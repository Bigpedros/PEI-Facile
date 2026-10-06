# Calibratore: intestazione, date e firme — 6 ottobre 2026

La prova nell'app pubblicata ha mostrato campi meglio posizionati, ma un'intestazione non compilabile e piccoli segni scambiati per caselle nella tabella. Questa revisione mantiene il motore documentale unico e il collegamento al compilatore.

## Correzioni

- I segnaposto tra parentesi quadre con etichette riconosciute diventano campi. L'intestazione della scuola copre il segnaposto stampato con sfondo bianco; viene suggerita l'associazione `school.institutionName`, da confermare in calibrazione.
- Le date compilate accanto a DATA vengono separate dall'etichetta usando le coordinate delle parole OCR. I valori validi con giorno/mese e anno a due o quattro cifre vengono convertiti nel formato del controllo data; il testo osservato resta disponibile.
- I riferimenti normativi non sono etichette di campi. I segni adiacenti a DATA, FIRMA e VERBALE non diventano caselle.
- Le righe di firma nelle celle vengono misurate sul raster sotto la relativa intestazione, senza includere il timbro. Le parole OCR della didascalia vengono separate dal rumore prodotto dalle righe puntinate.
- Le associazioni alle etichette sopra una riga sono limitate alla stessa colonna e a una distanza breve. Il campo parte dopo l'etichetta quando una riga rilevata la interseca.

## Verifiche

- TypeScript e build Vite superati.
- 30 test documentali, schema, calibrazione e raster superati.
- 23 test di associazione semantica e reverse engineering superati.
- Prima pagina del PDF Roma canonico incluso nel progetto: 204 parole OCR, 21 regioni e 24 campi; intestazione presente, quattro aree di firma, tre caselle, nessuna casella etichettata DATA o FIRMA. Sezione e Plesso restano separati.

## Prova ancora necessaria nell'app pubblicata

Il PDF compilato dell'ultima prova utente non è disponibile come allegato in questa revisione: sono stati letti gli screenshot e il JSON diagnostico. La verifica raster automatica usa il PDF Roma vuoto incluso nel progetto. Occorre sincronizzare GitHub verso AI Studio, ripubblicare e ripetere la prova sul documento compilato, quindi sulle altre pagine e su un secondo modello.

Questa revisione non certifica il completamento di tutti i modelli o della rettifica prospettica. Le impostazioni del compilatore, il worker PDF e i file diagnostici restano nel progetto.
