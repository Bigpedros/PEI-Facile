# Provenienza e criteri di estrazione

- Repository sorgente: `Bigpedros/Gestione-Casa-OCR`
- Commit sorgente: `8c9a0518c37c569ba128ba650522e2b90e94e236`
- Data estrazione: 2026-09-12
- Stato sorgente al momento dell'estrazione: working tree pulito
- Patch diagnostica Gemini D1 cancellata: esclusa

## Copia fedele

Sono stati copiati senza modifiche funzionali:

- `src/utils/imagePreprocessing.ts`
- l'intero albero `src/services/ocrParser/`
- fixture testuali `src/tests/fixtures/real-receipts/`
- tipi del precedente harness necessari alle fixture
- fotografie `Gruppo-caffe_espresso.jpeg` e `Todis_nuovo.jpeg`

## Disaccoppiamento applicativo

Da `receiptParserService.ts` sono stati eliminati soltanto:

- import dei repository Dexie;
- import del servizio di classificazione prodotti persistiti;
- metodo `parse(ocrProcessId)`, responsabile di lettura e scrittura database.

Il metodo puro `parseText()` è rimasto disponibile. I tipi applicativi richiesti
dal parser sono stati ridotti a un contratto locale in `src/types/index.ts`.

## Regola di lavoro

Ogni correzione successiva deve:

1. avere un test che riproduce il difetto;
2. evitare riferimenti hardcoded a singolo fornitore, prodotto o importo;
3. superare test, typecheck e build;
4. essere provata sulle stesse immagini prima su desktop e poi su iPhone.
