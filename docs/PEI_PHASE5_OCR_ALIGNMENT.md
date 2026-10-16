# Fase 5 — allineamento e ritentativi OCR del PEI

Baseline: fase 4, commit `4a89ca1399a0fc9a9f82a8e1fa0791a819d7be64`.
La nuova politica si applica soltanto alla seconda lettura del profilo `pei`.
Rimangono Tesseract e OCRS/RTen locali; nessun servizio AI/LLM, modello aggiuntivo
o dipendenza nuova. Il testo nativo PDF continua a evitare la lettura raster.

## Difetti affrontati

Il confronto precedente ammetteva come alternative parole vicine o contenute in
un token molto più grande, anche quando rappresentavano porzioni diverse di testo.
Inoltre ritentava i primi otto disaccordi, senza priorità per i difetti geometrici
e senza recuperare le parole completamente assenti da A ma già posizionate da B.
Sul PDF originale sono presenti token di uno o due caratteri con rettangoli che
coprono grandi parti delle intestazioni o delle celle.

## Regole operative

1. **Confronto di porzioni equivalenti.** Un candidato B deve sovrapporsi alla
   stessa porzione A con dimensioni compatibili. Più parole B possono formare
   un'osservazione di confronto, mantenendo le posizioni realmente lette. Parole
   adiacenti non votano come alternative dello stesso token. Il Decision Engine
   già integrato continua a scegliere il testo, isolatamente per ciascun token A;
   non può sopprimere altri token né inserire parole da un singolo canale.
2. **Separazione senza perdita di testo.** Un token aggregato può essere separato
   su rettangoli di parole B reali soltanto se coincide l'intero testo normalizzato.
   Vengono conservati caratteri, numeri, punteggiatura e maiuscole dell'originale A.
   Nessuna coordinata di parola è ottenuta dividendo proporzionalmente un riquadro.
   La riduzione a un solo rettangolo richiede anche concordanza geometrica B locale.
3. **Ritentativi con priorità e limite.** Al massimo sei aree per pagina, con area
   complessiva dei riquadri selezionati non superiore al 16% della pagina. I margini
   dei ritagli aggiungono contesto. Le priorità distinguono token deformati,
   segmentazioni discordanti, testo assente, valori critici e letture deboli.
   Se esiste testo B assente da A, fino a due posti sono riservati a queste aree.
   Sovrapposizioni vengono deduplicate; le letture concordi non deformate non
   vengono ritentate solo perché hanno bassa confidenza.
4. **Conferma primaria locale.** Tesseract rilegge le aree geometricamente anomale,
   quelle con testo mancante e i disaccordi critici selezionati, riusando il worker.
   Usa temporaneamente la segmentazione sparsa e ripristina quella originale anche
   in caso di errore. Le coordinate dei ritagli sono rimappate sulla pagina.
5. **Recupero dei token deformati.** Solo un token A poco affidabile e geometricamente
   anomalo può essere sostituito da parole locali: ogni parola deve concordare con B
   per testo e posizione, senza omissioni delle parole B contenute nell'area e senza
   sovrapporsi ad altri token A. Confidenza primaria locale minima 70, elevata a 85
   per parole che contengono cifre. Le differenze di accento possono essere considerate
   equivalenti nella corroborazione, conservando il testo effettivamente letto da A.
6. **Testo prima assente.** Una parola nuova entra soltanto se Tesseract locale e
   OCRS concordano su testo e posizione nell'area selezionata, fuori dai token
   esistenti, con le stesse soglie di affidabilità. I valori numerici non vengono
   introdotti dalla sola lettura B.
7. **Valori critici già letti.** Una correzione che cambia testo contenente cifre
   richiede anche un'osservazione locale primaria con confidenza almeno 85 e testo
   concorde con la scelta. La sola concordanza B completo/B regionale non basta.

Le righe per l'inferenza dei campi sono raggruppate entro la cella misurata più
piccola che le contiene, verificando anche l'allineamento verticale. Un `lineId`
OCR condiviso non autorizza a fondere livelli verticali diversi o celle adiacenti.

## Conservazione e diagnostica

