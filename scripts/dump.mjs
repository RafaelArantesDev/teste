import { analisarPDF } from '../src/services/extracaoService.js';
import { extrairHolerite } from '../src/extractors/holeriteExtractor.js';
import { extrairCartaoPonto } from '../src/extractors/cartaoPontoExtractor.js';
import fs from 'node:fs/promises';

const arquivo = process.argv[2];
const tipo = process.argv[3] ?? 'holerite';
const r = await analisarPDF(arquivo);
await fs.writeFile('/tmp/texto-' + arquivo.split('/').pop() + '.txt', r.texto);
const out = tipo === 'holerite' ? extrairHolerite(r.texto) : extrairCartaoPonto(r.texto);
console.log('ORIGEM:', r.origem);
console.log(JSON.stringify(out, null, 2));
