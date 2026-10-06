import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as napi from '@napi-rs/canvas';
import { renderPdfPageToCanvas } from '../src/core/pdfIntakeService';
import { GeometricRectificationEngine } from '../src/core/geometry/geometricRectificationEngine';

async function createSideBySideComparison(
  beforeCanvas: HTMLCanvasElement,
  afterCanvas: HTMLCanvasElement,
  title: string
): Promise<Buffer> {
  const targetH = 1200;
  const scaleBefore = targetH / beforeCanvas.height;
  const wBefore = Math.round(beforeCanvas.width * scaleBefore);
  const scaleAfter = targetH / afterCanvas.height;
  const wAfter = Math.round(afterCanvas.width * scaleAfter);

  const headerH = 60;
  const totalW = wBefore + wAfter + 30;
  const totalH = targetH + headerH + 20;

  const compCanvas = napi.createCanvas(totalW, totalH);
  const ctx = compCanvas.getContext('2d');

  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, totalW, totalH);

  // Header
  ctx.fillStyle = '#f5f5f4';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(title, 20, 38);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#a8a29e';
  ctx.fillText('Sinistra: Originale (Scansione)  |  Destra: Rettificato A4 Canonico', 350, 38);

  // Draw before
  ctx.drawImage(beforeCanvas as any, 10, headerH, wBefore, targetH);
  // Draw after
  ctx.drawImage(afterCanvas as any, wBefore + 20, headerH, wAfter, targetH);

  return compCanvas.toBuffer('image/png');
}

