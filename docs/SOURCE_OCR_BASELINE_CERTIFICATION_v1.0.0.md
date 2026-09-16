# MOTORE OCR — BASELINE CERTIFICATION v1.0.0

## Summary

### Documento di certificazione e congelamento della baseline Motore OCR v1.0.0

Questo file è esclusivamente un **documento tecnico di certificazione**.

Non contiene codice eseguibile, non partecipa al funzionamento del Motore OCR, non viene importato dall'applicazione, non modifica il comportamento del motore e non costituisce una dipendenza necessaria alla sua esecuzione.

Il suo scopo è documentare in maniera permanente e verificabile lo stato del Motore OCR nel momento in cui la baseline v1.0.0 è stata dichiarata conclusa, certificata e congelata.

In particolare, il documento registra:

- repository e commit esatto del codice sottoposto alla verifica finale;
- stato Git della baseline al momento della certificazione;
- benchmark utilizzato per il gate finale OCR-06;
- risultati ottenuti e confronto con la baseline approvata;
- classificazione dei warning conosciuti e non bloccanti;
- limiti e significato corretto delle metriche;
- decisione formale di freeze della baseline v1.0.0;
- strategia di utilizzo come matrice invariata per copie indipendenti;
- informazioni di provenienza richieste per i futuri derivati.

La presenza di questo file nel repository ha funzione esclusivamente **documentale, storica, tecnica e di tracciabilità**.

Il codice operativo certificato è quello identificato dal commit indicato nel presente documento. Questo file spiega **che cosa è stato certificato, con quali verifiche, con quali risultati e secondo quali regole viene congelato**.

---

## Stato del documento

**TIPO:** Documentazione tecnica — NON OPERATIVA  
**FUNZIONE:** Certificazione, tracciabilità e freeze della baseline  
**ESEGUIBILE:** No  
**UTILIZZATO A RUNTIME:** No  
**RICHIESTO DAL MOTORE OCR PER FUNZIONARE:** No  
**MODIFICA IL COMPORTAMENTO OCR:** No  
**STATO CERTIFICAZIONE:** PASS  
**BASELINE:** v1.0.0 — FROZEN  
**DATA DI CERTIFICAZIONE:** 15 settembre 2026

**Repository:** `Bigpedros/Motore-OCR`  
**Branch del codice certificato:** `main`  
**Commit del codice OCR sottoposto al gate finale:** `8d170cae2824d208d175667aa8a60192cfdf664d`

---

## 1. Scopo della certificazione

Il presente documento certifica lo stato finale della baseline del progetto Motore-OCR al termine delle attività di sviluppo, correzione, regressione e hardening condotte fino alla fase OCR-06.

La baseline certificata costituisce la **MATRICE DI RIFERIMENTO** del Motore OCR.

A partire dalla presente certificazione il codice del Motore-OCR v1.0.0 è considerato **FROZEN**.

Non sono previste ulteriori modifiche finalizzate al miglioramento del riconoscimento OCR sulla baseline certificata. Eventuali evoluzioni necessarie alle applicazioni saranno effettuate sulle rispettive copie integrate, senza modificare automaticamente la baseline master.

---

## 2. Stato Git certificato

Immediatamente prima della creazione del presente documento è stato verificato lo stato del repository.

**Branch:** `main`  
**HEAD del codice OCR verificato:** `8d170cae2824d208d175667aa8a60192cfdf664d`  
**Stato repository:** `main` allineato con `origin/main`  
**Working tree:** `clean`

Output verificato:

