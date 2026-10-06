# Installazione della root consolidata

Consegna del 5 ottobre 2026, confrontata con `pei-facile (9).zip`, SHA-256 `8190373672c65701f8e8c6c1d43f8042249409829b411dd98c7523f4b4590ecd`. Conservare lo ZIP originale e un backup dei documenti/calibrazioni del browser.

## Applicazione

Usare preferibilmente la root completa in una copia di prova. La patch contiene solo file aggiunti/modificati rispetto alla baseline originale, nei percorsi relativi alla root. Sovrapporli alla baseline e rimuovere esclusivamente i percorsi in `deleted` di `INTEGRATION-020-MANIFEST.json`. Non cancellare cartelle o dati del browser. Se la root Gemini contiene modifiche successive alla baseline, confrontarle prima di sovrascrivere; non rigenerare il motore per risolvere differenze.

`FILELIST.tsv` elenca ogni aggiunta, modifica e rimozione. Il manifest contiene gli hash della baseline e della root risultante. I vecchi file CHECKSUMS/SHA256SUMS/manifest di provenienza appartengono al pacchetto originario; il manifest INTEGRATION-020 è autorevole per questa consegna.

## Dipendenze e comandi

Node 22.12+; ambiente verificato Node **24.19.0**, npm **11.9.0**. Dalla root:

```sh
npm ci
npm run assets
npm run typecheck
npm run build
npm test
npm run test:integration
npm run test:renderer
```

Esiti attesi: **507 test in 75 file**, **26 test mirati**. La suite usa processi separati con un worker: i test PDF con Canvas nativo e OCR possono durare diversi minuti. Non cambiare tale configurazione per velocizzare l'esecuzione in ambienti con poca memoria.

Dipendenze principali: PDF.js **4.10.38**, Tesseract **7.0.0**, pdf-lib **1.17.1**, UTIF e librerie PEI preesistenti. Canvas di sviluppo è fissato a **0.1.100**: la versione 1.0.10 ha causato un arresto nativo riproducibile nel renderer delle prove. Playwright è una dipendenza di sviluppo. Non occorre adottare PDF.js 6/Vite 8 del progetto indipendente. Worker OCR, WASM, lingue ita/eng, font e CMap sono inclusi e ripreparabili con `npm run assets`.

Il nucleo documentale lavora localmente senza chiavi AI. Le funzioni AI preesistenti mantengono la configurazione `.env.example`. DOCX conserva il proprio adapter e i limiti dei modelli Word complessi; nessun servizio LibreOffice viene introdotto.

## Verifiche nel browser

```sh
npx playwright install chromium
npm run test:browser:integration
node scripts/verify-compiler.mjs
npm run test:persistence
```

Se Chromium è già disponibile, gli script principali accettano `CHROMIUM_EXECUTABLE`. La prova su PDF originali e JSON richiede i file personali, che non sono incorporati nei pacchetti:

```sh
PEI_REAL_PDF_DIR=/percorso/pdf-originali npm run test:browser:real
PEI_TEST_JSON_DIR=/percorso/json-originali npm run test:json:integration
```

La prova sui PDF usa i due nomi originali riportati in `real-pdf-report.json` e ne verifica gli hash. `PEI_REAL_VALUE_SAMPLES_FILE` può indicare un JSON privato di campioni `{ "key": "nome_campione", "value": "valore atteso" }`: il rapporto registra solo gli esiti, senza copiare i valori personali. Gli output personali delle prove vengono scritti fuori dalla root dell'applicazione, in `../private-verification`.

Per il confronto indipendente del raster occorrono Python con `pymupdf`, `numpy`, `scipy`, `pillow`:

```sh
PEI_REAL_PDF_DIR=/percorso/pdf-originali python3 scripts/verify-raster-preservation.py
```

Eseguire prima le prove browser che producono i PDF canonici. Senza PDF personali lo script verifica i 24 fogli A1/Roma della baseline. I risultati di questa consegna comprendono 49 fogli.

## Controlli nell'istanza Gemini

Avviare `npm run dev` in una copia di prova. Importare un documento compilato, correggere una proposta e il suo box, compilare un campo, salvare, riaprire e stampare A4. Aprire un modello e una calibrazione già salvati nell'archivio reale. Non sono state eseguite prove nella tua specifica istanza Google né nel tuo archivio effettivo: marcare tali controlli come aperti finché non sono eseguiti. Non pubblicare automaticamente.

## Ripristino

Ripristinare tutta la root dalla baseline originale, inclusi i file rimossi dalla patch, senza svuotare IndexedDB/localStorage. I nuovi documenti sono in `pei_facile_documents_020`; il primo record legacy sostituito al salvataggio è conservato come stringa originale sotto `__legacy_rollback_020__` nello store `documents`. Prima di tornare al vecchio codice, esportare i nuovi documenti/valori: la baseline non legge automaticamente il nuovo archivio binario.
