# PROCESSO — desenvolvimento e uso de IA

Este arquivo registra de forma transparente como a solução foi construída, como assistentes de IA foram usados, onde as sugestões falharam e quais decisões permaneceram sob validação humana.

O objetivo não é apresentar o desenvolvimento como uma sequência perfeita. O projeto passou por hipóteses erradas, regressões, revisões dos PDFs, alterações de estratégia e testes repetidos até chegar ao estado atual.

## 1. Ferramentas usadas e para quê

### ChatGPT / assistente de IA

Foi usado como parceiro de desenvolvimento durante praticamente todo o desafio, principalmente para:

- interpretar o enunciado e transformar os requisitos em etapas de implementação;
- revisar a arquitetura e o código existente;
- investigar bugs de extração;
- comparar a saída do sistema com os PDFs de exemplo;
- propor e implementar ajustes nos extratores;
- revisar contratos JSON;
- auxiliar na implementação da exportação XLSX/CSV/JSON;
- revisar frontend, backend e Docker;
- identificar requisitos mínimos ainda ausentes;
- criar e ampliar testes de regressão;
- revisar a limpeza de arquivos temporários e do repositório;
- apoiar a documentação final;
- revisar a preparação do deploy e a configuração do serviço público.

A IA não foi tratada como fonte de verdade. Várias respostas foram confrontadas com os PDFs e com a execução real da aplicação, e algumas abordagens precisaram ser descartadas.

### Git e GitHub

Foram usados para versionamento, sincronização entre alterações, branches/commits durante o desenvolvimento e consolidação da versão final. Também permitiram revisar o estado real do código antes da documentação.

### Node.js / npm

Node.js é o runtime do backend e dos testes. npm foi usado para instalação das dependências, execução da aplicação e execução da suíte de testes.

### Express

Usado para servir a interface e implementar a API HTTP.

### Multer e file-type

Multer recebe o upload multipart e aplica limites básicos. `file-type` verifica o conteúdo real do arquivo depois de salvo, evitando confiar apenas no MIME declarado pelo cliente.

### pdf-parse / pdfjs-dist

Usados no pipeline de leitura/renderização de PDFs e extração nativa.

### Tesseract.js + @napi-rs/canvas

Usados no fallback de OCR para PDFs escaneados ou cuja camada textual não apresenta qualidade suficiente.

### Docker / Docker Compose

Usados para criar um ambiente reproduzível de execução. Durante o desenvolvimento houve inclusive um problema inicial em que o comando `docker` não estava disponível na máquina; após a instalação/configuração, o build foi validado e a aplicação iniciou corretamente na porta 3000.

### Render

Usado para publicar a versão final a partir do mesmo `Dockerfile` validado localmente. O deploy foi configurado como Web Service, com health check em `/healthz`, porta fornecida pelo ambiente e bind do Express em `0.0.0.0`.

A aplicação publicada foi validada em:

`https://quick-filler-rafael.onrender.com`

Foram repetidos pela URL pública testes de interface, health check, upload, processamento, OCR, edição e exportação.

### Navegador / interface da aplicação

Usado repetidamente para testes manuais: upload, polling do processamento, comparação visual entre PDF e resultado, edição de campos e geração dos arquivos finais. Parte dos testes também foi repetida em janela anônima para evitar interferência de estado/cache do navegador.

## 2. Como o trabalho com IA aconteceu

O processo foi iterativo:

```text
requisito
  ↓
implementação inicial
  ↓
teste com PDFs reais
  ↓
comparação PDF × JSON/interface
  ↓
identificação de divergência
  ↓
revisão da hipótese do extrator
  ↓
correção
  ↓
teste de regressão
```

Os PDFs de exemplo tiveram papel central. Em vez de considerar uma implementação correta porque “parecia” compatível com o enunciado, as saídas foram comparadas com documentos concretos. Isso revelou vários erros que não seriam percebidos olhando somente o código.

## 3. Pontos em que o agente errou ou escolheu o caminho errado

### 3.1 Separação de holerites por um delimitador textual rígido

Uma abordagem inicial dependia de padrões como `Declaração Remuneração` e `Período` para separar blocos.

Isso parecia razoável nos textos mais limpos, mas falhou quando o OCR alterou caracteres ou espaçamento. O efeito era grave: um documento podia desaparecer da lista ou dois holerites podiam ser unidos. Depois disso, um regex que buscava o primeiro valor compatível podia capturar o INSS ou outro valor do bloco seguinte.

**Como percebemos:** a quantidade esperada de documentos não correspondia ao PDF e alguns valores estavam associados ao holerite errado.

