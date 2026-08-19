# Quick Filler — Transcrição de Holerites e Cartões de Ponto

Aplicação web para receber holerites e cartões de ponto em PDF, extrair informações estruturadas, permitir conferência/correção humana e exportar o resultado.

## Entrega

### 1. Repositório

**GitHub:** https://github.com/RafaelArantesDev/teste

### 2. URL da aplicação publicada

**Aplicação:** https://quick-filler-rafael.onrender.com

**Health check:** https://quick-filler-rafael.onrender.com/healthz

O deploy foi validado no Render com frontend, backend, upload, processamento, OCR, edição dos dados e exportação de arquivos.

> Observação: a aplicação utiliza a instância gratuita do Render. Após períodos de inatividade o serviço pode entrar em suspensão e a primeira requisição pode levar cerca de 50 segundos ou mais para responder.

### 3. Documentação da solução

Consulte **[`SOLUCAO.md`](./SOLUCAO.md)** para:

- como executar localmente e com Docker;
- arquitetura e fluxo da solução;
- decisões técnicas;
- API e exportação;
- testes e métricas;
- validação da entrega;
- limitações e o que ficou de fora.

### 4. Processo de desenvolvimento e uso de IA

Consulte **[`PROCESSO.md`](./PROCESSO.md)** para:

- ferramentas e agentes utilizados e para quê;
- erros/caminhos incorretos sugeridos pelo agente e como foram identificados;
- o que precisou ser reescrito ou direcionado manualmente;
- três decisões com mais de uma solução razoável;
- o que tende a quebrar primeiro em produção;
- pontos em que existe menor confiança na entrega;
- como os testes e PDFs reais influenciaram o desenvolvimento.

## Execução rápida

### Docker

```bash
docker compose up --build
```

Interface: `http://localhost:3000`

Health check: `http://localhost:3000/healthz`

### Sem Docker

Recomenda-se Node.js 22.

```bash
npm install
npm start
```

## Testes

```bash
npm test
```

A suíte executa testes de:

- holerites e regressões dos layouts tratados;
- cartões de ponto e regressões;
- normalização/detecção do tipo documental;
- geração de planilhas/arquivos de saída.

O repositório também contém os PDFs de exemplo usados para regressão funcional e conferência manual do fluxo completo.

## Fluxo principal

```text
PDF
 ↓
Upload e validação
 ↓
Extração nativa
 ↓
Avaliação de qualidade
 ↓
OCR quando necessário
 ↓
Extrator do tipo documental
 ↓
JSON estruturado
 ↓
Conferência e edição manual
 ↓
Exportação XLSX / CSV / JSON
```

A aplicação prioriza não inventar dados: informações sem evidência suficiente permanecem marcadas como incertas ou editáveis para revisão humana.

## Estrutura principal

```text
.
├── README.md
├── SOLUCAO.md
├── PROCESSO.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── public/
│   └── index.html
├── src/
│   ├── server.js
│   ├── router.js
│   ├── extractors/
│   └── services/
├── tests/
└── exemplos/
```

A documentação detalhada foi separada propositalmente para seguir o formato de entrega solicitado no desafio, evitando duplicar em `README.md` todo o conteúdo técnico e de processo.
