import express, { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { analisarPDF } from './services/extracaoService.js';
import { extrairHolerite } from './extractors/holeriteExtractor.js';
import { extrairCartaoPonto } from './extractors/cartaoPontoExtractor.js';
import { gerarArquivoPlanilha } from './services/planilhaService.js';
import { fileTypeFromFile } from 'file-type';
import fs from 'node:fs/promises';
import path from 'node:path';

const PASTA_UPLOADS = path.resolve('uploads');

const routerHealth = Router();
const routerTranscricoes = Router();

routerTranscricoes.use(express.json());

const result = { resultado: "ok, Funcionando" };
const transcricoes = new Map();

routerHealth.get('/', (req, res) => {
    res.json(result);
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        fs.mkdir(PASTA_UPLOADS, { recursive: true })
            .then(() => cb(null, PASTA_UPLOADS))
            .catch(cb);
    },
    filename: function (req, file, cb) {
        // Nome único por upload, para nunca sobrescrever arquivos
        // com o mesmo nome original enviados em momentos diferentes.
        const nomeUnico = `${Date.now()}-${file.originalname}`;
        cb(null, nomeUnico);
    }
});

const fileFilter = function (req, file, cb) {

    console.log('ARQUIVO RECEBIDO PELO FILTRO:');
    console.log({
        originalname: file.originalname,
        mimetype: file.mimetype
    });

    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Arquivo Inválido!'));
    }
};

async function validarPDF(caminhoArquivo) {
    const tipo = await fileTypeFromFile(caminhoArquivo);

    return tipo?.mime === 'application/pdf';
}

async function processarTranscricao(id) {
    console.log(`INICIANDO processamento em background para ${id}`);

    const transcricao = transcricoes.get(id);

    if (!transcricao) {
        console.log(`Transcrição ${id} não existe mais, abortando`);
        return;
    }

    try {
        const resultado = await analisarPDF(transcricao.arquivo);

        console.log('Origem do texto:', resultado.origem);
        console.log('Métricas da extração:');
        console.log(resultado.metricas);
        console.log('Avaliação da extração:');
        console.log(resultado.avaliacao);

        // A avaliação serve para decidir se devemos acionar OCR, não para
        // descartar o resultado depois. Mesmo um OCR imperfeito pode conter
        // vários campos confiáveis; o extrator marca os campos incertos com ?.
        // O contrato do desafio já recebe o tipo no upload. Não substituímos
        // esse valor por uma heurística de OCR: um OCR ruim pode conter sinais
        // dos dois layouts e trocar o extrator seria pior que preservar o tipo
        // escolhido pelo cliente. A detecção automática fica apenas como
        // fallback quando o campo tipo não foi informado.
        const tipoInformado = normalizarTipoDocumento(transcricao.tipo);
        const tipoDetectado = detectarTipoDocumento(resultado.texto);
        const tipoProcessamento = tipoInformado || tipoDetectado;

        if (!tipoProcessamento) {
            throw new Error(
                `Não foi possível determinar o tipo do documento. Tipo recebido: ${transcricao.tipo || '(vazio)'}`
            );
        }

        let valorExtraido;

        if (tipoProcessamento === 'holerite') {
            valorExtraido = extrairHolerite(resultado.texto);
        } else if (tipoProcessamento === 'cartao-ponto') {
            valorExtraido = extrairCartaoPonto(resultado.texto);
        } else {
            throw new Error(
                `Tipo de documento não suportado: ${tipoProcessamento}`
            );
        }

        // O tipo devolvido precisa representar o documento efetivamente
        // processado, não apenas o valor que veio do formulário.
        transcricao.tipo = tipoProcessamento;
        transcricao.status = "concluido";
        transcricao.value = valorExtraido;

        console.log(
            `Transcrição ${id} CONCLUÍDA via ${resultado.origem}`
        );

        transcricoes.set(id, transcricao);

    } catch (err) {
        transcricao.status = "erro";
        transcricao.erro = err.message;

        transcricoes.set(id, transcricao);

        console.log(
            `Transcrição ${id} FALHOU:`,
            err.message
        );
    }
}

