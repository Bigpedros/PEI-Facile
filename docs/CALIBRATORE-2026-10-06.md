# Calibratore campi — 6 ottobre 2026

Base: pei-facile (14).zip. Nessun nuovo trasferimento del motore.

## Modifiche
- Evidenza raster condivisa per linee, bordi di celle e caselle: soglia meno restrittiva, piccole interruzioni e inclinazioni tollerate; coordinate mantenute sul raster canonico.
- Righe continue e tratteggiate: privilegiata la geometria completa rispetto a frammenti sovrapposti. Le parole OCR che inglobano la sottolineatura non ne impediscono il rilevamento.
- Associazione etichette: recupero BAMBINO/A anche dall’OCR BAMBINOA; Sezione e Plesso o sede distinti; esclusione della frase Nella fase transitoria e delle istruzioni stampate.
- Caselle: eliminati duplicati e rettangoli coincidenti con lettere; didascalie fermate prima della casella successiva.
- Nessun cambiamento allo schema del compilatore, alla persistenza o alle trasformazioni delle coordinate.
- Unica configurazione PDF.js in src/core/pdfWorker.ts con import Vite ?url; eliminate configurazioni concorrenti di intake, adapter, analyzer e DocumentSurface.

## Verifiche
- 28/28 test mirati: calibratorRaster, documental/integration, templateSchema, templateCalibration. Il test raster usa realmente PDF.js e OCR locale sulla prima pagina di public/downloads/PEI_Comune_Roma_Canonico_A4_020.pdf.
- Risultato sul PDF incluso: 204 parole OCR, 21 regioni geometriche, 19 campi proposti. Sezione e Plesso o sede non si sovrappongono; nessun campo Nella fase transitoria; intestazione delle istruzioni GLO esclusa.
- Typecheck e build completati. Il worker PDF viene emesso come dist/assets/pdf.worker.min-*.mjs.

## Limiti e prossimo controllo
Il PDF esatto deformato importato il 5 ottobre non è identificato nello ZIP: il JSON diagnostico originale descrive 154 parole OCR, quindi questo test non è la riproduzione esatta di quella sessione. Riaprire quel modello ed eseguire Rileva pagina 1 per verificare la correzione sui suoi pixel.
Il caricamento del worker nell’anteprima remota non è stato verificato in un browser in questo ambiente. La correzione del percorso è verificata sulla build, ma va controllata nell’anteprima osservata dall’utente.
I 19 campi restano proposte da verificare. Non è dichiarata completa l’acquisizione di tutti i campi: caselle molto piccole, firme tratteggiate, didascalie ripetute e ulteriori pagine richiedono ancora una revisione sul documento reale.

## Avvio
Estrarre lo ZIP, quindi npm ci e npm run dev. Per la distribuzione: npm run build e pubblicare dist.