**Como corrigimos:** voltamos aos PDFs/textos extraídos, analisamos marcadores alternativos e evoluímos a separação para considerar sinais do layout em vez de depender de uma única frase exata.

### 3.2 Usar `Fls.` como se resolvesse todos os layouts

Depois do primeiro problema, `Fls.:` apareceu como um delimitador aparentemente mais estável. Porém isso também não era uma solução universal.

No `payroll-01`, uma página física representa uma ficha financeira com vários meses. Separar apenas por folha/página agrupava competências diferentes no mesmo bloco e misturava bases e verbas. Em outro layout, marcadores de página como `-- 1 of 5 --` tinham significado importante e estavam sendo ignorados.

**Como percebemos:** o primeiro mês de um demonstrativo ficou deslocado e a ficha financeira produziu campos duplicados/misturados.

**Como corrigimos:** deixamos de procurar um único separador universal e passamos a tratar famílias de layout de maneira específica.

### 3.3 O extrator chegou a “inventar” valores plausíveis

Em versões anteriores, regexes permissivos e buscas por proximidade podiam associar um número real do documento ao campo errado. O número existia no PDF, mas não representava aquela informação. Isso é especialmente perigoso porque o resultado parece válido.

Também houve casos de competência incorreta e campos sem evidência sendo preenchidos inadequadamente.

**Como percebemos:** comparação manual entre o JSON e os PDFs mostrou valores corretos em posição semântica errada; o problema também apareceu em regressões como `payroll-01`, `payroll-02`, `payroll-03` e no documento escaneado.

**Como corrigimos:** tornamos as regras mais conservadoras, adicionamos regressões específicas e adotamos como regra que uma informação incerta deve permanecer incerta (`?`/`??`) ou ser completada pelo usuário, em vez de receber uma inferência silenciosa.

## 4. O que foi reescrito/ajustado manualmente e por quê

O desenvolvimento não consistiu em aceitar uma geração única do agente. Houve revisão humana contínua sobre o comportamento esperado e várias solicitações explícitas de alteração depois de testar a aplicação.

Entre os pontos reescritos ou direcionados manualmente:

- regras de separação e interpretação dos diferentes layouts de holerite, após conferir visualmente os PDFs;
- regras de cartão de ponto para preservar dias sem batidas e horários não reconhecidos;
- decisão de deixar campos vazios editáveis no frontend quando OCR não consegue reconhecer o conteúdo;
- correções de valores que estavam sendo associados a campos errados;
- comportamento de `?`/`??` para impedir que o sistema apresente uma suposição como dado reconhecido;
- inclusão da geração de planilhas depois que foi identificado que o endpoint ainda retornava `501`/TODO;
- inclusão dos botões de exportação no frontend para tornar a funcionalidade utilizável no fluxo real;
- atualização do Docker para uma versão do Node compatível com as dependências;
- preparação do servidor e health check para a porta fornecida pelo ambiente de deploy;
- limpeza de scripts, artefatos temporários e PNGs de OCR que estavam poluindo o repositório;
- revisão do fluxo de edição para permitir correção humana antes da exportação.

Esses pontos foram alterados porque os testes reais mostraram que “funcionar no código” não era suficiente: o resultado precisava corresponder ao documento e continuar corrigível quando o OCR falhasse.

## 5. Três decisões em que havia mais de uma resposta razoável

### Decisão 1 — OCR sempre ou extração nativa + fallback?

**Alternativa A:** renderizar todos os PDFs e sempre executar OCR.

**Alternativa B:** extrair texto nativo primeiro e usar OCR somente quando necessário.

Escolhemos **B**. PDFs digitais já possuem texto que tende a ser mais fiel e barato de processar. OCR continua necessário para documentos escaneados, mas não há vantagem em introduzir ruído e custo em todos os arquivos.

A desvantagem é que precisamos de uma heurística para decidir quando a extração nativa é insuficiente. Essa heurística também pode errar.

### Decisão 2 — Um extrator genérico ou regras por família de layout?

Uma solução mais genérica seria atraente porque teria menos código específico. Entretanto, os documentos fornecidos demonstraram estruturas incompatíveis entre si: ficha financeira, demonstrativo mensal, recibo, folhas de frequência, relatórios de ponto e documentos manuscritos.

Escolhemos **regras por família de layout**, mantendo contratos de saída comuns. Isso aumentou código específico, mas tornou os erros mais localizáveis e permitiu regressões por layout.

### Decisão 3 — Persistência/queue completa ou estado em memória para o desafio?

