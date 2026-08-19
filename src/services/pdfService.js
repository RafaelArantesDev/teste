import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
    agruparEmLinhas,
    quebrarItemEmPalavras,
    renderizarDocumento
} from './layout.js';

// pdfjs-dist precisa da pasta de fontes padrão para substituir corretamente
// fontes não embutidas; sem isso alguns glifos saem trocados.
const pdfjsRoot = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
const STANDARD_FONT_DATA_URL = path.join(pdfjsRoot, 'standard_fonts').split(path.sep).join('/') + '/';

/**
 * Lê a camada de texto do PDF preservando a geometria.
 * Retorna páginas com palavras posicionadas, linhas já agrupadas e o texto
 * renderizado em colunas.
 */
export async function extrairPaginasPDF(caminhoArquivo) {
    const arquivo = await readFile(caminhoArquivo);

    const documento = await getDocument({
        data: new Uint8Array(arquivo),
        standardFontDataUrl: STANDARD_FONT_DATA_URL
    }).promise;

    const paginas = [];

    try {
        for (let numero = 1; numero <= documento.numPages; numero++) {
            const pagina = await documento.getPage(numero);
            const viewport = pagina.getViewport({ scale: 1 });
            const conteudo = await pagina.getTextContent();

            const palavras = [];

            for (const item of conteudo.items) {
                if (typeof item.str !== 'string' || !item.str.trim()) continue;

                const x = item.transform[4];
                // pdfjs usa origem no canto inferior esquerdo; convertemos para
                // um eixo Y crescente para baixo, igual ao do OCR.
                const yTopo = viewport.height - item.transform[5] - item.height;

                palavras.push(...quebrarItemEmPalavras(item.str, x, yTopo, item.width, item.height || 8));
            }

            paginas.push({
                numero,
                largura: viewport.width,
                altura: viewport.height,
                linhas: agruparEmLinhas(palavras)
            });
        }
    } finally {
        await documento.cleanup();
    }

    return paginas;
}

export async function extrairTextoPDF(caminhoArquivo) {
    const paginas = await extrairPaginasPDF(caminhoArquivo);

    return {
        texto: renderizarDocumento(paginas),
        paginas: paginas.length,
        documento: paginas
    };
}
