import {
    chaveRotulo,
    corredores,
    corteAntesDe,
    ehDinheiro,
    ehNumero,
    juntar,
    recortar,
    semAcentos,
    tokenizar
} from './colunas.js';

const MESES = {
    janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
    julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
};

const MESES_CURTOS = {
    jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
    jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
};

const DESCONHECIDO = '?';

/**
 * Rótulos da coluna RESULTADOS da ficha financeira. O PDF imprime os nomes
 * sem espaços, então a comparação é feita por chave normalizada.
 */
const RESULTADOS_FICHA = new Map([
    ['basedecalculodoinss', 'Base INSS'],
    ['basedecalculodoirf', 'Base IRRF'],
    ['basedecalculodofgts', 'Base FGTS'],
    ['valordofgts', 'FGTS Mês'],
    ['salarioliquidonomes', 'Valor Líquido'],
    ['valordoirfarecolher', 'IR a Recolher'],
    ['valordoirarecolher', 'IR a Recolher']
]);

const TOTAIS_FICHA = new Map([
    ['totrendimentos', 'Total Vencimentos'],
    ['totalrendimentos', 'Total Vencimentos'],
    ['totaldescontos', 'Total Descontos']
]);

export function extrairHolerite(texto) {
    if (typeof texto !== 'string' || !texto.trim()) return { pages: [] };

    const paginas = separarPaginas(texto);
    const layoutDocumento = detectarLayout(texto);
    const pages = [];

    paginas.forEach((conteudo, indice) => {
        const numero = indice + 1;
        const linhas = prepararLinhas(conteudo);
        const layout = detectarLayout(conteudo) ?? layoutDocumento ?? 'generico';

        pages.push(...extrairPagina(linhas, numero, layout));
    });

    return { pages };
}

function extrairPagina(linhas, page, layout) {
    if (layout === 'ficha') return extrairFicha(linhas, page);
    if (layout === 'declaracao') return extrairDeclaracao(linhas, page);
    if (layout === 'demonstrativo') return extrairDemonstrativo(linhas, page);
    if (layout === 'recibo') return extrairRecibo(linhas, page);
    return extrairGenerico(linhas, page);
}

