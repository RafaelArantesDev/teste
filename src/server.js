import express from 'express';
import path from 'node:path';
import { routerHealth, routerTranscricoes } from './router.js';

const app = express();
const PUBLIC_DIR = path.resolve('public');

// A interface fica no mesmo servidor da API.
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use('/healthz', routerHealth);
app.use('/api/transcricoes', routerTranscricoes);

app.listen(3000, () => {
  console.log('Servidor Iniciado');
  console.log('Interface: http://localhost:3000');
});
