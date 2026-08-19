# Correções V11 — payroll-02 e incerteza no payroll-04

## Payroll-02
- Mantida a lógica da versão que já apresentava boa leitura do layout `Declaração Remuneração`.
- O pipeline agora detecta uma camada nativa fortemente estruturada antes de decidir pelo OCR.
- Quando o PDF possui texto nativo com âncoras como `Declaração Remuneração`, `Folha de Pagamento`, `Mês/Ano`, `Verba/Nome/Valor` e `Proventos Líquidos`, a camada nativa é preservada.
- Isso evita que o OCR destrua a estrutura tabular de um PDF que já possui texto confiável.
- `Proventos Líquidos` é obtido somente do bloco `Folha de Pagamento: MÊS`; o mesmo rótulo existente em `ACERTO` não é usado como líquido mensal.
- `Provisão FGTS` e demais valores do bloco `ACERTO` não contaminam as bases do mês.

## Payroll-04
- Valores de `fields[]` ou `bases[]` que chegarem vazios/nulos são convertidos para `?`.
- Quando um rótulo de base é claramente encontrado no OCR, mas seu valor não pode ser associado com segurança, o registro é mantido com `?` em vez de ser omitido.
- Se uma leitura posterior encontrar o valor real de um rótulo que estava com `?`, o valor reconhecido substitui o `?`.
- O tratamento não cria valores a partir de cálculos ou de outros campos.

## Cartão de ponto
- `cartaoPontoExtractor.js` não foi alterado.
- Os testes existentes do cartão de ponto continuam passando.

## Validação
- O contrato continua sendo o do README original: `pages[].page`, `year`, `month`, `fields[]` e `bases[]`.
