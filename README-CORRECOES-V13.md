# Correções V13 — extração de holerite por geometria

## Problema

O texto do PDF era lido de forma linear (uma sequência de strings, sem
posição). Em documentos com colunas paralelas — rendimentos, descontos e
resultados impressos lado a lado — as palavras chegavam ao extrator fora de
ordem, então o parser misturava campos de colunas diferentes, atribuía o valor
de uma coluna ao rótulo de outra e, quando não conseguia decidir, ora deixava o
campo vazio, ora aproveitava o número mais próximo.

## O que mudou

### 1. Extração preserva a posição das palavras

- `src/services/pdfService.js` usa `pdfjs-dist` e guarda `x0/x1/y0/y1` de cada
  palavra em vez do texto corrido.
- `src/services/layout.js` (novo) agrupa palavras em linhas pela coordenada
  vertical e reconstrói cada página como texto posicionado: a coluna em que a
  palavra aparece no PDF vira a coluna do caractere no texto.
- `src/services/ocrProcess.js` devolve as palavras do Tesseract com as
  respectivas *bounding boxes*, convertidas para a escala da página. OCR e
  extração nativa passam a produzir exatamente a mesma estrutura, então o
  extrator é o mesmo nos dois caminhos.

### 2. Extrator de holerite reescrito

`src/extractors/holeriteExtractor.js` passou a reconhecer quatro famílias de
layout e a cortar cada linha em regiões antes de interpretá-la
(`src/extractors/colunas.js` fornece os utilitários de corte):

| Layout | Documento | Como é lido |
| --- | --- | --- |
| ficha | payroll-01 (Ficha Financeira) | corredores vazios entre colunas separam RENDIMENTOS \| DESCONTOS \| RESULTADOS; cada `Mês:` vira uma competência e blocos da mesma competência (Folha Normal, Adiantamento-PLR, 13º) são consolidados |
| declaracao | payroll-02 (Declaração Remuneração) | tabela Verba/Nome/Base/Valor; blocos `Folha de Pagamento: MÊS` e `: ACERTO` são lidos separadamente e só o bloco do MÊS alimenta as bases |
| demonstrativo | payroll-03 (Demonstrativo Mensal) | colunas Cod./Descrição/Unidade/Proventos/Descontos e os pares `Base I.N.S.S.:`, `F.G.T.S. do Mês:` etc. |
| recibo | payroll-04 (digitalizado, OCR) | duas vias por página: cada via é lida e apenas a mais legível é mantida, para não duplicar verbas |

### 3. Regra do `?`

- Rótulo/código identificado e valor não reconhecido → `value: "?"`.
- Nenhum valor é calculado, deduzido ou copiado de outra coluna.
- Nenhum campo obrigatório sai vazio ou `null`.
- Valores negativos impressos no documento são preservados (payroll-02).
- Mês/ano só são preenchidos quando a leitura é inequívoca: em payroll-04, a
  página em que o OCR leu `TANEIRO/2020` sai como `"month": "?"` em vez de
  chutar janeiro.
- Números soltos no meio do rótulo continuam no rótulo (`INSS 13 SALARIO`); só
  viram `reference` quando antecedem diretamente o valor.

### 4. Outras correções

- `documento.destroy()` → `documento.cleanup()` (a API do `pdfjs-dist` usado não
  expõe `destroy`).
- Polyfill de `ArrayBuffer.prototype.transferToFixedLength` no processo de OCR:
  sem ele a renderização das páginas falha no Node 20 e o OCR não retornava
  resultado nenhum.
- O erro do processo de OCR passou a incluir `stdout`/`stderr` do processo
  filho, em vez de apenas "não retornou um resultado válido".
- Linhas de valores do rodapé do recibo não são mais lidas como verbas.
- Removidos arquivos mortos: `src/testarOcr.js`, `src/testarConversao.js` e
  `src/services/ocrService.js` (substituído por `ocrProcess.js`).

## Resultado nos exemplos

| Arquivo | Origem | Saída |
| --- | --- | --- |
| payroll-01 | nativa | 25 competências, 455 verbas, nenhum `?` |
| payroll-02 | nativa | 5 páginas, negativos preservados, bases só do bloco MÊS |
| payroll-03 | nativa | 5 páginas; `Base IRRF 13º` sai `?` quando o campo está em branco no PDF |
| payroll-04 | OCR | 5 páginas, verbas sem duplicação; mês `?` só na página em que o OCR corrompeu o nome |
| time-card-01/02/03 | nativa/OCR | sem regressão |
| time-card-04 | OCR | digitalização ilegível; campos não lidos saem como `?` (nada é inventado) |

## Como rodar

```bash
npm install
npm test
npm start                      # http://localhost:3000
```

```bash
curl -F "arquivo=@exemplos/payroll-03.pdf" -F "tipo=holerite" \
     http://localhost:3000/api/transcricoes
curl http://localhost:3000/api/transcricoes/<id>
```

## Observação

O README original do desafio não estava no zip enviado (só os
`README-CORRECOES-V3..V12`). O contrato usado foi o descrito nesses arquivos e
nos testes: `pages[] { page, year, month, fields[] {code,label,reference,value},
bases[] {label,value} }`. Se o README original for enviado, dá para conferir
campo a campo.
