# Rilevamento pagina: risoluzione e diagnostica

## Riscontro sui file ricevuti

I JSON riportano 22, 17 e 16 candidati per le pagine 1, 2 e 3. Tutti venivano classificati come duplicati confrontandoli con i campi già applicati, anche automatici: `finalProposedFields: []` non indicava assenza di rilevamento. Il JSON di pagina 1 è datato 15:33 UTC e precede gli screenshot delle 18:06 italiane, che mostrano 28 proposte e le nuove intestazione/firme.

## Correzioni

- Il raster per rilevamento e diagnostica è prodotto dal PDF a 200 DPI; il canvas dell'anteprima e lo zoom non influenzano l'OCR.
- La diagnostica distingue proposte rigenerabili, corrispondenze automatiche, campi nuovi e duplicati dei campi revisionati. Non attribuisce all'esportazione una rigenerazione mai eseguita.
- Pagina e documento condividono la regola di protezione di campi manuali, nativi, confermati, modificati e scartati.
- Le celle narrative riconosciute propongono l'area sotto la consegna, conservando il testo già compilato; i bordi riconosciuti dall'OCR come `|` non vengono trattati come testo della consegna.
- I titoli di sezione e delle dimensioni non vengono usati come etichette di piccoli campi inline.

Il JSON aggiornato contiene `detectionRevision: calibratore-20261006-rileva-200dpi` e `detectionDpi: 200`.

## Verifica

Test su PDF Roma canonico: intestazione e quattro firme a pagina 1; geometrie identiche con anteprima piccola e vuota; aree narrative proposte nelle pagine 2 e 3. Test sintetici su conservazione del testo e protezione delle geometrie revisionate.

La disponibilità di alcune aree dipende ancora dalla corretta misura dei bordi e dall'OCR: questi test non certificano ogni campo delle dodici pagine. Il PDF compilato degli screenshot non è disponibile come allegato PDF; occorre una prova dopo sincronizzazione GitHub → AI Studio e republish, usando Rileva (Pagina) e nuovi JSON per le tre pagine. I campi già revisionati restano protetti.
