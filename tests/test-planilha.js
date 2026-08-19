import assert from 'node:assert/strict';
import { gerarArquivoPlanilha } from '../src/services/planilhaService.js';

const holerite = {
    pages: [
        {
            page: 1,
            year: '2020',
            month: '01',
            fields: [
                { code: '001', label: 'SALARIO', reference: '30', value: '1.300,00' },
                { code: '002', label: 'INSS', reference: '?', value: '120,00' }
            ],
            bases: []
        },
        {
            page: 2,
            year: '2020',
            month: '02',
            fields: [
                { code: '001', label: 'SALARIO', reference: '30', value: '1.300,00' }
            ],
            bases: []
        }
    ]
};

const cartaoPonto = {
    pages: [
        {
            page: 1,
            days: [
                {
                    date_raw: '03/01/2020',
                    punches: [
                        { kind: 'IN', time_hhmm: '08:00' },
                        { kind: 'OUT', time_hhmm: '12:00' },
                        { kind: 'IN', time_hhmm: '13:00' },
                        { kind: 'OUT', time_hhmm: '17:00' }
                    ]
                },
                {
                    date_raw: '04/01/2020',
                    punches: [
                        { kind: 'IN', time_hhmm: '08:10' },
                        { kind: 'OUT', time_hhmm: '12:10' }
                    ]
                }
            ]
        }
    ]
};

const json = gerarArquivoPlanilha('holerite', holerite, 'json');
const linhasJson = JSON.parse(json.buffer.toString('utf8'));
assert.equal(linhasJson.length, 2);
assert.equal(linhasJson[0]['Pág.'], '1');
assert.equal(linhasJson[0]['Mês'], '01');
assert.equal(linhasJson[0]['Ano'], '2020');
assert.equal(linhasJson[0].SALARIO, '1.300,00');
assert.equal(linhasJson[1].INSS, '', 'Verba ausente na página deve gerar célula vazia, não ?');

const csv = gerarArquivoPlanilha('cartao-ponto', cartaoPonto, 'csv');
const textoCsv = csv.buffer.toString('utf8');
assert.match(textoCsv, /"Data","Entrada 1","Saída 1","Entrada 2","Saída 2"/);
assert.match(textoCsv, /"03\/01\/2020","08:00","12:00","13:00","17:00"/);
assert.match(textoCsv, /"04\/01\/2020","08:10","12:10","",""/);

const xlsx = gerarArquivoPlanilha('holerite', holerite, 'xlsx');
assert.equal(xlsx.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
assert.equal(xlsx.buffer.subarray(0, 2).toString('ascii'), 'PK');
assert.ok(xlsx.buffer.length > 500);

assert.throws(
    () => gerarArquivoPlanilha('holerite', holerite, 'pdf'),
    /Formato de planilha não suportado/
);

console.log('Testes de planilha concluídos com sucesso.');
