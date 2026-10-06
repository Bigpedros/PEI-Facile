# PEI Facile: motore integrato consolidato

Consegna del **5 ottobre 2026**. Unico percorso automatico PDF/raster/campi implementato; **compilatore, editor e calibratore di PEI Facile conservati**. La suite completa è verde: **507/507 test, 75 file, nessun errore di worker**. Typecheck, build e installazione pulita riusciti. Questo esito non certifica accuratezza perfetta dell'OCR o assenza di problemi su documenti non provati.

## Correzioni completate

- Acquisizione PDF, immagini e TIFF e rilevazione assistita condividono il nucleo documentale. La diagnostica non esegue una seconda OCR/inferenza. DOCX mantiene il proprio adapter.
- PDF.js completo costruisce il raster, adattato A4 senza deformare le proporzioni. Raster, testo, box, editor e stampa condividono coordinate dichiarate; niente fallback bianco silenzioso o trasformazioni applicate due volte.
- Span nativi conservati separatamente; parole OCR ordinate per riga e ascissa. Piccole differenze di altezza non separano più valori e prompt. Il confine delle risposte OCR usa i box delle parole originali.
- Recuperati campi sottolineati nello stesso span e caselle native `[ ]` associate a scelte. Intestazioni istituzionali, istruzioni, continuazioni come “data” / “di nascita”, linee non etichettate e celle senza associazione non sono approvate automaticamente come campi.
- Valori preesistenti, originali, testo osservato, widget AcroForm, checkbox e scelte conservati. Le proposte PEI rimangono da revisionare e le associazioni semantiche sono suggerimenti. Campi modificati/scartati non vengono sovrascritti dalla nuova rilevazione.
- Compilatore PEI mantenuto: `DocumentSurface`, `PageSurface`, editor, revisione, valori per ID, salvataggio e stampa. Corretto il rapporto 72 punti PDF / 96 pixel CSS; il valore invariato già nel raster non viene stampato una seconda volta.
- Binari dei documenti in IndexedDB; metadati compatti in localStorage. Vecchi record leggibili senza migrazione all'apertura; stringa legacy preservata al primo salvataggio.
- Arresto nativo Canvas riprodotto sul PDF Roma con la dipendenza 1.0.10; fissata la dipendenza di sviluppo **0.1.100** e isolati i file di test in processi separati. Corretto il confronto delle metriche di curvatura nello stesso spazio di misura.

Non sono stati disabilitati test. I proxy PDF delle prove sono stati completati con renderer che producono pixel reali; le asserzioni obsolete su sorgenti, confidenza e associazioni automaticamente confermate sono state adattate al contratto di revisione. I test geometrici distinguono conservazione A4 da rettifica opzionale: non pretendono una correzione che il percorso ordinario non applica. L'OCR reale è stato eseguito sia nei test Node pertinenti sia nel browser.

## Verifiche effettive

| Prova | Risultato |
|---|---|
| Installazione pulita, asset, typecheck, build | Riusciti; Node 24.19.0, npm 11.9.0 |
| Suite completa | **507/507**, 75 file, circa 276 secondi |
| Integrazione/schema/calibrazione | **26/26** dopo reinstallazione pulita |
| Renderer Node Roma | Raster 2092×3007; inchiostro presente; nessun arresto |
| Browser A1/Roma della baseline | 12+12 pagine acquisite; raster, OCR e testo nativo; 11 controlli riusciti, nessuna eccezione pagina |
| PDF misto sintetico | Testo nativo e valore nell'immagine conservati insieme |
| AcroForm sintetico | Testo esistente, checkbox e scelta conservati; ricalibrazione nativa verificata |
| Compilatore tramite DOM | Testo inserito, checkbox cambiata, scelta cambiata; salvataggio e riapertura con valori identici |
| PDF compilato esportato | Riaperto indipendentemente: nuovo testo e scelta presenti; ispezione visiva del valore sostituito e della casella non selezionata |
| Revisione e ri-rilevazione | Proprietà corrette e campo MODIFIED protetto; schema proprio e rifiuto hash discordante |
| Compatibilità persistenza | Record precedente letto senza migrazione; snapshot identico; PDF da 19.555.923 byte ricaricato con hash invariato e metadati di 170 caratteri |
| PDF allegato nativo | **13 pagine**, 928/928 span nativi conservati, box dei campi nei limiti, schema e hash riaperti identici |
| PDF allegato compilato | **12 pagine**: PDF.js non restituisce span nativi, quindi OCR su tutte le pagine; box nei limiti, schema e hash riaperti identici |
| Campioni del PDF compilato | Nome, anno scolastico e plesso verificati nel testo OCR **e nei valori originali delle proposte**, senza riportare dati personali nel rapporto |
| JSON delle prove | 13+12 pagine, **1.094 campi trasferiti mantenendo valori e originali**; ricalcolo 63 e 98 proposte rispetto a 171 e 923, senza interpretare il conteggio come accuratezza |
| Renderer indipendente PyMuPDF | **49 pagine**; nessuna bianca; confronto dell'inchiostro dopo adattamento A4 e ispezione dei fogli/confronti |

