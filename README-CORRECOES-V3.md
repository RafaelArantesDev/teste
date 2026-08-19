# Desafio Rafael — versão corrigida v3

## Correções desta versão

### 1. `?` agora chega até o Postman
Nenhum campo do objeto `documentos` retorna `null`. Quando o parser não consegue identificar um campo com segurança, o valor é `?`.

Isso é aplicado no final do extrator, depois de todas as tentativas de reconhecimento, para não transformar um valor recuperável em `?` prematuramente.

### 2. Payroll-02 foi tratado como um formato diferente
O payroll-02 não possui o layout dos holerites tradicionais. Ele usa:

- `Mês/Ano`
- `Proventos Bruto`
- `Consignação`
- `Proventos Líquidos`
- `INSS-CONTR.PESSOAL`
- `IMPOSTO DE RENDA-FONTE`
- `Provisão FGTS`

O extrator agora reconhece esses campos diretamente.

### 3. Ficha financeira do payroll-01
Quando o PDF é uma ficha financeira, uma página pode conter várias competências. A separação por `Mês:` é feita antes da separação por `Fls.:`, evitando que várias competências sejam tratadas como um único documento.

### 4. Payroll-03
Mantida a separação por folha e corrigida a leitura de:

`Total A B` → `totalProventos = A` e `totalDescontos = B`.

### 5. Payroll-04 / OCR
O PDF escaneado passa pelo OCR. O processo OCR agora:

- renderiza as páginas em escala 4;
- usa Tesseract com `PSM 6`;
- preserva espaços entre palavras;
- envia o texto OCR ao mesmo extrator dos PDFs nativos;
- não descarta o resultado só porque a qualidade do OCR continua imperfeita.

### 6. Bug importante no fluxo assíncrono
Antes, depois de rodar OCR, o router ainda poderia interpretar `avaliacao.usarOCR === true` como falha e impedir o extrator de trabalhar.

Agora a avaliação decide se o OCR será acionado, mas não decide se o resultado extraído será descartado. O extrator recebe o texto mesmo quando ele contém ruído e usa `?` nos campos incertos.

### 7. Compatibilidade com OCR ruidoso
Foram adicionadas tolerâncias para casos como:

- `OTAL DE PROVENTOS`
- `OTAL DE DESCONTOS`
- `alario Base`
- `argo/Nível`
- `CONSULTOR...` com caracteres extras do OCR.

Essas tolerâncias só corrigem o reconhecimento de rótulos. Valores financeiros não são inventados.

## Estrutura

- `src/server.js` — servidor
- `src/router.js` — upload, processamento assíncrono e consulta
- `src/services/extracaoService.js` — PDF nativo + decisão de OCR
- `src/services/ocrProcess.js` — processo isolado de OCR
- `src/services/ocrService.js` — implementação auxiliar de OCR
- `src/services/pdfService.js` — extração nativa
- `src/services/pdfQuality.js` — métricas de qualidade
- `src/extractors/holeriteExtractor.js` — parser dos holerites
- `tests/test-holerite.js` — testes automatizados
- `exemplos/` — PDFs fornecidos para validação

## Teste

```bash
npm install
npm test
npm start
```

O teste automatizado valida os formatos dos payroll-02, payroll-03 e payroll-04 e garante que nenhum campo volte como `null`.


## Cartão de ponto — implementação adicionada

A versão atual mantém o pipeline compartilhado e adiciona `src/extractors/cartaoPontoExtractor.js`. O extrator segue o contrato do desafio: `pages[].page`, `days[]`, `date_raw` e `punches[]`, com `kind`, `time_raw` e `time_hhmm`.

Foram tratados os formatos presentes em `exemplos/`:

- SIPON / Folha de Frequência (`time-card-01.pdf`);
- Ponto Eletrônico / Relatório Mensal (`time-card-02.pdf`);
- Cartão de Ponto com datas completas (`time-card-03.pdf`);
- Cartão quinzenal escaneado (`time-card-04.pdf`).

O parser preserva a ordem das páginas e dos dias, mantém dias sem batidas como `punches: []`, alterna `IN`/`OUT` sem inventar batidas e usa `?` quando a competência ou um caractere de horário não pode ser reconhecido com segurança. O OCR continua sendo decidido pelo pipeline compartilhado de `analisarPDF()`.

O comando `npm test` agora executa os testes de holerite e cartão de ponto.
