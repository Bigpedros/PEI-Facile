# Fase 6 — collaudo integrale del percorso documentale

Data: 16 ottobre 2026. Base: `bde55b74917a28334444a8506de180707481a871`.

## Criterio di chiusura

La fase si chiude dopo una prova sul PDF originale di 12 pagine con entrambi i lettori effettivamente eseguiti, geometrie valide, PDF A4 integro, compilazione, proprietà dei campi, salvataggio, riapertura e stampa dall'anteprima di produzione. Il numero di campi rilevati non misura da solo la completezza del riconoscimento. La revisione visiva rimane distinta dai test automatici.

La sincronizzazione e il republish di AI Studio non fanno parte di questa modifica. Nessun servizio AI/LLM viene aggiunto al riconoscimento: restano Tesseract e OCRS/RTen locali.

## Correzioni

- Il ponte di acquisizione usava `pages.length + 1` prima di aggiungere tutte le pagine del singolo file: il documento multipagina appariva sempre fermo alla prima pagina. Ora riceve il totale dal caricatore PDF/TIFF/immagine e riporta la pagina corrente.
- Il logger del worker Tesseract conservava il numero della pagina usata per inizializzarlo. Ora segue la pagina corrente anche quando il worker viene riutilizzato, senza ricaricare il motore.
- La percentuale non arretra quando il passaggio OCR termina e inizia l'analisi geometrica. L'acquisizione documentale arriva all'85%; il servizio mantiene il completamento finale alla preparazione della revisione.
- Nei caricamenti di più file, numeri di pagina, etichette e risultati incrementali ricevono lo stesso offset. Finché il totale non è noto, rimane esplicitamente sconosciuto.
- Il callback facoltativo `onDocumentalPage` permette di conservare la diagnostica di ogni pagina completata senza ripetere l'OCR. Non modifica i criteri di rilevamento né conferma i campi.

## Prove riproducibili

Il PDF e gli esiti contenenti testo del documento devono restare in una cartella privata esterna al repository. Nessun PDF originale, testo OCR o immagine delle pagine viene aggiunto a GitHub.

### Acquisizione reale locale

```bash
PEI_PHASE6_INPUT=/percorso/privato/originale.pdf \
PEI_PHASE6_OUTPUT=/percorso/privato/esiti-node \
npm run test:phase6:acquisition
```

Senza queste variabili la prova è dichiarata `skipped`, non superata. Il test usa il servizio `processDocumentAcquisition` e i due motori reali: l'adattamento Node riguarda soltanto I/O, canvas e trasporto del runtime WASM. Non sostituisce risultati OCR. Salva ogni pagina appena completata; verifica 12 pagine ordinate, esecuzione del secondo lettore, conservazione del sorgente, unicità degli ID, geometrie entro A4 e riapertura del PDF canonico di 12 pagine. Il report espone tempi e strutture ancora irrisolte. Questo percorso non collauda il worker Web del browser. Il rendering Canvas nativo può differire da quello di Chromium: i conteggi non sono un confronto di accuratezza con le misure browser delle fasi precedenti.

Per verificare inoltre ogni pagina del PDF canonico rispetto al raster di produzione salvato:

```bash
node scripts/verify-phase6-canonical.mjs /percorso/privato/esiti-node
```

Questa prova riapre il PDF con PDF.js, verifica contenuto non bianco e scostamento medio dei pixel inferiore a 8/255 su ciascuna pagina, e produce un prospetto visivo privato delle 12 pagine. Non misura la correttezza del testo OCR.

### Ciclo completo nel browser

Con Chromium Playwright già installato (`npx playwright install chromium --only-shell` in un ambiente che ne consenta il download):

```bash
npm run test:phase6:browser -- /percorso/privato/originale.pdf /percorso/privato/esiti-browser
```

È disponibile anche `CHROMIUM_EXECUTABLE` per un Chromium esistente. Il server è limitato a `127.0.0.1`; il PDF è servito soltanto durante il test e non viene copiato negli asset pubblici.