async function run() {
  console.log('================================================================');
  console.log('PEI FACILE — PIPELINE COMPLETA 12 PAGINE MODELLO ROMA INFANZIA');
  console.log('================================================================');

  const pdfPath = path.resolve('./Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('ERRORE: File PDF non trovato in', pdfPath);
    process.exit(1);
  }

  const rawBytes = fs.readFileSync(pdfPath);
  const sourceHash = crypto.createHash('sha256').update(rawBytes).digest('hex');
  const expectedSourceHash = 'd35456652c65d388b2e1e1381407a2a0ab97c77351389a98451135ea37dea7e7';

  console.log('1. VERIFICA MODELLO SORGENTE:');
  console.log(`   Percorso: ${pdfPath}`);
  console.log(`   Dimensione: ${(rawBytes.length / 1024).toFixed(1)} KB`);
  console.log(`   SHA-256 calcolato: ${sourceHash}`);
  console.log(`   SHA-256 atteso:    ${expectedSourceHash}`);
  console.log(`   Corrispondenza:    ${sourceHash === expectedSourceHash ? 'PERFETTA (100%)' : 'DISCREPANZA'}`);

  const downloadsDir = path.resolve('./public/downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
  const testOutputDir = path.resolve('./test-output');
  if (!fs.existsSync(testOutputDir)) fs.mkdirSync(testOutputDir, { recursive: true });

  const doc = await pdfjs.getDocument({ data: new Uint8Array(rawBytes), useSystemFonts: true, isEvalSupported: false }).promise;
  const totalPages = doc.numPages;
  console.log(`\n2. CARICAMENTO PDF: ${totalPages} pagine identificate.`);

  const sourceCanvases: HTMLCanvasElement[] = [];
  const rectifiedCanvases: HTMLCanvasElement[] = [];
  const metricsList: any[] = [];

  for (let p = 1; p <= totalPages; p++) {
    const page = await doc.getPage(p);
    // Render at scale 2.0 (~144-150 DPI) for optimal fidelity / memory balance
    const srcCanvas = await renderPdfPageToCanvas(page, 2.0);
    sourceCanvases.push(srcCanvas);

    const rectRes = await GeometricRectificationEngine.rectifyCanvas(srcCanvas, p, 200);
    rectifiedCanvases.push(rectRes.rectifiedCanvas);
    metricsList.push(rectRes.metrics);

    console.log(`   Pagina ${p.toString().padStart(2, ' ')}: Inclinazione Iniziale = ${rectRes.metrics.globalSkewDegrees.toFixed(2)}° -> Residua = ${rectRes.metrics.residualSkewDegrees?.toFixed(2)}° | Curvatura = ${rectRes.metrics.localCurvatureMaxDeviationPx.toFixed(1)}px | Stato: ${rectRes.metrics.status} (Conf: ${rectRes.metrics.confidence})`);

    // Salvataggio confronti per pagine 1 e 3
    if (p === 1 || p === 3) {
      const compBuf = await createSideBySideComparison(
        srcCanvas,
        rectRes.rectifiedCanvas,
        `PEI Roma Infanzia — Pagina ${p} (Prima / Dopo Rettifica)`
      );
      fs.writeFileSync(path.join(downloadsDir, `PEI_Roma_Pagina_${p}_Prima_Dopo_Confronto.png`), compBuf);
      fs.writeFileSync(path.join(testOutputDir, `PEI_Roma_Pagina_${p}_Prima_Dopo_Confronto.png`), compBuf);
      
      // Salva anche i singoli debug
      fs.writeFileSync(path.join(downloadsDir, `debug_page${p}_source.png`), (srcCanvas as any).toBuffer('image/png'));
      fs.writeFileSync(path.join(downloadsDir, `debug_page${p}_rectified.png`), (rectRes.rectifiedCanvas as any).toBuffer('image/png'));
    }
  }

  console.log('\n3. GENERAZIONE PDF COMPLETO 12 PAGINE (FORMATO A4 CANONICO)...');
  const canonicalBytes = await GeometricRectificationEngine.buildCanonicalA4Pdf(rectifiedCanvases);
  const normalizedHash = crypto.createHash('sha256').update(canonicalBytes).digest('hex');

  console.log(`   Pagine processate: ${rectifiedCanvases.length}`);
  console.log(`   Dimensione PDF generato: ${(canonicalBytes.length / 1024).toFixed(1)} KB`);
  console.log(`   SHA-256 normalizzato: ${normalizedHash}`);

  // Salvataggio nei percorsi ufficiali
  const outPdfDownloads1 = path.join(downloadsDir, 'PEI_Comune_Roma_Rettificato_A4.pdf');
  const outPdfDownloads2 = path.join(downloadsDir, 'PEI_Comune_Roma_Normalizzato_A4.pdf');
  const outPdfTest1 = path.join(testOutputDir, 'PEI_Comune_Roma_Rettificato_A4.pdf');
  const outPdfTest2 = path.join(testOutputDir, 'PEI_Comune_Roma_Normalizzato_A4.pdf');

  fs.writeFileSync(outPdfDownloads1, Buffer.from(canonicalBytes));
  fs.writeFileSync(outPdfDownloads2, Buffer.from(canonicalBytes));
  fs.writeFileSync(outPdfTest1, Buffer.from(canonicalBytes));
  fs.writeFileSync(outPdfTest2, Buffer.from(canonicalBytes));
  console.log(`   Salvati con successo:`);
  console.log(`   - ${outPdfDownloads1}`);
  console.log(`   - ${outPdfDownloads2}`);

  console.log('\n4. RIAPERTURA DA DISCO E VERIFICA CONTENUTI SU TUTTE LE 12 PAGINE:');
  const diskBytes = fs.readFileSync(outPdfDownloads1);
  const diskDoc = await pdfjs.getDocument({ data: new Uint8Array(diskBytes), useSystemFonts: true, isEvalSupported: false }).promise;
  console.log(`   PDF riaperto dal disco. Numero pagine: ${diskDoc.numPages}`);

  let allPagesValid = true;
  for (let p = 1; p <= diskDoc.numPages; p++) {
    const page = await diskDoc.getPage(p);
    const canvas = await renderPdfPageToCanvas(page, 1.5);
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    let nonWhitePixels = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) {
        nonWhitePixels++;
      }
    }

    const isBlank = nonWhitePixels < 20000;
    if (isBlank) allPagesValid = false;

    console.log(`   - Pagina ${p.toString().padStart(2, ' ')}: ${nonWhitePixels.toLocaleString()} pixel non bianchi -> ${isBlank ? 'ERRORE BIANCA' : 'VALIDA (CONTENUTO PRESENTE)'}`);
  }

  if (!allPagesValid) {
    console.error('ERRORE CRITICO: Una o più pagine risultano bianche!');
    process.exit(1);
  }

  console.log('\n5. RISULTATO FINALE:');
  console.log(`   Tutte le 12 pagine del modello Roma sono state acquisite, rettificate geometricamente,`);
  console.log(`   posizionate su geometria A4 standard e verificate da disco senza pagine bianche.`);
  console.log(`   Hash sorgente:     ${sourceHash}`);
  console.log(`   Hash normalizzato: ${normalizedHash}`);
  console.log('================================================================');
}

run().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