function detectarLayout(texto) {
    const t = semAcentos(texto);

    if (/ficha\s*financeira/.test(t) || /tot\.?\s*rendimentos/.test(t)) return 'ficha';
    if (/declaracao\s+remuneracao/.test(t) || /folha\s+de\s+pagamento\s*:\s*(?:mes|acerto)/.test(t)) return 'declaracao';
    if (/demonstrativo\s+de\s+pagamento/.test(t) || /cod\.?\s+descricao/.test(t)) return 'demonstrativo';
    if (/recibo\s+de\s+pagamento/.test(t) || /total\s+de\s+proventos/.test(t)) return 'recibo';
    if (/mes\/ano\s*:/.test(t)) return 'declaracao';
    if (/\bmes\s*:\s*(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/.test(t)) return 'ficha';

    return null;
}

function separarPaginas(texto) {
    const normalizado = String(texto ?? '').replace(/\r/g, '').replace(/\u0000/g, '');

    const porMarcador = normalizado.split(/^\s*===\s*PAGINA\s+\d+\s*===\s*$/gim)
        .map(p => p.trim())
        .filter(Boolean);
    if (porMarcador.length > 1) return porMarcador;

    const porFormFeed = normalizado.split(/\f+/).map(p => p.trim()).filter(Boolean);
    if (porFormFeed.length > 1) return porFormFeed;

    const ocorrencias = [...normalizado.matchAll(/Fls\s*\.?\s*:\s*\d+/gi)];
    if (ocorrencias.length > 1) {
        const paginas = [];
        for (let i = 0; i < ocorrencias.length; i++) {
            const inicio = ocorrencias[i].index;
            const fim = i + 1 < ocorrencias.length ? ocorrencias[i + 1].index : normalizado.length;
            const bloco = normalizado.slice(inicio, fim).trim();
            if (bloco) paginas.push(bloco);
        }
        if (paginas.length) return paginas;
    }

    return normalizado.trim() ? [normalizado.trim()] : [];
}

/**
 * As linhas mantêm o recuo original: a posição horizontal é a informação que
 * separa as colunas do documento.
 */
function prepararLinhas(texto) {
    return String(texto ?? '')
        .split('\n')
        .map(linha => linha.replace(/\r/g, '').replace(/\t/g, '    ').replace(/\s+$/, ''))
        .filter(linha => linha.trim() && !/^\s*===\s*PAGINA\s+\d+\s*===\s*$/i.test(linha));
}

/* ------------------------------------------------------------------ */
/* payroll-01 — ficha financeira (RENDIMENTOS | DESCONTOS | RESULTADOS) */
/* ------------------------------------------------------------------ */

function extrairFicha(linhas, page) {
    const { colunaDescontos, colunaResultados } = limitesFicha(linhas);
    const blocos = separarBlocosFicha(linhas);
    const competencias = [];

    for (const bloco of blocos) {
        const extraido = lerBlocoFicha(bloco, page, colunaDescontos, colunaResultados);
        if (!extraido.fields.length && !extraido.bases.length) continue;

        // Uma competência pode aparecer em mais de um bloco na mesma página
        // (por exemplo "Adiantamento - PLR" e "Folha Normal"). O contrato pede
        // uma entrada por competência, então os blocos são consolidados.
        const existente = competencias.find(c =>
            c.year === extraido.year &&
            c.month === extraido.month &&
            c.month !== DESCONHECIDO
        );

        if (!existente) {
            competencias.push(extraido);
            continue;
        }

        existente.fields.push(...extraido.fields);
        for (const base of extraido.bases) definirBase(existente.bases, base.label, base.value);
    }

    return competencias.map(finalizarPagina);
}

function limitesFicha(linhas) {
    const dados = linhas.filter(linha => contarDinheiro(linha) >= 2);
    const faixas = corredores(dados.length >= 3 ? dados : linhas);

    const colunaResultados = corteAntesDe(
        faixas,
        primeiraColuna(linhas, chave => RESULTADOS_FICHA.has(chave))
    ) ?? Infinity;

    let colunaDescontos = corteAntesDe(
        faixas,
        primeiraColuna(linhas, chave => chave === 'totaldescontos')
    );

    if (colunaDescontos === null) {
        // Sem a linha de total, o corredor mais largo à esquerda dos
        // resultados separa rendimentos e descontos.
        const candidatos = faixas.filter(f => f.inicio > 0 && f.fim < colunaResultados);
        const maior = candidatos.sort((a, b) => (b.fim - b.inicio) - (a.fim - a.inicio))[0];
        colunaDescontos = maior ? Math.floor((maior.inicio + maior.fim) / 2) : Infinity;
    }

    return { colunaDescontos, colunaResultados };
}

function primeiraColuna(linhas, aceita) {
    let coluna = Infinity;

    for (const linha of linhas) {
        for (const token of tokenizar(linha)) {
            if (aceita(chaveRotulo(token.texto))) coluna = Math.min(coluna, token.inicio);
        }
    }

    return coluna;
}

function separarBlocosFicha(linhas) {
    const indices = [];
    for (let i = 0; i < linhas.length; i++) {
        if (/^mes\s*:/.test(semAcentos(linhas[i].trim()))) indices.push(i);
    }
    if (!indices.length) return [linhas];

    const blocos = [];
    for (let i = 0; i < indices.length; i++) {
        const fim = i + 1 < indices.length ? indices[i + 1] : linhas.length;
        blocos.push(linhas.slice(indices[i], fim));
    }
    return blocos;
}

function lerBlocoFicha(linhas, page, colunaDescontos, colunaResultados) {
    const competencia = extrairCompetencia(linhas.join('\n'));
    const fields = [];
    const bases = [];

    for (const linha of linhas) {
        if (ehLinhaIgnorada(linha)) continue;

        const regioes = [
            recortar(linha, 0, colunaDescontos),
            recortar(linha, colunaDescontos === Infinity ? undefined : colunaDescontos, colunaResultados)
        ];

        for (const regiao of regioes) {
            const verba = lerVerba(regiao);
            if (!verba) continue;

            const total = TOTAIS_FICHA.get(chaveRotulo(verba.label));
            if (total) {
                definirBase(bases, total, verba.value);
                continue;
            }

            fields.push(verba);
        }

        if (colunaResultados !== Infinity) {
            const resultado = lerResultadoFicha(recortar(linha, colunaResultados));
            if (resultado) definirBase(bases, resultado.label, resultado.value);
        }
    }

    return { page, year: competencia.year, month: competencia.month, fields, bases };
}

function lerResultadoFicha(trecho) {
    const tokens = tokenizar(trecho);
    if (!tokens.length) return null;

    const numericos = tokensFinaisNumericos(tokens, 0);
    const rotulo = tokens.slice(0, tokens.length - numericos.length);
    if (!rotulo.length) return null;

    const chave = chaveRotulo(juntar(rotulo));
    const label = RESULTADOS_FICHA.get(chave) ?? TOTAIS_FICHA.get(chave);
    if (!label) return null;

    const ultimo = numericos.at(-1);
    return { label, value: ultimo && ehDinheiro(ultimo.texto) ? ultimo.texto : DESCONHECIDO };
}

/**
 * Lê uma verba "código rótulo referência valor". Quando o rótulo existe mas o
 * valor monetário não foi reconhecido, o valor sai como `?`.
 */
function lerVerba(trecho) {
    const tokens = tokenizar(trecho);
    if (!tokens.length) return null;

    let inicio = 0;
    let code = '';
    const primeiro = tokens[0].texto.replace(/^[|]+/, '');

    if (tokens.length > 1 && /^\/?\d{1,4}$/.test(primeiro)) {
        code = primeiro;
        inicio = 1;
    }

    const numericos = tokensFinaisNumericos(tokens, inicio);
    const label = juntar(tokens.slice(inicio, tokens.length - numericos.length));

    if (!label || ehCabecalho(label)) return null;
    if (!code && !numericos.length) return null;

    const ultimo = numericos.at(-1);
    const temValor = ultimo && ehDinheiro(ultimo.texto);

    return {
        code,
        label,
        reference: referenciaDe(numericos, temValor),
        value: temValor ? ultimo.texto : DESCONHECIDO
    };
}

function referenciaDe(numericos, temValor) {
    if (!numericos.length) return '';
    if (!temValor) return numericos[0].texto;
    return numericos.length > 1 ? numericos.at(-2).texto : '';
}

function tokensFinaisNumericos(tokens, inicio) {
    let corte = tokens.length;
    while (corte > inicio && ehNumero(tokens[corte - 1].texto)) corte--;
    return tokens.slice(corte);
}

function ehLinhaIgnorada(linha) {
    const t = semAcentos(linha.trim());
    return /^(mes\s*:|folha\b|adiantamento\s*-|13\s*salario\b|ficha\s*financeira|empregado\s*:|cargo\s*:|datadeadmissao|cnpj|f[il]s\s*\.?\s*:|documento\s+assinado|assinado\s+eletronicamente|impresso\s+por|pje\b)/.test(t);
}

/* ------------------------------------------------------ */
/* payroll-02 — Declaração Remuneração (blocos MÊS/ACERTO) */
/* ------------------------------------------------------ */

function extrairDeclaracao(linhas, page) {
    const blocos = separarBlocosDeclaracao(linhas);
    const fields = [];
    const bases = [];
    let competencia = extrairCompetencia(linhas.join('\n'));

    for (const bloco of blocos) {
        const cabecalho = semAcentos(bloco[0] ?? '');
        const tipo = cabecalho.match(/folha\s+de\s+pagamento\s*:\s*(mes|acerto)/)?.[1];
        const competenciaBloco = extrairCompetencia(bloco[0] ?? '');

        if (competenciaBloco.month !== DESCONHECIDO) competencia = competenciaBloco;

        fields.push(...lerVerbasDeclaracao(bloco));

        // Somente a folha do MÊS descreve o resultado da competência; o bloco
        // ACERTO refere-se a diferenças de meses anteriores.
        if (tipo !== 'mes') continue;

        for (const [regex, label] of [
            [/proventos\s+liquidos/, 'Proventos Líquidos'],
            [/proventos\s+bruto/, 'Proventos Bruto'],
            [/consignacao/, 'Consignação'],
            [/provisao\s+fgts/, 'Provisão FGTS']
        ]) {
            const valor = valorRotulado(bloco, regex);
            if (valor !== null) definirBase(bases, label, valor);
        }
    }

    return [finalizarPagina({
        page,
        year: competencia.year,
        month: competencia.month,
        fields,
        bases
    })];
}

function separarBlocosDeclaracao(linhas) {
    const indices = [];
    for (let i = 0; i < linhas.length; i++) {
        if (/^mes\s*\/\s*ano\s*:/.test(semAcentos(linhas[i].trim()))) indices.push(i);
    }
    if (!indices.length) return [linhas];

    const blocos = [];
    for (let i = 0; i < indices.length; i++) {
        const fim = i + 1 < indices.length ? indices[i + 1] : linhas.length;
        blocos.push(linhas.slice(indices[i], fim));
    }
    return blocos;
}

function lerVerbasDeclaracao(bloco) {
    const fields = [];

    for (const linha of bloco) {
        const t = semAcentos(linha.trim());

        if (/^(verba\b|remuneracao\s+funcao|proventos\s+retidos|adiantamento\s+13|provisao\s+fgts|margem|impresso\s+por|documento\s+assinado|assinado\s+eletronicamente|fls\s*\.?\s*:)/.test(t)) continue;

        const verba = lerVerbaDeclaracao(linha);
        if (verba) fields.push(verba);
    }

    return fields;
}

function lerVerbaDeclaracao(linha) {
    const tokens = tokenizar(linha);
    if (tokens.length < 2) return null;
    if (!/^\d{2,4}$/.test(tokens[0].texto)) return null;

    const code = tokens[0].texto;
    const ultimo = tokens.at(-1);
    const temValor = ehDinheiro(ultimo.texto);

    let fimRotulo = temValor ? tokens.length - 1 : tokens.length;
    let reference = '';

    const anterior = tokens[fimRotulo - 1];
    if (temValor && anterior && ehReferenciaDeclaracao(anterior.texto)) {
        reference = anterior.texto;
        fimRotulo -= 1;
    }

    const label = juntar(tokens.slice(1, fimRotulo));
    if (!label) return null;

    return { code, label, reference, value: temValor ? ultimo.texto : DESCONHECIDO };
}

/**
 * A coluna "Base / Saldo / Benefício" pode conter um valor monetário ou uma
 * referência textual impressa pelo sistema, como "JULHO/18" ou "AC.SIST/0718".
 */
function ehReferenciaDeclaracao(texto) {
    return ehDinheiro(texto)
        || /^[A-Za-zÀ-ÿ.]+\/\d{2,6}$/.test(texto);
}

/* ------------------------------------------------ */
/* payroll-03 — Demonstrativo de Pagamento Mensal    */
/* ------------------------------------------------ */

const BASES_DEMONSTRATIVO = [
    [/base\s+i\.?\s*n\.?\s*s\.?\s*s\.?/, 'Base INSS'],
    [/base\s+i\.?\s*r\.?\s*r\.?\s*f\.?\s*13/, 'Base IRRF 13º'],
    [/base\s+i\.?\s*r\.?\s*r\.?\s*f\.?/, 'Base IRRF'],
    [/dep\.?\s+i\.?\s*r\.?\s*r\.?\s*f\.?/, 'Dep. IRRF'],
    [/f\.?\s*g\.?\s*t\.?\s*s\.?\s+do\s+mes/, 'FGTS Mês'],
    [/base\s+fgts/, 'Base FGTS'],
    [/salario\s+base/, 'Salário Base']
];

function extrairDemonstrativo(linhas, page) {
    const competencia = extrairCompetencia(linhas.join('\n'));
    const fields = [];
    const bases = [];
    let dentroDaTabela = false;

    for (const linha of linhas) {
        const t = semAcentos(linha.trim());

        if (/^cod\.?\s+descricao/.test(t)) {
            dentroDaTabela = true;
            continue;
        }

        if (dentroDaTabela && /^total\b/.test(t)) {
            dentroDaTabela = false;
            const numeros = tokenizar(linha).filter(tok => ehDinheiro(tok.texto));
            if (numeros[0]) definirBase(bases, 'Total Vencimentos', numeros[0].texto);
            definirBase(bases, 'Total Descontos', numeros[1]?.texto ?? DESCONHECIDO);
            continue;
        }

        if (/^liqu?[iü]do\b/.test(t)) {
            const numero = tokenizar(linha).find(tok => ehDinheiro(tok.texto));
            definirBase(bases, 'Valor Líquido', numero?.texto ?? DESCONHECIDO);
            continue;
        }

        if (dentroDaTabela) {
            const verba = lerVerbaDemonstrativo(linha);
            if (verba) fields.push(verba);
            continue;
        }

        for (const [label, value] of paresRotulados(linha, BASES_DEMONSTRATIVO)) {
            definirBase(bases, label, value);
        }
    }

    return [finalizarPagina({
        page,
        year: competencia.year,
        month: competencia.month,
        fields,
        bases
    })];
}

function lerVerbaDemonstrativo(linha) {
    const tokens = tokenizar(linha);
    if (tokens.length < 2) return null;

    const code = tokens[0].texto;
    if (!/^\/?[A-Z0-9]{2,6}$/i.test(code) || !/\d/.test(code)) return null;

    const numericos = tokensFinaisNumericos(tokens, 1);
    const label = juntar(tokens.slice(1, tokens.length - numericos.length));
    if (!label) return null;

    const ultimo = numericos.at(-1);
    const temValor = ultimo && ehDinheiro(ultimo.texto);

    return {
        code,
        label,
        reference: referenciaDe(numericos, temValor),
        value: temValor ? ultimo.texto : DESCONHECIDO
    };
}

/* --------------------------------------- */
/* payroll-04 — Recibo de Pagamento (OCR)   */
/* --------------------------------------- */

/** Espaço mínimo entre duas colunas para considerar o texto posicionado. */
const ESPACO_ENTRE_COLUNAS = 5;

const BASES_RECIBO = [
    [/sal[aá]rio\s+base/, 'Salário Base'],
    [/s?al\.?\s*contrib\.?\s*inss/, 'Sal. Contrib. INSS'],
    [/base\s+c[aá]lc\.?\s*fgts/, 'Base Cálc. FGTS'],
    [/base\s+c[aá]lc\.?\s*irrf/, 'Base Cálc. IRRF'],
    [/fgts\s+m[eê]s/, 'FGTS Mês']
];

function extrairRecibo(linhas, page) {
    const copias = separarCopiasRecibo(linhas);
    const lidas = copias.map(copia => lerRecibo(copia, page));

    // A digitalização do payroll-04 traz duas vias do mesmo recibo por página.
    // Mantemos apenas a via mais legível para não duplicar verbas.
    const melhor = lidas.sort((a, b) => pontuarRecibo(b) - pontuarRecibo(a))[0];
    return melhor ? [finalizarPagina(melhor)] : [];
}

function separarCopiasRecibo(linhas) {
    const indices = [];
    for (let i = 0; i < linhas.length; i++) {
        if (/recibo\s+de\s+pagamento/.test(semAcentos(linhas[i]))) indices.push(i);
    }
    if (indices.length < 2) return [linhas];

    const copias = [];
    for (let i = 0; i < indices.length; i++) {
        const fim = i + 1 < indices.length ? indices[i + 1] : linhas.length;
        copias.push(linhas.slice(indices[i], fim));
    }
    return copias;
}

function pontuarRecibo(pagina) {
    const incertos = [...pagina.fields, ...pagina.bases].filter(item => item.value === DESCONHECIDO).length;
    const competencia = pagina.month === DESCONHECIDO ? 2 : 0;
    return pagina.fields.length + pagina.bases.length - incertos * 2 - competencia;
}

function lerRecibo(linhas, page) {
    const competencia = extrairCompetencia(linhas.join('\n'));
    const colunaDescontos = colunaDescontosRecibo(linhas);
    const fields = [];
    const bases = [];

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const t = semAcentos(linha.trim());

        if (/^\[?total\s+de\s+proventos/.test(t)) {
            const [esquerda, direita] = dividirRecibo(linha, colunaDescontos);
            definirBase(bases, 'Total Vencimentos', ultimoValor(esquerda));
            definirBase(bases, 'Total Descontos', ultimoValor(direita));
            continue;
        }

        if (/liquido\s*,?\s*a\s*receber/.test(t)) {
            definirBase(bases, 'Valor Líquido', ultimoValor(linha));
            continue;
        }

        if (BASES_RECIBO.some(([regex]) => regex.test(t))) {
            const proxima = linhas[i + 1];
            for (const [label, value] of lerBasesRodape(linha, proxima)) {
                definirBase(bases, label, value);
            }
            // A linha seguinte traz apenas os valores desses rótulos.
            if (proxima && !tokenizar(proxima).some(tok => /\p{L}/u.test(tok.texto))) i += 1;
            continue;
        }

        if (ehCabecalhoRecibo(t) || ehLinhaIgnorada(linha)) continue;

        const [esquerda, direita] = dividirRecibo(linha, colunaDescontos);
        for (const trecho of [esquerda, direita]) {
            fields.push(...lerVerbasRecibo(trecho));
        }
    }

    return { page, year: competencia.year, month: competencia.month, fields, bases };
}

function ehCabecalhoRecibo(t) {
    return /^(recibo|referencia|matricula|nome|cpf|cargo|data\s+admissao|estabelecimento|descricao|proventos|descontos|\|?c(?:argo|pf)|l?cpf)/.test(t)
        || /^\d{2}\/\d{2}\/\d{4}$/.test(t)
        || /(?:^|\s)(?:mensal|1\/1)(?:\s|$)/.test(t);
}

function colunaDescontosRecibo(linhas) {
    for (const linha of linhas) {
        const tokens = tokenizar(linha);
        if (tokens.some(tok => ehDinheiro(tok.texto))) continue;

        const descricoes = tokens.filter(tok => chaveRotulo(tok.texto) === 'descricao');
        if (descricoes.length >= 2 && descricoes[1].inicio - descricoes[0].fim >= ESPACO_ENTRE_COLUNAS) {
            return descricoes[1].inicio - 1;
        }

        const descontos = tokens.find(tok => chaveRotulo(tok.texto) === 'descontos');
        const proventos = tokens.find(tok => chaveRotulo(tok.texto) === 'proventos');
        if (descontos && proventos && descontos.inicio - proventos.fim >= ESPACO_ENTRE_COLUNAS) {
            return Math.floor((proventos.fim + descontos.inicio) / 2);
        }
    }

    return null;
}

function dividirRecibo(linha, colunaDescontos) {
    if (colunaDescontos === null) return [linha, ''];
    return [recortar(linha, 0, colunaDescontos), recortar(linha, colunaDescontos)];
}

/**
 * Sem a coluna de descontos identificada (texto sem geometria), cada valor
 * monetário encerra uma verba: o rótulo é o texto imediatamente à esquerda.
 */
function lerVerbasRecibo(trecho) {
    const tokens = tokenizar(trecho).filter(tok => !ehRuidoOCR(tok.texto));
    if (!tokens.length) return [];

    const verbas = [];
    let rotulo = [];
    let referencia = '';

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const proximo = tokens[i + 1];

        if (ehDinheiro(token.texto)) {
            const label = juntar(rotulo);
            if (label && !ehCabecalho(label)) {
                verbas.push({ code: '', label, reference: referencia, value: token.texto });
            }
            rotulo = [];
            referencia = '';
            continue;
        }

        // Um número solto no meio do rótulo faz parte dele ("INSS 13 SALARIO");
        // só é referência quando antecede diretamente o valor.
        if (ehNumero(token.texto) && rotulo.length && proximo && ehDinheiro(proximo.texto)) {
            referencia = token.texto;
            continue;
        }

        rotulo.push(token);
    }

    const restante = juntar(rotulo);
    if (restante && !ehCabecalho(restante) && verbas.length === 0 && tokens.some(tok => ehNumero(tok.texto))) {
        verbas.push({ code: '', label: restante, reference: '', value: DESCONHECIDO });
    }

    return verbas;
}

