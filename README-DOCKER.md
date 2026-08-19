# Execução com Docker

## Pré-requisitos

- Docker Desktop instalado e em execução.
- Porta 3000 livre na máquina.

## Subir a aplicação

Na raiz do projeto:

```bash
docker compose up --build
```

Depois acesse:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/healthz
```

## Executar em segundo plano

```bash
docker compose up --build -d
```

Ver logs:

```bash
docker compose logs -f app
```

## Parar

```bash
docker compose down
```

## Reconstruir após alterações de código

```bash
docker compose up --build
```

## Pastas persistidas

O `docker-compose.yml` monta duas pastas locais no container:

- `./uploads` -> `/app/uploads`
- `./temp-orc` -> `/app/temp-orc`

Assim, os PDFs enviados e as imagens geradas pelo OCR continuam disponíveis na máquina host para inspeção durante os testes.

## Teste recomendado

Após o container ficar `healthy`, valide pela interface os arquivos de exemplo de holerite e cartão de ponto. Para arquivos que acionam OCR, confira também a geração das imagens em `temp-orc`.

## Comandos de diagnóstico

Status dos containers:

```bash
docker compose ps
```

Entrar no container:

```bash
docker compose exec app sh
```

Executar os testes automatizados dentro do container:

```bash
docker compose exec app npm test
```
