const MESES = {
    janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04',
    maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
    outubro: '10', novembro: '11', dezembro: '12'
};

const OCR_DIGITOS = {
    O: '0', Q: '0', D: '0',
    I: '1', l: '1', i: '1',
    Z: '2',
    S: '5', s: '5',
    G: '6',
    T: '7',
    B: '8'
};

export function extrairCartaoPonto(texto) {
    if (typeof texto !== 'string' || !texto.trim()) return { pages: [] };

    const paginas = separarPaginas(texto);
    return {
        pages: paginas.map((pagina, indice) => extrairPagina(pagina, indice + 1))
    };
}

function separarPaginas(texto) {
    const normalizado = String(texto ?? '').replace(/\r/g, '');

    const porMarcador = normalizado
        .split(/===\s*PAGINA\s+\d+\s*===/i)
        .map(p => p.trim())
        .filter(Boolean);
    if (porMarcador.length > 1) return porMarcador;

    const porFormFeed = normalizado
        .split(/\f+/)
        .map(p => p.trim())
        .filter(Boolean);
    if (porFormFeed.length > 1) return porFormFeed;

    const porFls = dividirPorMarcador(normalizado, /(?=Fls\s*\.?\s*:\s*\d+)/i);
    if (porFls.length > 1) return porFls;

    const porSipon = dividirPorMarcador(
        normalizado,
        /(?=F\s*O\s*L\s*H\s*A\s+DE\s+F\s*R\s*E\s*Q\s*U\s*E\s*N\s*C\s*I\s*A)/i
    );
    if (porSipon.length > 1) return porSipon;

    const porCartao = dividirPorMarcador(
        normalizado,
        /(?=Cart[aã]o\s+de\s+Ponto\s+P[aá]gina\s+\d+)/i
    );
    if (porCartao.length > 1) return porCartao;

    return normalizado.trim() ? [normalizado.trim()] : [];
}

function dividirPorMarcador(texto, regex) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const re = new RegExp(regex.source, flags);
    const encontrados = [...texto.matchAll(re)];
    if (encontrados.length <= 1) return [];

    const partes = [];
    for (let i = 0; i < encontrados.length; i++) {
        const inicio = encontrados[i].index;
        const fim = i + 1 < encontrados.length ? encontrados[i + 1].index : texto.length;
        const parte = texto.slice(inicio, fim).trim();
        if (parte) partes.push(parte);
    }
    return partes;
}

function extrairPagina(texto, numeroPagina) {
    const linhas = prepararLinhas(texto);
    const contexto = obterContextoCompetencia(texto);
    const ehSipon = /folha\s+de\s+frequencia|sistema\s+de\s+ponto/i.test(semAcentos(texto));
    const inicioTabela = encontrarInicioTabela(linhas);
    const linhasTabela = inicioTabela >= 0 ? linhas.slice(inicioTabela + 1) : linhas;
    const maxPunches = ehSipon ? 4 : determinarMaxPunches(linhas, texto);

    const days = [];

    for (let i = 0; i < linhasTabela.length; i++) {
        const linha = linhasTabela[i];
        const registro = analisarLinhaDeDia(linha, contexto, maxPunches, ehSipon);

        if (registro) {
            days.push(registro);
            continue;
        }

        // Em SIPON e alguns cartões, a segunda linha do mesmo dia contém só
        // horários. Ela é continuação, não uma nova linha do documento.
        if (days.length && ehLinhaContinuacao(linha)) {
            const extras = extrairHorarios(linha).slice(0, maxPunches - days.at(-1).punches.length);
            for (const horario of extras) {
                days.at(-1).punches.push(criarPunch(days.at(-1).punches.length, horario));
            }
        }
    }

    return { page: numeroPagina, days };
}

function prepararLinhas(texto) {
    return String(texto ?? '')
        .split('\n')
        .map(l => l.replace(/\t/g, '    ').trim())
        .filter(Boolean);
}

function determinarMaxPunches(linhas, texto) {
    const cabecalho = semAcentos(texto);
    if (/ent\d+.*sai\d+.*ent\d+.*sai\d+.*ent\d+.*sai\d+.*ent\d+.*sai\d+/i.test(cabecalho)) return 8;
    if (/entrada.*saida.*intervalo/i.test(cabecalho)) return 4;
    return 8;
}

function encontrarInicioTabela(linhas) {
    for (let i = 0; i < linhas.length; i++) {
        const linha = semAcentos(linhas[i]);
        if (/entrada.*saida|ent\d+.*sai\d+|dia\s+semana.*jornada.*entrada/i.test(linha)) return i;
    }
    return -1;
}

function obterContextoCompetencia(texto) {
    const cabecalho = texto.slice(0, 5000);
    const busca = semAcentos(cabecalho);

    const numerico = busca.match(/mes\s*[/\-]?\s*ano\s*:?\s*[^\n]{0,40}?(\d{1,2})\s*[\/]\s*(\d{4})/i);
    if (numerico) {
        const mes = validarMes(numerico[1]);
        const ano = validarAno(numerico[2]);
        if (mes && ano) return { mes, ano };
    }

    const nomeMes = busca.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i);
    const ano = busca.match(/\b(19\d{2}|20\d{2})\b/);
    if (nomeMes && ano) {
        return { mes: MESES[nomeMes[1]], ano: ano[1] };
    }

    return { mes: '??', ano: '????' };
}