```text
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

La creazione del presente documento avviene successivamente a tale verifica e costituisce esclusivamente una modifica documentale. Il commit che conterrà questa certificazione sarà quindi distinto dal commit del codice OCR sottoposto al gate finale.

---

## 3. Verifica finale OCR-06

La verifica finale è stata eseguita mediante:

`scripts/ocr05b0-rc05h-recertified-gate.ts`

Comando:

```text
npx tsx scripts/ocr05b0-rc05h-recertified-gate.ts > ocr06-tesseract.log 2>&1
```

Il file di log è escluso dal repository dalla regola `*.log` presente nel `.gitignore` e non costituisce parte della baseline operativa.

### Risultati certificati

**Technical success:** `15/15`  
**GT line coverage:** `48/70 (68.6%)`  
**Prices OK/W/A:** `35 / 2 / 11`

I risultati coincidono con la baseline precedentemente certificata al termine di OCR-05B0-R2.1. Non sono state rilevate regressioni nei parametri finali verificati.

---

## 4. Warning Tesseract

Durante l'esecuzione compare:

```text
Error: failed to load ./ita.special-words
```

L'audit OCR-06 ha verificato che nel codice sorgente del progetto non risultano riferimenti espliciti a `ita.special-words`.

Dipendenza OCR rilevata: `tesseract.js@7.0.0`

Il warning non impedisce il completamento del benchmark e non altera i risultati della baseline certificata.

**Classificazione finale: NON-BLOCKING / UPSTREAM-RUNTIME FINDING**

Il warning non costituisce motivo sufficiente per modificare la baseline. Non deve essere creato artificialmente un file `ita.special-words` senza una specifica necessità tecnica dimostrata.

---

## 5. Limiti e significato della certificazione

I risultati descrivono esclusivamente le prestazioni ottenute sul corpus di certificazione utilizzato dal progetto.

**48/70 (68.6%) non rappresenta una percentuale universale di accuratezza commerciale del Motore OCR.**

Il valore rappresenta esclusivamente la GT line coverage ottenuta sul corpus RC-05H utilizzato per regressione e certificazione.

La certificazione attesta:

- assenza di regressioni rispetto alla baseline approvata;
- riproducibilità del comportamento atteso sul corpus certificato;
- completamento tecnico dell'intero corpus;
- stabilità sufficiente per procedere all'integrazione applicativa.

Non certifica la capacità di riconoscere senza errore qualsiasi documento reale futuro.

---

## 6. Principio di revisione umana

Il Motore OCR non è progettato con il requisito di interpretare automaticamente e senza errore ogni documento.

Nel caso d'uso Gestione Casa, il flusso previsto comprende una fase di revisione da parte dell'utente prima della registrazione definitiva dei dati.

Il sistema può proporre i dati riconosciuti, evidenziare elementi incerti, consentire correzioni, richiedere conferma ed evitare la persistenza automatica di informazioni non sufficientemente affidabili.

La revisione umana costituisce parte dell'architettura prevista del prodotto e non un workaround del Motore OCR.

---

## 7. Decisione di freeze

Con il superamento del gate OCR-06:

**OCR-06 — FINAL HARDENING & VERIFICATION: PASS**

Di conseguenza:

**MOTORE OCR v1.0.0 — BASELINE CERTIFICATA E FROZEN**

Non verrà aperta una fase OCR-07 finalizzata al perseguimento del riconoscimento al 100%.

Parser, matcher, preprocessing e logica di riconoscimento della baseline certificata non devono essere modificati dopo il freeze senza una decisione esplicita di apertura di una nuova versione della baseline.

---

## 8. Strategia architetturale di riutilizzo

Il repository `Bigpedros/Motore-OCR` costituisce la **baseline master** conservata del motore.

La baseline non viene concepita come dipendenza condivisa che debba evolvere automaticamente insieme alle applicazioni.

Per ogni applicazione verrà utilizzata una **copia controllata** della baseline certificata.

La prima integrazione prevista riguarda **Gestione Casa**.

Il codice OCR verrà trasferito all'interno del progetto Gestione Casa e da quel momento costituirà il **motore OCR autonomo e indipendente di Gestione Casa**. Al momento della prima integrazione sarà sostanzialmente speculare alla baseline master v1.0.0.

Eventuali modifiche, ottimizzazioni, correzioni o regressioni necessarie specificamente per Gestione Casa saranno gestite localmente e non comporteranno automaticamente modifiche alla baseline master.

---

## 9. Utilizzo futuro della baseline

La baseline master potrà essere utilizzata in futuro come punto di partenza per altri progetti che richiedano tecnologie di riconoscimento ottico.

Principio architetturale:

**BASELINE INVARIATA → COPIA CONTROLLATA → ADATTAMENTO LOCALE**

Ogni progetto potrà sviluppare il proprio Motore OCR indipendente partendo da una base conosciuta, verificata e certificata. Le evoluzioni specifiche non devono contaminare automaticamente la matrice originale né gli altri progetti derivati.

---

## 10. Provenienza delle future copie

Ogni progetto derivato dovrà conservare almeno:

- repository di origine;
- versione della baseline;
- commit SHA della baseline;
- data dell'importazione;
- progetto destinatario;
- versione locale del motore, se successivamente modificato.

Per la prima integrazione:

**Source repository:** `Bigpedros/Motore-OCR`  
**Source baseline:** `v1.0.0`  
**Source code commit:** `8d170cae2824d208d175667aa8a60192cfdf664d`  
**Destination:** `Gestione Casa`

La data e il commit effettivo dell'integrazione dovranno essere registrati nel progetto destinatario al momento dell'operazione.

---

## 11. Regola di propagazione delle modifiche

Le modifiche effettuate sui motori OCR derivati non devono essere riportate automaticamente nella baseline master.

Una modifica sviluppata in un progetto derivato potrà essere valutata per altri progetti soltanto attraverso analisi, verifica di applicabilità, test dedicati, controllo delle regressioni e decisione esplicita di adozione.

Nessuna sincronizzazione automatica è prevista tra la baseline master e i motori OCR derivati.

---

## 12. Distinzione tra codice certificato e commit documentale

Il codice operativo sottoposto al gate finale OCR-06 corrisponde al commit:

`8d170cae2824d208d175667aa8a60192cfdf664d`

Il presente documento viene aggiunto successivamente. Il commit che introduce `OCR_BASELINE_CERTIFICATION_v1.0.0.md` avrà quindi necessariamente uno SHA differente.

Tale nuovo commit deve essere considerato **COMMIT DOCUMENTALE DI CERTIFICAZIONE**, non una nuova versione del codice OCR.

Prima dell'apposizione del tag `v1.0.0` dovrà essere verificato che il commit documentale abbia introdotto esclusivamente la presente documentazione e che nessun file operativo sia stato modificato.

---

## 13. Verdetto finale

**CERTIFICATION STATUS:** PASS  
**BASELINE:** FROZEN  
**VERSION:** v1.0.0  
**CERTIFIED SOURCE CODE COMMIT:** `8d170cae2824d208d175667aa8a60192cfdf664d`  
**TECHNICAL SUCCESS:** 15/15  
**GT LINE COVERAGE:** 48/70 (68.6%)  
**PRICES OK/W/A:** 35/2/11  
**KNOWN TESSERACT WARNING:** NON-BLOCKING / UPSTREAM-RUNTIME FINDING  
**STATUS:** READY FOR CONTROLLED INTEGRATION

---

## Nota finale

Questo documento rappresenta la chiusura formale dello sviluppo della baseline Motore OCR v1.0.0.

La sua presenza nel repository ha esclusivamente funzione di certificazione, tracciabilità, conservazione della provenienza e documentazione delle decisioni tecniche adottate.

**Non è un componente operativo del Motore OCR.**

---

Fine certificazione.
