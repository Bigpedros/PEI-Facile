import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { GeometricRectificationEngine, createWorkingCanvas } from '../core/geometry/geometricRectificationEngine';
import { computeSha256 } from '../core/templateAcquisitionService';

describe('PEI FACILE — Rettifica Geometrica OpenCV su PDF Comune di Roma', () => {
  it('1. Esegue rettifica geometrica (deskew + dewarping) su Pagina 1 e Pagina 3 del modello Roma', async () => {
    const fixturePath = './Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf';
    expect(fs.existsSync(fixturePath)).toBe(true);

    const rawBytes = fs.readFileSync(fixturePath);
    const sourceSha256 = await computeSha256(rawBytes);
    expect(sourceSha256).toBe('d35456652c65d388b2e1e1381407a2a0ab97c77351389a98451135ea37dea7e7');

    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(rawBytes),
    }).promise;
    expect(pdfDoc.numPages).toBe(12);

    const rectifiedCanvases: HTMLCanvasElement[] = [];
    const allMetrics: any[] = [];
    let p1OriginalCanvas: HTMLCanvasElement | null = null;
    let p1RectifiedCanvas: HTMLCanvasElement | null = null;
    let p3OriginalCanvas: HTMLCanvasElement | null = null;
    let p3RectifiedCanvas: HTMLCanvasElement | null = null;

    for (let pageNum = 1; pageNum <= 12; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const op = await page.getOperatorList();
      const imgIdx = op.fnArray.findIndex((fn) => fn === pdfjsLib.OPS.paintImageXObject);
      const imgName = op.argsArray[imgIdx][0];

      let rawImg: any = null;
      await new Promise<void>((resolve) => {
        page.objs.get(imgName, (img: any) => {
          rawImg = img;
          resolve();
        });
      });

      expect(rawImg).toBeDefined();
      const pageCanvas = await createWorkingCanvas(rawImg.width, rawImg.height);
      const pageCtx = pageCanvas.getContext('2d')!;
      const pageImgData = pageCtx.createImageData(rawImg.width, rawImg.height);

      const rawData = rawImg.data;
      if (rawData.length === rawImg.width * rawImg.height * 3) {
        let p = 0;
        for (let i = 0; i < rawData.length; i += 3, p += 4) {
          pageImgData.data[p] = rawData[i];
          pageImgData.data[p + 1] = rawData[i + 1];
          pageImgData.data[p + 2] = rawData[i + 2];
          pageImgData.data[p + 3] = 255;
        }
      } else {
        pageImgData.data.set(rawData);
      }
      pageCtx.putImageData(pageImgData, 0, 0);

      if (pageNum === 1) p1OriginalCanvas = pageCanvas;
      if (pageNum === 3) p3OriginalCanvas = pageCanvas;

      const pageResult = await GeometricRectificationEngine.rectifyCanvas(pageCanvas, pageNum, 150);
      expect(pageResult).toBeDefined();
      const m=pageResult.metrics;
      expect(typeof m.dewarpingMapApplied).toBe('boolean');
      expect(m.residualCurvatureMaxDeviationPx).toBeDefined();
      if(m.dewarpingMapApplied)expect(m.residualCurvatureMaxDeviationPx!).toBeLessThanOrEqual(m.localCurvatureMaxDeviationPx+1);
      else expect(m.gridDisplacementMaxPx).toBeGreaterThanOrEqual(0);

      rectifiedCanvases.push(pageResult.rectifiedCanvas);
      if(pageNum!==1&&pageNum!==3)pageCanvas.width=pageCanvas.height=1;
      allMetrics.push(pageResult.metrics);

      if (pageNum === 1) p1RectifiedCanvas = pageResult.rectifiedCanvas;
      if (pageNum === 3) p3RectifiedCanvas = pageResult.rectifiedCanvas;
    }

    expect(rectifiedCanvases.length).toBe(12);

    // Costruzione PDF canonico A4 completo a 12 pagine
    const canonicalPdf = await GeometricRectificationEngine.buildCanonicalA4Pdf(rectifiedCanvases);

    expect(canonicalPdf).toBeDefined();
    expect(canonicalPdf.byteLength).toBeGreaterThan(10000);

    const normSha256 = await computeSha256(canonicalPdf);
    expect(normSha256).toBeDefined();
    expect(normSha256.length).toBe(64);
    expect(normSha256).not.toBe(sourceSha256);

    // Salva file esportati per ispezione in cartella di lavoro esclusa dalla distribuzione
    const exportDir = './test-output';
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    fs.writeFileSync(`${exportDir}/PEI_Comune_Roma_Rettificato_A4.pdf`, canonicalPdf);
    fs.writeFileSync(`${exportDir}/PEI_Comune_Roma_Normalizzato_A4.pdf`, canonicalPdf);

    // Genera e salva immagini di confronto Prima/Dopo per Pagina 1 e Pagina 3
    const makeComparisonImage = async (origCanvas: HTMLCanvasElement, rectCanvas: HTMLCanvasElement, pageTitle: string) => {
      const compW = origCanvas.width + rectCanvas.width + 40;
      const compH = Math.max(origCanvas.height, rectCanvas.height) + 80;
      const compCanvas = await createWorkingCanvas(compW, compH);
      const compCtx = compCanvas.getContext('2d')!;

      compCtx.fillStyle = '#1e293b';
      compCtx.fillRect(0, 0, compW, compH);

      compCtx.fillStyle = '#f8fafc';
      compCtx.font = 'bold 24px sans-serif';
      compCtx.fillText(`PEI FACILE — ${pageTitle} : ORIGINALE (Sinistra) vs RETTIFICATO OPENCV (Destra)`, 20, 40);

      compCtx.drawImage(origCanvas, 15, 60);
      compCtx.drawImage(rectCanvas, origCanvas.width + 25, 60);

      if (typeof (compCanvas as any).toBuffer === 'function') {
        return (compCanvas as any).toBuffer('image/png');
      }
      const dataUrl = compCanvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1] || '';
      return Buffer.from(base64Data, 'base64');
    };

    const compP1Buf = await makeComparisonImage(p1OriginalCanvas!, p1RectifiedCanvas!, 'PAGINA 1');
    const compP3Buf = await makeComparisonImage(p3OriginalCanvas!, p3RectifiedCanvas!, 'PAGINA 3');

    fs.writeFileSync(`${exportDir}/PEI_Roma_Pagina_1_Prima_Dopo_Confronto.png`, compP1Buf);
    fs.writeFileSync(`${exportDir}/PEI_Roma_Pagina_3_Prima_Dopo_Confronto.png`, compP3Buf);

    console.log('=== METRICHE RETTIFICA GEOMETRICA OPENCV (MODELLO ROMA - 12 PAGINE) ===');
    console.log('Pagine elaborate:', rectifiedCanvases.length);
    console.log('Pagina 1 Skew stimato:', allMetrics[0].globalSkewDegrees, 'gradi');
    console.log('Pagina 1 Curvatura max residua:', allMetrics[0].localCurvatureMaxDeviationPx, 'px');
    console.log('Pagina 1 Griglia dewarping:', `${allMetrics[0].gridResolution.cols}x${allMetrics[0].gridResolution.rows}`);
    console.log('Pagina 1 Confidenza rettifica:', allMetrics[0].confidence);
    console.log('Pagina 3 Confidenza rettifica:', allMetrics[2].confidence);
    console.log('SHA-256 Originale:', sourceSha256);
    console.log('SHA-256 Rettificato A4 (12 pag):', normSha256);
    console.log('PDF Rettificato esportato in: ./test-output/PEI_Comune_Roma_Rettificato_A4.pdf');
    console.log('Immagine Confronto Pag 1: ./test-output/PEI_Roma_Pagina_1_Prima_Dopo_Confronto.png');
    console.log('Immagine Confronto Pag 3: ./test-output/PEI_Roma_Pagina_3_Prima_Dopo_Confronto.png');
  }, 60000);
});

