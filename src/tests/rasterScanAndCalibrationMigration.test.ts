import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { analyzeImageRasterScanLines } from '../core/canonical-template-engine/analyzer/rasterScanAnalysis';
import { migrateCalibrationToA4Space } from '../data/geometry/geometryTransform';
import { saveCustomTemplate, getCustomTemplate, getTemplatePdfBinary } from '../core/templateStorage';

describe('PEI FACILE — Analisi Geometria Scansione e Migrazione Calibrazione', () => {
  it('1. Misura inclinazione reale delle linee raster interne su Pagina 1 e Pagina 3', async () => {
    const buf = fs.readFileSync('./Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

    // Pagina 1
    const p1 = await doc.getPage(1);
    const op1 = await p1.getOperatorList();
    const imgIdx1 = op1.fnArray.findIndex((fn) => fn === pdfjsLib.OPS.paintImageXObject);
    const imgName1 = op1.argsArray[imgIdx1][0];

    let p1Analysis: any = null;
    await p1.objs.get(imgName1, (img: any) => {
      p1Analysis = analyzeImageRasterScanLines(img.width, img.height, img.data, 1);
    });

    expect(p1Analysis).not.toBeNull();
    expect(p1Analysis.detectedLines.length).toBeGreaterThan(0);
    expect(p1Analysis.globalScanSkewDegrees).toBeDefined();

    // Pagina 3
    const p3 = await doc.getPage(3);
    const op3 = await p3.getOperatorList();
    const imgIdx3 = op3.fnArray.findIndex((fn) => fn === pdfjsLib.OPS.paintImageXObject);
    const imgName3 = op3.argsArray[imgIdx3][0];

    let p3Analysis: any = null;
    await p3.objs.get(imgName3, (img: any) => {
      p3Analysis = analyzeImageRasterScanLines(img.width, img.height, img.data, 3);
    });

    expect(p3Analysis).not.toBeNull();
    expect(p3Analysis.detectedLines.length).toBeGreaterThan(0);
    expect(p3Analysis.globalScanSkewDegrees).toBeGreaterThanOrEqual(0.0);
  });

  it('2. Verifica migrazione delle calibrazioni manuali salvaguardando originalBounds', () => {
    const preNormalizedField: {
      fieldId: string;
      label: string;
      pageNumber: number;
      xPt: number;
      yPt: number;
      widthPt: number;
      heightPt: number;
      calibrationStatus: string;
      originalBounds?: { xPt: number; yPt: number; widthPt: number; heightPt: number };
    } = {
      fieldId: 'manual_f01',
      label: 'Campo Anagrafica Studente',
      pageNumber: 1,
      xPt: 200,
      yPt: 300,
      widthPt: 400,
      heightPt: 50,
      calibrationStatus: 'CONFIRMED',
    };

    // Transform from 2092 x 3007 to A4 (scale = 0.2800, dx = 4.78, dy = -0.02)
    const pageTransform = {
      scaleX: 0.2800,
      scaleY: 0.2800,
      deltaX: 4.78,
      deltaY: -0.02,
    };

    const migrated = migrateCalibrationToA4Space(preNormalizedField, pageTransform);

    // 1. originalBounds must be preserved distinctly
    expect(migrated.originalBounds).toBeDefined();
    expect(migrated.originalBounds.xPt).toBe(200);
    expect(migrated.originalBounds.yPt).toBe(300);

    // 2. A4 coordinates must be correctly calculated
    expect(migrated.xPt).toBe(Math.round((200 * 0.28 + 4.78) * 100) / 100); // 60.78
    expect(migrated.yPt).toBe(Math.round((300 * 0.28 - 0.02) * 100) / 100); // 83.98
    expect(migrated.widthPt).toBe(112); // 400 * 0.28
    expect(migrated.heightPt).toBe(14); // 50 * 0.28
  });

  it('3. Ritorna INSUFFICIENT_NO_LINES e null su immagini vuote o senza righe', () => {
    // 500x500 white image with zero dark pixels
    const emptyData = new Uint8Array(500 * 500 * 3);
    emptyData.fill(255);

    const emptyRes = analyzeImageRasterScanLines(500, 500, emptyData, 1);
    expect(emptyRes.detectedLines.length).toBe(0);
    expect(emptyRes.evidenceStatus).toBe('INSUFFICIENT_NO_LINES');
    expect(emptyRes.globalScanSkewDegrees).toBeNull();
  });

  it('4. Preserva le modifiche manuali successive dell\'utente nello spazio A4', () => {
    const userAdjustedField = {
      fieldId: 'manual_f02',
      label: 'Campo Modificato dall\'Utente in A4',
      pageNumber: 1,
      xPt: 75.0, // Manual adjustment in A4
      yPt: 95.0,
      widthPt: 150.0,
      heightPt: 25.0,
      originalBounds: { xPt: 200, yPt: 300, widthPt: 400, heightPt: 50 },
      isManuallyAdjusted: true,
    };

    const pageTransform = {
      scaleX: 0.2800,
      scaleY: 0.2800,
      deltaX: 4.78,
      deltaY: -0.02,
    };

    const result = migrateCalibrationToA4Space(userAdjustedField, pageTransform);
    // User manual edits must NOT be overwritten
    expect(result.xPt).toBe(75.0);
    expect(result.yPt).toBe(95.0);
    expect(result.originalBounds.xPt).toBe(200);
  });
});
