import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';

// --- Padrões que indicam conteúdo REAL de holerite/cartão de ponto ---
const REGEX_HORARIO = /\b([01]?\d|2[0-3]):[0-5]\d\b/;           // ex: 08:25, 18:00
const REGEX_VALOR_MONETARIO = /\b\d{1,3}(\.\d{3})*,\d{2}\b/;    // ex: 2.389,77
const REGEX_DATA = /\b\d{2}\/\d{2}\/\d{2,4}\b/;                 // ex: 21/05/2019

// --- Limiares de densidade (caracteres por página) ---
const LIMIAR_BAIXO = 50;     // abaixo disso: escaneado com certeza, nem checa padrão
const LIMIAR_AMBIGUO = 300;  // entre baixo e este: decide pelo padrão de conteúdo

function classificar(textoLimpo, numPaginas) {
    const densidade = textoLimpo.length / numPaginas;

    const temHorario = REGEX_HORARIO.test(textoLimpo);
    const temValor = REGEX_VALOR_MONETARIO.test(textoLimpo);
    const temData = REGEX_DATA.test(textoLimpo);
    const temPadraoConteudo = temHorario || temValor || temData;

    let classificacao;
    let motivo;

    if (densidade < LIMIAR_BAIXO) {
        classificacao = 'ESCANEADO';
        motivo = `densidade muito baixa (${densidade.toFixed(1)} chars/página)`;
    } else if (densidade < LIMIAR_AMBIGUO) {
        if (temPadraoConteudo) {
            classificacao = 'TEXTO REAL';
            motivo = `densidade baixa (${densidade.toFixed(1)} chars/página), mas encontrou padrão de conteúdo`;
        } else {
            classificacao = 'ESCANEADO';
            motivo = `densidade baixa (${densidade.toFixed(1)} chars/página) e nenhum padrão de conteúdo encontrado`;
        }
    } else {
        classificacao = 'TEXTO REAL';
        motivo = `densidade alta (${densidade.toFixed(1)} chars/página)`;
    }

    return { classificacao, motivo, densidade, temHorario, temValor, temData };
}

async function diagnosticar(caminho) {
    const buffer = fs.readFileSync(caminho);

    const parser = new PDFParse({ data: buffer });
    const resultado = await parser.getText();
    await parser.destroy();

    const textoLimpo = resultado.text.trim();
    const numPaginas = resultado.total ?? resultado.numpages ?? 1;

    const analise = classificar(textoLimpo, numPaginas);

    console.log(`\n📄 ${caminho}`);
    console.log(`Páginas: ${numPaginas}`);
    console.log(`Caracteres totais: ${textoLimpo.length}`);
    console.log(`Densidade: ${analise.densidade.toFixed(1)} chars/página`);
    console.log(`Padrões encontrados: horário=${analise.temHorario} | valor=${analise.temValor} | data=${analise.temData}`);

    if (analise.classificacao === 'ESCANEADO') {
        console.log(`🔴 ESCANEADO — ${analise.motivo} → vai precisar de OCR`);
    } else {
        console.log(`🟢 TEXTO REAL — ${analise.motivo} → pdf-parse deve funcionar direto`);
    }

    return { caminho, ...analise };
}

const arquivos = [
    './exemplos/payroll-01.pdf',
    './exemplos/payroll-02.pdf',
    './exemplos/payroll-03.pdf',
    './exemplos/payroll-04.pdf',
    './exemplos/time-card-01.pdf',
    './exemplos/time-card-02.pdf',
    './exemplos/time-card-03.pdf',
    './exemplos/time-card-04.pdf',
];

const resultados = [];
for (const arquivo of arquivos) {
    resultados.push(await diagnosticar(arquivo));
}

console.log('\n\n========== RESUMO ==========');
for (const r of resultados) {
    const icone = r.classificacao === 'ESCANEADO' ? '🔴' : '🟢';
    console.log(`${icone} ${r.caminho.padEnd(35)} ${r.classificacao}`);
}