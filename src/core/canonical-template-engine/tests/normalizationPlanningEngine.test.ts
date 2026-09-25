/**
 * Canonical Template Engine (CTE) - Release R05
 * NormalizationPlanningEngine Test Suite
 *
 * Verifies:
 * 1. Documento perfettamente allineato: piano vuoto / nessuna correzione necessaria.
 * 2. Documento inclinato: piano con operazione di Deskew.
 * 3. Documento ruotato: piano con operazione di Rotate.
 * 4. Documento con prospettiva: piano con operazione di Perspective Correction.
 * 5. Documento con traslazione: piano con operazione di Translate.
 * 6. Documento con scala differente: piano con operazione di Scale.
 * 7. Documento con più anomalie: verifica della sequenza coerente e ordinata.
 * 8. Integrazione con PdfDocumentAnalyzer e CanonicalDocumentFingerprint.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NormalizationPlanningEngine } from '../normalization/normalizationPlanningEngine';
import { PdfDocumentAnalyzer } from '../analyzer/pdfDocumentAnalyzer';
import {
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  GeometricAnalysisResult,
  PageMargins,
} from '../types';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from '../../../data/geometry/geometryTransform';

/**
 * Helper to build a mock CanonicalPageFingerprint for planning tests.
 */
function createMockPageFingerprint(options?: Partial<CanonicalPageFingerprint>): CanonicalPageFingerprint {
  return {
    pageIndex: 0,
    pageWidth: A4_WIDTH_PT,
    pageHeight: A4_HEIGHT_PT,
    rotation: 0,
    mediaBox: [0, 0, A4_WIDTH_PT, A4_HEIGHT_PT],
    cropBox: [0, 0, A4_WIDTH_PT, A4_HEIGHT_PT],
    vectorObjectCount: 10,
    rasterImageCount: 0,
    textObjectCount: 50,
    fontFamilies: ['Helvetica'],
    geometryHash: 'pgh_test_123',
    structureHash: 'psh_test_123',
    confidence: 0.98,
    ...options,
  };
}

/**
 * Helper to build a mock GeometricAnalysisResult for planning tests.
 */
function createMockGeometricResult(options?: Partial<GeometricAnalysisResult>): GeometricAnalysisResult {
  const margins: PageMargins = {
    top: 36,
    bottom: 36,
    left: 36,
    right: 36,
  };

  return {
    pageIndex: 0,
    width: A4_WIDTH_PT,
    height: A4_HEIGHT_PT,
    aspectRatio: Math.round((A4_WIDTH_PT / A4_HEIGHT_PT) * 1000) / 1000,
    pageRotation: 0,
    orientation: 'portrait',
    skewAngle: 0,
    perspectiveDeviation: 0,
    perspectiveScore: 100,
    horizontalAlignment: 98,
    verticalAlignment: 98,
    alignmentScore: 98,
    distortionScore: 100,
    marginScore: 98,
    margins,
    deformation: 0,
    translation: { x: 0, y: 0 },
    scale: 1.0,
    symmetry: 100,
    borderConsistency: 100,
    overallGeometryScore: 98,
    confidence: 0.95,
    geometricConfidence: 0.95,
    diagnosticSummary: 'Geometria ottimale.',
    ...options,
  };
}

