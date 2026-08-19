# SOLUÇÃO — Quick Filler

Este documento descreve como executar a aplicação, as principais decisões técnicas tomadas durante o desenvolvimento, o estado dos testes e o que ficou fora do escopo da entrega atual.

## 1. Aplicação publicada

**URL pública:** https://quick-filler-rafael.onrender.com

**Health check:** https://quick-filler-rafael.onrender.com/healthz

O deploy foi realizado no Render usando o `Dockerfile` do projeto. A aplicação foi validada na URL pública com os fluxos principais: carregamento do frontend, health check, upload de PDFs, processamento, OCR quando necessário, revisão manual e exportação dos resultados.

A instância utilizada é a modalidade gratuita do Render. Após períodos de inatividade o serviço pode entrar em suspensão; por isso, a primeira requisição depois de um período sem uso pode levar aproximadamente 50 segundos ou mais para responder.

## 2. Como executar

### Opção recomendada — Docker

Pré-requisito: Docker Desktop/Docker Engine com Docker Compose.

```bash
git clone https://github.com/RafaelArantesDev/teste.git
cd teste
docker compose up --build
```

Após o build:

- Interface: `http://localhost:3000`
- Health check: `http://localhost:3000/healthz`

Para encerrar:

```bash
docker compose down
```

O Dockerfile usa Node.js 22 sobre Debian Bookworm Slim, instala somente dependências de produção, cria os diretórios temporários necessários, expõe a porta da aplicação e possui `HEALTHCHECK` HTTP em `/healthz`. Em hospedagem, o servidor utiliza `process.env.PORT` e escuta em `0.0.0.0`.

### Execução sem Docker

Pré-requisitos: Node.js 22 e npm.

```bash
npm install
npm start
```

A aplicação fica disponível em `http://localhost:3000`.

### Executar os testes

```bash
npm test
```

O comando executa os testes de holerite, cartão de ponto, tipo de documento e geração de planilhas.

## 3. Fluxo da solução

```text
PDF
 ↓
POST /api/transcricoes
 ↓
Multer + validação do arquivo
 ↓
UUID + status processando
 ↓
Extração nativa do PDF
 ↓
Avaliação da qualidade
 ├── suficiente → usa texto nativo
 └── insuficiente → OCR
 ↓
Extrator de holerite ou cartão de ponto
 ↓
JSON estruturado
 ↓
Conferência e edição humana no frontend
 ↓
PUT /api/transcricoes/:id
 ↓
Exportação XLSX / CSV / JSON
```

A interface e a API são servidas pelo mesmo processo Express.

## 4. Decisões técnicas

### 4.1 Extração nativa antes do OCR

OCR não é executado indiscriminadamente. O sistema primeiro tenta aproveitar a camada textual do PDF e avalia sua qualidade. OCR é acionado quando a extração nativa é insuficiente.

A escolha reduz processamento desnecessário e evita substituir texto digital confiável por uma leitura OCR potencialmente mais ruidosa.

### 4.2 OCR em processo isolado

O OCR é executado por um processo Node separado. A operação é significativamente mais pesada do que as rotas HTTP normais, portanto isolá-la reduz o impacto direto sobre o processo principal da API.

### 4.3 Extratores separados por domínio

Holerites e cartões de ponto possuem contratos e layouts muito diferentes. Foram implementados extratores independentes (`holeriteExtractor.js` e `cartaoPontoExtractor.js`) em vez de uma função genérica com muitas condições misturadas.

### 4.4 Regras por layout, não uma regex universal

Os documentos de exemplo demonstraram que um mesmo tipo documental pode ter estruturas muito diferentes. A implementação passou a identificar sinais do layout e aplicar regras adequadas a cada família de documento.

Essa decisão surgiu após erros reais de desenvolvimento: separadores textuais rígidos falhavam com OCR degradado, meses eram associados à página errada e valores de regiões distintas podiam ser misturados.

### 4.5 Não inventar informação

Quando não existe evidência suficiente para reconstruir uma informação, o sistema preserva a incerteza (`?`, `??` ou campo editável, conforme o contrato) em vez de inferir um valor aparentemente plausível.

