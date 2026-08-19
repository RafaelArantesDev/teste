import assert from 'node:assert/strict';
import { extrairCartaoPonto } from '../src/extractors/cartaoPontoExtractor.js';

// Layout SIPON / time-card-01: dia + semana, duas linhas de batidas e ocorrências.
const sipon = `F O L H A DE FREQUENCIA - SISTEMA DE PONTO ELETRONICO
Mes/Ano : 7 / 2012
Dia Semana Jornada Entrada Saida Ocorrencia Qtde
1 - DOM 08:00
2 - SEG 08:00 09:03 14:05 HE-BCO DE HORAS 00:13
15:12 18:36 HE-REMUNERADA 00:13
3 - TER 08:00 09:19 14:02 HE-BCO DE HORAS 00:10
15:10 18:48 HE-REMUNERADA 00:11
4 - QUA 08:00 09:34 13:35
14:35 18:36`;

const rSipon = extrairCartaoPonto(sipon);
assert.equal(rSipon.pages.length, 1);
assert.equal(rSipon.pages[0].days.length, 4);
assert.equal(rSipon.pages[0].days[0].date_raw, '01/07/2012');
assert.equal(rSipon.pages[0].days[0].punches.length, 0);
assert.deepEqual(rSipon.pages[0].days[1].punches.map(p => p.time_hhmm), ['09:03', '14:05', '15:12', '18:36']);

// Layout PONTO ELETRÔNICO / time-card-02: horários aparecem como intervalos.
const pontoEletronico = `PONTO ELETRÔNICO
Relatório Mensal
Mês/Ano: 05/2010
Dia Entrada Saída Intervalo 1 Intervalo 2
01 SAB Feriado 610 100 N
02 DOM Descanso Semanal 610 100 N
03 SEG Sem Registro de Ponto 610 100 N
17 SEG 12:00 - 18:15 15:00 - 15:15 610 276 S
18 TER 09:00 - 18:00 12:00 - 13:00 2,0 610 378 S`;

const rPonto = extrairCartaoPonto(pontoEletronico);
assert.equal(rPonto.pages.length, 1);
assert.equal(rPonto.pages[0].days.length, 5);
assert.equal(rPonto.pages[0].days[3].date_raw, '17/05/2010');
assert.deepEqual(rPonto.pages[0].days[3].punches.map(p => p.time_hhmm), ['12:00', '18:15', '15:00', '15:15']);
assert.deepEqual(rPonto.pages[0].days[0].punches, []);

// Layout Cartão de Ponto / time-card-03: data completa e até quatro pares de batidas.
const cartao = `Cartão de Ponto Página 1 de 38
Emissão: Junho/2025
Data Ent1 Sai1 Ent2 Sai2 Ent3 Sai3 Ent4 Sai4
16/12/2019 SEG 07:00d 12:00d 13:00d 17:00d
17/12/2019 TER 06:59d 12:00d 13:00d 16:59d
18/12/2019 QUA
24/12/2019 TER ABONO JORNADA ENT/SAIDA`;

const rCartao = extrairCartaoPonto(cartao);
assert.equal(rCartao.pages.length, 1);
assert.equal(rCartao.pages[0].days.length, 4);
assert.equal(rCartao.pages[0].days[0].date_raw, '16/12/2019');
assert.deepEqual(rCartao.pages[0].days[0].punches.map(p => p.time_hhmm), ['07:00', '12:00', '13:00', '17:00']);
assert.equal(rCartao.pages[0].days[2].punches.length, 0);

// Layout manuscrito / time-card-04: quando competência não é legível, não inventar.
const manuscrito = `=== PAGINA 1 ===
Mês Ano
1.QUINZENA
Dia Entrada Saída Entrada Saída Entrada Saída
01 09:50 14:15 15:14 19:21 19:55 23:20
02
03 09:22 14:31 15:27 19:16 19:20 22:28
=== PAGINA 2 ===
2.QUINZENA
16
17 09:32 14:23 15:21 16:20 16:35 23:42`;

const rManuscrito = extrairCartaoPonto(manuscrito);
assert.equal(rManuscrito.pages.length, 2);
assert.equal(rManuscrito.pages[0].days[0].date_raw, '01/??/????');
assert.deepEqual(rManuscrito.pages[0].days[0].punches.map(p => p.time_hhmm), ['09:50', '14:15', '15:14', '19:21', '19:55', '23:20']);
assert.equal(rManuscrito.pages[0].days[1].punches.length, 0);

// Regra de honestidade: nenhum campo obrigatório deve voltar como null.
for (const resultado of [rSipon, rPonto, rCartao, rManuscrito]) {
    for (const pagina of resultado.pages) {
        assert.ok(Number.isInteger(pagina.page));
        assert.ok(Array.isArray(pagina.days));
        for (const dia of pagina.days) {
            assert.equal(typeof dia.date_raw, 'string');
            assert.ok(Array.isArray(dia.punches));
            for (const batida of dia.punches) {
                assert.ok(['IN', 'OUT'].includes(batida.kind));
                assert.equal(typeof batida.time_raw, 'string');
                assert.equal(typeof batida.time_hhmm, 'string');
            }
        }
    }
}

console.log('TESTES DO EXTRATOR DE CARTÃO DE PONTO: OK');

// Regressão: form-feed não pode criar uma página vazia antes da primeira página.
const duasPaginas = `PONTO ELETRÔNICO\nMês/Ano: 05/2010\nDia Entrada Saída\n01 SAB\fPONTO ELETRÔNICO\nMês/Ano: 06/2010\nDia Entrada Saída\n01 SEG 08:00 - 17:00`;
const rDuasPaginas = extrairCartaoPonto(duasPaginas);
assert.equal(rDuasPaginas.pages.length, 2);
assert.equal(rDuasPaginas.pages[0].page, 1);
assert.equal(rDuasPaginas.pages[1].page, 2);
assert.equal(rDuasPaginas.pages[1].days[0].date_raw, '01/06/2010');

// Regressão: datas repetidas em duas linhas são duas linhas do documento,
// não devem ser fundidas silenciosamente.
const datasRepetidas = `Cartão de Ponto Página 1 de 1\nData Ent1 Sai1\n17/12/2019 TER 08:00 12:00\n17/12/2019 TER 13:00 18:00`;
const rDatasRepetidas = extrairCartaoPonto(datasRepetidas);
assert.equal(rDatasRepetidas.pages[0].days.length, 2);
assert.deepEqual(rDatasRepetidas.pages[0].days.map(d => d.date_raw), ['17/12/2019', '17/12/2019']);

// Regra de honestidade: horário impossível não vira outro horário válido.
const horarioInvalido = `Cartão de Ponto Página 1 de 1\nData Ent1 Sai1\n17/12/2019 TER 93:00 14:84`;
const rHorarioInvalido = extrairCartaoPonto(horarioInvalido);
assert.deepEqual(rHorarioInvalido.pages[0].days[0].punches.map(p => p.time_hhmm), ['??:00', '14:??']);
