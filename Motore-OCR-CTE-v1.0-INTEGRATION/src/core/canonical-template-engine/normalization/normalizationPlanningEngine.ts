/**
 * Canonical Template Engine (CTE) - Release R05
 * NormalizationPlanningEngine
 *
 * Core Principles:
 * 1. Exclusively Plans: Determines the theoretical sequence of operations to convert a real document into its canonical equivalent.
 * 2. Zero Execution: Does NOT modify PDFs, images, or canvases. Produces strictly a NormalizationPlan.
 * 3. Simulation & Prediction: Estimates expected geometric quality and confidence after hypothetical normalization.
 * 4. Deterministic & Repeatable: Identical inputs produce identical plans and operation sequences.
 */

import {
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  CanonicalTemplate,
  GeometricAnalysisResult,
  DocumentGeometricAnalysis,
  TemplateMatchResult,
  NormalizationPlan,
  PageNormalizationPlan,
  PlannedOperation,
  PerspectiveCorrectionPlan,
  MarginCorrectionPlan,
} from '../types';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from '../../../data/geometry/geometryTransform';

/**
 * Standard thresholds triggering theoretical normalization operations.
 */
export const NORMALIZATION_PLANNING_THRESHOLDS = {
  MIN_SKEW_DEGREES: 0.05,
  MIN_PERSPECTIVE_DEVIATION: 0.1,
  MIN_TRANSLATION_PT: 0.5,
  MIN_SCALE_RATIO_DELTA: 0.005,
  MIN_MARGIN_ASYMMETRY_PT: 5.0,
  TARGET_PAGE_WIDTH_PT: A4_WIDTH_PT,
  TARGET_PAGE_HEIGHT_PT: A4_HEIGHT_PT,
  TARGET_STANDARD_MARGIN_PT: 36.0,
};

export interface CreatePlanOptions {
  fingerprint: CanonicalDocumentFingerprint;
  geometricAnalysis?: DocumentGeometricAnalysis | GeometricAnalysisResult[];
  matchResult?: TemplateMatchResult;
  matchedTemplate?: CanonicalTemplate;
  targetTemplateId?: string;
  targetVersion?: string;
}

/**
 * Engine responsible for designing theoretical geometric normalization plans.
 */