Il raster canonico non cambia. `rawText` e `rawTokens` restano disponibili nella
diagnostica; separazioni e recuperi conservano ID e rettangolo originali e gli ID
delle osservazioni di supporto. I campi manuali, confermati, ignorati e nativi
mantengono le protezioni del calibratore. Le nuove proposte restano da verificare.

`ocrReading.alignment` espone `PEI_OCR_ALIGNMENT_V1`: confronti, separazioni,
recuperi, parole aggiunte, aree pianificate, tentativi effettivamente avviati,
aree rinviate e ID di provenienza. I token deformati conservati hanno un motivo
esplicito, per esempio `LOW_LOCAL_CONFIDENCE`, `INCOMPLETE_LOCAL_COVERAGE` o
`INDEPENDENT_TEXT_OR_GEOMETRY_DISAGREEMENT`. I tempi distinguono B completo,
B regionale e A regionale. L'export del calibratore include il passo
`peiOcrAlignment` e gli esiti irrisolti. Revisione:
`calibratore-20261016-fase5-allineamento-ocr`.

## Verifica sul PDF originale

Acquisite realmente le letture complete A/B delle pagine 2, 7, 9 e 12; eseguite
realmente entrambe le riletture regionali. Le soglie finali sono state ricontrollate
nel browser sulle stesse osservazioni reali, verificando che il piano dei ritagli
fosse identico. Una nuova acquisizione completa della pagina 12 ha confermato
17 proposte e 305 token. Non sono stati usati testi inventati per questi confronti.

| Pagina | Token A iniziali | Token finali | Token aggregati separati | Token deformati recuperati | Parole prima assenti recuperate | Campi prima → dopo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 301 | 301 | 0 | 0 | 0 | 20 → 20 |
| 7 | 293 | 295 | 0 | 2 | 2 | 55 → 55 |
| 9 | 277 | 278 | 1 | 2 | 0 | 3 → 3 |
| 12 | 300 | 305 | 1 | 0 | 3 | 15 → 17 |

Totale selezionato: 1.171 → 1.179 token, due token aggregati separati, quattro
token deformati recuperati e cinque parole prima assenti recuperate. Le proposte
passano da 93 a 95. Questi conteggi descrivono il recupero, **non l'accuratezza**:
anche due motori possono concordare su un errore. Restano 21 token deformati
conservati con motivazione e altre aree rinviate dal limite dei tentativi.

Verificati raster ed evidenze immutati, provenienza dei token, limiti pagina,
assenza di token introdotti senza supporto e assenza di errori browser.
Controllati visivamente i rettangoli recuperati nelle tabelle settimanale e firme.
Il repository contiene soltanto conteggi anonimi in
`baselines/pei-roma-phase5-20261016.json`; nessun dato compilato o raster personale.

Verifiche automatiche: 113 test mirati, 9 test del calibratore raster, typecheck,
build e test browser delle proprietà campo (modifica, salvataggio, riapertura e
stampa). I test unitari usano anche fixture sintetiche per errori e annullamenti;
le prove sul documento originale sono separate. Non viene dichiarato il
superamento dell'intera suite storica: i problemi precedenti sono documentati
in `PEI_PHASE4_FIELD_ASSOCIATIONS.md`.

Riproduzione su `baseline-<pagina>.json` privati contenenti `PageResult` e letture
originali A/B: il comando riusa quelle letture complete ed esegue davvero i
ritentativi con entrambi i lettori locali.

```sh
node scripts/verify-ocr-alignment.mjs --evidence-dir /percorso/privato
```

`--recorded-retries` riusa anche le osservazioni regionali reali salvate nei
`phase5-<pagina>.json`; rifiuta un piano di ritagli diverso. Non serve a misurare
nuovi tempi di acquisizione.

## Criticità ancora aperte

La latenza non è risolta. Nella nuova prova completa sulla pagina 12, la seconda
lettura complessiva richiede circa 66,5 secondi, includendo i ritentativi. Il limite
di sei aree non garantisce una riduzione dei tempi rispetto a otto aree diverse.
I tempi del replay, che riusa A/B completi, non sono un confronto di prestazioni
complessive. Non sono introdotti cicli automatici illimitati per forzare un risultato.

Le aree con letture locali incomplete o discordanti restano da verificare. Il
controllo finale su tutte le 12 pagine, salvataggio, riapertura ed esportazione
completa rimane nel perimetro della fase 6.