describe('Canonical Template Engine (CTE) - Release R05 Normalization Planning Engine', () => {
  const engine = new NormalizationPlanningEngine();
  const analyzer = new PdfDocumentAnalyzer();

  it('TEST 1: Documento perfettamente allineato (piano vuoto / nessuna correzione)', () => {
    const pageFp = createMockPageFingerprint();
    const docFp: CanonicalDocumentFingerprint = {
      pageCount: 1,
      pages: [pageFp],
      documentGeometryHash: 'dgh_aligned_1',
      documentStructureHash: 'dsh_aligned_1',
      fingerprint: 'cdfp_aligned_1',
    };
    const geo = createMockGeometricResult();

    const plan = engine.createPlan({
      fingerprint: docFp,
      geometricAnalysis: [geo],
    });

    expect(plan.requiresNormalization).toBe(false);
    expect(plan.totalOperations).toBe(0);
    expect(plan.pagePlans).toHaveLength(1);

    const pagePlan = plan.pagePlans[0];
    expect(pagePlan.requiresCorrection).toBe(false);
    expect(pagePlan.operationSequence).toHaveLength(0);
    expect(pagePlan.rotationCorrection).toBe(0);
    expect(pagePlan.skewCorrection).toBe(0);
    expect(pagePlan.perspectiveCorrection.needed).toBe(false);
    expect(pagePlan.translation.x).toBe(0);
    expect(pagePlan.translation.y).toBe(0);
    expect(pagePlan.scaling.scaleX).toBe(1.0);
    expect(pagePlan.scaling.scaleY).toBe(1.0);
    expect(pagePlan.expectedGeometryScore).toBeGreaterThanOrEqual(98);
    expect(pagePlan.summary).toContain('nessuna correzione necessaria');
  });

  it('TEST 2: Documento inclinato (piano con Deskew)', () => {
    const pageFp = createMockPageFingerprint();
    const docFp: CanonicalDocumentFingerprint = {
      pageCount: 1,
      pages: [pageFp],
      documentGeometryHash: 'dgh_skewed_1',
      documentStructureHash: 'dsh_skewed_1',
      fingerprint: 'cdfp_skewed_1',
    };
    const geo = createMockGeometricResult({
      skewAngle: 3.25,
      distortionScore: 80,
    });

    const plan = engine.createPlan({
      fingerprint: docFp,
      geometricAnalysis: [geo],
    });

    expect(plan.requiresNormalization).toBe(true);
    expect(plan.totalOperations).toBe(1);

    const pagePlan = plan.pagePlans[0];
    expect(pagePlan.requiresCorrection).toBe(true);
    expect(pagePlan.skewCorrection).toBe(-3.25);
    expect(pagePlan.operationSequence).toHaveLength(1);

    const op = pagePlan.operationSequence[0];
    expect(op.type).toBe('deskew');
    expect(op.name).toContain('Deskew');
    expect(op.parameters.skewCorrectionDegrees).toBe(-3.25);
    expect(op.expectedImpact.before).toBe(3.25);
    expect(op.expectedImpact.estimatedAfter).toBe(0);
    expect(pagePlan.expectedGeometryScore).toBe(99.0);
  });

  it('TEST 3: Documento ruotato (piano con Rotate)', () => {
    const pageFp = createMockPageFingerprint({ rotation: 90 });
    const docFp: CanonicalDocumentFingerprint = {
      pageCount: 1,
      pages: [pageFp],
      documentGeometryHash: 'dgh_rotated_1',
      documentStructureHash: 'dsh_rotated_1',
      fingerprint: 'cdfp_rotated_1',
    };
    const geo = createMockGeometricResult({
      pageRotation: 90,
      orientation: 'landscape',
    });

    const plan = engine.createPlan({
      fingerprint: docFp,
      geometricAnalysis: [geo],
    });

    expect(plan.requiresNormalization).toBe(true);

    const pagePlan = plan.pagePlans[0];
    expect(pagePlan.requiresCorrection).toBe(true);
    expect(pagePlan.rotationCorrection).toBe(-90);

    const rotateOp = pagePlan.operationSequence.find(o => o.type === 'rotate');
    expect(rotateOp).toBeDefined();
    expect(rotateOp?.parameters.rotationCorrectionDegrees).toBe(-90);
    expect(rotateOp?.expectedImpact.estimatedAfter).toBe(0);
  });

  it('TEST 4: Documento con prospettiva (piano con Perspective Correction)', () => {
    const pageFp = createMockPageFingerprint();
    const docFp: CanonicalDocumentFingerprint = {
      pageCount: 1,
      pages: [pageFp],
      documentGeometryHash: 'dgh_persp_1',
      documentStructureHash: 'dsh_persp_1',
      fingerprint: 'cdfp_persp_1',
    };
    const geo = createMockGeometricResult({
      perspectiveDeviation: 1.8,
      perspectiveScore: 64,
    });

    const plan = engine.createPlan({
      fingerprint: docFp,
      geometricAnalysis: [geo],
    });

    expect(plan.requiresNormalization).toBe(true);

    const pagePlan = plan.pagePlans[0];
    expect(pagePlan.perspectiveCorrection.needed).toBe(true);
    expect(pagePlan.perspectiveCorrection.deviation).toBe(1.8);

    const perspOp = pagePlan.operationSequence.find(o => o.type === 'perspective');
    expect(perspOp).toBeDefined();
    expect(perspOp?.expectedImpact.before).toBe(64);
    expect(perspOp?.expectedImpact.estimatedAfter).toBe(100);
  });

  it('TEST 5: Documento con traslazione (piano con Translate)', () => {
    const pageFp = createMockPageFingerprint();
    const docFp: CanonicalDocumentFingerprint = {
      pageCount: 1,
      pages: [pageFp],
      documentGeometryHash: 'dgh_trans_1',
      documentStructureHash: 'dsh_trans_1',
      fingerprint: 'cdfp_trans_1',
    };
    const geo = createMockGeometricResult({
      translation: { x: 15.0, y: -20.0 },
    });

    const plan = engine.createPlan({
      fingerprint: docFp,
      geometricAnalysis: [geo],
    });

    expect(plan.requiresNormalization).toBe(true);

    const pagePlan = plan.pagePlans[0];
    expect(pagePlan.translation.x).toBe(-15.0);
    expect(pagePlan.translation.y).toBe(20.0);

    const transOp = pagePlan.operationSequence.find(o => o.type === 'translate');
    expect(transOp).toBeDefined();
    expect(transOp?.parameters.deltaXPt).toBe(-15.0);
    expect(transOp?.parameters.deltaYPt).toBe(20.0);
  });

  it('TEST 6: Documento con scala differente (piano con Scale)', () => {
    const pageFp = createMockPageFingerprint({
      pageWidth: 500,
      pageHeight: 700,
    });
    const docFp: CanonicalDocumentFingerprint = {
      pageCount: 1,
      pages: [pageFp],
      documentGeometryHash: 'dgh_scale_1',
      documentStructureHash: 'dsh_scale_1',
      fingerprint: 'cdfp_scale_1',
    };
    const geo = createMockGeometricResult({
      width: 500,
      height: 700,
      scale: 0.835,
    });

    const plan = engine.createPlan({
      fingerprint: docFp,
      geometricAnalysis: [geo],
    });

    expect(plan.requiresNormalization).toBe(true);

    const pagePlan = plan.pagePlans[0];
    expect(pagePlan.scaling.scaleX).toBeCloseTo(A4_WIDTH_PT / 500, 2);
    expect(pagePlan.scaling.scaleY).toBeCloseTo(A4_HEIGHT_PT / 700, 2);

    const scaleOp = pagePlan.operationSequence.find(o => o.type === 'scale');
    expect(scaleOp).toBeDefined();
    expect(scaleOp?.expectedImpact.before).toBe('500x700');
    expect(scaleOp?.expectedImpact.estimatedAfter).toBe(`${A4_WIDTH_PT}x${A4_HEIGHT_PT}`);
  });

  it('TEST 7: Documento con più anomalie (sequenza ordinata e coerente)', () => {
    const pageFp = createMockPageFingerprint();
    const docFp: CanonicalDocumentFingerprint = {
      pageCount: 1,
      pages: [pageFp],
      documentGeometryHash: 'dgh_multi_1',
      documentStructureHash: 'dsh_multi_1',
      fingerprint: 'cdfp_multi_1',
    };
    const geo = createMockGeometricResult({
      pageRotation: 90,
      skewAngle: 2.5,
      perspectiveDeviation: 1.2,
      perspectiveScore: 76,
      translation: { x: 10, y: 5 },
      width: 550,
      height: 780,
      margins: { top: 36, bottom: 36, left: 120, right: 20 },
      symmetry: 45,
    });

    const plan = engine.createPlan({
      fingerprint: docFp,
      geometricAnalysis: [geo],
    });

    const pagePlan = plan.pagePlans[0];
    const sequenceTypes = pagePlan.operationSequence.map(o => o.type);

    // The sequence must follow the canonical logical order:
    // 1. rotate -> 2. deskew -> 3. perspective -> 4. translate -> 5. scale -> 6. margin_adjustment
    expect(sequenceTypes).toEqual([
      'rotate',
      'deskew',
      'perspective',
      'translate',
      'scale',
      'margin_adjustment',
    ]);

    // Check step numbers are strictly increasing from 1 to 6
    for (let i = 0; i < pagePlan.operationSequence.length; i++) {
      expect(pagePlan.operationSequence[i].step).toBe(i + 1);
    }

    expect(pagePlan.expectedGeometryScore).toBe(99.0);
  });

  it('TEST 8: Integrazione con PdfDocumentAnalyzer e CanonicalDocumentFingerprint', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const buffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const analysis = await analyzer.analyze(buffer);

    // Verify document analysis has normalizationPlan connected
    expect(analysis.normalizationPlan).toBeDefined();
    expect(analysis.normalizationPlan?.totalPages).toBe(12);

    // Verify structural fingerprint has normalizationPlan connected
    expect(analysis.structuralFingerprint.normalizationPlan).toBeDefined();
    expect(analysis.structuralFingerprint.normalizationPlan?.totalPages).toBe(12);

    // Verify that frozen hashes are NOT altered
    expect(analysis.structuralFingerprint.documentGeometryHash.startsWith('dgh_')).toBe(true);
    expect(analysis.structuralFingerprint.documentStructureHash.startsWith('dsh_')).toBe(true);

    // Verify page-level normalization plans
    expect(analysis.pages[0].normalizationPlan).toBeDefined();
    expect(analysis.pages[0].structuralFingerprint.normalizationPlan).toBeDefined();
  });
});