function analisarLinhaDeDia(linha, contexto, maxPunches, ehSipon = false) {
    const original = linha.trim();

    // 1) Data completa confiável: 16/12/2019, 16-12-2019, etc.
    const completa = original.match(/^([^\s]+[\/\-.][^\s]+[\/\-.][^\s]+)(?:\s+|$)(.*)$/);
    if (completa && pareceDataCompleta(completa[1])) {
        const data = normalizarDataCompleta(completa[1]);
        const horarios = extrairHorarios(completa[2]);
        return { date_raw: data, punches: horarios.slice(0, maxPunches).map((h, i) => criarPunch(i, h)) };
    }

    // 2) Layout clássico: "01 SAB ...", "17 SEG ...".
    const diaSemana = original.match(/^([0-3]?\d)\s*(?:-\s*)?([A-ZÀ-Ú]{2,5})(?:\s+|$)(.*)$/i);
    if (diaSemana) {
        const dia = Number(diaSemana[1]);
        if (dia >= 1 && dia <= 31) {
            const dateRaw = montarData(dia, contexto);
            const horarios = extrairHorarios(diaSemana[3], ehSipon);
            return { date_raw: dateRaw, punches: horarios.slice(0, maxPunches).map((h, i) => criarPunch(i, h)) };
        }
    }

    // 3) Data completa OCRizada sem separadores, ex.: 16122019.
    const compacta = original.match(/^([0-3]?\d)([01]?\d)(\d{4})(?:\s+|$)(.*)$/);
    if (compacta) {
        const data = normalizarDataCompleta(`${compacta[1]}/${compacta[2]}/${compacta[3]}`);
        const horarios = extrairHorarios(compacta[4], ehSipon);
        return { date_raw: data, punches: horarios.slice(0, maxPunches).map((h, i) => criarPunch(i, h)) };
    }

    // 4) OCR com dia legível e resto textual: "02 Descanso Semanal".
    const somenteDia = original.match(/^([0-3]?\d)(?:\s+|$)(.*)$/);
    if (somenteDia) {
        const dia = Number(somenteDia[1]);
        if (dia >= 1 && dia <= 31) {
            const horarios = extrairHorarios(somenteDia[2], ehSipon);
            return { date_raw: montarData(dia, contexto), punches: horarios.slice(0, maxPunches).map((h, i) => criarPunch(i, h)) };
        }
    }

    // 5) OCR pode deixar um separador ruim na data. Só aceitamos quando a
    // estrutura continua inequívoca; caso contrário, não inventamos a data.
    const dataRuim = extrairDataOCRConfiavel(original);
    if (dataRuim) {
        const horarios = extrairHorarios(original.slice(dataRuim.consumidos));
        return { date_raw: dataRuim.dateRaw, punches: horarios.slice(0, maxPunches).map((h, i) => criarPunch(i, h)) };
    }

    return null;
}

function extrairDataOCRConfiavel(linha) {
    // Procura um bloco inicial com pelo menos 8 caracteres numéricos/OCR e
    // separadores. Não tenta adivinhar uma data quando a estrutura é fraca.
    const m = linha.match(/^([0-9OQDIlZSGTB?]{1,2})[\/\-.]([0-9OQDIlZSGTB?]{1,2})[\/\-.]([0-9OQDIlZSGTB?]{4})(?:\s+|$)/i);
    if (!m) return null;

    const dia = converterDigitosOCR(m[1]);
    const mes = converterDigitosOCR(m[2]);
    const ano = converterDigitosOCR(m[3]);
    const diaN = Number(dia);
    const mesN = Number(mes);

    if (!/^\d{2}$/.test(dia) || !/^\d{2}$/.test(mes) || !/^\d{4}$/.test(ano)) {
        return { dateRaw: `${padraoOuInterrogacao(dia, 2)}/${padraoOuInterrogacao(mes, 2)}/${padraoOuInterrogacao(ano, 4)}`, consumidos: m[0].length };
    }

    if (Number(ano) < 1900 || Number(ano) > 2200) return { dateRaw: `${dia}/${mes}/????`, consumidos: m[0].length };
    if (mesN < 1 || mesN > 12) return { dateRaw: `${dia}/??/${ano}`, consumidos: m[0].length };
    const ultimo = new Date(Number(ano), mesN, 0).getDate();
    if (diaN < 1 || diaN > ultimo) return { dateRaw: `??/${mes}/${ano}`, consumidos: m[0].length };

    return { dateRaw: `${dia}/${mes}/${ano}`, consumidos: m[0].length };
}

