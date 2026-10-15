# Fase 1 — baseline e osservabilità

Base: main `82f2e27c154a1af4d2fc0453a2a7725ea709577d`.
Questa fase aggiunge osservazioni senza cambiare le regole, le soglie,
l'ordine, i valori, il merge o le geometrie del rilevamento. Non collega
il secondo lettore: quello è il lavoro della fase 2.

## Baseline delle 12 pagine

`baselines/pei-roma-20261015.json` registra i conteggi visibili negli
screenshot dell'utente: 25, 21, 9, 14, 10, 1, 1, 6, 0, 1, 1, 2.
Sono osservazioni dell'app, non il numero di campi attesi e non una nuova
esecuzione automatica. Il JSON runtime della pagina 12 documenta 297 parole,
31 regioni e 2 proposte. I valori non disponibili sulle altre pagine sono
`null`. Documenti, immagini e testo personale non sono inclusi nel repository.

Per confrontare nuove esportazioni senza copiarne il testo:

    node scripts/summarize-pei-diagnostics.mjs /percorso/diagnostiche

Lo script emette il confronto su stdout. Rifiuta più esecuzioni della stessa
pagina; le pagine non fornite restano esplicitamente non misurate.

## Rapporto per regione

Il nucleo allega `fieldInferenceDiagnostics` al risultato pagina. L'export
del calibratore lo espone in `fieldInference.firstPass` e, se eseguito,
`fieldInference.secondPass`, con schema `PEI_FIELD_INFERENCE_AUDIT_V1`.

Ogni regione ha una decisione, il codice del motivo, categoria, coordinate
in pixel del raster, numero di parole posizionate, campi prodotti e campi
geometricamente sovrapposti. Una sovrapposizione non certifica la copertura
semantica e non cambia la decisione del rilevatore.

Categorie: `geometry`, `association`, `filter`, `proposal`. Le osservazioni
OCR sono separate: numero di parole deboli e ID di token sproporzionati.
La mancanza di parole in una cella non prova da sola un fallimento OCR.

Esempi di codici:

- `FIELD_PROPOSED`
- `CHECKBOX_BELOW_TEXT_SCALE`
- `PRINTED_INSTRUCTION_IN_REGION`
- `INK_WITHOUT_POSITIONED_TEXT`
- `COLUMN_HEADER_STATIC`
- `EMPTY_CELL_WITHOUT_RECOGNIZED_LABEL`
- `CONTENT_WITHOUT_RECOGNIZED_FIELD_RELATION`
- `SIGNATURE_WITHOUT_MEASURED_WRITING_LINE`
- `NARRATIVE_RESPONSE_TOO_SHORT`
- `DUPLICATE_FIELD`
- `FIELD_TOO_SMALL_AFTER_CLAMP`

`attempts` distingue anche candidati proposti prima/fuori dal ciclo sulle
regioni (`regionId: null`). I candidati esclusi per dimensione o duplicazione
sono tracciati. Le righe/token che non generano alcun candidato fuori dalle
regioni non hanno una traccia individuale in questa fase.

Il JSON runtime usa schema `PEI_CALIBRATION_AUDIT_V1`; `fieldIdMap` collega gli
ID interni alle proposte esportate della prima passata e segnala i candidati
rimossi dal merge con i widget nativi. `pipelineTrace.discarded` distingue
scarti di regioni, candidati e conflitti con campi protetti. Il rapporto
interno resta separato dal conteggio finale dopo i merge.

## Stato del secondo lettore

`secondReader` distingue:

- `not-configured`: nessuna funzione fornita dall'app;
- `provided-unverified`: funzione presente ma non ancora eseguita;
- `available`: chiamata completata, con conteggio delle parole restituite.

`execution` distingue `blocked-no-reader`, `not-needed` e `completed`.
Una chiamata completata può restituire zero parole; non è dichiarata una
lettura riuscita del documento. Gli errori continuano a propagarsi come
prima, senza fallback aggiuntivi. Non vengono fatti probe o chiamate extra.

Il contatore legacy `uncoveredPlausibleRegionsCount` resta compatibile, ma
`uncoveredEvidenceKind: text-markers-and-short-prompts` chiarisce che oggi
misura solo evidenze testuali, non tutte le regioni compilabili mancanti.

## Verifica

I test confrontano gli stessi input con osservatore presente/assente,
ignorando soltanto gli UUID generati: campi, geometrie, etichette, valori e
ordine devono restare identici. Si verificano anche ragioni di esclusione,
stati del secondo lettore e presenza del rapporto nella pipeline attiva.
