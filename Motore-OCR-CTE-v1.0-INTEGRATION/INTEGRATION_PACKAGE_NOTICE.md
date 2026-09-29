# Motore OCR-CTE v1.0 — Integration Package

Questo archivio è una copia derivata e alleggerita del checkpoint ufficiale Motore OCR-CTE v1.0 Stable Core, preparata esclusivamente per l'integrazione in PEI FACILE tramite agente AI.

## Contenuto mantenuto
- sorgenti completi `src/`
- package/config TypeScript/Vitest
- documentazione contrattuale e di integrazione
- fixture PDF reale Comune di Roma usata per la regressione

## Contenuto omesso intenzionalmente
- `dist/`
- directory temporanee di compilazione/probe
- overlay PNG
- JSON diagnostici di output già generati

Le omissioni non modificano il core e non rimuovono codice necessario all'integrazione. Il checkpoint completo Motore-OCR-CTE-v1.0.zip resta la fonte archivistica ufficiale.

Regola: integrare il motore tramite la sua public surface; non modificare il core durante l'integrazione PEI FACILE.
