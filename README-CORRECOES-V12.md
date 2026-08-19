# Correções V12 — payroll-02 e persistência das imagens OCR

## Payroll-02
- Corrigido o reconhecimento do cabeçalho tabular quando o PDF nativo entrega `Verba`, `Nome`, `Base / Saldo / Benefício` e `Valor` em linhas separadas.
- As verbas da tabela principal agora são lidas a partir da primeira linha `Verba` válida e continuam até o início da seção de bases/resumo.
- Os valores negativos impressos na tabela de descontos são preservados, pois fazem parte da verba; nenhum valor é convertido em positivo ou calculado.
- `Proventos Líquidos` continua sendo lido exclusivamente do bloco `Folha de Pagamento: MÊS`, nunca do bloco `ACERTO`.
- `Provisão FGTS`, `Proventos Bruto`, `Consignação` e demais valores do bloco `ACERTO` não contaminam as bases do mês.

## OCR / temp-orc
- As páginas PNG geradas durante OCR voltaram a ser preservadas em `temp-orc/<uuid>/pagina-XX.png`.
- A limpeza automática que apagava essas imagens após o OCR foi removida para permitir auditoria visual e comparação com a transcrição.
- O processo continua usando um diretório isolado por transcrição.

## Cartão de ponto
- `cartaoPontoExtractor.js` não foi alterado nesta versão.

## Validação
- Testes do extrator de holerite: OK.
- Testes de regressão payroll-01/payroll-02: OK.
- Teste de incerteza payroll-04: OK.
- Testes do cartão de ponto: OK.
- Teste de detecção de tipo: OK.
- Contrato de saída permanece `pages[].page`, `year`, `month`, `fields[]` e `bases[]`, conforme o README original.
