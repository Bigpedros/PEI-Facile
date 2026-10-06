# Verifica sulle scansioni del PEI compilato

## Problema riprodotto

La revisione a 200 DPI è presente nei JSON ricevuti e nessun campo è protetto. La persistenza non impedisce il ricalcolo. La ricostruzione delle celle perde bordi chiari/inclinati e interpreta male consegne e risposte con bounding box OCR sovrapposti.

## Correzione nel nucleo unico

- Evidenza raster condivisa: scansione di bordi lunghi inclinati fino a ±2°, soglia dedicata ai tratti chiari e intersezioni misurate con la pendenza del bordo. Le piccole caselle mantengono la misura stretta originaria.
- La fusione dei tratti lunghi non incorpora intere righe di testo vicine al bordo.
- Associazione della consegna alla riga OCR esplicita della cella, evitando residui della cella precedente.
- Nelle celle con consegna e risposta sovrapposte si conserva l'intero testo originale nella cella compilabile, inclusa la consegna: resta una proposta da revisionare, senza perdere la prima riga della risposta.
- Etichette brevi per Obiettivi, Attività, Strategie e strumenti; una frase che termina con due punti non diventa automaticamente una etichetta.
- Firme associate alla propria riga tratteggiata anche quando il contorno della cella è incompleto; recupero delle caselle lette come C]/Q] soltanto accanto a scelte esplicite.

Raster e compilatore restano nella stessa pipeline. Il documento mostrato non viene ruotato o sostituito dal rilevatore.

## Validazione

Il PDF originale compilato viene normalizzato usando le dimensioni, la risoluzione e l'incapsulamento PDF della pipeline di acquisizione. Verifica sulle prime quattro pagine: quattro firme a pagina 1, aree narrative a pagina 2, tutte e quattro le dimensioni a pagina 3, nove riquadri Obiettivi/Attività/Strategie a pagina 4. Controllata anche la conservazione delle prime righe di testo e l'assenza di caselle spurie a pagina 4.

Il documento personale non è incluso nel repository. `src/core/documental/realRasterRegression.test.ts` è una regressione opzionale, eseguibile impostando `PEI_REAL_ROMA_PDF` al percorso del documento originale. In assenza del documento il test viene saltato. Sono inclusi test sintetici riproducibili su bordi chiari inclinati e risposte sulla stessa riga della consegna.

## Prova nell'app

Sincronizzare GitHub → AI Studio, ripubblicare e ripetere Rileva (Pagina) sul documento già salvato. Il JSON deve riportare `detectionRevision: calibratore-20261006-bordi-inclinati` e `detectionDpi: 200`.

La verifica copre le prime quattro pagine. Non certifica ancora tutte le dodici pagine, la fedeltà OCR di ogni parola o la resa finale di tutti i valori nel PDF compilato. L'approvazione resta manuale.
