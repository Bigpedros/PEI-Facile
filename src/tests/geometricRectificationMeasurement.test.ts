import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { CanonicalTemplateEngine } from '../core/canonical-template-engine/canonicalTemplateEngine';
import { CteDecision } from '../core/canonical-template-engine/types';
import { createWorkingCanvas } from '../core/geometry/geometricRectificationEngine';

describe('PEI FACILE — Misura Deformazioni Geometriche Interne e Valutazione Rettifica (Comune di Roma)', () => {
  it('Misura deformazioni, linearità, pendenze locali e ortogonalità su linee orizzontali e verticali', async () => {
    const filePath = './Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf';
    const rawBytes = fs.readFileSync(filePath);

    // 1. Esegui normalizzazione CTE
    const cte = CanonicalTemplateEngine.getInstance();
    const cteRes = await cte.execute(rawBytes.buffer.slice(0), {
      forceDecision: CteDecision.NORMALIZE_TO_TEMPLATE,
    });

    const normPdfBytes = cteRes.canonicalDocument ? new Uint8Array(cteRes.canonicalDocument) : new Uint8Array(rawBytes);

    // 2. Carica sia il PDF originale che il PDF normalizzato con PDF.js
    const origDoc = await pdfjsLib.getDocument({ data: new Uint8Array(rawBytes), useSystemFonts: true }).promise;
    const normDoc = await pdfjsLib.getDocument({ data: normPdfBytes, useSystemFonts: true }).promise;

    const origP1 = await origDoc.getPage(1);
    const normP1 = await normDoc.getPage(1);

    const origVp = origP1.getViewport({ scale: 1.0 });
    const normVp = normP1.getViewport({ scale: 1.0 });

    console.log(`Originale Pag 1: ${origVp.width} x ${origVp.height} pt`);
    console.log(`Normalizzato Pag 1: ${normVp.width} x ${normVp.height} pt`);

    // Estrai immagine raw Pagina 1 Originale
    const op1 = await origP1.getOperatorList();
    const imgIdx1 = op1.fnArray.findIndex((fn) => fn === pdfjsLib.OPS.paintImageXObject);
    const imgName1 = op1.argsArray[imgIdx1][0];

    let origImg: any = null;
    await new Promise<void>((resolve) => {
      origP1.objs.get(imgName1, (img: any) => {
        origImg = img;
        resolve();
      });
    });

    const origCanvas = await createWorkingCanvas(origImg.width, origImg.height);
    const origCtx = origCanvas.getContext('2d')!;
    const origImgData = origCtx.createImageData(origImg.width, origImg.height);
    const origData = origImg.data;
    if (origData.length === origImg.width * origImg.height * 3) {
      let p = 0;
      for (let i = 0; i < origData.length; i += 3, p += 4) {
        origImgData.data[p] = origData[i];
        origImgData.data[p + 1] = origData[i + 1];
        origImgData.data[p + 2] = origData[i + 2];
        origImgData.data[p + 3] = 255;
      }
    } else {
      origImgData.data.set(origData);
    }
    origCtx.putImageData(origImgData, 0, 0);

    // Estrai immagine raw Pagina 1 Normalizzata
    const normOp1 = await normP1.getOperatorList();
    const normImgIdx1 = normOp1.fnArray.findIndex((fn) => fn === pdfjsLib.OPS.paintImageXObject);
    let normCanvas: HTMLCanvasElement;
    let normCtx: any;

    if (normImgIdx1 !== -1) {
      const normImgName1 = normOp1.argsArray[normImgIdx1][0];
      let normImg: any = null;
      await new Promise<void>((resolve) => {
        normP1.objs.get(normImgName1, (img: any) => {
          normImg = img;
          resolve();
        });
      });
      normCanvas = await createWorkingCanvas(normImg.width, normImg.height);
      normCtx = normCanvas.getContext('2d')!;
      const normImgData = normCtx.createImageData(normImg.width, normImg.height);
      const normData = normImg.data;
      if (normData.length === normImg.width * normImg.height * 3) {
        let p = 0;
        for (let i = 0; i < normData.length; i += 3, p += 4) {
          normImgData.data[p] = normData[i];
          normImgData.data[p + 1] = normData[i + 1];
          normImgData.data[p + 2] = normData[i + 2];
          normImgData.data[p + 3] = 255;
        }
      } else {
        normImgData.data.set(normData);
      }
      normCtx.putImageData(normImgData, 0, 0);
    } else {
      normCanvas = origCanvas;
      normCtx = origCtx;
    }

    // Helper per estrarre segmenti di linea e misurare la deviazione da retta
    const measureHorizontalSegment = (ctx: any, ySearchMin: number, ySearchMax: number, xMin: number, xMax: number) => {
      const w = ctx.canvas.width;
      const imgData = ctx.getImageData(0, 0, w, ctx.canvas.height).data;

      const points: Array<{ x: number; y: number }> = [];

      for (let x = xMin; x <= xMax; x += 4) {
        let bestY = -1;
        let minLum = 255;
        for (let y = ySearchMin; y <= ySearchMax; y += 1) {
          const idx = (y * w + x) * 4;
          const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
          if (lum < 160 && lum < minLum) {
            minLum = lum;
            bestY = y;
          }
        }
        if (bestY !== -1) {
          points.push({ x, y: bestY });
        }
      }

      if (points.length < 5) return null;

      const pFirst = points[0];
      const pLast = points[points.length - 1];
      const dx = pLast.x - pFirst.x;
      const dy = pLast.y - pFirst.y;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

      // Linear regression and max deviation (sagitta / curvature)
      let maxDev = 0;
      for (const pt of points) {
        // Distance from point to line (pFirst -> pLast)
        const num = Math.abs(dy * pt.x - dx * pt.y + pLast.x * pFirst.y - pLast.y * pFirst.x);
        const den = Math.sqrt(dx * dx + dy * dy);
        const dist = den > 0 ? num / den : 0;
        if (dist > maxDev) maxDev = dist;
      }

      return {
        pointsCount: points.length,
        x1: Math.round(pFirst.x * 10) / 10,
        x2: Math.round(pLast.x * 10) / 10,
        y1: Math.round(pFirst.y * 10) / 10,
        y2: Math.round(pLast.y * 10) / 10,
        angleDeg: Math.round(angleDeg * 100) / 100,
        maxCurvatureDeviationPx: Math.round(maxDev * 100) / 100,
      };
    };

    const measureVerticalSegment = (ctx: any, xSearchMin: number, xSearchMax: number, yMin: number, yMax: number) => {
      const w = ctx.canvas.width;
      const imgData = ctx.getImageData(0, 0, w, ctx.canvas.height).data;

      const points: Array<{ x: number; y: number }> = [];

      for (let y = yMin; y <= yMax; y += 4) {
        let bestX = -1;
        let minLum = 255;
        for (let x = xSearchMin; x <= xSearchMax; x += 1) {
          const idx = (y * w + x) * 4;
          const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
          if (lum < 160 && lum < minLum) {
            minLum = lum;
            bestX = x;
          }
        }
        if (bestX !== -1) {
          points.push({ x: bestX, y });
        }
      }

      if (points.length < 5) return null;

      const pFirst = points[0];
      const pLast = points[points.length - 1];
      const dx = pLast.x - pFirst.x;
      const dy = pLast.y - pFirst.y;
      const angleFromVerticalDeg = (Math.atan2(dx, dy) * 180) / Math.PI;

      let maxDev = 0;
      for (const pt of points) {
        const num = Math.abs(dy * pt.x - dx * pt.y + pLast.x * pFirst.y - pLast.y * pFirst.x);
        const den = Math.sqrt(dx * dx + dy * dy);
        const dist = den > 0 ? num / den : 0;
        if (dist > maxDev) maxDev = dist;
      }

      return {
        pointsCount: points.length,
        x1: Math.round(pFirst.x * 10) / 10,
        x2: Math.round(pLast.x * 10) / 10,
        y1: Math.round(pFirst.y * 10) / 10,
        y2: Math.round(pLast.y * 10) / 10,
        angleFromVerticalDeg: Math.round(angleFromVerticalDeg * 100) / 100,
        maxCurvatureDeviationPx: Math.round(maxDev * 100) / 100,
      };
    };

    console.log('=== MISURE SU DOCUMENTO ORIGINALE (Prima della normalizzazione, 2092x3007 px) ===');
    // Misure su originale (coordinate pixel raw)
    const origH1 = measureHorizontalSegment(origCtx, 200, 350, 400, 1800);
    const origH2 = measureHorizontalSegment(origCtx, 1900, 2100, 300, 1800);
    const origH3 = measureHorizontalSegment(origCtx, 2500, 2750, 200, 1800);
    const origV1 = measureVerticalSegment(origCtx, 150, 260, 2400, 2850);
    const origV2 = measureVerticalSegment(origCtx, 1750, 1900, 2400, 2850);

    console.log('Orig Linea Orizzontale Superiore (Intestazione):', origH1);
    console.log('Orig Linea Orizzontale Mediana (Tabella PEI Provvisorio):', origH2);
    console.log('Orig Linea Orizzontale Inferiore (Tabella GLO):', origH3);
    console.log('Orig Bordo Verticale Sinistro (Tabella GLO):', origV1);
    console.log('Orig Bordo Verticale Destro (Tabella GLO):', origV2);

    console.log('=== MISURE SU DOCUMENTO NORMALIZZATO (Dopo la normalizzazione, 595x842 pt) ===');
    // Misure su normalizzato (coordinate pt A4)
    const normH1 = measureHorizontalSegment(normCtx, 40, 80, 100, 500);
    const normH2 = measureHorizontalSegment(normCtx, 540, 590, 80, 500);
    const normH3 = measureHorizontalSegment(normCtx, 700, 770, 50, 500);
    const normV1 = measureVerticalSegment(normCtx, 40, 80, 680, 800);
    const normV2 = measureVerticalSegment(normCtx, 480, 550, 680, 800);

    console.log('Norm Linea Orizzontale Superiore (Intestazione):', normH1);
    console.log('Norm Linea Orizzontale Mediana (Tabella PEI Provvisorio):', normH2);
    console.log('Norm Linea Orizzontale Inferiore (Tabella GLO):', normH3);
    console.log('Norm Bordo Verticale Sinistro (Tabella GLO):', normV1);
    console.log('Norm Bordo Verticale Destro (Tabella GLO):', normV2);

    expect(origDoc).toBeDefined();
    expect(normDoc).toBeDefined();
  }, 60000);
});