export class NormalizationPlanningEngine {
  /**
   * Plans the normalization sequence for an entire document.
   */
  createPlan(options: CreatePlanOptions): NormalizationPlan {
    const { fingerprint, geometricAnalysis } = options;

    const targetTemplateId =
      options.targetTemplateId ||
      options.matchedTemplate?.id ||
      'CANONICAL_MINISTERIAL_A1';
    const targetVersion =
      options.targetVersion ||
      options.matchedTemplate?.version ||
      options.matchedTemplate?.versione ||
      '1.0.0';

    // Extract page-level geometric analyses
    let pageGeometrics: (GeometricAnalysisResult | undefined)[] = [];
    if (geometricAnalysis) {
      if (Array.isArray(geometricAnalysis)) {
        pageGeometrics = geometricAnalysis;
      } else if (
        'pages' in geometricAnalysis &&
        Array.isArray(geometricAnalysis.pages)
      ) {
        pageGeometrics = geometricAnalysis.pages;
      }
    } else if (fingerprint.geometricAnalysis?.pages) {
      pageGeometrics = fingerprint.geometricAnalysis.pages;
    }

    const totalPages = fingerprint.pageCount || fingerprint.pages.length || 1;
    const pagePlans: PageNormalizationPlan[] = [];

    for (let i = 0; i < totalPages; i++) {
      const pageFp = fingerprint.pages[i];
      const pageGeo = pageGeometrics[i] || pageFp?.geometricAnalysis;
      const pagePlan = this.createPagePlan({
        pageIndex: i,
        pageFingerprint: pageFp,
        geometricAnalysis: pageGeo,
      });
      pagePlans.push(pagePlan);
    }

    const requiresNormalization = pagePlans.some(p => p.requiresCorrection);
    const totalOperations = pagePlans.reduce(
      (acc, p) => acc + p.operationSequence.length,
      0
    );

    const expectedOverallGeometryScore =
      pagePlans.length > 0
        ? Math.round(
            (pagePlans.reduce(
              (acc, p) => acc + p.expectedGeometryScore,
              0
            ) /
              pagePlans.length) *
              100
          ) / 100
        : 100;

    const estimatedOverallConfidence =
      pagePlans.length > 0
        ? Math.round(
            (pagePlans.reduce(
              (acc, p) => acc + p.estimatedConfidence,
              0
            ) /
              pagePlans.length) *
              100
          ) / 100
        : 1.0;

    let summary: string;
    if (!requiresNormalization) {
      summary = `Documento già conforme allo standard canonico: nessuna correzione necessaria (qualità stimata: ${expectedOverallGeometryScore}%).`;
    } else {
      summary = `Piano di normalizzazione generato: ${totalOperations} operazioni pianificate su ${totalPages} pagine per target ${targetTemplateId} v${targetVersion}.`;
    }

    const plan: NormalizationPlan = {
      id: `norm_plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      targetTemplateId,
      targetVersion,
      createdAt: new Date().toISOString(),
      requiresNormalization,
      totalPages,
      pagePlans,
      totalOperations,
      expectedOverallGeometryScore,
      estimatedOverallConfidence,
      summary,
    };

    return plan;
  }

  /**
   * Plans the normalization sequence for a single page.
   */
  createPagePlan(options: {
    pageIndex: number;
    pageFingerprint?: CanonicalPageFingerprint;
    geometricAnalysis?: GeometricAnalysisResult;
    targetWidth?: number;
    targetHeight?: number;
  }): PageNormalizationPlan {
    const { pageIndex, pageFingerprint, geometricAnalysis } = options;

    const targetWidth =
      options.targetWidth || NORMALIZATION_PLANNING_THRESHOLDS.TARGET_PAGE_WIDTH_PT;
    const targetHeight =
      options.targetHeight ||
      NORMALIZATION_PLANNING_THRESHOLDS.TARGET_PAGE_HEIGHT_PT;

    // Derived or provided metrics
    const currentWidth =
      geometricAnalysis?.width || pageFingerprint?.pageWidth || targetWidth;
    const currentHeight =
      geometricAnalysis?.height || pageFingerprint?.pageHeight || targetHeight;
    const currentRotation =
      geometricAnalysis?.pageRotation ?? pageFingerprint?.rotation ?? 0;
    const currentSkew = geometricAnalysis?.skewAngle ?? 0;
    const currentPerspectiveDev =
      geometricAnalysis?.perspectiveDeviation ?? 0;
    const currentPerspectiveScore =
      geometricAnalysis?.perspectiveScore ?? 100;
    const currentTranslation = geometricAnalysis?.translation || { x: 0, y: 0 };
    const currentMargins = geometricAnalysis?.margins || {
      top: 36,
      bottom: 36,
      left: 36,
      right: 36,
    };
    const currentSymmetry = geometricAnalysis?.symmetry ?? 100;
    const currentScore = geometricAnalysis?.overallGeometryScore ?? 98;
    const currentConfidence = geometricAnalysis?.confidence ?? 0.95;

    const operations: PlannedOperation[] = [];
    let stepNumber = 1;

    // 1. ROTATE
    let rotationCorrection = 0;
    if (currentRotation !== 0) {
      rotationCorrection = ((-currentRotation % 360) + 360) % 360;
      if (rotationCorrection > 180) {
        rotationCorrection -= 360;
      }
    }
    if (rotationCorrection !== 0) {
      operations.push({
        step: stepNumber++,
        type: 'rotate',
        name: 'Rotazione Pagina Canonica',
        description: `Rotazione teorica di ${rotationCorrection}° per ripristinare l'orientamento verticale standard.`,
        parameters: { rotationCorrectionDegrees: rotationCorrection },
        expectedImpact: {
          targetMetric: 'pageRotation',
          before: currentRotation,
          estimatedAfter: 0,
        },
      });
    }

    // 2. DESKEW
    let skewCorrection = 0;
    if (
      Math.abs(currentSkew) >=
      NORMALIZATION_PLANNING_THRESHOLDS.MIN_SKEW_DEGREES
    ) {
      skewCorrection = Math.round(-currentSkew * 100) / 100;
      operations.push({
        step: stepNumber++,
        type: 'deskew',
        name: 'Compensazione Inclinazione (Deskew)',
        description: `Correzione teorica dell'angolo di inclinazione di ${skewCorrection.toFixed(2)}°.`,
        parameters: { skewCorrectionDegrees: skewCorrection },
        expectedImpact: {
          targetMetric: 'skewAngle',
          before: currentSkew,
          estimatedAfter: 0,
        },
      });
    }

    // 3. PERSPECTIVE
    const perspectiveCorrection: PerspectiveCorrectionPlan = {
      needed: false,
      deviation: currentPerspectiveDev,
    };
    if (
      currentPerspectiveDev >=
        NORMALIZATION_PLANNING_THRESHOLDS.MIN_PERSPECTIVE_DEVIATION ||
      currentPerspectiveScore < 98
    ) {
      perspectiveCorrection.needed = true;
      perspectiveCorrection.description = `Raddrizzamento prospettico teorico per deviazione trapezoidale di ${currentPerspectiveDev.toFixed(2)}.`;
      perspectiveCorrection.quadrilateralCorners = {
        topLeft: { x: 0, y: 0 },
        topRight: { x: currentWidth, y: 0 },
        bottomLeft: { x: 0, y: currentHeight },
        bottomRight: { x: currentWidth, y: currentHeight },
      };

      operations.push({
        step: stepNumber++,
        type: 'perspective',
        name: 'Raddrizzamento Prospettico (Perspective Correction)',
        description: perspectiveCorrection.description,
        parameters: {
          deviation: currentPerspectiveDev,
          targetPerspectiveScore: 100,
        },
        expectedImpact: {
          targetMetric: 'perspectiveScore',
          before: currentPerspectiveScore,
          estimatedAfter: 100,
        },
      });
    }

    // 4. TRANSLATE
    const translation = {
      x:
        Math.abs(currentTranslation.x) >=
        NORMALIZATION_PLANNING_THRESHOLDS.MIN_TRANSLATION_PT
          ? Math.round(-currentTranslation.x * 100) / 100
          : 0,
      y:
        Math.abs(currentTranslation.y) >=
        NORMALIZATION_PLANNING_THRESHOLDS.MIN_TRANSLATION_PT
          ? Math.round(-currentTranslation.y * 100) / 100
          : 0,
    };
    if (translation.x !== 0 || translation.y !== 0) {
      operations.push({
        step: stepNumber++,
        type: 'translate',
        name: 'Riallineamento Origine Coordinate (Translate)',
        description: `Traslazione teorica di [dx: ${translation.x}, dy: ${translation.y}] pt per allineamento canonico.`,
        parameters: { deltaXPt: translation.x, deltaYPt: translation.y },
        expectedImpact: {
          targetMetric: 'originOffset',
          before: `[${currentTranslation.x}, ${currentTranslation.y}]`,
          estimatedAfter: '[0, 0]',
        },
      });
    }

    // 5. SCALE
    const scaleX = Math.round((targetWidth / currentWidth) * 1000) / 1000;
    const scaleY = Math.round((targetHeight / currentHeight) * 1000) / 1000;
    const scaling = { scaleX, scaleY };

    if (
      Math.abs(scaleX - 1.0) >=
        NORMALIZATION_PLANNING_THRESHOLDS.MIN_SCALE_RATIO_DELTA ||
      Math.abs(scaleY - 1.0) >=
        NORMALIZATION_PLANNING_THRESHOLDS.MIN_SCALE_RATIO_DELTA
    ) {
      operations.push({
        step: stepNumber++,
        type: 'scale',
        name: 'Adattamento Dimensionale Scala Canonica (Scale)',
        description: `Scalatura teorica a formato canonico (sx: ${scaleX.toFixed(3)}, sy: ${scaleY.toFixed(3)}).`,
        parameters: { scaleX, scaleY, targetWidth, targetHeight },
        expectedImpact: {
          targetMetric: 'pageSize',
          before: `${currentWidth}x${currentHeight}`,
          estimatedAfter: `${targetWidth}x${targetHeight}`,
        },
      });
    }

    // 6. MARGIN ADJUSTMENT
    const targetMargin =
      NORMALIZATION_PLANNING_THRESHOLDS.TARGET_STANDARD_MARGIN_PT;
    const marginCorrection: MarginCorrectionPlan = {
      top: Math.round((targetMargin - currentMargins.top) * 10) / 10,
      bottom: Math.round((targetMargin - currentMargins.bottom) * 10) / 10,
      left: Math.round((targetMargin - currentMargins.left) * 10) / 10,
      right: Math.round((targetMargin - currentMargins.right) * 10) / 10,
    };

    const hMarginDiff = Math.abs(currentMargins.left - currentMargins.right);
    const vMarginDiff = Math.abs(currentMargins.top - currentMargins.bottom);

    if (
      currentSymmetry < 85 ||
      hMarginDiff >=
        NORMALIZATION_PLANNING_THRESHOLDS.MIN_MARGIN_ASYMMETRY_PT ||
      vMarginDiff >= NORMALIZATION_PLANNING_THRESHOLDS.MIN_MARGIN_ASYMMETRY_PT
    ) {
      operations.push({
        step: stepNumber++,
        type: 'margin_adjustment',
        name: 'Ribilanciamento Margini Tipografici (Margin Adjustment)',
        description: `Centratura e ribilanciamento teorico dei margini per simmetria canonica.`,
        parameters: { adjustmentsPt: marginCorrection },
        expectedImpact: {
          targetMetric: 'symmetry',
          before: currentSymmetry,
          estimatedAfter: 100,
        },
      });
    }

    const requiresCorrection = operations.length > 0;

    // Simulation of expected quality post-normalization
    let expectedGeometryScore: number;
    let estimatedConfidence: number;
    let summary: string;

    if (!requiresCorrection) {
      expectedGeometryScore = Math.max(currentScore, 98);
      estimatedConfidence = currentConfidence;
      summary = `Pagina ${pageIndex + 1}: conforme allo standard, nessuna correzione necessaria.`;
    } else {
      expectedGeometryScore = 99.0;
      estimatedConfidence =
        Math.round(Math.min(0.99, currentConfidence + 0.03) * 100) / 100;
      summary = `Pagina ${pageIndex + 1}: pianificate ${operations.length} trasformazioni [${operations.map(o => o.type).join(' -> ')}] (qualità prevista: ${expectedGeometryScore}%).`;
    }

    return {
      pageIndex,
      requiresCorrection,
      rotationCorrection,
      skewCorrection,
      perspectiveCorrection,
      translation,
      scaling,
      marginCorrection,
      expectedGeometryScore,
      estimatedConfidence,
      operationSequence: operations,
      summary,
    };
  }
}
