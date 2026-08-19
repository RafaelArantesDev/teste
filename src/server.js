import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { routerHealth, routerTranscricoes } from './router.js';

const app = express();

// A interface fica no mesmo servidor da API.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '../public')));

app.use('/healthz', routerHealth);

app.use('/api/transcricoes', routerTranscricoes);

app.listen(3000, () => {
    console.log('Servidor Iniciado');
});
