# Celle mancanti e associazione delle consegne

I quattro JSON del modello Roma Infanzia vuoto confermano la revisione precedente a 200 DPI. Nessun campo revisionato blocca la rigenerazione. Le mancanze riguardano la ricostruzione dei bordi e l'associazione delle consegne, non la memoria del documento.

## Modifiche

- Intestazioni di colonna associate a tutte le righe misurate della tabella; intestazioni prestampate e ruoli restano statici. Recupero dei nomi dei componenti accanto ai ruoli nella tabella GLO, inclusa una continuazione geometrica priva di testo OCR.
- Titolo di partecipazione e variazione del componente associati alle rispettive colonne.
- Consegna Obiettivi tollerante alla lettura OCR Oblettivi; riquadro degli obiettivi riconosciuto anche con la sola intestazione esterna, lasciando spazio al titolo interno non letto.
- Aree di revisione e verifica degli esiti associate alla cella descrittiva di sinistra; la data sopra resta un campo distinto.
- Scelte Va definita / Va omessa riconosciute dai simboli OCR adiacenti; non vengono inglobate come risposta di Sezione.
- Brevi interruzioni agli angoli dei bordi lunghi ammesse solo con entrambe le pareti laterali misurate. Le righe interne più corte non chiudono artificialmente celle.
- Riquadri larghi con almeno due righe interne di scrittura possono diventare proposte di testo con etichetta da verificare se la consegna è illeggibile. Confidenza ridotta, nessuna associazione semantica automatica.
- Etichette di verbale normalizzate per l'errore OCR VERDALE; una riga incorporata nel bounding box di una breve etichetta non annulla più lo spazio disponibile.

La pipeline, il raster mostrato e il compilatore restano quelli esistenti. Tutte le nuove proposte richiedono revisione; campi manuali o già revisionati mantengono le protezioni esistenti.

## Verifiche

40 test superati: raster sintetici e modello Roma distribuito, associazioni di celle, integrazione, schema, calibrazione e classificazione dei campi. Typecheck e build completati.

Confronto locale dell'inferenza con parole e riquadri dei quattro JSON ricevuti: recupero del riquadro obiettivi a pagina 3, dei nove riquadri Obiettivi/Attività/Strategie a pagina 4, delle aree di revisione e verifica e delle righe della tabella variazioni. Il controllo locale usa il raster Roma incluso nel progetto per le letture dei pixel: non sostituisce una prova completa sul PDF esatto dell'istanza. Screenshot e JSON dell'utente non sono pubblicati nel repository.

## Prova nell'app

Sincronizzare GitHub verso AI Studio, ripubblicare e ripetere Rileva pagina sul documento in memoria. Marcatore diagnostico: `calibratore-20261007-celle-etichette`, DPI 200.

Questa revisione non certifica la copertura di tutti i campi delle dodici pagine né il PDF compilato finale. Le consegne illeggibili e le geometrie ambigue rimangono da verificare nell'app.
