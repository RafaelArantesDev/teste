import assert from 'node:assert/strict';
import { extrairHolerite } from '../src/extractors/holeriteExtractor.js';

const payroll02 = `Fls.: 361
RENDIMENTOS
Declaração Remuneração - Folha de Pagamento
Funcionário:
Mês/Ano: 08/2018 Folha de Pagamento: MÊS
830 INSS-CONTR.PESSOAL 5.645,80 -621,03
875 IMPOSTO DE RENDA-FONTE 4.882,93 -473,44
Remuneração Função Vl. Ref.: 5.017,04 Proventos Retidos: 0,00 Proventos Bruto: 6.188,63
Adiantamento 13o.: 3.094,31 Margem (30%): 1.113,97 Consignação: 1.837,08
Provisão FGTS: 495,09 Margem (70%): 2.494,96 Proventos Líquidos: 4.351,55`;

const payroll03 = `Fls.: 230
D E M O N S T R A T I V O D E P A G A M E N T O M E N S A L
Período : 10/2019
Admissão : 09.04.2019 Cargo : OPERADOR MÁQUINAS III
Salário Base : 1.678,61
Cod. Descrição Unidade Proventos Descontos
0105 Dias Trabalhados 30,00 1.678,61
2007 Horas Extras 100% 5,00 76,30
/314 Contr. INSS Remuneração 9,00 177,03
Total 1.967,07 859,46
Líqüido 1.107,61
Base I.N.S.S. : 1.967,07 F.G.T.S. do Mês : 157,37`;

const payroll04 = `=== PAGINA 1 ===
Fis.: 316
Recibo de Pagamento
Referencia Folha Fis
CNPJ: SETEMBRO/2019 MENSAL 1/1
Cargo/Nível
CONSULTOR COMERCIAL BI /
Data Admissão
09/09/2019
Proventos Descontos
SALARIO 953,36 INSS MES 200,43
SR COMISSAO 172,66
REMUNERACAO VARIAVEL 1.100,00
TOTAL DE PROVENTOS 2.227,04 TOTAL DE DESCONTOS 211,43
LIQUIDO A RECEBER 2.015,61
Salário Base 1.300,00 Sal. Contrib. INSS 2.227,04 Base Cálc. FGTS 0,00 FGTS Mês 178,16`;

const r2 = extrairHolerite(payroll02);
assert.equal(Object.keys(r2).join(','), 'pages');
assert.equal(r2.pages.length, 1);
assert.deepEqual(r2.pages[0], {
    page: 1,
    year: '2018',
    month: '08',
    fields: [
        { code: '830', label: 'INSS-CONTR.PESSOAL', reference: '5.645,80', value: '-621,03' },
        { code: '875', label: 'IMPOSTO DE RENDA-FONTE', reference: '4.882,93', value: '-473,44' }
    ],
    bases: [
        { label: 'Proventos Líquidos', value: '4.351,55' },
        { label: 'Proventos Bruto', value: '6.188,63' },
        { label: 'Consignação', value: '1.837,08' },
        { label: 'Provisão FGTS', value: '495,09' }
    ]
});

const r3 = extrairHolerite(payroll03);
assert.equal(r3.pages.length, 1);
assert.equal(r3.pages[0].year, '2019');
assert.equal(r3.pages[0].month, '10');
assert.equal(r3.pages[0].fields[0].label, 'Dias Trabalhados');
assert.equal(r3.pages[0].fields.at(-1).value, '177,03');
assert.equal(r3.pages[0].bases.find(b => b.label === 'Valor Líquido')?.value, '1.107,61');
assert.equal(r3.pages[0].bases.find(b => b.label === 'FGTS Mês')?.value, '157,37');

const r4 = extrairHolerite(payroll04);
assert.equal(r4.pages.length, 1);
assert.equal(r4.pages[0].year, '2019');
assert.equal(r4.pages[0].month, '09');
assert.deepEqual(r4.pages[0].fields.slice(0, 2), [
    { code: '', label: 'SALARIO', reference: '', value: '953,36' },
    { code: '', label: 'INSS MES', reference: '', value: '200,43' }
]);
assert.equal(r4.pages[0].bases.find(b => b.label === 'Valor Líquido')?.value, '2.015,61');

for (const resultado of [r2, r3, r4]) {
    assert.ok(Array.isArray(resultado.pages));
    for (const page of resultado.pages) {
        assert.ok(Number.isInteger(page.page));
        assert.equal(typeof page.year, 'string');
        assert.equal(typeof page.month, 'string');
        assert.ok(Array.isArray(page.fields));
        assert.ok(Array.isArray(page.bases));
        for (const field of page.fields) {
            assert.equal(typeof field.code, 'string');
            assert.equal(typeof field.label, 'string');
            assert.equal(typeof field.reference, 'string');
            assert.equal(typeof field.value, 'string');
            assert.notEqual(field.value, null);
        }
        for (const base of page.bases) {
            assert.equal(typeof base.label, 'string');
            assert.equal(typeof base.value, 'string');
            assert.notEqual(base.value, null);
        }
    }
}

