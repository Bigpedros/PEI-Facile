# Integrazione PEI Facile / Motore documentale 0.2.0

**Stato: integrazione implementata e verificata nei percorsi browser descritti; non è ancora una release certificata senza regressioni.** La suite storica resta non verde: 53 test falliti, 440 passati e 6 errori di worker nell'ultima esecuzione. Questo limite non è stato nascosto né risolto ignorando test.

## Intervento concreto

- Nucleo 0.2.0 incorporato e adattato alle dipendenze PEI, con un'unica acquisizione PDF/raster e un'unica inferenza dei campi sullo sfondo finale.
- Renderer PDF.js completo al posto del ridisegno incompleto XObject in Node; eliminato il fallback bianco silenzioso.
- A4 con proporzioni conservate; conversione pixel -> punti esplicita; schema del documento acquisito associato al proprio sfondo/hash.
- Conservazione di valori/default/originali, AcroForm, checkbox, opzioni, suggerimenti semantici e revisioni manuali.
- Raggruppamento delle parole senza attraversare celle; esclusione di istruzioni, righe non etichettate e celle vuote senza associazione.
- Calibratore: corretta continuità del binario canonico, originale, hash e proprietà dei campi durante acquisizione, bozza e approvazione.
- PEI completo: binari in IndexedDB e metadati compatti in localStorage. Nessuna cancellazione o migrazione all'apertura dei vecchi record; snapshot legacy mantenuto al primo salvataggio.
- Stampa: correzione 72 punti PDF / 96 pixel CSS; niente seconda stampa del valore originale già presente nel raster.
- Download diagnostici aggiornati al PDF canonico verificato e ai confronti reali. Il vecchio PDF bianco viene rimosso dalla root aggiornata, conservata la baseline originale.

## Verifiche effettive

| Prova | Esito |
|---|---|
| Installazione `npm ci` e preparazione asset locali | Riuscite |
| Typecheck e build | Riusciti; rimangono avvisi di dimensione bundle e import dinamici |
| Test mirati integrazione, schema, calibrazione | **22/22 passati** |
| Chromium locale: applicazione React | Avvio riuscito |
| A1 incluso nella baseline | Tutte le 12 pagine; span nativi conservati e OCR delle informazioni raster nelle pagine miste; coordinate nei limiti |
| PDF misto sintetico | Testo nativo e valore presente nell'immagine entrambi conservati |
| AcroForm sintetico | Nome precompilato, checkbox selezionata e scelta conservati; testo modificato esportato nella superficie PEI |
| IndexedDB modelli | Salvataggio, reload, riapertura schema e verifica separata degli hash originale/normalizzato |
| Download modello | Stessi byte del binario salvato, hash verificato |
| Campo modificato | Geometria/proprietà protette durante nuova rilevazione; prova di compilazione e stampa con PageSurface |
| Schema del documento acquisito | Ripristino JSON, superficie DocumentSurface, rifiuto hash discordante |
| Roma reale della baseline | **12/12 pagine raster e OCR**, attraverso `processDocumentAcquisition`, hash sorgente controllato |
| PEI Roma completo | Salvataggio dei PDF e valori, reload, hash originali/canonici corrispondenti, riapertura dal comando dell'app “Apri PEI Esistente” |
| Compatibilità vecchio salvataggio | Lettura senza migrazione; snapshot identico preservato dopo salvataggio nuovo; PDF superiore a 5 MB ricaricato con hash invariato |
| Renderer indipendente PyMuPDF | A1 e Roma: **24 pagine renderizzate**, nessuna pagina bianca; confronti pagine 1 e 3 ispezionati |
| Due JSON allegati | 13 + 12 pagine; **1.094 campi trasferiti conservando valori/originali**. Il ricalcolo propone 82 e 228 candidati rispetto a 171 e 923; è una riduzione del numero di proposte, non una misura di accuratezza |
| Suite completa legacy | **53 falliti / 440 passati / 6 errori**, 75 file censiti. Baseline: 2 falliti / 486 passati / 4 errori, 74 file censiti. I worker usciti impediscono l'esecuzione completa di alcuni casi |

Il controllo indipendente confronta l'inchiostro delle pagine corrispondenti alla stessa scala, con tolleranza spaziale di 2 pixel: massimo inchiostro sorgente senza corrispondente vicino 0% su A1 e circa 0,023% su Roma. Questo controllo, insieme ai confronti visivi, riguarda la conservazione dello sfondo; **non misura correttezza OCR, curvatura o precisione dei campi**.

## Limiti e problemi aperti

1. La suite legacy non è compatibile integralmente con il nuovo nucleo browser. Molti mock non hanno un renderer reale (`page.render`), alcuni ambienti jsdom non forniscono ObjectURL/decodifica immagini e alcuni worker Node terminano. Due difetti geometrici erano già presenti nella baseline. Non tutti i 53 fallimenti possono essere liquidati come “test obsoleti”: vanno riallineati e analizzati prima di una release definitiva. I test sono rimasti attivi.
2. L'acquisizione automatica applica **adattamento A4**, senza approvare deskew, prospettiva o dewarping. Le curvature del modello Roma non sono dichiarate corrette. Il supporto geometrico resta nei sorgenti e richiede una validazione dedicata.
3. Le proposte restano da verificare: non esiste un ground truth annotato per certificare campi mancanti, falsi positivi o associazioni. Il numero dei campi non equivale a precisione.
4. I PDF originali corrispondenti esattamente ai due OCR JSON allegati non erano inclusi. Il PDF A1 e Roma usati nella prova completa provengono dalla baseline; i JSON sono stati verificati come esportazioni raster/testo/valori, senza inventare un confronto con gli originali mancanti.
5. Il test browser esercita API reali, IndexedDB, PageSurface/DocumentSurface e il comando dell'app per riaprire il documento. Non certifica ogni interazione dei modali del calibratore, ogni formato o il comportamento nella tua istanza Google AI Studio e nel tuo archivio reale.
6. DOCX conserva il comportamento precedente, compresi i limiti dei modelli Word complessi. Non sono stati creati servizi Office o nuove schermate.

## Ripresa dopo interruzione

Sorgenti modificati, baseline ZIP, motore ZIP e prove precedenti ritrovati. Ricontrollati gli SHA-256 dei due ZIP originali. Ripetuti typecheck, build e 22 test mirati; ripetuta l’intera prova browser con attesa esplicita del completamento del rendering prima della stampa. Ispezionato il PDF compilato finale: sfondo, nome modificato, checkbox e scelta visibili, senza placeholder di caricamento. Nessun file necessario al lavoro già svolto è andato perso. Restano mancanti i PDF originali corrispondenti ai JSON, come specificato sopra.

## Consegna e uso

La root e la patch includono sorgenti, configurazione, asset locali, manifest, istruzioni, prompt Gemini e artefatti di verifica. Le prove e i PDF completi sono in `test-output/integration-020`; i file scaricabili dall'app in `public/downloads`.

**Usare prima una copia di prova. Non pubblicare automaticamente.** Applicare esattamente il pacchetto e verificare nell'anteprima un documento compilato e una calibrazione già salvata. Leggere `INSTALLAZIONE.md` per installazione, riproduzione, limiti e ripristino. La baseline originale resta immutata.
