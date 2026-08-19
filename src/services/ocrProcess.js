import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';

const pdfjsRoot = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
const STANDARD_FONT_DATA_URL = path.join(pdfjsRoot, 'standard_fonts').split(path.sep).join('/') + '/';

// O pdfjs-dist 6 usa ArrayBuffer.prototype.transferToFixedLength, disponível
// apenas a partir do Node 21. Sem esse recurso a renderização falha em
// silêncio e o Tesseract recebe páginas em branco — o PDF escaneado voltava
// sem nenhum campo. O polyfill mantém o OCR funcionando no Node 20.
if (typeof ArrayBuffer.prototype.transferToFixedLength !== 'function') {
    Object.defineProperty(ArrayBuffer.prototype, 'transferToFixedLength', {
        configurable: true,
        writable: true,
        value: function transferToFixedLength(novoTamanho) {
            const tamanho = novoTamanho ?? this.byteLength;
            const destino = new ArrayBuffer(tamanho);
            new Uint8Array(destino).set(
                new Uint8Array(this, 0, Math.min(tamanho, this.byteLength))
            );
            return destino;
        }
    });
}

const ESCALA = 4;

async function converterPdfParaImagens(caminhoPdf, pastaSaida) {
    await mkdir(pastaSaida, { recursive: true });

    const documento = await getDocument({
        data: new Uint8Array(await readFile(caminhoPdf)),
        standardFontDataUrl: STANDARD_FONT_DATA_URL
    }).promise;

    const paginas = [];

    for (let numero = 1; numero <= documento.numPages; numero++) {
        const pagina = await documento.getPage(numero);
        const viewport = pagina.getViewport({ scale: ESCALA });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const contexto = canvas.getContext('2d');

        // Páginas de PDF são transparentes por padrão. Sem o fundo branco o
        // Tesseract recebe preto sobre preto e perde linhas inteiras.
        contexto.fillStyle = '#ffffff';
        contexto.fillRect(0, 0, canvas.width, canvas.height);

        await pagina.render({ canvasContext: contexto, viewport }).promise;

        const caminho = path.join(pastaSaida, `pagina-${String(numero).padStart(2, '0')}.png`);
        await writeFile(caminho, canvas.toBuffer('image/png'));

        const original = pagina.getViewport({ scale: 1 });
        paginas.push({
            numero,
            caminho,
            largura: original.width,
            altura: original.height,
            escala: ESCALA
        });
    }

    return paginas;
}

/**
 * Reconhece cada página e devolve as palavras com as coordenadas convertidas
 * de volta para o sistema do PDF. A geometria é o que permite ao extrator
 * saber a qual coluna cada número pertence.
 */
async function reconhecerPaginas(paginas, idioma = 'por') {
    const worker = await createWorker(idioma);
    const resultado = [];

    try {
        for (const pagina of paginas) {
            const candidatos = [];

            // PSM 6 (bloco uniforme) costuma ganhar em recibos tabulares;
            // PSM 4 ajuda quando há colunas bem separadas.
            for (const psm of ['6', '4']) {
                await worker.setParameters({
                    tessedit_pageseg_mode: psm,
                    preserve_interword_spaces: '1'
                });

                const { data } = await worker.recognize(
                    pagina.caminho,
                    {},
                    { text: true, blocks: true }
                );

                const palavras = extrairPalavras(data, pagina);
                candidatos.push({
                    palavras,
                    texto: data.text ?? '',
                    score: pontuarOCR(data.text ?? '', palavras)
                });
            }

            candidatos.sort((a, b) => b.score - a.score);
            const melhor = candidatos[0];

            resultado.push({
                numero: pagina.numero,
                largura: pagina.largura,
                altura: pagina.altura,
                palavras: melhor?.palavras ?? []
            });
        }
    } finally {
        await worker.terminate();
    }

    return resultado;
}

function extrairPalavras(data, pagina) {
    const palavras = [];
    const escala = pagina.escala || 1;

    for (const bloco of data.blocks ?? []) {
        for (const paragrafo of bloco.paragraphs ?? []) {
            for (const linha of paragrafo.lines ?? []) {
                for (const palavra of linha.words ?? []) {
                    const texto = String(palavra.text ?? '').trim();
                    if (!texto) continue;

                    palavras.push({
                        texto,
                        x0: palavra.bbox.x0 / escala,
                        x1: palavra.bbox.x1 / escala,
                        y0: palavra.bbox.y0 / escala,
                        y1: palavra.bbox.y1 / escala,
                        confianca: palavra.confidence ?? 0
                    });
                }
            }
        }
    }

    return palavras;
}

function pontuarOCR(texto, palavras) {
    const t = String(texto ?? '');
    let score = 0;

    score += (t.match(/\b\d{2}[\/\-.]\d{2}[\/\-.]\d{4}\b/g) ?? []).length * 8;
    score += (t.match(/\b\d{1,2}[:.]\d{2}\b/g) ?? []).length * 2;
    score += (t.match(/\b(?:entrada|saida|saída|ent\d+|sai\d+|dia|semana)\b/gi) ?? []).length * 2;
    score += (t.match(/\b(?:salario|salário|proventos|descontos|inss|fgts|recibo|pagamento|liquido|líquido)\b/gi) ?? []).length * 2;
    score += (t.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) ?? []).length * 2;
    score += Math.min(t.replace(/\s/g, '').length / 200, 20);
    score -= (t.match(/[^\p{L}\p{N}\s.,:;!?%/()\-+]/gu) ?? []).length * 0.2;

    // Confiança média do Tesseract: separa um reconhecimento limpo de um
    // reconhecimento que só produziu ruído com aparência de texto.
    if (palavras.length) {
        const confianca = palavras.reduce((total, p) => total + (p.confianca ?? 0), 0) / palavras.length;
        score += confianca / 5;
    }

    return score;
}

async function main() {
    const caminhoPdf = process.argv[2];
    const pastaSaida = process.argv[3];

    if (!caminhoPdf || !pastaSaida) {
        throw new Error('Uso: node ocrProcess.js <caminho-pdf> <pasta-saida>');
    }

    const imagens = await converterPdfParaImagens(caminhoPdf, pastaSaida);
    const paginas = await reconhecerPaginas(imagens);

    // As imagens ficam preservadas em temp-orc para auditoria visual.
    process.stdout.write('__RESULTADO_OCR__' + JSON.stringify({ paginas }));
}

main().catch(err => {
    console.error('ERRO_NO_OCR:', err.message);
    process.exit(1);
});
