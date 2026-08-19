/**
 * Utilitários de leitura de texto posicionado.
 *
 * O pipeline de extração (nativo e OCR) preserva a posição horizontal das
 * palavras, então as linhas chegam aqui com as colunas do documento
 * reconstruídas por espaços. Estas funções permitem cortar uma linha em
 * regiões (rendimentos, descontos, resultados) sem misturar colunas.
 */

const NUMERO = /^[+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^[+-]?\d+(?:,\d+)?$/;
const DINHEIRO = /^[+-]?\d{1,3}(?:\.\d{3})*,\d{2}$|^[+-]?\d+,\d{2}$/;

export function tokenizar(linha) {
    const tokens = [];
    const regex = /\S+/g;
    let match;

    while ((match = regex.exec(String(linha ?? ''))) !== null) {
        tokens.push({
            texto: match[0],
            inicio: match.index,
            fim: match.index + match[0].length
        });
    }

    return tokens;
}

export function ehNumero(texto) {
    return NUMERO.test(String(texto ?? ''));
}

export function ehDinheiro(texto) {
    return DINHEIRO.test(String(texto ?? ''));
}

/**
 * Faixas de colunas que estão vazias em todas as linhas informadas. São os
 * "corredores" entre colunas da tabela.
 */
export function corredores(linhas, largura = 2) {
    const limite = Math.max(0, ...linhas.map(l => l.length));
    const ocupado = new Array(limite).fill(false);

    for (const linha of linhas) {
        for (let i = 0; i < linha.length; i++) {
            if (linha[i] !== ' ') ocupado[i] = true;
        }
    }

    const faixas = [];
    let inicio = null;

    for (let i = 0; i <= limite; i++) {
        if (i < limite && !ocupado[i]) {
            if (inicio === null) inicio = i;
            continue;
        }
        if (inicio !== null) {
            if (i - inicio >= largura) faixas.push({ inicio, fim: i });
            inicio = null;
        }
    }

    return faixas;
}

/**
 * Última coluna livre à esquerda de uma referência. É usada para descobrir
 * onde começa uma região da tabela a partir de um rótulo conhecido dela.
 */
export function corteAntesDe(faixas, coluna) {
    let corte = null;

    for (const faixa of faixas) {
        if (faixa.fim <= coluna) corte = Math.floor((faixa.inicio + faixa.fim) / 2);
    }

    return corte;
}

export function recortar(linha, inicio, fim) {
    return String(linha ?? '')
        .slice(inicio ?? 0, fim ?? undefined)
        .replace(/\s+$/, '');
}

export function juntar(tokens) {
    return tokens
        .map(t => (typeof t === 'string' ? t : t.texto))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function semAcentos(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function chaveRotulo(valor) {
    return semAcentos(valor).replace(/[^a-z0-9]/g, '');
}
