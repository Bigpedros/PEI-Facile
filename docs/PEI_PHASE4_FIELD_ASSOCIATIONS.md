# Fase 4 — associazioni dei campi alla struttura del PEI

La fase 3 recupera proposte generiche nelle aree realmente misurate. La fase 4
collega quelle aree a intestazioni e consegne, conservando il contenuto esistente.
Si applica soltanto al profilo `pei`, dopo il recupero strutturale, sul medesimo
raster canonico. Non introduce servizi AI/LLM né ulteriori esecuzioni OCR.

## Collegamenti implementati

- Intestazioni di colonna propagate sulle celle della stessa griglia connessa,
  anche quando manca la regione di una cella intermedia. Le righe sono numerate
  dalla geometria disponibile; la numerazione non riparte per ogni colonna.
- Intestazioni foglia sotto celle unite; un titolo unito senza foglie sufficienti
  produce un'ambiguità, senza scegliere arbitrariamente una colonna.
- Etichette nella cella sinistra, comprese celle unite verticalmente su più righe.
- Giorni della settimana collegati alle fasce orarie disponibili nella stessa riga.
- Consegne esterne vicine a un riquadro ampio, escluse dall'area del valore.
- Firme generiche associate soltanto a una riga di scrittura misurata.

Le tabelle sono componenti di celle che condividono bordi entro una tolleranza
proporzionata all'altezza del testo. La sola vicinanza non permette di attraversare
vuoti o di ereditare un'intestazione da un'altra tabella.

## Intestazioni già lette dal secondo percorso

Su alcune pagine la lettura principale non contiene le intestazioni che OCRS/RTen
ha invece già letto. Il passaggio usa queste parole posizionate come ancore solo
per intestazioni riconoscibili, con un'altra intestazione distinta e allineata
nella stessa riga della griglia misurata. Una parola isolata non basta.

I valori provengono sempre dai token primari del passaggio precedente. Le parole
del lettore B non vengono inserite nei valori né nel testo della pagina. Quando
A e B assegnano intestazioni riconoscibili diverse alla stessa cella, il legame
resta ambiguo (`READER_HEADER_DISAGREEMENT`). Maiuscole e accenti equivalenti non
costituiscono disaccordo. Questo è un uso contestuale delle evidenze già acquisite,
non una nuova politica di correzione OCR.

## Conservazione e limiti

Una proposta automatica generica può ricevere etichetta e motivazione più precise;
mantiene ID, rettangolo, valore, originale, testo osservato e mascheratura. I campi
automatici già significativi restano invariati. Campi manuali, confermati, ignorati
o AcroForm bloccano anche intersezioni piccole; la protezione è ripetuta nel merge
del calibratore. Intestazioni e assi statici possono eliminare soltanto proposte
generiche automatiche, senza modificare il documento.

I nuovi campi sono proposte da verificare, mai conferme automatiche. Se l'area
contiene inchiostro ma non parole posizionate sufficienti, il passaggio non la
dichiara vuota. Consegne interne non separabili, risposte con caselle di scelta,
intestazioni concorrenti e intersezioni parziali restano esplicite nella diagnostica.
Le date interpretabili possono essere normalizzate; il testo osservato è conservato.
Una data non interpretabile rimane testo. Il nome di un componente GLO non viene
associato automaticamente al nome dell'alunno.

## Diagnostica

`PageResult.fieldAssociations` e l'export del calibratore espongono
`PEI_FIELD_ASSOCIATIONS_V1`, con esito, motivo, relazione, regioni e token di origine,
lettore dell'ancora e ID del campo. Gli esiti distinguono nuove proposte,
arricchimenti, campi esistenti conservati, regioni statiche, ambiguità e conflitti.
`stageTimingsMs.fieldAssociation` misura il passaggio; la copertura strutturale viene
ricalcolata sui campi finali. Revisione: `calibratore-20261015-fase4-associazioni`.

## Verifica reale

Baseline: commit `6b525d57d9622d69d846ba7d5e995f7a99a40cb9` (fase 3).
Acquisite con entrambi i lettori le pagine critiche 2, 7, 9 e 12 del PDF Roma
originale; rieseguita l'associazione in Chromium sulle stesse evidenze e sullo
stesso raster. Nessun dato compilato, raster o diagnostico personale è incluso
nel repository; sono salvati soltanto i conteggi anonimi in
`baselines/pei-roma-phase4-20261015.json`.

| Pagina | Campi prima | Campi dopo | Nuove proposte | Proposte arricchite | Casi ambigui |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 20 | 20 | 0 | 2 | 0 |
| 7 | 46 | 55 | 9 | 39 | 2 |
| 9 | 3 | 3 | 0 | 2 | 1 |
| 12 | 11 | 15 | 4 | 10 | 7 |

Totale selezionato: 80 → 93 campi, 13 nuove proposte e 53 etichette arricchite.
I conteggi non misurano l'accuratezza e non attestano il completamento del PDF.
Verificati immutabilità di raster ed evidenze, conservazione dei campi esistenti,
geometria e valori degli arricchimenti, idempotenza, limiti pagina e assenza di
errori browser. Controllati visivamente gli overlay delle tabelle settimanale e firme.

Riproduzione con evidenze locali nel formato `PageResult`, nominate
`baseline-<pagina>.json` (possono contenere dati personali e non vanno committate):

```sh
node scripts/verify-field-associations.mjs --evidence-dir /percorso/evidenze
```

Le prove automatiche coprono associazioni, ambiguità, lettori discordanti,
intestazioni unite, celle mancanti, conservazione e protezione nel calibratore.
Il test del percorso operativo verifica che le ancore B raggiungano la fase 4
senza sostituire i token primari e senza rieseguire OCR.

Validazione: 68 test mirati superati (associazioni, due lettori, copertura,
integrazione, protezione campi, presentazione e diagnostica), più 9 test del
calibratore raster. Typecheck, build e verifiche browser delle proprietà campo
superati. La suite estesa non è interamente verde: quattro asserzioni nei test
storici `cteFix02dRasterPipeline`, `cteFix02eFieldDiscrimination` e
`cteFix02xPhase4RuntimeTrace` falliscono anche sul commit della fase 3, con gli
stessi risultati. Sono emersi inoltre timeout nelle prove generali di
normalizzazione A4 e nell'adapter OCR-CTE; non sono considerati risolti da questa
fase e non viene dichiarato il superamento dell'intera suite.

## Criticità residue

Le risposte non lette o aggregate in token troppo grandi restano materia della
fase 5. Non viene promessa una riduzione della latenza OCR: questo passaggio
riutilizza le evidenze e le misure già disponibili, ma non ottimizza i lettori.
La verifica finale su tutte le 12 pagine, riapertura ed esportazione completa resta
prevista nella fase 6. Le proprietà campo già introdotte nella fase 3 restano
verificate con il test browser di modifica, salvataggio, riapertura e stampa.
