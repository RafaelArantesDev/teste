# Quick Filler — Transcrição de Holerites e Cartões de Ponto

Aplicação web para receber documentos trabalhistas em PDF, extrair informações estruturadas, permitir conferência e correção manual e exportar o resultado em formatos reutilizáveis.

O projeto foi desenvolvido para lidar com documentos de layouts diferentes e também com PDFs digitalizados. A estratégia adotada combina extração nativa do PDF com OCR e evita preencher automaticamente informações que não puderam ser reconhecidas com segurança.

---

## 1. Objetivo

O Quick Filler automatiza parte do trabalho de leitura e digitação de **holerites** e **cartões de ponto**.

Fluxo principal:

```text
PDF
 ↓
Upload pela interface ou API
 ↓
Validação do arquivo
 ↓
Extração nativa do texto
 ↓
Análise da qualidade da extração
 ↓
OCR, quando necessário
 ↓
Identificação e interpretação do layout
 ↓
JSON estruturado
 ↓
Conferência / edição manual
 ↓
Exportação XLSX, CSV ou JSON
```

Uma decisão importante do projeto é priorizar a confiabilidade: quando uma informação não pode ser identificada com segurança, o sistema utiliza o marcador `?` ou mantém o campo editável em branco na interface, em vez de criar um valor inexistente.

---

## 2. Funcionalidades implementadas

- Upload de um arquivo PDF por vez.
- Seleção entre `holerite` e `cartao-ponto`.
- Validação do MIME informado no upload e validação do conteúdo real do arquivo.
- Limite de upload de **10 MB**.
- Processamento assíncrono com identificador UUID.
- Estados de processamento: `processando`, `concluido` e `erro`.
- Extração de texto nativa para PDFs que já possuem camada textual utilizável.
- OCR automático para documentos cuja extração nativa é insuficiente.
- OCR em processo Node.js isolado, evitando bloquear diretamente o processo principal da API.
- Suporte a diferentes estruturas de holerite.
- Suporte a diferentes estruturas de cartão de ponto.
- Tratamento conservador de campos não reconhecidos.
- Interface web para envio, visualização, conferência e edição.
- Visualização do PDF original ao lado do resultado.
- Correção manual de informações extraídas.
- Inclusão manual de verbas/bases de holerite não reconhecidas.
- Inclusão e edição de batidas e dias de cartão de ponto não reconhecidos.
- Persistência das correções durante o tempo de vida da transcrição.
- Exportação dos dados corrigidos em XLSX, CSV e JSON.
- Endpoint de health check.
- Limpeza automática de arquivos/transcrições temporárias após o período de retenção.
- Execução local ou por Docker Compose.
- Testes automatizados para os principais módulos de interpretação e exportação.

---

## 3. Tecnologias

### Backend

- Node.js
- JavaScript ES Modules
- Express
- Multer
- `file-type`
- `pdf-parse`
- `pdfjs-dist`

### OCR e PDF

- Tesseract.js
- modelo de idioma português (`por.traineddata`)
- `@napi-rs/canvas`

### Frontend

- HTML5
- CSS3
- JavaScript
- Fetch API

### Infraestrutura

- Docker
- Docker Compose

---

## 4. Estrutura do projeto

```text
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
├── por.traineddata
├── public/
│   └── index.html
├── src/
│   ├── server.js
│   ├── router.js
│   ├── extractors/
│   │   ├── holeriteExtractor.js
│   │   ├── cartaoPontoExtractor.js
│   │   └── colunas.js
│   └── services/
│       ├── extracaoService.js
│       ├── layout.js
│       ├── ocrProcess.js
│       ├── pdfQuality.js
│       ├── pdfService.js
│       └── planilhaService.js
├── tests/
│   ├── test-holerite.js
│   ├── test-cartao-ponto.js
│   ├── test-tipo-documento.js
│   └── test-planilha.js
├── exemplos/
│   ├── payroll-01.pdf
│   ├── payroll-02.pdf
│   ├── payroll-03.pdf
│   ├── payroll-04.pdf
│   ├── time-card-01.pdf
│   ├── time-card-02.pdf
│   ├── time-card-03.pdf
│   └── time-card-04.pdf
├── uploads/      # criado/utilizado em execução e ignorado pelo Git
└── temp-orc/     # imagens temporárias do OCR; ignorado pelo Git
```

### Responsabilidade dos principais módulos

