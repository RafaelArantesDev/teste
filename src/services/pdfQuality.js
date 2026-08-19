export function analisarQualidadeTexto(texto, paginas) {
    const bruto = String(texto ?? '');
    const textoNormalizado = bruto.replace(/\s+/g, ' ').trim();

    const caracteres = textoNormalizado.length;
    const palavras = textoNormalizado.split(' ').filter(Boolean);
    const quantidadePalavras = palavras.length;
    const caracteresValidos = textoNormalizado.match(/[A-Za-zÀ-ÿ0-9]/g)?.length ?? 0;
    const caracteresSuspeitos = textoNormalizado.match(/[?]/g)?.length ?? 0;
    const simbolos = textoNormalizado.match(/[^A-Za-zÀ-ÿ0-9\s.,;:!?%()/\-+R$]/g)?.length ?? 0;
    const caracteresPorPagina = paginas > 0 ? caracteres / paginas : 0;

    const sinaisDocumento = [
        /holerite|recibo\s+de\s+pagamento|demonstrativo\s+de\s+pagamento|folha\s+de\s+pagamento/i,
        /salario\s+base|proventos|descontos|inss|fgts/i,
        /cartao\s+de\s+ponto|folha\s+de\s+frequencia|ponto\s+eletronico|mes\s*\/\s*ano/i,
        /entrada\s+saida|ent\d+\s+sai\d+/i
    ];

    const sinaisDocumentoEncontrados = sinaisDocumento.filter(r => r.test(bruto)).length;
    const apenasRodape = /assinado\s+eletronicamente/i.test(bruto) && sinaisDocumentoEncontrados === 0;

    return {
        paginas,
        caracteres,
        palavras: quantidadePalavras,
        caracteresValidos,
        caracteresSuspeitos,
        simbolos,
        caracteresPorPagina: Number(caracteresPorPagina.toFixed(2)),
        percentualCaracteresValidos: caracteres > 0 ? Number(((caracteresValidos / caracteres) * 100).toFixed(2)) : 0,
        percentualCaracteresSuspeitos: caracteres > 0 ? Number(((caracteresSuspeitos / caracteres) * 100).toFixed(2)) : 0,
        sinaisDocumentoEncontrados,
        apenasRodape,
        possuiTexto: caracteres > 0
    };
}

export function avaliarQualidadeExtracao(metricas) {
    const problemas = [];

    if (!metricas.possuiTexto) problemas.push('PDF não possui texto extraível');
    if (metricas.apenasRodape) problemas.push('Camada de texto contém apenas rodapé/metadados');
    if (metricas.caracteresPorPagina < 100) problemas.push('Quantidade de texto por página muito baixa');
    if (metricas.palavras < 20) problemas.push('Quantidade de palavras muito baixa');
    if (metricas.sinaisDocumentoEncontrados === 0) problemas.push('Não foram encontrados sinais confiáveis de documento trabalhista');

    return { usarOCR: problemas.length > 0, problemas };
}
