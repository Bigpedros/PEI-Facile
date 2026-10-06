import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import * as pdfjsLib from 'pdfjs-dist';
import { renderPdfPageToCanvas } from '../src/core/pdfIntakeService';
import { GeometricRectificationEngine } from '../src/core/geometry/geometricRectificationEngine';

async function run() {
  console.log('=== AVVIO GENERAZIONE ARTEFATTI PAGINA 1 ===');
  const pdfPath = path.resolve('./Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.error('ERRORE: File PDF non trovato in', pdfPath);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(pdfPath);
  const hashSum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const expectedHash = 'd35456652c65d388b2e1e1381407a2a0ab97c77351389a98451135ea37dea7e7';

  console.log('SHA-256 calcolato:', hashSum);
  if (hashSum !== expectedHash) {
    console.error('ATTENZIONE: Hash SHA-256 non corrisponde esattamente all\'atteso!');
  }

  const downloadsDir = path.resolve('./public/downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  // 1. Carica PDF con pdfjs-dist
  const uint8 = new Uint8Array(fileBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8, useSystemFonts: true });
  const pdfDoc = await loadingTask.promise;
  console.log('Totale pagine PDF:', pdfDoc.numPages);

  const page1 = await pdfDoc.getPage(1);

  // 2. Renderizza sorgente pagina 1 -> debug_page1_source.png
  console.log('Renderizzazione pagina 1 sorgente...');
  const sourceCanvas = await renderPdfPageToCanvas(page1, 2.0);
  const sourceBuf = (sourceCanvas as any).toBuffer('image/png');
  const sourcePngPath = path.join(downloadsDir, 'debug_page1_source.png');
  fs.writeFileSync(sourcePngPath, sourceBuf);
  console.log('Salvato:', sourcePngPath);

  // 3. Rettifica geometrica pagina 1 -> debug_page1_rectified.png
  console.log('Rettifica geometrica pagina 1...');
  const rectifiedResult = await GeometricRectificationEngine.rectifyCanvas(sourceCanvas, 1, 200);
  const rectifiedCanvas = rectifiedResult.rectifiedCanvas;
  const rectifiedBuf = (rectifiedCanvas as any).toBuffer('image/png');
  const rectifiedPngPath = path.join(downloadsDir, 'debug_page1_rectified.png');
  fs.writeFileSync(rectifiedPngPath, rectifiedBuf);
  console.log('Salvato:', rectifiedPngPath);

  // 4. Costruisci PDF A4 a pagina singola -> debug_page1_single.pdf
  console.log('Generazione PDF A4 pagina singola...');
  const singlePdfBytes = await GeometricRectificationEngine.buildCanonicalA4Pdf([rectifiedCanvas]);
  const singlePdfPath = path.join(downloadsDir, 'debug_page1_single.pdf');
  fs.writeFileSync(singlePdfPath, Buffer.from(singlePdfBytes));
  console.log('Salvato:', singlePdfPath);

  // 5. Riapri il PDF salvato e renderizza -> debug_page1_reopened.png
  console.log('Riapertura PDF salvato e renderizzazione...');
  const reopenedBuffer = fs.readFileSync(singlePdfPath);
  const reopenedLoading = pdfjsLib.getDocument({ data: new Uint8Array(reopenedBuffer), useSystemFonts: true });
  const reopenedDoc = await reopenedLoading.promise;
  const reopenedPage1 = await reopenedDoc.getPage(1);
  const reopenedCanvas = await renderPdfPageToCanvas(reopenedPage1, 2.0);
  const reopenedBuf = (reopenedCanvas as any).toBuffer('image/png');
  const reopenedPngPath = path.join(downloadsDir, 'debug_page1_reopened.png');
  fs.writeFileSync(reopenedPngPath, reopenedBuf);
  console.log('Salvato:', reopenedPngPath);

  // 6. Verifica esistenza, dimensioni e conteggio pixel non bianchi
  console.log('\n=== VERIFICA ARTEFATTI E METRICHE ===');
  const filesToCheck = [
    { name: 'debug_page1_source.png', path: sourcePngPath, canvas: sourceCanvas },
    { name: 'debug_page1_rectified.png', path: rectifiedPngPath, canvas: rectifiedCanvas },
    { name: 'debug_page1_single.pdf', path: singlePdfPath, isPdf: true },
    { name: 'debug_page1_reopened.png', path: reopenedPngPath, canvas: reopenedCanvas },
  ];

  for (const f of filesToCheck) {
    const exists = fs.existsSync(f.path);
    const stats = exists ? fs.statSync(f.path) : null;
    let nonWhitePixels = 'N/A';

    if (exists && f.canvas) {
      const ctx = f.canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, f.canvas.width, f.canvas.height);
      const data = imgData.data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Non bianco se R < 240 o G < 240 o B < 240
        if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
          count++;
        }
      }
      nonWhitePixels = count.toLocaleString();
    }

    console.log(`- ${f.name}:`);
    console.log(`  Esiste: ${exists ? 'SI' : 'NO'}`);
    console.log(`  Dimensione: ${stats ? (stats.size / 1024).toFixed(1) + ' KB' : 'N/A'}`);
    if (nonWhitePixels !== 'N/A') {
      console.log(`  Pixel non bianchi: ${nonWhitePixels}`);
    }
  }

  console.log('=== GENERAZIONE ARTEFATTI COMPLETATA CON SUCCESSO ===');
}

run().catch((err) => {
  console.error('ERRORE CRITICO NELLO SCRIPT:', err);
  process.exit(1);
});