| Arquivo | Responsabilidade |
|---|---|
| `src/server.js` | Inicialização do Express, arquivos estáticos e montagem das rotas. |
| `src/router.js` | Upload, validação, estado das transcrições, consulta, edição e download. |
| `extracaoService.js` | Decide entre extração nativa e OCR. |
| `pdfService.js` | Extração das páginas do PDF. |
| `pdfQuality.js` | Avaliação da qualidade do texto extraído. |
| `ocrProcess.js` | Renderização/processamento OCR das páginas. |
| `layout.js` | Reconstrução de linhas e layout textual. |
| `holeriteExtractor.js` | Interpretação específica de holerites. |
| `cartaoPontoExtractor.js` | Interpretação específica de cartões de ponto. |
| `colunas.js` | Apoio à interpretação espacial/colunas. |
| `planilhaService.js` | Geração dos arquivos XLSX, CSV e JSON. |
| `public/index.html` | Interface de upload, conferência, edição e exportação. |

---

## 5. Como a extração funciona

### 5.1 Extração nativa

O sistema tenta inicialmente extrair o conteúdo textual já existente no PDF. As páginas são reconstruídas em uma representação textual preservando informações úteis de layout.

Essa abordagem é preferida quando a qualidade é suficiente porque é mais rápida e normalmente mais precisa do que executar OCR desnecessariamente.

### 5.2 Avaliação de qualidade

O texto nativo passa por uma análise de qualidade. Quando as métricas indicam que o conteúdo extraído não é suficiente para interpretar o documento, o fluxo muda automaticamente para OCR.

### 5.3 OCR

O OCR é executado em um processo Node separado. Durante esse processamento, as páginas podem ser renderizadas como imagens temporárias dentro de `temp-orc/`.

Essas imagens são **artefatos temporários de processamento** e não fazem parte do código-fonte. Por isso `temp-orc/` permanece no `.gitignore`.

### 5.4 Interpretação

Depois da obtenção do texto, o documento é enviado ao extrator correspondente:

```text
texto
 ├─ holerite       → extrairHolerite()
 └─ cartao-ponto   → extrairCartaoPonto()
```

Os extratores utilizam regras compatíveis com os diferentes layouts encontrados nos PDFs de exemplo, em vez de depender de uma única estrutura fixa.

---

## 6. Tratamento de documentos heterogêneos

Durante o desenvolvimento foi identificado que documentos do mesmo tipo podem possuir estruturas bastante diferentes.

### Holerites

Entre os casos tratados estão:

- ficha financeira com vários períodos;
- demonstrativo de pagamento mensal;
- recibo de pagamento;
- diferenças de nomenclatura entre campos equivalentes;
- documentos com múltiplos blocos na mesma página física;
- PDFs nativos e PDFs escaneados;
- OCR com ruído, caracteres incorretos e espaçamento irregular.

Um dos problemas encontrados inicialmente era separar documentos usando somente textos exatos como `Declaração Remuneração` ou `Período`. Em OCR degradado, pequenas alterações nesses textos podiam juntar dois documentos ou eliminar uma separação. O extrator evoluiu para considerar a estrutura real dos exemplos e múltiplos sinais de layout.

Outro caso importante foi o `payroll-02.pdf`, cuja estrutura difere dos demais e contém nomenclaturas e regiões repetidas. A implementação foi ajustada para não selecionar simplesmente a primeira ocorrência textual de um rótulo quando isso poderia associar o valor à seção errada.

### Cartões de ponto

O extrator de cartão de ponto foi desenvolvido separadamente do holerite e considera informações por página/período e registros diários de batidas.

Quando uma batida não é reconhecida, a interface permite preencher a posição manualmente. Se uma linha/dia inteiro não tiver sido identificado, também é possível adicioná-lo manualmente antes da exportação.

---

## 7. Regra para informações não reconhecidas

A aplicação **não deve inventar valores** para completar uma transcrição.

Quando o extrator não possui evidência suficiente para determinar um dado, utiliza-se o marcador:

```text
?
```

Na interface, campos ausentes que podem ser completados manualmente também podem aparecer como caixas vazias editáveis.

Isso é especialmente importante em documentos escaneados de baixa qualidade: é preferível sinalizar incerteza e permitir conferência humana a apresentar um número incorreto como se tivesse sido reconhecido.

---

## 8. API

URL local padrão:

```text
http://localhost:3000
```

### `GET /healthz`

Verifica se a aplicação está respondendo.

Resposta esperada:

```json
{
  "resultado": "ok"
}
```

### `POST /api/transcricoes`

Cria uma transcrição.

Requisição `multipart/form-data`:

| Campo | Valor |
|---|---|
| `arquivo` | PDF |
| `tipo` | `holerite` ou `cartao-ponto` |

Resposta de criação:

```json
{
  "id": "uuid-da-transcricao"
}
```

O endpoint retorna HTTP `202`, pois o processamento continua de forma assíncrona.

Validações relevantes:

- apenas um arquivo;
- máximo de 10 MB;
- MIME de PDF no upload;
- verificação posterior do conteúdo real do arquivo;
- tipo obrigatório e suportado.

### `GET /api/transcricoes/:id`

Consulta o estado e o resultado.

Formato público:

```json
{
  "id": "uuid-da-transcricao",
  "tipo": "holerite",
  "status": "concluido",
  "erro": null,
  "value": {
    "pages": []
  }
}
```

Enquanto estiver processando, `value` pode ser `null`.

### `GET /api/transcricoes/:id/arquivo`

Retorna o PDF original enquanto ele ainda estiver disponível no armazenamento temporário.

### `PUT /api/transcricoes/:id`

Atualiza o conteúdo estruturado depois da conferência/edição manual.

Corpo esperado:

```json
{
  "value": {
    "pages": []
  }
}
```

A atualização somente é aceita quando a transcrição já está concluída.

### `GET /api/transcricoes/:id/planilha?formato=xlsx`

Gera o arquivo com os dados atuais da transcrição, incluindo correções feitas pelo usuário.

Formatos disponíveis pela aplicação:

```text
xlsx
csv
json
```

---

## 9. Códigos HTTP relevantes

| Código | Situação |
|---:|---|
| `200` | Consulta, edição, health check ou download concluído. |
| `202` | Upload aceito e processamento iniciado. |
| `400` | Arquivo/tipo/requisição inválidos. |
| `404` | Transcrição ou PDF temporário não encontrado. |
| `409` | Operação solicitada antes da conclusão do processamento. |
| `413` | PDF acima do limite de 10 MB. |
| `500` | Falha interna na geração/processamento correspondente. |

---

## 10. Interface web

O frontend é servido pelo próprio Express e pode ser aberto em:

```text
http://localhost:3000
```

A interface permite:

1. selecionar o tipo de documento;
2. selecionar o PDF;
3. enviar para processamento;
4. acompanhar o estado da transcrição;
5. visualizar o PDF original;
6. conferir o conteúdo extraído;
7. editar campos reconhecidos incorretamente;
8. preencher campos que o OCR não reconheceu;
9. adicionar informações ausentes nos casos suportados;
10. salvar as correções;
11. exportar em XLSX, CSV ou JSON.

O PDF e os dados são apresentados no mesmo fluxo para facilitar a conferência humana.

---

## 11. Execução local

### Pré-requisitos

- Node.js compatível com as dependências do projeto (recomenda-se Node.js 22, mesma versão principal utilizada no Docker);
- npm.

### Instalação

```bash
npm install
```

### Inicialização

```bash
npm start
```

A aplicação ficará disponível em:

```text
http://localhost:3000
```

---

## 12. Execução com Docker

O projeto contém `Dockerfile` e `docker-compose.yml`.

A imagem utiliza **Node.js 22 sobre Debian Bookworm Slim**.

### Subir a aplicação

```bash
docker compose up --build
```

Depois do build:

```text
Interface: http://localhost:3000
Health:    http://localhost:3000/healthz
```

### Encerrar

```bash
docker compose down
```

### Health check do container

O `Dockerfile` possui `HEALTHCHECK` consultando `/healthz` periodicamente. Isso permite que o runtime do Docker verifique se o processo está realmente respondendo HTTP, e não apenas se o container continua aberto.

### Volumes

O Compose monta:

```text
./uploads  → /app/uploads
./temp-orc → /app/temp-orc
```

Assim, os diretórios necessários ao processamento ficam disponíveis ao container.

---

## 13. Testes automatizados

Execute:

```bash
npm test
```

O script executa, em sequência:

```text
tests/test-holerite.js
tests/test-cartao-ponto.js
tests/test-tipo-documento.js
tests/test-planilha.js
```

### Escopo

#### `test-holerite.js`

Valida regras importantes da interpretação dos holerites e ajuda a evitar regressões nos diferentes layouts.

#### `test-cartao-ponto.js`

Valida a estrutura e as regras principais da interpretação dos cartões de ponto.

#### `test-tipo-documento.js`

Valida a identificação/normalização dos tipos suportados.

#### `test-planilha.js`