function lerBasesRodape(linha, proxima) {
    const rotulos = paresRotuladosComPosicao(linha, BASES_RECIBO);
    if (!rotulos.length) return [];

    const comValor = rotulos.filter(item => item.value !== null);
    if (comValor.length === rotulos.length) {
        return rotulos.map(item => [item.label, item.value]);
    }

    const numeros = tokenizar(proxima ?? '').filter(tok => ehDinheiro(tok.texto));

    if (numeros.length === rotulos.length) {
        return rotulos.map((item, i) => [item.label, numeros[i].texto]);
    }

    return rotulos.map(item => {
        const numero = numeros.find(n => Math.abs(n.inicio - item.inicio) <= 12);
        return [item.label, item.value ?? numero?.texto ?? DESCONHECIDO];
    });
}

/* ------------------------------- */
/* Layout desconhecido (fallback)   */
/* ------------------------------- */

const BASES_GENERICAS = [
    [/l[ií]quido\s+a\s+receber/, 'Valor Líquido'],
    [/proventos\s+liquidos/, 'Proventos Líquidos'],
    ...BASES_DEMONSTRATIVO,
    ...BASES_RECIBO
];

function extrairGenerico(linhas, page) {
    const competencia = extrairCompetencia(linhas.join('\n'));
    const fields = [];
    const bases = [];

    for (const linha of linhas) {
        const pares = paresRotulados(linha, BASES_GENERICAS);
        if (pares.length) {
            for (const [label, value] of pares) definirBase(bases, label, value);
            continue;
        }

        const verba = lerVerba(linha);
        if (verba) fields.push(verba);
    }

    return [finalizarPagina({
        page,
        year: competencia.year,
        month: competencia.month,
        fields,
        bases
    })];
}

