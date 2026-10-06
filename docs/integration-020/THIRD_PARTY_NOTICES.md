# Componenti di terze parti

Versioni applicative: PDF.js/pdfjs-dist 6.3.289; Tesseract.js 7.0.0; modelli italiano e inglese dai pacchetti @tesseract.js-data/ita e @tesseract.js-data/eng 1.0.0, variante 4.0.0_best_int. Tesseract.js-core è una dipendenza del riconoscitore: versione precisa nel lockfile.

- PDF.js: https://github.com/mozilla/pdf.js — Apache-2.0.
- Tesseract.js: https://github.com/naptha/tesseract.js — Apache-2.0.
- Tesseract.js-core: https://github.com/naptha/tesseract.js-core — Apache-2.0; compilazione WebAssembly di Tesseract, Leptonica e componenti associati.
- Tessdata: https://github.com/tesseract-ocr/tessdata_best — Apache-2.0.
- Vite, TypeScript, Playwright e tsx: strumenti di sviluppo; relative licenze incluse dove disponibili in `licenses/`.

Questo elenco descrive i componenti principali; i file upstream di licenza e avviso vengono conservati in `licenses/`. Conservare gli avvisi anche nella redistribuzione della build statica.

Componenti aggiunti nella 0.2.0:

- pdf-lib 1.17.1: https://github.com/Hopding/pdf-lib — MIT.
- @pdf-lib/fontkit 1.1.1: https://github.com/Hopding/fontkit — MIT.
- UTIF 3.1.0: https://github.com/photopea/UTIF.js — MIT; usa pako (MIT/Zlib).
- DejaVu Sans: https://dejavu-fonts.github.io/ — licenza Bitstream Vera e modifiche DejaVu, copia in assets/fonts/LICENSE.txt e public/vendor/fonts.
- LibreOffice è una dipendenza esterna opzionale, non inclusa nello ZIP: https://www.libreoffice.org/ — MPL 2.0 e licenze dei componenti.
