import assert from 'node:assert/strict';

function normalizarTipoDocumento(tipo) {
    const valor = String(tipo ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_\s]+/g, '-');

    if (valor === 'holerite') return 'holerite';
    if (valor === 'cartao-ponto' || valor === 'cartao-de-ponto') return 'cartao-ponto';
    return null;
}

function detectarTipoDocumento(texto) {
    const valor = String(texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    const sinaisCartao = [
        /folha\s+de\s+frequencia/,
        /sistema\s+de\s+ponto/,
        /ponto\s+eletronico/,
        /relatorio\s+mensal/,
        /cartao\s+de\s+ponto/,
        /mes\s*\/?\s*ano/,
        /entrada\s+saida/,
        /entrada\s+ent\d*.*saida\d*/
    ];

    const sinaisHolerite = [
        /demonstrativo\s+de\s+pagamento/,
        /recibo\s+de\s+pagamento/,
        /salario\s+base/,
        /total\s+de\s+proventos/,
        /total\s+de\s+descontos/,
        /liquido\s+(?:a\s+receber|receber)/,
        /contrib\.?\s+inss/,
        /fgts/
    ];

    const pontosCartao = sinaisCartao.reduce((n, r) => n + (r.test(valor) ? 1 : 0), 0);
    const pontosHolerite = sinaisHolerite.reduce((n, r) => n + (r.test(valor) ? 1 : 0), 0);

    if (pontosCartao >= 2 && pontosCartao > pontosHolerite) return 'cartao-ponto';
    if (pontosHolerite >= 2 && pontosHolerite > pontosCartao) return 'holerite';
    return null;
}

assert.equal(normalizarTipoDocumento('cartão ponto'), 'cartao-ponto');
assert.equal(normalizarTipoDocumento('cartao_ponto'), 'cartao-ponto');
assert.equal(normalizarTipoDocumento('holerite'), 'holerite');

assert.equal(
    detectarTipoDocumento('FOLHA DE FREQUENCIA SISTEMA DE PONTO ELETRONICO Mes/Ano Entrada Saida'),
    'cartao-ponto'
);

assert.equal(
    detectarTipoDocumento('RECIBO DE PAGAMENTO SALARIO BASE TOTAL DE PROVENTOS FGTS'),
    'holerite'
);

console.log('TESTES DE DETECCAO DE TIPO: OK');
