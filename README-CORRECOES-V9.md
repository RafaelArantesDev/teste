# Correções V9 — calibração dos PDFs de exemplo

Esta versão parte da V8 e corrige principalmente falsos positivos observados nos payroll-01 e payroll-02, sem regredir os cartões de ponto.

## Holerites

### payroll-01 — ficha financeira
- A ficha financeira agora é reconhecida no documento inteiro, mesmo quando o cabeçalho `FICHA FINANCEIRA` aparece somente na primeira página.
- Cada competência vira uma entrada em `pages[]`, mantendo o número da página original.
- Blocos da mesma competência na mesma página são consolidados, por exemplo `Adiantamento - PLR`, `Folha Normal` e `13 Salario`.
- A coluna `RESULTADOS` é isolada antes da leitura das verbas. Valores de `BASE...`, `SALARIO LIQUIDO NO MES`, `VALOR DO FGTS` e `VALOR DO IR A RECOLHER` não podem mais vazar para `fields[]`.
- Referências inteiras como `0`, `22`, `42` continuam em `reference`; não são confundidas com o valor.
- Verbas sem código, como `REMUNERACAO MES` e `DIAS/HORAS TRAB`, continuam sendo preservadas.
- Códigos de verbas iniciados por separadores do PDF, como `|421`, também são reconhecidos.
- Quando o código/rótulo foi lido, mas o valor monetário não foi reconhecido, o valor fica `?` em vez de ser inventado.

### payroll-02 — layout Declaração Remuneração
- `Proventos Líquidos` é reconhecido literalmente.
- O sistema não cria `Valor Líquido` para esse layout.
- Valores negativos só são preservados quando estão realmente impressos no PDF. No bloco `ACERTO`, por exemplo, `Provisão FGTS: -1,04` e `Proventos Líquidos: -76,37` são valores reais do documento.
- O valor de `Provisão FGTS` não pode mais aparecer como se fosse líquido.
- As verbas da tabela `Verba / Nome / Base / Saldo / Benefício / Valor` continuam em `fields[]`; bases/resultados continuam em `bases[]`.

### payroll-03 e payroll-04
- Mantido o tratamento anterior para os layouts nativo e OCR.
- Nenhum valor é calculado a partir de outros campos.
- Quando a leitura não é confiável, o pipeline usa `?` conforme o contrato.

## Cartões de ponto

- Mantido o processamento SIPON, Ponto Eletrônico e cartão com `Ent1/Sai1...Ent4/Sai4`.
- A ordem das linhas do documento é preservada.
- Duas linhas com a mesma data continuam sendo duas linhas quando realmente aparecem como duas linhas no PDF.
- Horários da jornada e valores de ocorrência do SIPON não são tratados como batidas.
- Horários inválidos continuam sendo marcados com `?`, sem substituição por outro horário plausível.

## Contrato

A saída continua seguindo literalmente o formato do README:
- holerite: `pages[].page`, `year`, `month`, `fields[]`, `bases[]`;
- cartão de ponto: `pages[].page`, `days[]`, `date_raw`, `punches[]`, `kind`, `time_raw`, `time_hhmm`.

Valores monetários permanecem como strings no formato brasileiro.

## Validação

Foram executados:
- `tests/test-holerite.js`
- `tests/test-cartao-ponto.js`
- `tests/test-tipo-documento.js`

Também foram adicionados testes de regressão específicos para:
- vazamento da coluna `RESULTADOS` no payroll-01;
- referência `0` versus valor `58,18`;
- distinção entre `Proventos Líquidos` e `Provisão FGTS` no payroll-02;
- preservação de negativos somente quando impressos no documento.
