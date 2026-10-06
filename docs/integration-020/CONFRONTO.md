# PEI Facile + Motore documentale 0.2.0: confronto e decisioni

Il codice dei due ZIP è stato letto direttamente. La conversazione precedente è stata usata come contesto, senza attribuire ai sorgenti operazioni descritte solo nella chat.

| Fase | Baseline PEI | Nucleo indipendente 0.2.0 | Decisione applicata |
|---|---|---|---|
| Acquisizione | Adapter separati PDF/immagine/TIFF; DOCX via Mammoth | Generatore pagine sequenziale browser | Nucleo comune per PDF e raster; DOCX mantiene il suo adapter, senza richiedere un endpoint Office inesistente |
| Rendering | Browser PDF.js; Node ridisegna solo XObject e può restituire bianco | Renderer completo PDF.js | Renderer completo; eliminato il fallback Node bianco e il ridisegno incompleto delle immagini |
| Sfondo | Testo estratto prima della normalizzazione; OpenCV/CTE in secondo passaggio | Raster A4 definitivo prima della lettura | Una normalizzazione A4 con proporzioni conservate; riconoscimento sul medesimo sfondo |
| Rettifica | Deskew/dewarping OpenCV con test geometrici già falliti nella baseline | Rotazione, deskew e funzioni di prospettiva/griglia | Le funzioni restano nei sorgenti; l'acquisizione automatica non applica correzioni geometriche non validate |
| OCR | Varianti e Tesseract, risorse in percorsi diversi | Tesseract locale con token e cancellazione | Worker locale unico del nuovo nucleo; scansioni lette; PDF misti conservano gli span nativi e leggono le immagini |
| Testo/regioni | CTE, clustering, semantica PEI e rilevazione assistita | Celle, checkbox, righe e box in pixel | Analisi nuova sul raster definitivo; parole OCR raggruppate senza attraversare le celle |
| Campi | Numerosi percorsi con proposte differenti | Campi con valore, originale e motivazione | Unica inferenza automatica; niente righe senza etichetta e niente celle vuote prive di associazione; intestazioni/istruzioni escluse dalle etichette |
| AcroForm | Widget riconosciuti ma valori non sempre trasferiti | Soprattutto geometria raster | Conservata l'estrazione dei widget espliciti e dei valori: testo, checkbox e scelta |
| Semantica | Classificazione, catalogo e reverse engineering PEI | Chiavi generiche euristiche | Conservati catalogo, classificazione, gate ministeriale per hash e suggerimenti PEI; chiavi suggerite non confermate automaticamente |
| Revisione | Calibratore, protezione dei campi manuali, schema PEI | Stato review/confirmed/ignored | Interfaccia esistente; proposte PROPOSED/REVIEW_REQUIRED; protezione di geometrie esistenti durante ri-rilevazione |
| Compilazione | DocumentSurface/PageSurface e valori per ID | Moduli indipendenti | Superficie PEI conservata; schema del documento acquisito agganciato al suo PDF; valori originali/default e controlli checkbox/scelta mantenuti |
| Persistenza modello | IndexedDB, doppio hash e schema | Store indipendente con JSON | Store PEI conservato; calibratore ora salva il binario canonico e mantiene originale/hash/metadati |
| Persistenza PEI | localStorage con PDF serializzati: quota insufficiente per raster grandi | IndexedDB | Nuovo archivio documenti IndexedDB con binari tipizzati; metadati compatti in localStorage; vecchi record leggibili e snapshot legacy preservato al primo salvataggio |
| Export | Anteprima e stampa browser | Export AcroForm indipendente con fontkit | Conservata la stampa PEI, corretto rapporto 72 punti/96 pixel CSS. L'export AcroForm autonomo non viene aggiunto come seconda modalità UI |

## Percorso attivo

`processDocumentAcquisition` -> `runDocumental` -> `analyzeDocument` -> pagine PDF/raster -> A4 definitivo -> testo nativo/OCR -> regioni/campi -> bridge PEI -> revisione/compilazione -> persistenza -> stampa.

`acquirePdfTemplate` usa lo stesso risultato per i modelli custom. L'eccezione per i modelli ministeriali vuoti con hash esatto mantiene le geometrie approvate, senza reinferirle. Una versione compilata ha un hash diverso e non entra automaticamente nel percorso del modello vuoto.

`detectFieldsOnPdfPage` richiama la stessa inferenza sullo sfondo esistente, senza applicare di nuovo la normalizzazione A4. Le primitive CTE e i moduli storici restano per catalogo, matching, strumenti diagnostici e test; non esiste un selettore fra due motori nell'acquisizione ordinaria.

## Coordinate e dati

Il nucleo conserva pixel finali con origine in alto a sinistra. Il bridge converte X con `larghezzaPt/larghezzaRaster` e Y con `altezzaPt/altezzaRaster`. Schema, editor e superficie PDF usano punti dall'alto. La matrice di acquisizione dichiara `sourceUnit=px` e `targetUnit=pt`; le geometrie già finali non vengono trasformate una seconda volta.

I campi conservano `defaultValue`, `originalValue`, `observedText`, tipo e opzioni. Il testo già presente nello sfondo non viene stampato una seconda volta se il valore non cambia. Un documento acquisito porta il proprio schema e il proprio hash; non eredita implicitamente il layout ministeriale solo perché classificato A1.

I record e le calibrazioni precedenti non vengono cancellati o migrati all'apertura. Il nuovo formato dei documenti viene scritto solo al salvataggio. Il rollback del codice non rende leggibili alla baseline i nuovi record IndexedDB: conservarli e fare un backup prima del ripristino.

## Consolidamento dopo le prove reali

La diagnostica assistita usa un'unica chiamata ad `analyzeRasterPage`: non esegue una seconda OCR/inferenza per produrre i contatori. I widget AcroForm sono estratti dalla stessa funzione sia durante l'acquisizione sia durante la rilevazione assistita. Le primitive CTE storiche restano disponibili e testate; non vengono riattivate come pipeline concorrente.

Gli span PDF non vengono fusi tra etichetta e valore. Le parole OCR vengono ordinate per riga e ascissa, conservando i box originali per delimitare le risposte: piccole differenze verticali non separano più nome, anno scolastico e plesso dall'etichetta. Sono recuperate le sottolineature multiple nello stesso span e le caselle native `[ ]` associate a scelte esplicite. Le intestazioni istituzionali e le continuazioni come `data` / `di nascita` non diventano valori compilati.

Il compilatore PEI, le superfici `DocumentSurface` / `PageSurface`, gli editor, il calibratore e il flusso di revisione sono conservati. Non è stata importata l'interfaccia del progetto indipendente. I campi acquisiti hanno schema proprio; checkbox e scelta mantengono valori tipizzati.

### Verifica dell'ulteriore ZIP 0.3.0

Sono stati confrontati direttamente anche i sorgenti di `Motori-OCR-0.3.0-root.zip`. In `src/engine/index.ts` cambia soltanto il numero di versione 0.2.0 -> 0.3.0. In `types.ts` cambia la versione ed è aggiunto il metadato opzionale `classification` collegato al classificatore della shell. `load.ts`, `raster.ts`, `ocr.ts`, `geometry.ts`, `rectify.ts`, `regions.ts` e `fields.ts` sono identici tra i due ZIP. Cambiano la shell indipendente, il classificatore e lo store; non contengono una correzione del nucleo OCR/campi da sostituire a quella integrata. Non viene aggiunta una seconda app o un secondo archivio indipendente a PEI Facile.
