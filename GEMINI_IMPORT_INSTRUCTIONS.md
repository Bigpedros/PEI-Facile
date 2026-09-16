# GEMINI - IMPORTAZIONE CONTROLLATA NELL'APP PEI FACILE

## Obiettivo
Integrare fisicamente i materiali ministeriali del D.I. 153/2023 nell'applicazione PEI FACILE senza alterare il core OCR frozen.

## Operazione richiesta
1. Verificare `CHECKSUMS_SHA256.txt`.
2. Copiare `public/models/*.pdf` nel repository dell'app sotto `public/models/`, byte-per-byte.
3. Copiare `public/reference/ministerial/2023/*` sotto lo stesso percorso dell'app.
4. Copiare `src/data/ministerial/*` sotto `src/data/ministerial/`.
5. Conservare `reference/editable/*` nel repository come materiale di riferimento; NON è necessario servirlo nel bundle runtime.
6. Usare `models_manifest.json` come registro univoco A1-A4.
7. Collegare la UI di selezione modello A1/A2/A3/A4 ai PDF reali presenti in `/models/`.
8. Usare `official_field_prompts.json` per guida contestuale/tassonomia.
9. Usare `phrase_library_schema.json` come schema della futura libreria di frasi/casistiche.

## Vincoli
- NON modificare i PDF ministeriali originali.
- NON modificare i 5 file core OCR frozen.
- NON sostituire i modelli A1-A4 con ricostruzioni HTML/PDF.
- NON usare PEI reali compilati come seed.
- NON inventare frasi attribuendole al Ministero.
- Ogni futura frase/casistica deve essere separata dalla fonte ministeriale, anonimizzata e sottoposta a conferma docente.
- Il docente resta responsabile della selezione, modifica e conferma del testo inserito.

## Verifica finale
Restituire:
- elenco file copiati;
- SHA-256 dei 4 PDF A1-A4 dopo la copia;
- conferma MATCH con `models_manifest.json`;
- test/typecheck/build;
- nessuna modifica al core OCR frozen;
- commit GitHub proposto per l'integrazione.
