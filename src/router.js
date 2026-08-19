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
const RETENCAO_MS = Math.max(60_000, Number(process.env.RETENCAO_MS) || 60 * 60 * 1000);

const routerHealth = Router();
const routerTranscricoes = Router();

routerTranscricoes.use(express.json({ limit: '2mb' }));

const transcricoes = new Map();

routerHealth.get('/', (req, res) => {
    res.status(200).json({ resultado: 'ok' });
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        fs.mkdir(PASTA_UPLOADS, { recursive: true })
            .then(() => cb(null, PASTA_UPLOADS))
            .catch(cb);
    },
    filename: function (req, file, cb) {
        const extensao = path.extname(file.originalname).toLowerCase() === '.pdf' ? '.pdf' : '';
        cb(null, `${Date.now()}-${randomUUID()}${extensao}`);
    }
});

const fileFilter = function (req, file, cb) {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Arquivo inválido. Envie um PDF.'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1
    }
}).single('arquivo');

async function validarPDF(caminhoArquivo) {
    const tipo = await fileTypeFromFile(caminhoArquivo);
    return tipo?.mime === 'application/pdf';
}

async function removerArquivo(caminhoArquivo) {
    if (!caminhoArquivo) return;
    try {
        await fs.unlink(caminhoArquivo);
    } catch (erro) {
        if (erro?.code !== 'ENOENT') {
            console.log('Falha ao remover arquivo temporário:', erro.message);
        }
    }
}

async function limparTranscricoesExpiradas() {
    const agora = Date.now();

    for (const [id, transcricao] of transcricoes.entries()) {
        if (transcricao.status === 'processando') continue;
        if (agora - transcricao.criadoEm < RETENCAO_MS) continue;

        await removerArquivo(transcricao.arquivo);
        transcricoes.delete(id);
    }
}

const limpezaTimer = setInterval(() => {
    limparTranscricoesExpiradas().catch(erro => {
        console.log('Falha na limpeza de arquivos temporários:', erro.message);
    });
}, Math.min(RETENCAO_MS, 10 * 60 * 1000));
limpezaTimer.unref?.();

async function processarTranscricao(id) {
    const transcricao = transcricoes.get(id);

    if (!transcricao) return;

    try {
        const resultado = await analisarPDF(transcricao.arquivo);
        const tipoInformado = normalizarTipoDocumento(transcricao.tipo);
        const tipoDetectado = detectarTipoDocumento(resultado.texto);
        const tipoProcessamento = tipoInformado || tipoDetectado;

        if (!tipoProcessamento) {
            throw new Error('Não foi possível determinar o tipo do documento.');
        }

        let valorExtraido;

        if (tipoProcessamento === 'holerite') {
            valorExtraido = extrairHolerite(resultado.texto);
        } else if (tipoProcessamento === 'cartao-ponto') {
            valorExtraido = extrairCartaoPonto(resultado.texto);
        } else {
            throw new Error('Tipo de documento não suportado.');
        }

        transcricao.tipo = tipoProcessamento;
        transcricao.status = 'concluido';
        transcricao.value = valorExtraido;
        transcricao.erro = null;
        transcricoes.set(id, transcricao);

        console.log(`Transcrição ${id} concluída via ${resultado.origem}.`);
    } catch (err) {
        transcricao.status = 'erro';
        transcricao.value = null;
        transcricao.erro = err?.message || 'Falha no processamento.';
        transcricoes.set(id, transcricao);

        console.log(`Transcrição ${id} falhou: ${transcricao.erro}`);
    }
}

routerTranscricoes.post('/', (req, res) => {
    const id = randomUUID();

    upload(req, res, async function (err) {
        if (err) {
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

        try {
            const pdfValido = await validarPDF(req.file.path);

            if (!pdfValido) {
                await removerArquivo(req.file.path);
                return res.status(400).json({
                    erro: 'O arquivo enviado não é um PDF válido.'
                });
            }

            const tipo = normalizarTipoDocumento(req.body.tipo);
            if (!tipo) {
                await removerArquivo(req.file.path);
                return res.status(400).json({
                    erro: 'Tipo inválido. Use cartao-ponto ou holerite.'
                });
            }

            transcricoes.set(id, {
                id,
                tipo,
                status: 'processando',
                arquivo: req.file.path,
                value: null,
                erro: null,
                criadoEm: Date.now()
            });

            processarTranscricao(id);

            return res.status(202).json({ id });
        } catch (erro) {
            await removerArquivo(req.file?.path);
            return res.status(400).json({
                erro: 'Não foi possível validar o arquivo enviado.'
            });
        }
    });
});

routerTranscricoes.get('/:id/arquivo', async (req, res) => {
    const transcricao = transcricoes.get(req.params.id);

    if (!transcricao) {
        return res.status(404).json({ erro: 'Transcrição não encontrada' });
    }

    try {
        await fs.access(transcricao.arquivo);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'private, no-store');
        return res.sendFile(path.resolve(transcricao.arquivo));
    } catch {
        return res.status(404).json({ erro: 'PDF não está mais disponível.' });
    }
});

routerTranscricoes.get('/:id', (req, res) => {
    const transcricao = transcricoes.get(req.params.id);

    if (!transcricao) {
        return res.status(404).json({
            erro: 'Transcrição não encontrada'
        });
    }

    return res.status(200).json(formatarRespostaPublica(transcricao));
});

routerTranscricoes.put('/:id', (req, res) => {
    const transcricao = transcricoes.get(req.params.id);
    const { value } = req.body;

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

    if (!value || !Array.isArray(value.pages)) {
        return res.status(400).json({
            erro: 'value.pages deve ser um array.'
        });
    }

    transcricao.value = value;
    transcricoes.set(transcricao.id, transcricao);

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
        res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
        res.setHeader('Content-Length', arquivo.buffer.length);

        return res.status(200).send(arquivo.buffer);
    } catch (erro) {
        if (erro.code === 'FORMATO_INVALIDO' || erro.code === 'TIPO_INVALIDO') {
            return res.status(400).json({ erro: erro.message });
        }

        console.log('Erro ao gerar planilha:', erro.message);
        return res.status(500).json({
            erro: 'Não foi possível gerar a planilha.'
        });
    }
});

function formatarRespostaPublica(transcricao) {
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
