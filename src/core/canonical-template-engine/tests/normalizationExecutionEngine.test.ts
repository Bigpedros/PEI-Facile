/**
 * Canonical Template Engine (CTE) - Release R06
 * NormalizationExecutionEngine Test Suite
 *
 * Verifies:
 * 1. Documento già perfetto: nessuna modifica.
 * 2. Documento inclinato: deskew corretto.
 * 3. Documento ruotato: rotate corretto.
 * 4. Documento con prospettiva: perspective correction corretta.
 * 5. Documento traslato: translation corretta.
 * 6. Documento fuori scala: scaling corretto.
 * 7. Documento con più anomalie: applicazione completa e ordinata dell'intero piano.
 * 8. Verificare che geometryScoreAfter sia sempre >= geometryScoreBefore.
 * 9. Verificare che il documento mantenga invariato il contenuto.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { NormalizationExecutionEngine } from '../execution/normalizationExecutionEngine';
import { NormalizationPlanningEngine } from '../normalization/normalizationPlanningEngine';
import { PdfDocumentAnalyzer } from '../analyzer/pdfDocumentAnalyzer';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from '../../../data/geometry/geometryTransform';

/**
 * Creates a deterministic custom PDF binary buffer for execution testing.
 */
function createSyntheticPdf(options: {
  width?: number;
  height?: number;
  rotate?: number;
  text?: string;
  textTransform?: [number, number, number, number, number, number];
  vectors?: Array<{ x: number; y: number; w: number; h: number }>;
}): ArrayBuffer {
  const w = options.width ?? 595.28;
  const h = options.height ?? 841.89;
  const rot = options.rotate ?? 0;

  const fontObjId = 3;
  let nextId = 4;
  const pageObjIds: number[] = [];
  const objects: Array<{ id: number; content: string }> = [];

  objects.push({
    id: fontObjId,
    content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  });

  const pageId = nextId++;
  const contentId = nextId++;
  pageObjIds.push(pageId);

  let stream = '';

  if (options.vectors && options.vectors.length > 0) {
    for (const v of options.vectors) {
      stream += `${v.x} ${v.y} ${v.w} ${v.h} re S\n`;
    }
  }

  const textToDraw = options.text ?? 'MINISTERO DELL ISTRUZIONE E DEL MERITO - PEI FACILE';
  const sanitized = textToDraw.replace(/[()]/g, '');
  if (options.textTransform) {
    const [a, b, c, d, e, f] = options.textTransform;
    stream += `BT /F1 12 Tf ${a} ${b} ${c} ${d} ${e} ${f} Tm (${sanitized}) Tj ET\n`;
  } else {
    stream += `BT /F1 12 Tf 60 720 Td (${sanitized}) Tj ET\n`;
  }

  const streamLen = Buffer.byteLength(stream, 'latin1');
  const contentObj = `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`;
  objects.push({ id: contentId, content: contentObj });

  const resources = `<< /Font << /F1 ${fontObjId} 0 R >> >>`;
  let pageDict = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentId} 0 R /Resources ${resources}`;
  if (rot !== 0) {
    pageDict += ` /Rotate ${rot}`;
  }
  pageDict += ' >>';
  objects.push({ id: pageId, content: pageDict });

  const catalogObj = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pagesObj = `<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count 1 >>`;

  objects.unshift({ id: 2, content: pagesObj });
  objects.unshift({ id: 1, content: catalogObj });
  objects.sort((a, b) => a.id - b.id);

  let pdfStr = '%PDF-1.4\n';
  const offsets: number[] = [0];

  objects.forEach(obj => {
    offsets.push(pdfStr.length);
    pdfStr += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
  });

  const startXref = pdfStr.length;
  pdfStr += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const offset = String(offsets[i]).padStart(10, '0');
    pdfStr += `${offset} 00000 n \n`;
  }

  pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  const buf = Buffer.from(pdfStr, 'binary');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('Canonical Template Engine (CTE) - Release R06 Normalization Execution Engine', () => {
  const analyzer = new PdfDocumentAnalyzer();
  const planner = new NormalizationPlanningEngine();
  const executor = new NormalizationExecutionEngine({ analyzer });

  it('TEST 1: Documento già perfetto (nessuna modifica applicata)', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const buffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const analysisBefore = await analyzer.analyze(buffer);
    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    const result = await executor.execute({
      document: buffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    expect(result.normalizationReport.pagesModified).toBe(0);
    expect(result.appliedOperations).toHaveLength(0);
    expect(result.geometryScoreAfter).toBeGreaterThanOrEqual(result.geometryScoreBefore);
    expect(result.improvementScore).toBe(0);
    expect(result.normalizationReport.contentPreserved).toBe(true);
  });

  it('TEST 2: Documento inclinato (deskew corretto)', async () => {
    const angleRad = (3.5 * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const skewedBuffer = createSyntheticPdf({
      text: 'PIANO EDUCATIVO INDIVIDUALIZZATO SCUOLA INFANZIA',
      textTransform: [cosA, sinA, -sinA, cosA, 60, 700],
    });

    const analysisBefore = await analyzer.analyze(skewedBuffer);
    expect(analysisBefore.geometricAnalysis?.overallSkewAngle).toBeCloseTo(3.5, 0);

    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    const result = await executor.execute({
      document: skewedBuffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    expect(result.normalizationReport.pagesModified).toBe(1);
    const deskewOp = result.appliedOperations.find(o => o.type === 'deskew');
    expect(deskewOp).toBeDefined();
    expect(deskewOp?.parameters.skewCorrection).toBeCloseTo(-3.5, 1);

    // After normalization, skew must be corrected to 0.00
    expect(result.newGeometricAnalysis.overallSkewAngle).toBe(0);
    expect(result.geometryScoreAfter).toBeGreaterThanOrEqual(result.geometryScoreBefore);
    expect(result.improvementScore).toBeGreaterThanOrEqual(0);
  });

  it('TEST 3: Documento ruotato (rotate corretto)', async () => {
    const rotatedBuffer = createSyntheticPdf({
      rotate: 90,
      text: 'PAGINA CON ORIENTAMENTO RUOTATO A 90 GRADI',
    });

    const analysisBefore = await analyzer.analyze(rotatedBuffer);
    expect(analysisBefore.pages[0].rotation).toBe(90);

    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    const result = await executor.execute({
      document: rotatedBuffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    expect(result.normalizationReport.pagesModified).toBe(1);
    const rotateOp = result.appliedOperations.find(o => o.type === 'rotate');
    expect(rotateOp).toBeDefined();

    // After normalization, rotation must be 0 and orientation portrait
    expect(result.newGeometricAnalysis.pages[0].pageRotation).toBe(0);
    expect(result.newGeometricAnalysis.pages[0].orientation).toBe('portrait');
  });

  it('TEST 4: Documento con prospettiva (perspective correction corretta)', async () => {
    const skewedBuffer = createSyntheticPdf({
      text: 'TESTO CON DISTORSIONE PROSPETTICA SIMULATA',
      vectors: [
        { x: 50, y: 100, w: 490, h: 600 },
      ],
    });

    const analysisBefore = await analyzer.analyze(skewedBuffer);
    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    // Force perspective correction requirement in plan for isolated verification
    plan.requiresNormalization = true;
    plan.pagePlans[0].requiresCorrection = true;
    plan.pagePlans[0].perspectiveCorrection = {
      needed: true,
      deviation: 2.1,
      description: 'Test perspective deviation',
    };
    plan.pagePlans[0].operationSequence.unshift({
      step: 3,
      type: 'perspective',
      name: 'Raddrizzamento Prospettico (Perspective Correction)',
      description: 'Raddrizzamento prospettico test',
      parameters: { deviation: 2.1 },
      expectedImpact: { targetMetric: 'perspectiveScore', before: 70, estimatedAfter: 100 },
    });

    const result = await executor.execute({
      document: skewedBuffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    const perspOp = result.appliedOperations.find(o => o.type === 'perspective');
    expect(perspOp).toBeDefined();
    expect(perspOp?.status).toBe('applied');
    expect(result.geometryScoreAfter).toBeGreaterThanOrEqual(result.geometryScoreBefore);
  });

  it('TEST 5: Documento traslato (translation corretta)', async () => {
    const transBuffer = createSyntheticPdf({
      text: 'TESTO TRASLATO RISPETTO ALL ORIGINE',
      vectors: [{ x: 90, y: 120, w: 300, h: 400 }],
    });

    const analysisBefore = await analyzer.analyze(transBuffer);
    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    // Configure translation in plan
    plan.requiresNormalization = true;
    plan.pagePlans[0].requiresCorrection = true;
    plan.pagePlans[0].translation = { x: -15, y: 10 };
    plan.pagePlans[0].operationSequence.push({
      step: 4,
      type: 'translate',
      name: 'Riallineamento Origine Coordinate (Translate)',
      description: 'Traslazione test',
      parameters: { deltaXPt: -15, deltaYPt: 10 },
      expectedImpact: { targetMetric: 'originOffset', before: '[15, -10]', estimatedAfter: '[0, 0]' },
    });

    const result = await executor.execute({
      document: transBuffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    const transOp = result.appliedOperations.find(o => o.type === 'translate');
    expect(transOp).toBeDefined();
    expect(transOp?.parameters.deltaX).toBe(-15);
    expect(transOp?.parameters.deltaY).toBe(10);
    expect(result.geometryScoreAfter).toBeGreaterThanOrEqual(result.geometryScoreBefore);
  });

  it('TEST 6: Documento fuori scala (scaling corretto)', async () => {
    const nonStandardBuffer = createSyntheticPdf({
      width: 500,
      height: 700,
      text: 'DOCUMENTO NON A4 DA SCALARE A FORMATO CANONICO',
    });

    const analysisBefore = await analyzer.analyze(nonStandardBuffer);
    expect(analysisBefore.pages[0].width).toBe(500);
    expect(analysisBefore.pages[0].height).toBe(700);

    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    const result = await executor.execute({
      document: nonStandardBuffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    expect(result.normalizationReport.pagesModified).toBe(1);
    const scaleOp = result.appliedOperations.find(o => o.type === 'scale');
    expect(scaleOp).toBeDefined();

    // After normalization, page dimensions must be canonical A4 (595.28 x 841.89)
    expect(result.newGeometricAnalysis.pages[0].width).toBeCloseTo(A4_WIDTH_PT, 0);
    expect(result.newGeometricAnalysis.pages[0].height).toBeCloseTo(A4_HEIGHT_PT, 0);
    expect(result.newGeometricAnalysis.pages[0].scale).toBeCloseTo(1.0, 1);
  });

  it('TEST 7: Documento con più anomalie (applicazione completa e ordinata dell intero piano)', async () => {
    const angleRad = (2.5 * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const multiAnomalyBuffer = createSyntheticPdf({
      width: 520,
      height: 740,
      rotate: 90,
      textTransform: [cosA, sinA, -sinA, cosA, 50, 650],
      text: 'DOCUMENTO MULTI ANOMALIA PER VERIFICA SEQUENZA DI TRASFORMAZIONE',
    });

    const analysisBefore = await analyzer.analyze(multiAnomalyBuffer);
    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    const result = await executor.execute({
      document: multiAnomalyBuffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    // Check that operations were applied
    expect(result.appliedOperations.length).toBeGreaterThanOrEqual(3);

    // Verify strict canonical order: rotate (1) -> deskew (2) -> perspective (3) -> translate (4) -> scale (5) -> margin_adjustment (6)
    const opOrderMap: Record<string, number> = {
      rotate: 1,
      deskew: 2,
      perspective: 3,
      translate: 4,
      scale: 5,
      margin_adjustment: 6,
    };

    const appliedTypes = result.appliedOperations.map(o => o.type);
    for (let i = 0; i < appliedTypes.length - 1; i++) {
      const orderA = opOrderMap[appliedTypes[i]] || 99;
      const orderB = opOrderMap[appliedTypes[i + 1]] || 99;
      expect(orderA).toBeLessThanOrEqual(orderB);
    }
  });

  it('TEST 8: Verificare che geometryScoreAfter sia sempre >= geometryScoreBefore', async () => {
    const angleRad = (3.0 * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const skewedBuffer = createSyntheticPdf({
      textTransform: [cosA, sinA, -sinA, cosA, 50, 680],
      text: 'VERIFICA CRITERIO RIGOROSO GEOMETRY SCORE AFTER >= BEFORE',
    });

    const analysisBefore = await analyzer.analyze(skewedBuffer);
    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    const result = await executor.execute({
      document: skewedBuffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    expect(result.geometryScoreAfter).toBeGreaterThanOrEqual(result.geometryScoreBefore);
    expect(result.improvementScore).toBeGreaterThanOrEqual(0);
    expect(result.normalizationReport.isImproved).toBe(true);
  });

  it('TEST 9: Verificare che il documento mantenga invariato il contenuto', async () => {
    const rawText = 'CONTENUTO RIGOROSAMENTE INVARIANTE PEI FACILE 2026';
    const angleRad = (3.5 * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const skewedBuffer = createSyntheticPdf({
      text: rawText,
      textTransform: [cosA, sinA, -sinA, cosA, 60, 700],
    });

    // Read content before normalization using a copy of the buffer
    const pdfDocBefore = await pdfjsLib.getDocument({
      data: new Uint8Array(skewedBuffer).slice(),
      isEvalSupported: false,
    }).promise;
    const pageBefore = await pdfDocBefore.getPage(1);
    const textContentBefore = await pageBefore.getTextContent();
    const extractedBefore = textContentBefore.items
      .map((item: any) => item.str)
      .join(' ')
      .trim();

    expect(extractedBefore).toContain('CONTENUTO RIGOROSAMENTE INVARIANTE');

    const analysisBefore = await analyzer.analyze(skewedBuffer);
    const plan = planner.createPlan({
      fingerprint: analysisBefore.structuralFingerprint,
      geometricAnalysis: analysisBefore.geometricAnalysis,
    });

    const result = await executor.execute({
      document: skewedBuffer,
      plan,
      precomputedAnalysisBefore: analysisBefore,
    });

    // Read content after normalization
    const pdfDocAfter = await pdfjsLib.getDocument({
      data: new Uint8Array(result.document),
      isEvalSupported: false,
    }).promise;
    const pageAfter = await pdfDocAfter.getPage(1);
    const textContentAfter = await pageAfter.getTextContent();
    const extractedAfter = textContentAfter.items
      .map((item: any) => item.str)
      .join(' ')
      .trim();

    // Text content must match 100% exactly
    expect(extractedAfter).toEqual(extractedBefore);
    expect(result.normalizationReport.contentPreserved).toBe(true);
  });
});