Seria razoável introduzir PostgreSQL/Redis e uma fila de jobs. Também seria razoável manter a solução pequena para o escopo proposto.

Escolhemos **Map em memória + processamento assíncrono simples**, porque o desafio precisava demonstrar o fluxo de transcrição, revisão e exportação, e não uma infraestrutura distribuída. Adicionar banco e broker aumentaria bastante a superfície de falha sem melhorar a qualidade da extração, que era o problema principal.

Essa escolha não é a que usaríamos para uma aplicação real em escala e está explicitamente registrada como limitação.

## 6. O que quebra primeiro em produção?

Provavelmente **processamento/estado sob concorrência e escala**, antes da interface.

Há três motivos principais:

1. As transcrições vivem em um `Map`. Um restart perde o estado e duas réplicas não compartilham os mesmos IDs/resultados.
2. PDFs e artefatos temporários vivem no filesystem local. Em múltiplas instâncias, uma requisição pode chegar a um processo que não possui o arquivo.
3. OCR é caro em CPU/memória. Mesmo isolado em outro processo, muitos uploads simultâneos podem saturar a máquina porque não existe fila com limite global de concorrência/backpressure.

A primeira evolução de produção seria separar API e workers, colocar jobs em fila, armazenar estado de forma durável e mover documentos temporários para object storage com política explícita de retenção.

## 7. Onde eu não confio completamente no que foi entregue?

A parte em que existe menor confiança é a **generalização da extração para documentos que não pertencem às famílias usadas durante o desenvolvimento**.

Os testes de regressão dão confiança de que bugs conhecidos não reapareçam nos casos representados. Eles não provam que qualquer holerite ou cartão de ponto brasileiro será interpretado corretamente.

Também há menor confiança em:

- OCR de documentos muito degradados, manuscritos ou fotografados;
- heurística que decide entre texto nativo e OCR;
- associação semântica quando um layout desconhecido contém rótulos/números parecidos com um layout conhecido;
- comportamento sob alta concorrência, porque o projeto não possui teste de carga;
- estabilidade/performance do plano gratuito do Render para OCR pesado ou vários usuários simultâneos;
- segurança para documentos reais sensíveis, pois autenticação/autorização não fazem parte da solução atual.

Por isso a solução deliberadamente mantém a revisão humana no fluxo e evita transformar informação incerta em dado aparentemente confiável.

## 8. Testes como parte do processo, não só no final

Os testes surgiram principalmente de falhas observadas durante o desenvolvimento. Exemplos de regressões que viraram casos verificáveis:

- `payroll-01`: impedir que valores de uma região da ficha financeira vazem para outra;
- `payroll-02`: impedir associação incorreta de bases e valores de blocos diferentes;
- `payroll-03`: preservar competência correta;
- `payroll-04`: não produzir informação vazia/inventada quando a leitura é incerta;
- cartão de ponto: não criar página vazia ao separar páginas;
- cartão de ponto: não fundir silenciosamente duas linhas com a mesma data;
- cartão de ponto: não transformar horário impossível em horário válido;
- documento manuscrito: manter mês/ano desconhecidos quando não são legíveis.

Além dos testes automatizados, os PDFs foram enviados pela interface e conferidos visualmente em várias etapas. Também foram testados health check, execução via Docker, arquivos de saída e comportamento da interface após as correções.

Na etapa final, os principais fluxos foram repetidos pela aplicação publicada no Render e funcionaram corretamente.

## 9. O que eu faria em seguida

Se o objetivo deixasse de ser o desafio e passasse a ser produto, a ordem seria:

1. construir uma base anotada maior e medir precisão por campo/layout;
2. adicionar testes end-to-end da API com PDFs reais de regressão;
3. persistir jobs/resultados e mover OCR para workers com fila;
4. adicionar autenticação, autorização e políticas adequadas para documentos sensíveis;
5. armazenar arquivos temporários fora do filesystem local;
6. adicionar métricas de latência, taxa de erro e tempo de OCR;
7. criar testes de carga e limites explícitos de concorrência;
8. ampliar suporte somente a novos layouts acompanhados de fixtures e regressões.

## 10. Resumo

A IA acelerou análise, implementação e revisão, mas também produziu hipóteses erradas — principalmente quando tentou generalizar layouts documentais cedo demais. A parte mais importante do processo foi não aceitar a plausibilidade da saída como evidência de correção. Os PDFs, os testes e a comparação manual foram usados para contrariar o agente quando necessário.

A solução final reflete essa experiência: extração híbrida, extratores específicos, saída conservadora, revisão humana e regressões para os erros que realmente aconteceram durante o desenvolvimento.
