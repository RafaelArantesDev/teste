import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { routerHealth, routerTranscricoes } from './router.js';

const app = express();
const porta = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

// A interface fica no mesmo servidor da API.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '../public')));

app.use('/healthz', routerHealth);
app.use('/api/transcricoes', routerTranscricoes);

app.listen(porta, host, () => {
    console.log(`Servidor Iniciado em http://${host}:${porta}`);
});