Valida a geração dos arquivos de saída e as estruturas necessárias à exportação.

---

## 14. Validação manual recomendada

Além dos testes automatizados, o fluxo completo deve ser validado pela interface e, quando necessário, por um cliente HTTP como Postman.

### Checklist funcional

- [ ] `npm test` finaliza sem falhas.
- [ ] `docker compose up --build` conclui o build.
- [ ] `GET /healthz` retorna HTTP 200 e `{ "resultado": "ok" }`.
- [ ] A interface abre em `/`.
- [ ] Um holerite pode ser enviado.
- [ ] Um cartão de ponto pode ser enviado.
- [ ] O status passa de `processando` para `concluido`.
- [ ] O PDF original pode ser visualizado pela interface.
- [ ] Campos não reconhecidos não recebem valores inventados.
- [ ] Campos vazios podem ser completados nos casos suportados.
- [ ] Alterações manuais podem ser salvas.
- [ ] O resultado salvo pode ser exportado.
- [ ] XLSX pode ser baixado.
- [ ] CSV pode ser baixado.
- [ ] JSON pode ser baixado.
- [ ] Os arquivos da pasta `exemplos/` podem ser utilizados como conjunto de regressão.
- [ ] Arquivos temporários do OCR não aparecem como alterações do Git.

### PDFs de regressão

Holerites:

```text
payroll-01.pdf
payroll-02.pdf
payroll-03.pdf
payroll-04.pdf
```

Cartões de ponto:

```text
time-card-01.pdf
time-card-02.pdf
time-card-03.pdf
time-card-04.pdf
```

Esses arquivos representam layouts e qualidades de digitalização diferentes e foram utilizados durante o desenvolvimento para identificar falhas que não apareceriam testando apenas um modelo de documento.

---

## 15. Principais problemas encontrados durante o desenvolvimento

### Separação incorreta de documentos/períodos

Versões iniciais dependiam excessivamente de delimitadores textuais exatos. Em OCR ruidoso, isso podia fazer dois blocos serem interpretados juntos ou um período deixar de ser encontrado.

**Tratamento:** evolução das regras de separação e interpretação considerando os diferentes layouts reais dos exemplos.

### Valores associados ao campo errado

Alguns documentos possuem rótulos repetidos ou estrutura em colunas. Uma busca textual simples podia encontrar um número correto no documento, mas pertencente a outro campo.

**Tratamento:** regras mais específicas de contexto e posição, além de política conservadora para campos ambíguos.

### Valores inexistentes sendo inferidos

Durante as primeiras versões, alguns fallbacks acabavam aceitando `0,00`, números negativos ou números próximos a um rótulo mesmo sem evidência suficiente.

**Tratamento:** remoção/restrição de inferências inseguras e uso de `?` quando a leitura não é confiável.

### PDFs escaneados

Alguns exemplos não possuem texto nativo suficiente e apresentam ruído significativo.

**Tratamento:** análise automática de qualidade e fallback para OCR.

### Diferenças entre holerites

`payroll-01`, `payroll-02`, `payroll-03` e `payroll-04` não seguem um único modelo visual. Um parser baseado em apenas um deles apresentava regressões nos demais.

**Tratamento:** desenvolvimento e testes considerando o conjunto de exemplos, sem assumir um único layout universal.

### Cartão de ponto não exibido no frontend

O backend e o frontend precisaram compartilhar corretamente o formato `pages` e as estruturas específicas de cartão de ponto.

**Tratamento:** renderização específica por tipo de documento e validação ponta a ponta pela interface.

### Arquivos temporários no Git

Imagens PNG geradas durante OCR chegaram a poluir o histórico do repositório.

**Tratamento:** remoção dos temporários versionados e manutenção de `temp-orc/` no `.gitignore`.

---

## 16. Armazenamento e ciclo de vida

As transcrições são mantidas em memória utilizando `Map`.

Isso significa que:

- a solução atual não depende de banco de dados;
- os dados existem durante a execução da instância;
- reiniciar o servidor/container remove os registros em memória;
- uploads são temporários;
- uma rotina remove transcrições concluídas/erro e seus arquivos depois do período de retenção.

O período padrão de retenção é de **1 hora** e pode ser alterado pela variável:

```text
RETENCAO_MS
```

Existe um limite mínimo de 60 segundos aplicado pela aplicação.

Essa arquitetura é adequada ao escopo atual de processamento temporário, mas não deve ser confundida com armazenamento permanente.

---

## 17. Segurança e validações