Il confronto indipendente usa larghezza 1000 pixel, soglie d'inchiostro e tolleranza di 2 pixel. Massimo inchiostro sorgente senza vicino corrispondente **0,0958%** (A1 baseline); circa **0,0052%** sul PDF compilato allegato; zero nei due altri casi. Misura conservazione del raster, non correttezza OCR, campi mancanti o rettifica della curvatura. I report JSON includono gli hash dei file effettivamente verificati.

## Confronto con 0.3.0 e limiti

Anche lo ZIP indipendente 0.3.0 è stato letto. Rasterizzazione, OCR, geometria, regioni e inferenza sono uguali a 0.2.0; cambia la versione del risultato e si aggiungono metadati/classificatore, shell e store indipendenti. Non è stato importato un secondo frontend o archivio. Dettagli e decisioni sono in `CONFRONTO.md`.

Restano proposte ambigue, possibili falsi campi e aree non proposte automaticamente, soprattutto celle narrative, segni grafici e compilazioni spostate rispetto al prompt. Non è disponibile un ground truth annotato completo: la revisione manuale resta necessaria. I 37 e 17 campi con valori non vuoti conservati nelle due acquisizioni sono un controllo di trasferimento, non una valutazione semantica di tutti i contenuti.

L'acquisizione ordinaria applica adattamento A4, senza deskew/dewarping/prospettiva automatici: la curvatura di Roma non è dichiarata risolta. L'export mantenuto è la stampa statica dell'app; il PDF canonico raster non conserva un nuovo modulo AcroForm interattivo. Lo schema/valori salvati nell'app restano editabili.

Non sono state provate la specifica istanza Gemini/Google e le calibrazioni del tuo archivio effettivo, ogni interazione grafica dei modali o tutti i formati/documenti possibili. DOCX complessi e rettifiche automatiche richiedono prove dedicate. Rimangono avvisi di build per bundle grandi, import statici/dinamici e moduli Node esternalizzati; nei test OCR compare l'avviso sul dizionario opzionale `ita.special-words`, ma la lettura si conclude e i test passano.

## Disponibilità e consegna

Alla ripresa erano disponibili la root consegnata precedentemente, la baseline originale, i motori 0.2.0/0.3.0, i due PDF reali, due OCR JSON e diagnostiche. Le correzioni transitorie non contenute nella vecchia consegna sono state ricostruite e riverificate. Non è disponibile lo screenshot `Screenshot 2026-10-04 191000.png` della lista precedentemente segnalato come mancante; non è presente un'esportazione della chat Google. Nessun allegato indispensabile a queste prove rimane mancante.

Baseline originale conservata e non modificata. Root completa e patch hanno percorsi relativi identici, manifest e lista precisa dei file; il vecchio download PDF bianco è rimosso. PDF personali, raster personali e valori campione privati non sono inclusi nei pacchetti dell'app. Le evidenze sintetiche e della baseline sono in `test-output/integration-020`; report e log correnti in questa cartella. Il precedente rapporto non verde è conservato come storico, non descrive lo stato finale.

Applicazione esatta, dipendenze, comandi e ripristino: `INSTALLAZIONE.md`. Prompt operativo per Gemini: `PROMPT_GEMINI.txt`. Nessuna pubblicazione o distribuzione automatica eseguita.
