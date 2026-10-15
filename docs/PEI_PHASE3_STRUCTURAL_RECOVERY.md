# Fase 3 — copertura e recupero strutturale

Base: `5a9e2fa01272a200b7774f4b0cf7c3a6015a1c67` (fase 2).

Il controllo precedente cercava soltanto segnaposto ed etichette brevi. Il nucleo
comune ora osserva anche celle misurate, caselle in gruppi coerenti e righe di
scrittura ripetute. Una tabella vuota attiva il recupero anche senza parole OCR.
Nessun servizio AI o chiamata a LLM viene aggiunto al riconoscimento.

La copertura usa l'unione delle intersezioni dei campi con l'area di risposta:
toccare una cella o trovarsi vicino a un'etichetta non basta. Campi sovrapposti non
sono contati due volte. Un campo con etichetta diversa non copre automaticamente
un prompt vicino. `uncoveredPlausibleRegionsCount` comprende evidenze strutturali
residue e marcatori testuali non già rappresentati; `uncoveredEvidenceKind` vale
`structure-and-text`.

Il recupero aggiunge soltanto proposte in aree libere misurate:

- celle vuote di griglie ripetute o sul lato di risposta di una coppia misurata;
- spazio bianco sotto testo stampato di un corpo tabellare ampio;
- righe parallele con dimensioni e distanze coerenti;
- piccole caselle soltanto in gruppo e accanto a una scelta esplicita.

Intestazioni riconosciute, giorni, fasce orarie e celle descrittive strette restano
statici. Un riquadro isolato o una riga senza contesto non bastano. L'inchiostro non
letto non viene dichiarato spazio vuoto. Spunte ambigue restano irrisolte. Non si
interpretano automaticamente i contenuti compilati.

Le etichette sono `Cella da verificare`, `Riga da verificare` e `Selezione da
verificare`, con provenienza `PEI_STRUCTURAL_RECOVERY`, stato di revisione e nessuna
associazione semantica confermata. Le aree vuote sono trasparenti. Testo, raster e
campi esistenti restano immutati. Anche sovrapposizioni parziali con campi manuali,
confermati, AcroForm o rifiutati bloccano una proposta strutturale. Il recupero è
idempotente.

La stessa funzione opera in acquisizione, Rileva pagina, Rileva documento ed
export. Non avvia altro OCR: riusa le evidenze dei lettori già eseguiti. L'hook
custom legacy può partire sulle evidenze residue, senza duplicare B già eseguito.

## Diagnostica

`structuralCoverage`, schema `PEI_STRUCTURAL_COVERAGE_V1`, riporta in pixel ogni
struttura, area di risposta, contesto, copertura prima/dopo, motivo, esito e ID
della proposta. Distingue recupero, contenuto statico e problemi irrisolti. L'audit
fase 1 registra anche i campi recuperati. L'export runtime contiene il passo
`structuralCoverageRecovery`.

I conteggi sono evidenze plausibili secondo le regole, non un certificato di
completezza. La fase 4 resta dedicata ad associazioni semantiche, intestazioni
complesse, celle unite e contenuti compilati; la fase 5 alle anomalie OCR. Questo
recupero non inventa aree prive di geometria misurata.

## Verifica reale

Nella sessione del 15 ottobre sono state lette tutte le 12 pagine del PDF Roma
deformato originale con Tesseract e OCRS/RTen, dalla fase 2 isolata. Le immagini,
parole e regioni sono state passate al recupero senza rifare OCR, isolando la
modifica strutturale. Verificati immutabilità di evidenze/campi, limiti pagina e
idempotenza su tutte le pagine. Controllate visivamente le sovrapposizioni sulle
pagine 2, 7, 9 e 12. Dopo l'interruzione della sessione il codice è stato ripristinato
e riverificato con test automatici e browser; il confronto originale delle 12
pagine non è presentato come una nuova acquisizione serale.

`baselines/pei-roma-phase3-20261015.json` conserva i conteggi anonimi misurati:
proposte da 85 a 158 (+73), sempre da verificare. Pagina 7 da 1 a 46, pagina 9 da
0 a 3, pagina 12 da 1 a 11. Questa baseline fase 2 è distinta dai 101 campi
osservati negli screenshot fase 1: le due serie non sono confrontate direttamente.
Testo, immagini e valori personali non sono inclusi nel repository.

Per confrontare risultati pagina fase 2 salvati come `baseline-1.json` ecc.:

    node scripts/verify-structural-coverage.mjs --evidence-dir /percorso/evidenze

Lo script browser produce conteggi e sovrapposizioni locali e verifica
immutabilità/idempotenza. La directory di evidenze deve restare fuori dal git.

## Prestazioni

I tratti sono misurati una volta per pagina e condivisi fra regioni, inferenza e
recupero, senza cache globale che possa diventare obsoleta. I test confrontano
campi e regioni con il percorso a misure separate. `stageTimingsMs` distingue
normalizzazione, prima lettura, seconda lettura, geometria, inferenza e recupero;
`ocrReading.timingsMs` distingue B completa e regionale. Il doppio lettore resta
attivo e la risoluzione non viene ridotta.

Sulla pagina 9 originale: geometria separata 7119 ms, condivisa 2060 ms, risultati
identici. Nella prova OCR: A 4473 ms, B 62229 ms (pagina completa 51619 ms, regioni
10561 ms), geometria 2225 ms, inferenza 43 ms, recupero 13 ms. La geometria migliora
ma la lentezza complessiva resta prevalentemente in B e non è dichiarata risolta.
Sono misure di questa esecuzione, non previsioni per il computer dell'utente.
Dati in `baselines/pei-phase3-performance-20261015.json`.
