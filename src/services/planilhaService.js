import { deflateRawSync } from 'node:zlib';

const FORMATOS_SUPORTADOS = new Set(['xlsx', 'csv', 'json']);

export function gerarArquivoPlanilha(tipo, value, formato = 'xlsx') {
    const formatoNormalizado = String(formato ?? 'xlsx').trim().toLowerCase();

    if (!FORMATOS_SUPORTADOS.has(formatoNormalizado)) {
        const erro = new Error(`Formato de planilha não suportado: ${formato}`);
        erro.code = 'FORMATO_INVALIDO';
        throw erro;
    }

    const tabela = montarTabela(tipo, value);

    if (formatoNormalizado === 'json') {
        const conteudo = JSON.stringify(
            tabela.linhas.map(linha => objetoDaLinha(tabela.colunas, linha)),
            null,
            2
        );

        return {
            buffer: Buffer.from(conteudo, 'utf8'),
            contentType: 'application/json; charset=utf-8',
            extensao: 'json'
        };
    }

    if (formatoNormalizado === 'csv') {
        const linhas = [tabela.colunas, ...tabela.linhas];
        const csv = linhas
            .map(linha => linha.map(valor => escaparCSV(valor)).join(','))
            .join('\r\n');

        return {
            // BOM melhora a abertura de acentos no Excel no Windows.
            buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
            contentType: 'text/csv; charset=utf-8',
            extensao: 'csv'
        };
    }

    return {
        buffer: gerarXlsx(tabela.colunas, tabela.linhas),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extensao: 'xlsx'
    };
}

function montarTabela(tipo, value) {
    if (tipo === 'holerite') return montarTabelaHolerite(value);
    if (tipo === 'cartao-ponto') return montarTabelaCartaoPonto(value);

    const erro = new Error(`Tipo de documento não suportado para planilha: ${tipo}`);
    erro.code = 'TIPO_INVALIDO';
    throw erro;
}

function montarTabelaHolerite(value) {
    const paginas = Array.isArray(value?.pages) ? value.pages : [];
    const labels = [];
    const labelsVistos = new Set();

    for (const pagina of paginas) {
        for (const campo of Array.isArray(pagina?.fields) ? pagina.fields : []) {
            const label = valorSeguro(campo?.label);
            if (!labelsVistos.has(label)) {
                labelsVistos.add(label);
                labels.push(label);
            }
        }
    }

    const colunas = ['Pág.', 'Mês', 'Ano', ...labels];
    const linhas = paginas.map(pagina => {
        const valoresPorLabel = new Map();

        for (const campo of Array.isArray(pagina?.fields) ? pagina.fields : []) {
            const label = valorSeguro(campo?.label);
            const valor = valorSeguro(campo?.value);

            if (!valoresPorLabel.has(label)) {
                valoresPorLabel.set(label, []);
            }

            const valores = valoresPorLabel.get(label);
            if (!valores.includes(valor)) valores.push(valor);
        }

        return [
            valorSeguro(pagina?.page),
            valorSeguro(pagina?.month),
            valorSeguro(pagina?.year),
            ...labels.map(label => {
                const valores = valoresPorLabel.get(label);
                return valores?.length ? valores.join(' | ') : '?';
            })
        ];
    });

    return { colunas, linhas };
}

function montarTabelaCartaoPonto(value) {
    const paginas = Array.isArray(value?.pages) ? value.pages : [];
    const dias = paginas.flatMap(pagina => Array.isArray(pagina?.days) ? pagina.days : []);
    const maiorQuantidadeBatidas = dias.reduce(
        (maior, dia) => Math.max(maior, Array.isArray(dia?.punches) ? dia.punches.length : 0),
        0
    );

    const colunas = ['Data'];
    for (let indice = 0; indice < maiorQuantidadeBatidas; indice++) {
        const numero = Math.floor(indice / 2) + 1;
        colunas.push(indice % 2 === 0 ? `Entrada ${numero}` : `Saída ${numero}`);
    }

    const linhas = dias.map(dia => {
        const punches = Array.isArray(dia?.punches) ? dia.punches : [];
        const horarios = [];

        for (let indice = 0; indice < maiorQuantidadeBatidas; indice++) {
            horarios.push(valorSeguro(punches[indice]?.time_hhmm));
        }

        return [valorSeguro(dia?.date_raw), ...horarios];
    });

    return { colunas, linhas };
}

function valorSeguro(valor) {
    if (valor === null || valor === undefined) return '?';
    const texto = String(valor).trim();
    return texto || '?';
}

function objetoDaLinha(colunas, linha) {
    const objeto = {};
    colunas.forEach((coluna, indice) => {
        objeto[coluna] = valorSeguro(linha[indice]);
    });
    return objeto;
}

function escaparCSV(valor) {
    const texto = valorSeguro(valor);
    return `"${texto.replace(/"/g, '""')}"`;
}

function gerarXlsx(colunas, linhas) {
    const planilha = [colunas, ...linhas];
    const worksheetXml = gerarWorksheetXml(planilha);

    const arquivos = [
        {
            nome: '[Content_Types].xml',
            conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
        },
        {
            nome: '_rels/.rels',
            conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
        },
        {
            nome: 'xl/workbook.xml',
            conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Transcricao" sheetId="1" r:id="rId1"/></sheets></workbook>`
        },
        {
            nome: 'xl/_rels/workbook.xml.rels',
            conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
        },
        {
            nome: 'xl/worksheets/sheet1.xml',
            conteudo: worksheetXml
        }
    ];

    return criarZip(arquivos);
}