La prova apre l'app, acquisisce il PDF originale senza OCR simulato, controlla entrambi i lettori e le 12 pagine, modifica campi sulle pagine 1/7/12 tramite DOM, verifica un campo manuale di collaudo, modifica dimensioni tramite cursori, carattere a 15 punti e grassetto/corsivo/sottolineato. Usa la persistenza IndexedDB di produzione, ricarica la pagina e confronta valori, proprietà, schema e hash dei due binari. Infine stampa dal componente `AnteprimaScreen`, riapre il PDF esportato e verifica 12 pagine A4 e testi di prova sulle pagine previste.

Per esercitare la compilazione crea una copia di test dello schema con stato calibrato; conserva `visualReviewStatus: REQUIRED`. Non approva automaticamente lo schema ottenuto dall'OCR né sostituisce la revisione umana. Il campo manuale è una fixture del test di persistenza, non una prova del disegno manuale nell'editor di calibrazione.

## Stato del collaudo

- 127 test superati in 12 file (111 mirati più 7 sulla diagnostica e 9 sul calibratore raster): doppia lettura, allineamento OCR, recupero strutturale, associazioni, schema, calibrazione, proprietà e regressioni sull'avanzamento.
- TypeScript: superato.
- Build Vite: superata; resta l'avviso preesistente sulla dimensione dei bundle.
- Prova browser: bloccata prima dell'avvio perché Chromium non è presente. Il download è rifiutato dalla rete dell'ambiente con HTTP 403 (`Domain not in allowlist`). Non è registrata come superata.
- Acquisizione originale locale: **superata** su tutte le 12 pagine, senza OCR simulato e senza fallback al solo lettore A. Rilevate 173 proposte di campo; coordinate valide entro A4, ID univoci e sorgente conservato. Tempo del servizio: 544.8 secondi (circa 9.1 minuti), inclusa la costruzione del PDF canonico.
- PDF canonico: riaperto e verificato su 12 pagine A4. Tutte contengono il raster atteso; scostamento medio dei pixel tra 0.75 e 5.26/255 al rendering a 72 dpi. Controllato anche il prospetto visivo delle 12 pagine per impaginazione e assenza di pagine bianche. Questa verifica non certifica la correttezza dei singoli campi.

Non si dichiara superata l'intera suite storica: questa verifica riguarda i file indicati. La lentezza del secondo lettore non è risolta dalle correzioni dell'avanzamento. La fase 6 non è dichiarata chiusa finché manca il collaudo del ciclo completo nel browser e la revisione delle pagine risultanti.

## Esiti per pagina (percorso Node)

| Pagina | Proposte | Secondi | Strutture irrisolte |
| --- | ---: | ---: | ---: |
| 1 | 27 | 39.4 | 0 |
| 2 | 21 | 45.4 | 1 |
| 3 | 8 | 61.2 | 0 |
| 4 | 14 | 71.2 | 0 |
| 5 | 7 | 49.8 | 0 |
| 6 | 1 | 16.2 | 0 |
| 7 | 54 | 43.6 | 6 |
| 8 | 5 | 29.1 | 1 |
| 9 | 3 | 44.0 | 0 |
| 10 | 16 | 40.9 | 3 |
| 11 | 1 | 48.0 | 1 |
| 12 | 16 | 44.8 | 6 |

Restano **18 strutture da verificare**: 16 con inchiostro non attribuibile con sicurezza a testo compilato oppure stampato (`UNPOSITIONED_OR_PRINTED_INK`), e 2 con sovrapposizione parziale a campi esistenti (`PARTIAL_FIELD_CONFLICT`). Non equivalgono automaticamente a 18 campi mancanti. Non vengono trasformate in campi o dichiarate vuote per far risultare completo il documento.

I tempi della seconda lettura sommano circa 468.3 secondi: rimane il costo dominante. Si tratta di misure del percorso Node, non di un confronto prestazionale con AI Studio.

Conteggi e misure anonime sono salvati in [`baselines/pei-roma-phase6-20261016.json`](baselines/pei-roma-phase6-20261016.json). Il test browser è predisposto ma non eseguito: salvataggio, riapertura e stampa del documento completo non sono certificati da questa sessione.
