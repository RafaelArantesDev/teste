import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { extrairPaginasPDF } from './pdfService.js';
import { agruparEmLinhas, renderizarDocumento } from './layout.js';
import { analisarQualidadeTexto, avaliarQualidadeExtracao } from './pdfQuality.js';

const execFileAsync = promisify(execFile);

const PASTA_TEMP_OCR = path.resolve('temp-orc');
const CAMINHO_PROCESSO_OCR = fileURLToPath(new URL('./ocrProcess.js', import.meta.url));

async function rodarOcrEmProcessoIsolado(caminhoArquivo, pastaTemp) {
    const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [CAMINHO_PROCESSO_OCR, caminhoArquivo, pastaTemp],
        { maxBuffer: 1024 * 1024 * 200 }
    );

    if (stderr?.trim()) console.log(stderr.trim());

    const marcador = '__RESULTADO_OCR__';
    const indice = stdout.indexOf(marcador);

    if (indice === -1) {
        throw new Error(
            'Processo de OCR não retornou um resultado válido.\n' +
            `--- stdout ---\n${stdout || '(vazio)'}\n--- stderr ---\n${stderr || '(vazio)'}`
        );
    }

    const { paginas } = JSON.parse(stdout.slice(indice + marcador.length));

    return paginas.map(pagina => ({
        numero: pagina.numero,
        largura: pagina.largura,
        altura: pagina.altura,
        linhas: agruparEmLinhas(pagina.palavras)
    }));
}

/**
 * Um PDF pode ter camada de texto em algumas páginas e ser escaneado em
 * outras. A decisão de OCR é por documento, mas a métrica considera quantas
 * páginas realmente possuem texto aproveitável.
 */
export async function analisarPDF(caminhoArquivo) {
    const paginasNativas = await extrairPaginasPDF(caminhoArquivo);
    const textoNativo = renderizarDocumento(paginasNativas);

    const metricasNativas = analisarQualidadeTexto(textoNativo, paginasNativas.length);
    const avaliacaoNativa = avaliarQualidadeExtracao(metricasNativas);

    if (!avaliacaoNativa.usarOCR) {
        return {
            paginas: paginasNativas,
            texto: textoNativo,
            metricas: metricasNativas,
            avaliacao: avaliacaoNativa,
            origem: 'nativo'
        };
    }

    console.log('Extração nativa insuficiente, acionando OCR (processo isolado)...');

    const pastaTemp = path.join(PASTA_TEMP_OCR, randomUUID());
    const paginasOCR = await rodarOcrEmProcessoIsolado(caminhoArquivo, pastaTemp);
    const textoOCR = renderizarDocumento(paginasOCR);

    const metricasOCR = analisarQualidadeTexto(textoOCR, paginasOCR.length);

    return {
        paginas: paginasOCR,
        texto: textoOCR,
        metricas: metricasOCR,
        avaliacao: avaliarQualidadeExtracao(metricasOCR),
        origem: 'ocr'
    };
}
