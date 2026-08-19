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
            tabela.linhas.map(linha => objetoDaLinha(tabela.colunas, linha.valores)),
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
        const linhas = [tabela.colunas, ...tabela.linhas.map(linha => linha.valores)];
        const csv = linhas
            .map(linha => linha.map(valor => escaparCSV(valor)).join(','))
            .join('\r\n');

        return {
            buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
            contentType: 'text/csv; charset=utf-8',
            extensao: 'csv'
        };
    }

    return {
        buffer: gerarXlsx(tabela),
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
            const label = valorObrigatorio(campo?.label);
            if (!labelsVistos.has(label)) {
                labelsVistos.add(label);
                labels.push(label);
            }
        }
    }

    const colunas = ['Pág.', 'Mês', 'Ano', ...labels];
    const linhas = [];
    let competenciaAnterior = null;

    for (const pagina of paginas) {
        const valoresPorLabel = new Map();

        for (const campo of Array.isArray(pagina?.fields) ? pagina.fields : []) {
            const label = valorObrigatorio(campo?.label);
            const valor = valorObrigatorio(campo?.value);

            if (!valoresPorLabel.has(label)) valoresPorLabel.set(label, []);
            const valores = valoresPorLabel.get(label);
            if (!valores.includes(valor)) valores.push(valor);
        }

        const valores = [
            valorObrigatorio(pagina?.page),
            valorObrigatorio(pagina?.month),
            valorObrigatorio(pagina?.year),
            ...labels.map(label => {
                const encontrados = valoresPorLabel.get(label);
                return encontrados?.length ? encontrados.join(' | ') : '';
            })
        ];

        const competenciaAtual = lerCompetencia(pagina?.month, pagina?.year);
        const naoSequencial = Boolean(
            competenciaAnterior && competenciaAtual && !competenciaSeguinte(competenciaAnterior, competenciaAtual)
        );
        if (competenciaAtual) competenciaAnterior = competenciaAtual;

        const paginaVazia = !Array.isArray(pagina?.fields) || pagina.fields.length === 0;
        const possuiInterrogacao = valores.some(valor => String(valor).includes('?'));

        linhas.push({
            valores,
            aviso: paginaVazia || possuiInterrogacao,
            naoSequencial
        });
    }

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

    const linhas = [];
    let dataAnterior = null;

    for (const dia of dias) {
        const punches = Array.isArray(dia?.punches) ? dia.punches : [];
        const horarios = [];

        for (let indice = 0; indice < maiorQuantidadeBatidas; indice++) {
            const punch = punches[indice];
            horarios.push(punch ? valorObrigatorio(punch.time_hhmm) : '');
        }

        const valores = [valorObrigatorio(dia?.date_raw), ...horarios];
        const dataAtual = lerDataBrasileira(dia?.date_raw);
        const naoSequencial = Boolean(
            dataAnterior && dataAtual && !dataSeguinte(dataAnterior, dataAtual)
        );
        if (dataAtual) dataAnterior = dataAtual;

        linhas.push({
            valores,
            aviso: punches.length % 2 !== 0 || valores.some(valor => String(valor).includes('?')),
            naoSequencial
        });
    }

    return { colunas, linhas };
}

function valorObrigatorio(valor) {
    if (valor === null || valor === undefined) return '?';
    const texto = String(valor).trim();
    return texto || '?';
}

function objetoDaLinha(colunas, linha) {
    const objeto = {};
    colunas.forEach((coluna, indice) => {
        objeto[coluna] = linha[indice] ?? '';
    });
    return objeto;
}

function escaparCSV(valor) {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return `"${texto.replace(/"/g, '""')}"`;
}

function lerCompetencia(month, year) {
    const mes = String(month ?? '').trim();
    const ano = String(year ?? '').trim();
    if (!/^\d{2}$/.test(mes) || !/^\d{4}$/.test(ano)) return null;

    const numeroMes = Number(mes);
    const numeroAno = Number(ano);
    if (numeroMes < 1 || numeroMes > 12) return null;
    return { mes: numeroMes, ano: numeroAno };
}

function competenciaSeguinte(anterior, atual) {
    let mes = anterior.mes + 1;
    let ano = anterior.ano;
    if (mes === 13) {
        mes = 1;
        ano += 1;
    }
    return atual.mes === mes && atual.ano === ano;
}

function lerDataBrasileira(valor) {
    const texto = String(valor ?? '').trim();
    const match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;

    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const ano = Number(match[3]);
    const data = new Date(Date.UTC(ano, mes - 1, dia));

    if (
        data.getUTCFullYear() !== ano ||
        data.getUTCMonth() !== mes - 1 ||
        data.getUTCDate() !== dia
    ) return null;

    return data;
}

function dataSeguinte(anterior, atual) {
    return atual.getTime() - anterior.getTime() === 24 * 60 * 60 * 1000;
}

function gerarXlsx(tabela) {
    const worksheetXml = gerarWorksheetXml(tabela);

    const arquivos = [
        {
            nome: '[Content_Types].xml',
            conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
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
            conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
        },
        {
            nome: 'xl/styles.xml',
            conteudo: gerarStylesXml()
        },
        {
            nome: 'xl/worksheets/sheet1.xml',
            conteudo: worksheetXml
        }
    ];

    return criarZip(arquivos);
}

function gerarStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3CD"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8D7DA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="medium"><color rgb="FFDC3545"/></left><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/></cellXfs></styleSheet>`;
}

function gerarWorksheetXml(tabela) {
    const linhas = [
        { valores: tabela.colunas, cabecalho: true, aviso: false, naoSequencial: false },
        ...tabela.linhas
    ];
    const quantidadeColunas = Math.max(1, ...linhas.map(linha => linha.valores.length));
    const ultimaColuna = numeroParaColuna(quantidadeColunas);
    const ultimaLinha = Math.max(1, linhas.length);

    const rowsXml = linhas.map((linha, indiceLinha) => {
        const numeroLinha = indiceLinha + 1;
        const cells = linha.valores.map((valor, indiceColuna) => {
            const referencia = `${numeroParaColuna(indiceColuna + 1)}${numeroLinha}`;
            const texto = escaparXml(valor === null || valor === undefined ? '' : String(valor));
            const estilo = linha.cabecalho
                ? 1
                : linha.naoSequencial
                    ? (indiceColuna === 0 ? 4 : 3)
                    : linha.aviso
                        ? 2
                        : 0;
            return `<c r="${referencia}" t="inlineStr" s="${estilo}"><is><t xml:space="preserve">${texto}</t></is></c>`;
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
