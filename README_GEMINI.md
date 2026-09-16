# PEI FACILE OCR STARTER — istruzioni per Gemini

Questo ZIP non è il Motore OCR scontrini completo. È una base pulita derivata dalla baseline certificata `Bigpedros/Motore-OCR` v1.0.0 per costruire il motore OCR di PEI FACILE.

## Obiettivo
Integrare in PEI FACILE un flusso locale di acquisizione PDF che:
- preferisca sempre l'estrazione del testo nativo del PDF;
- usi OCR solo per pagine/zone scannerizzate o senza text layer;
- utilizzi Tesseract.js 7 con modello italiano locale incluso in `public/tessdata`;
- conservi testo, confidence e coordinate;
- passi il risultato a un parser specifico dei modelli ministeriali PEI;
- richieda revisione umana prima di salvare dati importati.

## File principali
- `src/core/ocrEngine.ts`: motore OCR neutro immagine→testo.
- `src/core/imagePreprocessing.ts`: preprocessing derivato dalla baseline, generalizzato.
- `src/core/types.ts`: contratti dati.
- `src/pei/peiDocumentParser.ts`: contratto iniziale del parser PEI, da implementare.
- `docs/PEI_OCR_ARCHITECTURE.md`: architettura obbligatoria del flusso PDF.
- `PROVENANCE.md`: provenienza e baseline certificata.
- `reference/`: snapshot non compilati dei due file originali utili per confronto.

## Vincoli di implementazione
1. NON reintrodurre parser, knowledge base o recovery specifici degli scontrini.
2. NON modificare i file in `reference/`; sono solo confronto storico.
3. Mantenere l'elaborazione local-first.
4. Non persistire automaticamente campi OCR incerti.
5. Non usare nomi reali di alunni nei test: usare documenti sintetici o anonimizzati.
6. Ogni nuova regola di parsing PEI deve avere test dedicato.
7. Evitare hardcoding su un singolo PEI reale; ancorarsi a titoli/sezioni/campi dei modelli ministeriali.
8. Prima di OCR su PDF, tentare sempre text-layer extraction.

## Prima attività richiesta
Costruire un `PdfIntakeService` separato dal core OCR. Deve classificare ogni pagina come:
- `TEXT_NATIVE`
- `IMAGE_ONLY`
- `MIXED`

Per le pagine `TEXT_NATIVE`, restituire testo e coordinate senza Tesseract.
Per `IMAGE_ONLY`, renderizzare e chiamare `analyzeDocumentImage`.
Per `MIXED`, OCR solo delle regioni senza testo quando tecnicamente possibile.

Poi costruire il primo `PeiDocumentParser` sulla struttura dei modelli ministeriali, senza ancora aggiungere librerie di testi suggeriti.