function gerarWorksheetXml(linhas) {
    const quantidadeColunas = Math.max(1, ...linhas.map(linha => linha.length));
    const ultimaColuna = numeroParaColuna(quantidadeColunas);
    const ultimaLinha = Math.max(1, linhas.length);

    const rowsXml = linhas.map((linha, indiceLinha) => {
        const numeroLinha = indiceLinha + 1;
        const cells = linha.map((valor, indiceColuna) => {
            const referencia = `${numeroParaColuna(indiceColuna + 1)}${numeroLinha}`;
            const texto = escaparXml(valorSeguro(valor));
            return `<c r="${referencia}" t="inlineStr"><is><t xml:space="preserve">${texto}</t></is></c>`;
        }).join('');
        return `<row r="${numeroLinha}">${cells}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${ultimaColuna}${ultimaLinha}"/><sheetData>${rowsXml}</sheetData></worksheet>`;
}

function numeroParaColuna(numero) {
    let n = numero;
    let resultado = '';

    while (n > 0) {
        n -= 1;
        resultado = String.fromCharCode(65 + (n % 26)) + resultado;
        n = Math.floor(n / 26);
    }

    return resultado || 'A';
}

function escaparXml(valor) {
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function criarZip(arquivos) {
    const locais = [];
    const centrais = [];
    let offset = 0;
    const dataHora = dataHoraDos();

    for (const arquivo of arquivos) {
        const nome = Buffer.from(arquivo.nome, 'utf8');
        const original = Buffer.from(arquivo.conteudo, 'utf8');
        const compactado = deflateRawSync(original);
        const crc = crc32(original);

        const cabecalhoLocal = Buffer.alloc(30);
        cabecalhoLocal.writeUInt32LE(0x04034b50, 0);
        cabecalhoLocal.writeUInt16LE(20, 4);
        cabecalhoLocal.writeUInt16LE(0, 6);
        cabecalhoLocal.writeUInt16LE(8, 8);
        cabecalhoLocal.writeUInt16LE(dataHora.hora, 10);
        cabecalhoLocal.writeUInt16LE(dataHora.data, 12);
        cabecalhoLocal.writeUInt32LE(crc, 14);
        cabecalhoLocal.writeUInt32LE(compactado.length, 18);
        cabecalhoLocal.writeUInt32LE(original.length, 22);
        cabecalhoLocal.writeUInt16LE(nome.length, 26);
        cabecalhoLocal.writeUInt16LE(0, 28);

        locais.push(cabecalhoLocal, nome, compactado);

        const cabecalhoCentral = Buffer.alloc(46);
        cabecalhoCentral.writeUInt32LE(0x02014b50, 0);
        cabecalhoCentral.writeUInt16LE(20, 4);
        cabecalhoCentral.writeUInt16LE(20, 6);
        cabecalhoCentral.writeUInt16LE(0, 8);
        cabecalhoCentral.writeUInt16LE(8, 10);
        cabecalhoCentral.writeUInt16LE(dataHora.hora, 12);
        cabecalhoCentral.writeUInt16LE(dataHora.data, 14);
        cabecalhoCentral.writeUInt32LE(crc, 16);
        cabecalhoCentral.writeUInt32LE(compactado.length, 20);
        cabecalhoCentral.writeUInt32LE(original.length, 24);
        cabecalhoCentral.writeUInt16LE(nome.length, 28);
        cabecalhoCentral.writeUInt16LE(0, 30);
        cabecalhoCentral.writeUInt16LE(0, 32);
        cabecalhoCentral.writeUInt16LE(0, 34);
        cabecalhoCentral.writeUInt16LE(0, 36);
        cabecalhoCentral.writeUInt32LE(0, 38);
        cabecalhoCentral.writeUInt32LE(offset, 42);

        centrais.push(cabecalhoCentral, nome);
        offset += cabecalhoLocal.length + nome.length + compactado.length;
    }

    const diretorioCentral = Buffer.concat(centrais);
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(0, 4);
    fim.writeUInt16LE(0, 6);
    fim.writeUInt16LE(arquivos.length, 8);
    fim.writeUInt16LE(arquivos.length, 10);
    fim.writeUInt32LE(diretorioCentral.length, 12);
    fim.writeUInt32LE(offset, 16);
    fim.writeUInt16LE(0, 20);

    return Buffer.concat([...locais, diretorioCentral, fim]);
}

function dataHoraDos() {
    const agora = new Date();
    const ano = Math.max(1980, agora.getFullYear());

    return {
        data: ((ano - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate(),
        hora: (agora.getHours() << 11) | (agora.getMinutes() << 5) | Math.floor(agora.getSeconds() / 2)
    };
}

const TABELA_CRC = criarTabelaCrc();

function criarTabelaCrc() {
    const tabela = new Uint32Array(256);

    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        tabela[i] = c >>> 0;
    }

    return tabela;
}

function crc32(buffer) {
    let crc = 0xFFFFFFFF;

    for (const byte of buffer) {
        crc = TABELA_CRC[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}
