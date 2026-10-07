# Riquadri, righe interne e consegne esterne

## Evidenza del test nell'app

I JSON delle pagine 1–5 confermano la revisione celle-etichette a 200 DPI. Pagina 4 contiene i nove riquadri narrativi e le due aree di revisione/verifica. Pagina 2 recupera le tabelle GLO, ma il riquadro Sintetica descrizione si accorcia. Pagina 3 recupera gli obiettivi e perde Attività. Pagina 5 misura tredici regioni e produce soltanto tre campi: riconoscimento geometrico e associazione della consegna hanno esiti distinti.

## Correzioni

- La tolleranza agli angoli interrotti richiede almeno un angolo con supporto stretto su ciascun bordo orizzontale. Le righe interne con margini a entrambe le estremità non chiudono nuove celle. Resta ammesso il singolo angolo interrotto verificato dal test sintetico.
- La riga della consegna non incorpora più frammenti della riga precedente soltanto per vicinanza verticale.
- Coppie di celle sotto la consegna esplicita Interventi didattici e metodologici possono recuperare Attività e Strategie e Strumenti anche quando le etichette interne non vengono lette. Geometria misurata, confidenza ridotta e revisione richiesta.
- Riquadri larghi vuoti collegati alle consegne esterne Osservazioni nel contesto scolastico e Obiettivi educativi e didattici; riconoscimento della consegna interna Modalità di sostegno educativo.
- Varianti OCR di Specificare gestite solo nell'associazione alla cella descrittiva di revisione.
- Simboli OCR (Q] e [O] ammessi soltanto accanto a scelte esplicite.
- Date associate a righe brevi misurate sulla baseline della parola DATA anche quando il tratto è prossimo al bordo della tabella. Non si usa l'intera cella narrativa come data.

## Verifica

44 test superati, inclusa una regressione OCR sul raster Roma vuoto distribuito nel repository, pagine 2, 3 e 5. Ripristinata l'altezza della Sintetica descrizione, recuperata Attività e riconosciute le tre aree narrative di pagina 5. Typecheck e build completati. Screenshot e diagnostiche dell'utente restano fuori dal repository.

Marcatore: `calibratore-20261007-consegne-esterne`. Prova sul documento salvato dopo sincronizzazione GitHub → AI Studio e ripubblicazione.

## Limite strutturale ancora aperto

Il motore unico distingue già regioni e campi, ma parte dell'inferenza richiede tuttora consegne note. Questa revisione migliora le strutture osservate senza certificare tutti i campi delle dodici pagine, la trascrizione OCR o l'esportazione compilata. Un rilevamento più generale dovrà classificare le aree compilabili sulla struttura della pagina, conservando come proposte incerte quelle geometricamente motivate anche senza associazione semantica sicura. Non ogni regione misurata è compilabile: intestazioni, celle descrittive e elementi grafici devono restare statici.
