# Fase 2 — doppio lettore operativo

Base: fase 1 `7b77f1b408fd7e3bf2edb476d7801fefc6abd02c`.
Nessun servizio AI, Ollama o runtime esterno è coinvolto nel riconoscimento.

Il nucleo `documental/engine` prepara il raster canonico, esegue Tesseract
sulla copia con contrasto e OCRS/RTen sul raster canonico. Raccoglie le
evidenze B complete e fino a otto riletture regionali delle discordanze.
Il Decision Engine deterministico di MOTORE-OCR-AI confronta le letture,
poi la pipeline esistente ricava regioni e campi.

Acquisizione, Rileva pagina, Rileva documento ed esportazione diagnostica
usano il medesimo nucleo. Le opzioni di rilevamento e il segnale di
annullamento sono inoltrati anche durante Rileva documento.

Le letture originali A e B restano distinte in `ocrReading`. Le correzioni
ammesse mantengono le coordinate del token A, il testo originale e la
decisione. Se non vi sono modifiche, restano anche ordine e ID di riga A.
Le passate B completa e regionale non sono due motori diversi. La confidence
B è euristica, non una probabilità calibrata. Le nuove parole assenti da A
seguono i requisiti conservativi del Decision Engine: non è garantito il
recupero di ogni parola o campo mancante.

L'inferenza WASM gira in un Web Worker, separato dal thread dell'interfaccia.
L'annullamento termina il worker; a fine documento si rilasciano le risorse.
Il modello è riutilizzato tra le pagine della stessa acquisizione. Gli URL
degli asset rispettano BASE_URL e i pixel non sono inviati a servizi esterni.

Asset inclusi:

- `public/recognizer-b/ocrs_wasm.js`
- `public/recognizer-b/ocrs_wasm_bg.wasm`
- `public/models/text-detection.rten`
- `public/models/text-recognition.rten`

Se B non è caricabile, A continua con il risultato originale e la diagnostica
mostra `availability: unavailable`, `execution: fallback-primary` e il motivo.
Un risultato B vuoto è distinto da un asset mancante. `secondReader` e
`independentOcrComparison` dichiarano l'esecuzione effettiva.

Il testo nativo PDF coerente conserva il percorso nativo. Le pagine miste
mantengono la fusione esistente. Un runner OCR custom non attiva B
implicitamente. `independentReading: false` lo disabilita per confronti.
L'hook legacy `secondaryOcrRunner` rimane compatibile con le integrazioni
custom, ma non viene rieseguito se il nucleo ha già letto la pagina con B.

Regole di associazione dei campi, soglie geometriche e protezioni dei campi
manuali/confermati restano invariate. Il vecchio contatore delle evidenze
testuali scoperte non è stato esteso alle regioni: quello resta nella fase 3.
La baseline osservata della fase 1 non viene aggiornata ai nuovi risultati.

## Provenienza

Snapshot `Bigpedros/MOTORE-OCR-AI`, commit
`be0005803ed60eadd4eb4030b7d2a2bad79a5c29`, in
`src/core/documental/vendor/motore-ocr-ai`: recognizer B, contratto provider,
checkpoints, Decision Engine, local evidence resolver e contratti necessari.
Le regole decisionali sono mantenute senza riscrittura. Adattamenti al bridge:
runtime in worker, annullamento, rilascio risorse e rifiuto di box degeneri.
Il bridge Rust sorgente è in `recognizer-b/ocrs-wasm`.

Asset compilati dal banco `Bigpedros/bancodiprovamotore`, distribuiti senza
modifiche. Blob Git: WASM `7e86ee761933ea8ffb980d34f1a744f04918bb43`, detection
`1725cf29e433161510682367a2cb374b6677bc99`, recognition
`464815feb06d97cf2c731dad5e85d62fb7a2a606`.
OCRS/RTen: Robert Knight, MIT/Apache-2.0; modelli CC-BY-SA-4.0.
Attribuzione in `public/licenses/recognizer-b/NOTICE.md`.

## Verifica riproducibile

    npm run typecheck
    npm run build
    npx vitest run src/core/documental/dualReading.test.ts src/tests/peiFieldDetectionProfile.test.ts
    node scripts/verify-independent-reader.mjs

Il test browser usa i motori reali su una fixture raster, acquisizione,
rilevamento pagina/documento, export e pagina 1 del PDF Roma canonico incluso.
Verifica anche fallback e annullamento. Non certifica tutte le 12 pagine del
documento originale deformato dell'utente.