Isso é particularmente importante em horários, competência e campos monetários provenientes de documentos escaneados.

### 4.6 Human-in-the-loop

O resultado automático não é tratado como verdade absoluta. O frontend exibe o PDF ao lado dos dados, permite editar campos reconhecidos incorretamente e preencher campos não reconhecidos. A exportação usa o estado corrigido pelo usuário.

### 4.7 Processamento assíncrono simples

O `POST` retorna `202` e um UUID. O estado fica temporariamente em memória (`Map`) e o cliente consulta o resultado pelo ID.

Para o escopo do desafio isso evita adicionar banco, Redis e fila sem necessidade. A limitação dessa decisão está documentada na seção de produção.

### 4.8 Validação real do PDF

Além do MIME recebido no multipart, o arquivo salvo é inspecionado com `file-type`. O upload é limitado a um PDF de até 10 MB.

### 4.9 Docker como ambiente reproduzível

Foi escolhida a imagem Node 22 porque dependências atuais do projeto exigem uma versão moderna do Node. O Compose expõe a aplicação na porta 3000 e monta os diretórios temporários utilizados pelo processamento.

### 4.10 Deploy no Render

O serviço publicado usa o mesmo `Dockerfile` validado localmente. O Render fornece a porta por variável de ambiente, e o servidor foi preparado para escutar em `0.0.0.0`. O health check configurado é `/healthz`.

Essa abordagem reduz diferenças entre o ambiente local e o ambiente publicado.

## 5. API principal

- `GET /healthz` — saúde da aplicação.
- `POST /api/transcricoes` — recebe PDF e inicia processamento.
- `GET /api/transcricoes/:id` — consulta status/resultado.
- `GET /api/transcricoes/:id/arquivo` — exibe o PDF original temporário.
- `PUT /api/transcricoes/:id` — persiste a revisão manual enquanto a transcrição existir.
- `GET /api/transcricoes/:id/planilha?formato=xlsx|csv|json` — exporta o resultado atual.

## 6. Testes e métricas

### 6.1 Suíte automatizada existente

O projeto possui quatro arquivos de teste executados pelo `npm test`:

| Grupo | Objetivo |
|---|---|
| Holerite | contrato, layouts e regressões de valores/bases |
| Cartão de ponto | diferentes layouts, páginas, datas e horários |
| Tipo de documento | normalização/detecção suportada |
| Planilha | geração dos formatos de exportação |

### 6.2 Casos de regressão documentados

Nos testes de holerite há cobertura explícita para:

- layout de declaração/remuneração;
- demonstrativo mensal;
- recibo de pagamento;
- ficha financeira;
- prevenção de vazamento de valores entre regiões/colunas;
- associação correta de competência;
- prevenção de bases incorretas;
- tratamento de campos incertos sem valor vazio indevido.

Nos testes de cartão de ponto há cobertura explícita para:

- SIPON/folha de frequência;
- relatório de ponto eletrônico;
- cartão com data completa;
- cartão manuscrito/competência ilegível;
- múltiplas páginas;
- datas repetidas sem fusão silenciosa;
- horário impossível sem transformação em horário aparentemente válido;
- dias sem batidas.

### 6.3 Conjunto de documentos usado durante o desenvolvimento

O repositório mantém oito documentos principais de regressão funcional:

- `payroll-01.pdf`
- `payroll-02.pdf`
- `payroll-03.pdf`
- `payroll-04.pdf`
- `time-card-01.pdf`
- `time-card-02.pdf`
- `time-card-03.pdf`
- `time-card-04.pdf`

Além da suíte automatizada, esses arquivos foram usados repetidamente para validação manual do fluxo completo durante o desenvolvimento: upload, processamento, comparação com o PDF, edição e exportação.

### 6.4 Métricas que podem ser afirmadas a partir do projeto

