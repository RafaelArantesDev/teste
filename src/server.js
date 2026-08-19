import express from 'express';
import {routerHealth, routerTranscricoes } from './router.js'

const app = express();

app.get('/', (req, res) => {
  res.send('Óla Rafael!');
});

app.use('/healthz', routerHealth)

app.use('/api/transcricoes', routerTranscricoes)

app.listen(3000, () =>{
    console.log('Servidor Iniciado')
});
