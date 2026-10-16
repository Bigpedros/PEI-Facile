# Prestazioni — fase 1: evitare riletture implicite

Base: d8920bd (fase 6). Nessuna modifica ai motori OCR, ai modelli RTen,
alla risoluzione di riconoscimento o alle regole di proposta dei campi.

## Comportamento

- Aprire il calibratore, cambiare pagina o zoom esegue solo il rendering PDF.
  Il rendering non chiama più il rilevamento dei campi.
- Acquisizione e rilevamenti espliciti conservano una RecognitionSnapshot per pagina.
  Si salvano evidenze, tempi, proposte e provenienza, senza duplicare l'immagine raster.
- Le evidenze attraversano record IndexedDB e schema di calibrazione, compresi
  i percorsi documento acquisito e modello personalizzato.
- Entrambi i pulsanti diagnostici esportano uno snapshot locale senza caricare
  pagine PDF, renderizzare, riconoscere o inferire campi. Le proposte registrate
  restano distinte dai campi correnti eventualmente modificati dall'utente.
- Per modelli precedenti senza evidenze salvate, il JSON contiene i campi correnti
  e `recognitionEvidence.availability = unavailable`. I tempi mancanti non vengono
  ricostruiti. Un nuovo riconoscimento richiede un comando esplicito dell'utente.
- Il formato esportato è `PEI_CALIBRATION_SNAPSHOT_V1`, distinto dalla vecchia
  diagnostica che eseguiva la pipeline. Il vecchio collector resta disponibile
  per i test della pipeline, ma non è più collegato ai pulsanti di esportazione.
- L'object URL del download resta valido per 30 secondi prima della revoca.

## Verifica

Test mirati: snapshot immutabile, evidenze senza immagine, schema salvato/riaperto,
risoluzione dal PDF associato, esportazioni ripetute dopo distruzione del PDF
senza ulteriori chiamate ai runner OCR, compatibilità dei modelli precedenti,
rilevamento esplicito dell'intero documento e regressioni schema/calibrazione.

Il test usa un PDF nativo generato e runner strumentati; non è un benchmark OCR.
Typecheck e build di produzione devono completarsi prima del commit.
La verifica del download nell'app pubblicata richiede sincronizzazione e republish
in AI Studio: questa modifica non aggiorna automaticamente il sito online.

Verifica completata: 27 test mirati superati in 5 file, `npm run typecheck`
e `npm run build` riusciti. Il test di riapertura ricrea il modulo degli schemi
e usa un adapter IndexedDB strumentato; non sostituisce la prova browser finale.

## Prova dopo il republish

1. Aprire un modello esistente e cambiare pagina/zoom: nessuna seconda lettura automatica.
2. Esportare la diagnostica: JSON immediato; sui vecchi modelli evidenze non disponibili.
3. Acquisire il PDF anonimo oppure eseguire volontariamente Rileva pagina.
4. Esportare: tempi della lettura conclusa e proposte registrate nel JSON.
5. Salvare, chiudere e riaprire il modello: evidenze conservate e nessun OCR implicito.

SIMD e ottimizzazione dei ritentativi regionali sono rinviati alle fasi 2 e 3.
La fase 1 riduce il lavoro ripetuto; non accelera la singola esecuzione OCRS/RTen.