console.log('TESTES DO EXTRATOR DE HOLERITE NO CONTRATO README: OK');


// Regressão payroll-01 (ficha financeira):
// valores da coluna RESULTADOS não podem "vazar" para fields.
// O 820 possui referência inteira 0 e valor monetário 58,18.
const payroll01Ficha = `FICHAFINANCEIRA-PERIODO:2017/04 a 2025/03
Mês: abr-17
      REMUNERAÇÃOMES                          969,73      290 VA Funcionario                 0      30,67    BASEDECALCULODOINSS       1.260,65
      DIAS/HORASTRAB                          146,67      491 Seguro Vida Fun                0       2,40    BASEDECALCULODOIRF          780,62
   40 Reembolso VR             0,00           360,00      499 Vale Ref Func                  0      36,00    BASEDECALCULODOFGTS       1.260,65
   91 Hr Adic Pericul        146,67           290,92      511 INSS Normal                    0     100,85    VALORDOFGTS                 100,85
      TOT.RENDIMENTOS                       1.620,65      561 IRF Normal                     0       0,00   SALARIOLIQUIDONOMES       1.392,55
                                                          820 Vale Transp Fun                0      58,18    VALORDOIRFARECOLHER           0,00
                                                              TOTALDESCONTOS                       228,10`;

const rFicha = extrairHolerite(payroll01Ficha);
assert.equal(rFicha.pages.length, 1);
assert.equal(rFicha.pages[0].month, '04');
assert.equal(rFicha.pages[0].year, '2017');
assert.deepEqual(rFicha.pages[0].fields.find(f => f.code === '820'), {
    code: '820',
    label: 'Vale Transp Fun',
    reference: '0',
    value: '58,18'
});
assert.equal(rFicha.pages[0].fields.find(f => f.label === 'REMUNERAÇÃOMES')?.value, '969,73');
assert.equal(rFicha.pages[0].fields.find(f => f.label === 'DIAS/HORASTRAB')?.value, '146,67');
assert.equal(rFicha.pages[0].bases.find(b => b.label === 'Valor Líquido')?.value, '1.392,55');
assert.ok(!rFicha.pages[0].fields.some(f => f.value === '1.260,65' && f.code !== ''));
assert.ok(!rFicha.pages[0].fields.some(f => f.code === '820' && f.value === '0,00'));

// Regressão payroll-02:
// "Proventos Líquidos" é a base correta do layout; não existe "Valor Líquido"
// e o -1,04 pertence exclusivamente a "Provisão FGTS" no bloco ACERTO.
const payroll02Acerto = `Mês/Ano: 08/2018 Folha de Pagamento: ACERTO
Verba Nome Base / Saldo / Benefício Valor
058 HORA EXTRA-BCO HORAS-CONV JULHO/18 -12,89
765 CASSI-PARTICIPACOES -67,72
875 IMPOSTO DE RENDA-FONTE 11,87 3,26
Proventos Retidos: 0,00 Proventos Bruto: -12,89
Adiantamento 13o.: 0,00 Margem (30%): 0,00 Consignação: 63,48
Provisão FGTS: -1,04 Margem (70%): 0,00 Proventos Líquidos: -76,37`;

const rAcerto = extrairHolerite(payroll02Acerto);
assert.equal(rAcerto.pages.length, 1);
assert.equal(rAcerto.pages[0].bases.find(b => b.label === 'Proventos Líquidos'), undefined);
assert.equal(rAcerto.pages[0].bases.find(b => b.label === 'Provisão FGTS'), undefined);
assert.equal(rAcerto.pages[0].bases.some(b => b.label === 'Valor Líquido'), false);
assert.equal(rAcerto.pages[0].fields.find(f => f.code === '875')?.value, '3,26');
assert.equal(rAcerto.pages[0].fields.some(f => f.value === '-1,04'), false);

console.log('TESTES DE REGRESSÃO PAYROLL-01/PAYROLL-02: OK');


// Incerteza no payroll-04: nenhum valor vazio pode sair da transcrição.
const payroll04SemValor = `=== PAGINA 1 ===
Recibo de Pagamento
Data Admissao 09/09/2019
Cargo/Nível
CONSULTOR COMERCIAL BI
Proventos Descontos
SALARIO 1.300,00 INSS MES 200,43
TOTAL DE PROVENTOS 2.227,04 TOTAL DE DESCONTOS 211,43
LIQUIDO A RECEBER 2.015,61
Salário Base Sal. Contrib. INSS Base Cálc. FGTS FGTS Mês
1.300,00 2.227,04 0,00 178,16`;

const r04SemValor = extrairHolerite(payroll04SemValor);
assert.ok(r04SemValor.pages[0].bases.every(b => typeof b.value === 'string' && b.value.length > 0));
assert.ok(!r04SemValor.pages[0].bases.some(b => b.value === ''));

console.log('TESTE DE INCERTEZA PAYROLL-04: OK');