function extrairHorarios(texto, ignorarPrimeiro = false) {
    const resultado = [];
    let entrada = String(texto ?? '');

    // No SIPON, depois das batidas vêm as colunas de ocorrência/quantidade
    // (por exemplo 00:13). Esses horários não são batidas.
    if (ignorarPrimeiro) {
        const limiteOcorrencia = entrada.search(/\b(?:HE|ocorrencia|qtde)\b/i);
        if (limiteOcorrencia >= 0) entrada = entrada.slice(0, limiteOcorrencia);
    }

    // Primeiro: HH:MM / H:MM e variantes OCR comuns.
    const padraoComSeparador = /(?<![\dA-Za-z])([0-9OQDIlZSGTB?]{1,2})[:.]([0-9OQDIlZSGTB?]{2})([a-z])?(?![\dA-Za-z])/gi;
    for (const match of entrada.matchAll(padraoComSeparador)) {
        const raw = match[0];
        const hora = converterDigitosOCR(match[1]);
        const minuto = converterDigitosOCR(match[2]);
        resultado.push(validarHorario(raw, hora, minuto));
    }

    if (ignorarPrimeiro && resultado.length) resultado.shift();

    // Segundo: OCR que removeu o ':'; exatamente quatro posições para evitar
    // confundir códigos de jornada como 610/100.
    if (!resultado.length) {
        for (const match of entrada.matchAll(/(?<!\d)([0-9OQDIlZSGTB?]{4})(?!\d)/gi)) {
            const raw = match[1];
            const normalizado = converterDigitosOCR(raw);
            if (!/^\d{4}$/.test(normalizado)) continue;
            const hh = Number(normalizado.slice(0, 2));
            const mm = Number(normalizado.slice(2));
            if (hh <= 23 && mm <= 59) {
                resultado.push({ raw, hhmm: `${normalizado.slice(0, 2)}:${normalizado.slice(2)}` });
            }
        }
    }

    return resultado;
}

function validarHorario(raw, hora, minuto) {
    const hh = Number(hora);
    const mm = Number(minuto);

    const horaValida = /^\d{1,2}$/.test(hora) && hh <= 23;
    const minutoValido = /^\d{2}$/.test(minuto) && mm <= 59;

    const h = hora.length === 1 ? hora.padStart(2, '0') : hora;
    const horaSeguro = horaValida ? h : substituirDigitosInvalidos(h, 2);
    const minutoSeguro = minutoValido ? minuto : substituirDigitosInvalidos(minuto, 2);

    return {
        raw,
        hhmm: `${horaSeguro}:${minutoSeguro}`
    };
}

function criarPunch(indice, horario) {
    return {
        kind: indice % 2 === 0 ? 'IN' : 'OUT',
        time_raw: horario.raw,
        time_hhmm: horario.hhmm
    };
}

function ehLinhaContinuacao(linha) {
    const t = linha.trim();
    if (/^[0-3]?\d\s+/i.test(t)) return false;
    if (/^\d{2}[\/\-.]\d{2}[\/\-.]\d{4}/.test(t)) return false;
    return extrairHorarios(t).length > 0;
}

function montarData(dia, contexto) {
    return `${String(dia).padStart(2, '0')}/${contexto.mes}/${contexto.ano}`;
}

function normalizarDataCompleta(valor) {
    const partes = valor.split(/[\/\-.]/);
    if (partes.length !== 3) return '??/??/????';

    const dia = converterDigitosOCR(partes[0]);
    const mes = converterDigitosOCR(partes[1]);
    const ano = converterDigitosOCR(partes[2]);

    if (!/^\d{2}$/.test(dia) || !/^\d{2}$/.test(mes) || !/^\d{4}$/.test(ano)) {
        return `${padraoOuInterrogacao(dia, 2)}/${padraoOuInterrogacao(mes, 2)}/${padraoOuInterrogacao(ano, 4)}`;
    }

    const d = Number(dia);
    const m = Number(mes);
    const a = Number(ano);
    if (a < 1900 || a > 2200) return `${dia}/${mes}/????`;
    if (m < 1 || m > 12) return `${dia}/??/${ano}`;
    const ultimoDia = new Date(a, m, 0).getDate();
    if (d < 1 || d > ultimoDia) return `??/${mes}/${ano}`;

    return `${dia}/${mes}/${ano}`;
}

function pareceDataCompleta(valor) {
    return /^[-\dOQDIlZSGTB?]{1,3}[\/\-.][-\dOQDIlZSGTB?]{1,3}[\/\-.][-\dOQDIlZSGTB?]{2,4}$/i.test(valor);
}

function converterDigitosOCR(valor) {
    return String(valor ?? '').split('').map(char => OCR_DIGITOS[char] ?? char).join('');
}

function padraoOuInterrogacao(valor, tamanho) {
    const s = String(valor ?? '');
    return s.length === tamanho ? s : '?'.repeat(tamanho);
}

function substituirDigitosInvalidos(valor, tamanho) {
    const s = String(valor ?? '').padStart(tamanho, '?').slice(-tamanho);
    return '?'.repeat(tamanho).split('').map((_, i) => /\d/.test(s[i]) ? '?' : '?').join('');
}

function validarMes(valor) {
    const n = Number(valor);
    return n >= 1 && n <= 12 ? String(n).padStart(2, '0') : null;
}

function validarAno(valor) {
    const n = Number(valor);
    return n >= 1900 && n <= 2200 ? String(valor) : null;
}

function semAcentos(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}