/* --------------- */
/* Apoio comum      */
/* --------------- */

function paresRotulados(linha, definicoes) {
    return paresRotuladosComPosicao(linha, definicoes)
        .map(item => [item.label, item.value ?? DESCONHECIDO]);
}

/**
 * Lê pares "rótulo: valor" que dividem a mesma linha. O valor de um rótulo é
 * procurado somente até o início do rótulo seguinte, evitando que um campo
 * receba o número de outro.
 */
function paresRotuladosComPosicao(linha, definicoes) {
    const alvo = semAcentos(linha);
    const encontrados = [];

    for (const [regex, label] of definicoes) {
        const match = alvo.match(regex);
        if (!match) continue;
        if (encontrados.some(item => item.label === label)) continue;
        if (encontrados.some(item => match.index >= item.inicio && match.index < item.fim)) continue;
        encontrados.push({ label, inicio: match.index, fim: match.index + match[0].length });
    }

    encontrados.sort((a, b) => a.inicio - b.inicio);

    return encontrados.map((item, i) => {
        const limite = i + 1 < encontrados.length ? encontrados[i + 1].inicio : linha.length;
        const trecho = linha.slice(item.fim, limite);
        const numero = tokenizar(trecho).find(tok => ehDinheiro(tok.texto));
        return { ...item, value: numero?.texto ?? null };
    });
}