routerTranscricoes.post('/', (req, res) => {
    const id = randomUUID();

    console.log('ID GERADO:', id);

    const upload = multer({
        storage,
        fileFilter,
        limits: {
            fileSize: 10 * 1024 * 1024
        }
    }).single('arquivo');

    upload(req, res, async function (err) {

        if (err) {
            console.log('ERRO RECEBIDO PELO CALLBACK:');
            console.log(err);

            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    erro: 'Arquivo muito grande. O tamanho máximo permitido é 10 MB.'
                });
            }

            return res.status(400).json({
                erro: err.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                erro: 'Nenhum arquivo foi enviado.'
            });
        }

        console.log('Arquivo PDF recebido para processamento.');

        try {
            const pdfValido = await validarPDF(req.file.path);

            if (!pdfValido) {

                await fs.unlink(req.file.path);

                return res.status(400).json({
                    erro: 'O arquivo enviado não é um PDF válido.'
                });
            }

            const objt = {
                id: id,
                tipo: req.body.tipo,
                status: "processando",
                arquivo: req.file.path,
                value: null,
                erro: null
            };

            transcricoes.set(id, objt);

            console.log('ID SALVO:', id);
            console.log('TAMANHO DO MAP:', transcricoes.size);

            processarTranscricao(id);

            return res.status(202).json({
                id: id
            });

        } catch (erro) {

            console.log('ERRO AO VALIDAR ARQUIVO:', erro);

            if (req.file?.path) {
                try {
                    await fs.unlink(req.file.path);
                } catch {
                    // Arquivo já pode ter sido removido
                }
            }

            return res.status(400).json({
                erro: 'Não foi possível validar o arquivo enviado.'
            });
        }
    });
});

routerTranscricoes.get('/:id', (req, res) => {
    const { id } = req.params;

    const transcricao = transcricoes.get(id);

    if (!transcricao) {
        return res.status(404).json({
            erro: 'Transcrição não encontrada'
        });
    }

    return res.status(200).json(formatarRespostaPublica(transcricao));
});

routerTranscricoes.put('/:id', (req, res) => {
    const { id } = req.params;
    const { value } = req.body;

    const transcricao = transcricoes.get(id);

    if (!transcricao) {
        return res.status(404).json({
            erro: 'Transcrição não encontrada'
        });
    }

    transcricao.value = value;
    transcricoes.set(id, transcricao);

    return res.status(200).json(formatarRespostaPublica(transcricao));
});

routerTranscricoes.get('/:id/planilha', (req, res) => {
    const { id } = req.params;
    const { formato = 'xlsx' } = req.query;

    const transcricao = transcricoes.get(id);

    if (!transcricao) {
        return res.status(404).json({
            erro: 'Transcrição não encontrada'
        });
    }

    if (transcricao.status !== 'concluido') {
        return res.status(409).json({
            erro: 'Transcrição ainda não está concluída'
        });
    }

    try {
        const arquivo = gerarArquivoPlanilha(
            transcricao.tipo,
            transcricao.value,
            formato
        );

        const nomeArquivo = `${transcricao.tipo}-${id}.${arquivo.extensao}`;

        res.setHeader('Content-Type', arquivo.contentType);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${nomeArquivo}"`
        );
        res.setHeader('Content-Length', arquivo.buffer.length);

        return res.status(200).send(arquivo.buffer);
    } catch (erro) {
        if (erro.code === 'FORMATO_INVALIDO' || erro.code === 'TIPO_INVALIDO') {
            return res.status(400).json({
                erro: erro.message
            });
        }

        console.log('ERRO AO GERAR PLANILHA:', erro);
        return res.status(500).json({
            erro: 'Não foi possível gerar a planilha.'
        });
    }
});


function formatarRespostaPublica(transcricao) {
    // O contrato do README é literal: o caminho do arquivo é interno e não
    // faz parte da resposta GET/PUT. Mantemos apenas id, tipo, status, erro e value.
    return {
        id: transcricao.id,
        tipo: transcricao.tipo,
        status: transcricao.status,
        erro: transcricao.erro ?? null,
        value: transcricao.value ?? null
    };
}

function normalizarTipoDocumento(tipo) {
    const valor = String(tipo ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_\s]+/g, '-');

    if (valor === 'holerite') return 'holerite';
    if (valor === 'cartao-ponto' || valor === 'cartao-de-ponto') return 'cartao-ponto';
    return null;
}

function detectarTipoDocumento(texto) {
    const valor = String(texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    const sinaisCartao = [
        /folha\s+de\s+frequencia/,
        /sistema\s+de\s+ponto/,
        /ponto\s+eletronico/,
        /relatorio\s+mensal/,
        /cartao\s+de\s+ponto/,
        /mes\s*\/?\s*ano/,
        /entrada\s+saida/,
        /entrada\s+ent\d*.*saida\d*/
    ];

    const sinaisHolerite = [
        /demonstrativo\s+de\s+pagamento/,
        /recibo\s+de\s+pagamento/,
        /salario\s+base/,
        /total\s+de\s+proventos/,
        /total\s+de\s+descontos/,
        /liquido\s+(?:a\s+receber|receber)/,
        /contrib\.?\s+inss/,
        /fgts/
    ];

    const pontosCartao = sinaisCartao.reduce((total, regex) => total + (regex.test(valor) ? 1 : 0), 0);
    const pontosHolerite = sinaisHolerite.reduce((total, regex) => total + (regex.test(valor) ? 1 : 0), 0);

    if (pontosCartao >= 2 && pontosCartao > pontosHolerite) return 'cartao-ponto';
    if (pontosHolerite >= 2 && pontosHolerite > pontosCartao) return 'holerite';

    return null;
}

export { routerTranscricoes, routerHealth };