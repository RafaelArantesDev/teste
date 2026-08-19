# Correções V8 — Extração e contrato JSON

Esta versão foi revisada a partir dos PDFs de exemplo e dos problemas observados nas transcrições.

## Principais correções

- Saída pública dos dois extratores segue o contrato do README: `pages[]`.
- Holerite preserva `page`, `year`, `month`, `fields[]` e `bases[]`.
- Cartão de ponto preserva `page`, `days[]`, `date_raw`, `punches[]`, `kind`, `time_raw` e `time_hhmm`.
- Separação de páginas corrigida para marcador OCR, form-feed e `Fls.:` sem criar uma página vazia no início.
- Holerite passou a reconhecer `Proventos Líquidos` como base distinta de `Valor Líquido` e nunca calcula líquido por conta própria.
- Datas e horários impossíveis são marcados com `?` nos caracteres problemáticos.
- Cartão de ponto não funde duas linhas que possuem a mesma data; a ordem original é preservada.
- Layout SIPON ignora horário de jornada e valores de ocorrência que não são batidas.
- Layouts de cartão com intervalos e com `Ent1/Sai1...Ent4/Sai4` recebem limites de batidas compatíveis com o cabeçalho.
- OCR passou a testar três modos de segmentação do Tesseract por página e escolher o candidato com melhor evidência de documento.
- PDF cuja camada de texto contém apenas rodapé/metadados agora cai para OCR mesmo que tenha alguns caracteres legíveis.
- Logs do processo OCR não imprimem o texto completo reconhecido, evitando exposição desnecessária de PII.
- O tipo informado pela API é respeitado; detecção automática fica apenas como fallback se o campo não vier.

## Testes

`npm test` foi executado com sucesso após as alterações.