function valorRotulado(linhas, regex) {
    for (const linha of linhas) {
        const pares = paresRotuladosComPosicao(linha, [[regex, 'alvo']]);
        if (pares.length) return pares[0].value ?? DESCONHECIDO;
    }
    return null;
}

function ultimoValor(trecho) {
    const numeros = tokenizar(trecho).filter(tok => ehDinheiro(tok.texto));
    return numeros.at(-1)?.texto ?? DESCONHECIDO;
}

function contarDinheiro(linha) {
    return tokenizar(linha).filter(tok => ehDinheiro(tok.texto)).length;
}

function ehCabecalho(label) {
    return /^(cod\.?|descricao|unidade|proventos|descontos|verba|nome|valor|qtde|base\s*\/|referencia|folha|fls)\b/
        .test(semAcentos(label));
}

/** Marcas soltas deixadas pelo OCR nas bordas da página. */
function ehRuidoOCR(texto) {
    return /^[^\p{L}\p{N}]+$/u.test(texto) || /^[a-zA-Z]$/.test(texto);
}

function definirBase(bases, label, value) {
    const existente = bases.find(base => base.label === label);
    const valor = String(value ?? '').trim() || DESCONHECIDO;

    if (!existente) {
        bases.push({ label, value: valor });
        return;
    }

    if (valor !== DESCONHECIDO) existente.value = valor;
}