Foram implementadas medidas básicas adequadas ao escopo do desafio:

- limite de tamanho do upload;
- apenas um arquivo por requisição;
- filtro de MIME;
- validação da assinatura/tipo real do arquivo com `file-type`;
- nomes internos de upload gerados pela aplicação;
- tipos de documento restritos aos suportados;
- limite de 2 MB para JSON de edição;
- PDF servido com `Cache-Control: private, no-store`;
- limpeza periódica de arquivos temporários.

---

## 18. Limitações conhecidas

OCR não é determinístico e sua qualidade depende diretamente da resolução, contraste, rotação, ruído e estrutura visual do documento.

Por isso:

- documentos novos com layouts muito diferentes podem exigir novas regras de interpretação;
- digitalizações ruins podem gerar campos `?`;
- a aplicação oferece edição manual justamente para que incertezas possam ser corrigidas antes da exportação;
- os dados não são persistidos após reinicialização do servidor;
- a implementação atual foi validada principalmente com o conjunto de PDFs disponibilizado em `exemplos/`.

O uso de `?` é intencional: uma ausência explícita é mais segura do que um dado inventado.

---

## 19. Decisões de projeto

### Extração híbrida em vez de OCR para tudo

PDFs com texto nativo aproveitável não precisam pagar o custo e a perda potencial de precisão do OCR. O OCR é acionado quando a avaliação de qualidade indica necessidade.

### Processamento assíncrono

O `POST` responde com UUID e HTTP 202. O cliente consulta posteriormente o resultado. Isso evita manter a requisição de upload aberta durante todo o OCR.

### Correção humana

OCR e parsers heurísticos possuem limitações. A interface permite corrigir a saída antes da exportação, mantendo o usuário no controle do dado final.

### Falha explícita em vez de dado fabricado

O sistema prefere `?`/campo vazio editável quando não há evidência suficiente.

### Frontend e API no mesmo servidor

O Express serve `public/` e a API na mesma aplicação, reduzindo a complexidade de execução e eliminando a necessidade de configurar dois serviços para o escopo atual.

---

## 20. Fluxo de validação para entrega

Antes de uma entrega/release, recomenda-se executar exatamente esta sequência:

```bash
npm install
npm test
docker compose up --build
```

Em seguida:

1. abrir `http://localhost:3000`;
2. confirmar `http://localhost:3000/healthz`;
3. testar pelo menos um holerite nativo;
4. testar pelo menos um documento que acione OCR;
5. testar um cartão de ponto;
6. conferir o PDF contra os dados apresentados;
7. editar um campo;
8. salvar a alteração;
9. baixar XLSX, CSV e JSON;
10. confirmar que os arquivos exportados refletem a correção salva;
11. encerrar com `docker compose down`.

Para uma regressão completa, repetir o fluxo com os oito PDFs principais da pasta `exemplos/`.

---

## 21. Histórico técnico resumido

O projeto evoluiu incrementalmente:

1. criação da API básica de upload;
2. validação e armazenamento temporário dos PDFs;
3. criação do controle de transcrições por UUID;
4. extração nativa de PDF;
5. implementação de OCR para documentos escaneados;
6. interpretação inicial de holerites;
7. identificação de problemas de separação e associação de valores;
8. adaptação para múltiplos layouts de holerite;
9. adoção da política de `?` para informações não reconhecidas;
10. implementação do extrator de cartões de ponto;
11. correções específicas para layouts e OCR degradado;
12. criação da interface web;
13. integração da interface com a API;
14. edição e correção manual dos resultados;
15. geração de XLSX, CSV e JSON;
16. criação/fortalecimento dos testes automatizados;
17. containerização com Docker;
18. health check e ajustes de execução;
19. revisão dos requisitos mínimos e tratamento de erros;
20. limpeza de artefatos temporários e preparação para entrega.

---

## 22. Comandos rápidos

```bash
# instalar dependências
npm install

# executar testes
npm test

# executar sem Docker
npm start

# executar com Docker
docker compose up --build

# parar containers
docker compose down
```

---

## 23. Resultado

A versão atual entrega um fluxo completo:

```text
Upload
→ validação
→ extração nativa/OCR
→ interpretação
→ JSON estruturado
→ conferência visual
→ edição manual
→ salvamento
→ exportação
```

A aplicação foi construída e refinada utilizando documentos de exemplo com estruturas diferentes, incluindo PDFs textuais e digitalizados, e mantém uma política conservadora para dados de baixa confiança.

---

## Autor

**Rafael Arantes**
