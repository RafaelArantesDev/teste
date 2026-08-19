// Modelo geométrico compartilhado pelas duas origens de texto (PDF nativo e
// OCR). Toda a extração passou a trabalhar sobre palavras posicionadas, e não
// sobre linhas de texto soltas: é a posição horizontal que diz a qual coluna
// do holerite um número pertence. Sem isso, "Unidade", "Proventos" e
// "Descontos" viram apenas três números na mesma linha e o parser precisa
// adivinhar — que era exatamente a origem dos campos trocados.

export const TOLERANCIA_LINHA = 0.6;

/**
 * Agrupa palavras em linhas pela coordenada vertical.
 * Cada palavra: { texto, x0, x1, y0, y1 }.
 */
export function agruparEmLinhas(palavras, tolerancia = TOLERANCIA_LINHA) {
    const ordenadas = [...palavras]
        .filter(p => p && String(p.texto ?? '').trim())
        .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

    const linhas = [];

    for (const palavra of ordenadas) {
        const altura = Math.max(1, palavra.y1 - palavra.y0);
        const limite = altura * tolerancia;
        const atual = linhas.at(-1);

        if (atual && Math.abs(centroY(palavra) - atual.centro) <= limite) {
            atual.palavras.push(palavra);
            atual.centro = media(atual.palavras.map(centroY));
            atual.y0 = Math.min(atual.y0, palavra.y0);
            atual.y1 = Math.max(atual.y1, palavra.y1);
            continue;
        }

        linhas.push({
            centro: centroY(palavra),
            y0: palavra.y0,
            y1: palavra.y1,
            palavras: [palavra]
        });
    }

    for (const linha of linhas) {
        linha.palavras.sort((a, b) => a.x0 - b.x0);
        linha.texto = textoDaLinha(linha.palavras);
    }

    return linhas;
}

export function textoDaLinha(palavras) {
    return palavras.map(p => p.texto).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Renderiza a página preservando as colunas, no estilo `pdftotext -layout`.
 * Serve tanto para depuração quanto para os parsers que ainda trabalham
 * com texto (cartão de ponto).
 */
export function renderizarPagina(linhas, larguraPagina, colunas = 200) {
    const escala = larguraPagina > 0 ? colunas / larguraPagina : 1;

    return linhas.map(linha => {
        let saida = '';
        for (const palavra of linha.palavras) {
            const coluna = Math.max(0, Math.round(palavra.x0 * escala));
            if (coluna > saida.length) saida += ' '.repeat(coluna - saida.length);
            else if (saida.length && !saida.endsWith(' ')) saida += ' ';
            saida += palavra.texto;
        }
        return saida.replace(/\s+$/, '');
    }).join('\n');
}

export function renderizarDocumento(paginas) {
    return paginas
        .map(pagina => `=== PAGINA ${pagina.numero} ===\n${renderizarPagina(pagina.linhas, pagina.largura)}`)
        .join('\n\n');
}

/** Palavras cujo centro horizontal cai dentro de [x0, x1). */
export function palavrasNaFaixa(linha, x0, x1) {
    return linha.palavras.filter(p => {
        const centro = (p.x0 + p.x1) / 2;
        return centro >= x0 && centro < x1;
    });
}

export function centroX(palavra) {
    return (palavra.x0 + palavra.x1) / 2;
}

function centroY(palavra) {
    return (palavra.y0 + palavra.y1) / 2;
}

function media(valores) {
    if (!valores.length) return 0;
    return valores.reduce((total, valor) => total + valor, 0) / valores.length;
}

/**
 * Quebra um item de texto do PDF em palavras, distribuindo a largura do item
 * proporcionalmente aos caracteres. É uma aproximação, mas suficiente porque
 * só precisamos saber em qual coluna cada palavra começa e termina.
 */
export function quebrarItemEmPalavras(texto, x, y, largura, altura) {
    const bruto = String(texto ?? '');
    if (!bruto.trim()) return [];

    const larguraCaractere = bruto.length > 0 ? largura / bruto.length : 0;
    const palavras = [];
    const regex = /\S+/g;
    let match;

    while ((match = regex.exec(bruto)) !== null) {
        const inicio = match.index;
        const fim = inicio + match[0].length;
        palavras.push({
            texto: match[0],
            x0: x + inicio * larguraCaractere,
            x1: x + fim * larguraCaractere,
            y0: y,
            y1: y + altura
        });
    }

    return palavras;
}