- **4 grupos/arquivos de testes automatizados** no comando `npm test`.
- **8 PDFs principais de regressão funcional** mantidos no repositório.
- **4 layouts/famílias de holerite** representados no conjunto principal.
- **4 layouts/famílias de cartão de ponto** representados no conjunto principal.
- **3 formatos de exportação** exercitados pela funcionalidade: XLSX, CSV e JSON.
- **Deploy público validado** com os dois tipos documentais e o fluxo de exportação.

Não é apresentada uma porcentagem artificial de “acurácia do OCR”. O conjunto disponível é pequeno e heterogêneo, e uma porcentagem calculada apenas sobre esses exemplos daria uma impressão de generalização que o projeto não consegue demonstrar. Da mesma forma, o projeto não possui instrumentação de cobertura de linhas, portanto não é declarado um percentual de code coverage sem medi-lo.

## 7. Validação manual de entrega

A versão final foi validada localmente e na URL pública. O checklist utilizado foi:

1. `GET /healthz` retorna HTTP 200.
2. Interface abre na raiz.
3. Upload válido retorna um ID e chega a `concluido`.
4. PDF inválido é recusado.
5. Holerites são comparados visualmente com seus PDFs.
6. Cartões de ponto são comparados visualmente com seus PDFs.
7. Campo incorreto pode ser editado.
8. Campo/dia não reconhecido pode ser preenchido manualmente nos casos suportados.
9. Alterações podem ser salvas.
10. XLSX, CSV e JSON podem ser gerados a partir do resultado revisado.
11. Os fluxos principais foram repetidos pela URL pública do Render.

Para repetir localmente:

```bash
npm test
docker compose up --build
```

## 8. O que ficou de fora / o que implementar para produção

Estas limitações são deliberadamente registradas em vez de apresentadas como funcionalidades concluídas.

### Persistência durável

As transcrições ficam em `Map`. Reiniciar a aplicação perde os registros. Uma versão de produção deveria usar banco de dados e/ou armazenamento compartilhado.

### Fila de processamento

O processamento é assíncrono para o cliente, mas não existe uma fila distribuída. Em maior volume seria adequado usar uma fila com workers, controle de concorrência, retry e dead-letter strategy.

### Escalabilidade horizontal

Estado em memória e arquivos locais tornam múltiplas réplicas problemáticas. Produção deveria usar persistência e object storage compartilhados.

### Autenticação e autorização

A solução do desafio não implementa usuários, login, isolamento por conta ou autorização de acesso às transcrições. Isso seria obrigatório antes de processar documentos reais sensíveis em ambiente público.

### Observabilidade

Existem logs de execução, mas não métricas operacionais, tracing, dashboard, alertas ou correlação estruturada por requisição.

### Segurança de produção

Uma implantação real deveria acrescentar políticas de autenticação, rate limiting, headers de segurança, gestão de segredos, TLS na borda, auditoria e políticas de retenção adequadas à natureza dos documentos.

### Limitações do plano gratuito do Render

A instância pode entrar em suspensão por inatividade e possui recursos reduzidos. Além disso, a solução atual não depende de persistência local durável: filesystem e memória não devem ser tratados como armazenamento permanente em produção.

### Generalização para layouts desconhecidos

Os extratores foram fortalecidos contra os layouts do conjunto fornecido, mas documentos totalmente diferentes podem exigir novas regras. Não é correto afirmar que regex/OCR determinístico generaliza para qualquer holerite ou cartão de ponto existente.

### Avaliação formal de OCR

Ficou de fora uma base anotada (“ground truth”) grande o suficiente para medir precisão por campo, recall e taxa de erro do OCR/extrator. Essa seria a próxima evolução para transformar os testes de regressão em avaliação quantitativa de qualidade.

### CI/CD

A suíte pode ser executada por `npm test` e o Render está configurado para deploy a partir da branch principal, mas uma pipeline completa de CI com testes obrigatórios antes do deploy não faz parte da solução atual.

## 9. Principal risco técnico

O ponto mais sensível continua sendo a interpretação de PDFs escaneados e layouts não vistos. A solução reduz o risco usando fallback OCR, regras conservadoras e revisão humana, mas não elimina a incerteza inerente ao reconhecimento de documentos heterogêneos.