function finalizarPagina(pagina) {
    return {
        page: pagina.page,
        year: pagina.year,
        month: pagina.month,
        fields: pagina.fields.map(field => ({
            code: String(field.code ?? ''),
            label: String(field.label ?? DESCONHECIDO),
            reference: String(field.reference ?? ''),
            value: String(field.value ?? '').trim() || DESCONHECIDO
        })),
        bases: pagina.bases.map(base => ({
            label: String(base.label ?? DESCONHECIDO),
            value: String(base.value ?? '').trim() || DESCONHECIDO
        }))
    };
}

function extrairCompetencia(texto) {
    const busca = semAcentos(texto);

    const numericos = [
        /mes\s*\/\s*ano\s*:\s*(\d{1,2})\s*\/\s*(\d{4})/,
        /periodo\s*:\s*(\d{1,2})\s*\/\s*(\d{4})/,
        /competencia\s*[:\-]?\s*(\d{1,2})\s*\/\s*(\d{4})/,
        /mes\s*:\s*(\d{1,2})\s*\/\s*(\d{4})/
    ];

    for (const regex of numericos) {
        const m = busca.match(regex);
        if (m) return { month: validarMes(m[1]), year: validarAno(m[2]) };
    }

    // Ficha financeira: "Mês: abr-17".
    const abreviado = busca.match(/mes\s*:\s*([a-z]{3})\s*[-/]\s*(\d{2,4})\b/);
    if (abreviado) {
        const month = MESES_CURTOS[abreviado[1]];
        const year = normalizarAno(abreviado[2]);
        if (month && year !== '????') return { month, year };
    }

    // Recibo digitalizado: "SETEMBRO/2019", às vezes com a primeira letra
    // perdida pelo OCR ("UTUBRO/2019").
    const porExtenso = busca.match(/([a-z]{4,12})\s*\/\s*((?:19|20)\d{2})\b/);
    if (porExtenso) {
        const month = mesPorNome(porExtenso[1]);
        if (month) return { month, year: porExtenso[2] };
        return { month: DESCONHECIDO, year: validarAno(porExtenso[2]) };
    }

    return { month: DESCONHECIDO, year: DESCONHECIDO };
}

/**
 * Reconhece o nome do mês mesmo com caracteres perdidos nas bordas pelo OCR,
 * desde que a correspondência seja única. Caso contrário devolve nulo para o
 * mês ficar como `?` em vez de ser adivinhado.
 */
function mesPorNome(nome) {
    const candidatos = Object.keys(MESES).filter(mes =>
        mes === nome ||
        (nome.length >= 5 && (mes.endsWith(nome) || mes.startsWith(nome)))
    );

    return candidatos.length === 1 ? MESES[candidatos[0]] : null;
}

function validarMes(valor) {
    const n = Number(valor);
    return n >= 1 && n <= 12 ? String(n).padStart(2, '0') : DESCONHECIDO;
}

function validarAno(valor) {
    const n = Number(valor);
    return n >= 1900 && n <= 2200 ? String(valor) : DESCONHECIDO;
}

function normalizarAno(valor) {
    const n = Number(valor);
    if (String(valor).length === 2) return String(n >= 70 ? 1900 + n : 2000 + n);
    return validarAno(valor);
}
