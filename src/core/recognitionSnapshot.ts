import type { PageResult } from './documental/engine/types';
import type { FieldGeometry, PageGeometry } from '../data/geometry/types';
import type { PeiFieldDetectionProfileResult } from './pei-specialization/PeiFieldDetectionProfile';

/** Serializable evidence from a completed recognition, without another copy of the page image. */
export interface RecognitionSnapshot {
  schema: 'PEI_RECOGNITION_SNAPSHOT_V1';
  capturedAt: string;
  origin: 'acquisition' | 'explicit-detection';
  page: Omit<PageResult, 'image'>;
  fields: FieldGeometry[];
  profileDiagnostics?: PeiFieldDetectionProfileResult['diagnostics'];
  secondPassInference?: PageResult['fieldInferenceDiagnostics'];
}

export function captureRecognitionSnapshot(
  page: PageResult,
  fields: FieldGeometry[],
  origin: RecognitionSnapshot['origin'],
  profile?: PeiFieldDetectionProfileResult,
): RecognitionSnapshot {
  const { image: _image, ...evidence } = page;
  // Detach from the engine's mutable results and manual field edits.
  return JSON.parse(JSON.stringify({
    schema: 'PEI_RECOGNITION_SNAPSHOT_V1', capturedAt: new Date().toISOString(),
    origin, page: evidence, fields, profileDiagnostics: profile?.diagnostics,
    secondPassInference: profile?.secondPass?.page.fieldInferenceDiagnostics,
  }));
}

/** No PDF loading, canvas rendering, OCR or inference is allowed in an export. */
export function buildStoredPageDiagnostics(
  pageGeometry: PageGeometry,
  model: { modelId: string; modelName: string; sourcePdfSha256?: string; normalizedPdfSha256?: string },
) {
  const snapshot = pageGeometry.recognitionSnapshot;
  const page = snapshot?.page;
  const sx = page ? pageGeometry.widthPt / page.width : 1;
  const sy = page ? pageGeometry.heightPt / page.height : 1;
  const toField = (f: FieldGeometry) => ({
    fieldId: f.fieldId, label: f.label, semanticKey: f.semanticKey,
    fieldType: f.fieldType, calibrationStatus: f.calibrationStatus,
    bbox: { xPt: f.xPt, yPt: f.yPt, widthPt: f.widthPt, heightPt: f.heightPt },
    confidence: f.confidence, derivationMethod: f.derivationMethod, detectionSource: f.detectionSource,
  });
  return {
    timestamp: new Date().toISOString(), diagnosticSchema: 'PEI_CALIBRATION_SNAPSHOT_V1',
    exportMode: 'STORED_SNAPSHOT',
    recognitionEvidence: {
      availability: snapshot ? 'available' : 'unavailable', capturedAt: snapshot?.capturedAt,
      origin: snapshot?.origin, recognitionExecutedDuringExport: false,
      reason: snapshot ? 'COMPLETED_RECOGNITION_EVIDENCE' : 'LEGACY_MODEL_WITHOUT_SAVED_EVIDENCE',
    },
    document: { modelId: model.modelId, modelName: model.modelName,
      sourcePdfSha256: model.sourcePdfSha256, normalizedPdfSha256: model.normalizedPdfSha256,
      pageNumber: pageGeometry.pageNumber,
      pageWidthPt: pageGeometry.widthPt, pageHeightPt: pageGeometry.heightPt },
    stageTimingsMs: page?.stageTimingsMs, recognitionElapsedMs: page?.elapsedMs,
    ocrReading: page?.ocrReading, secondReader: page?.secondReader ?? snapshot?.profileDiagnostics?.secondReader,
    structuralCoverage: page?.structuralCoverage, fieldAssociations: page?.fieldAssociations,
    fieldInference: { firstPass: page?.fieldInferenceDiagnostics, secondPass: snapshot?.secondPassInference },
    profileDiagnostics: snapshot?.profileDiagnostics,
    textItems: page?.tokens.map(t => ({ text: t.text, x: t.box.x*sx, y: t.box.y*sy,
      width: t.box.width*sx, height: t.box.height*sy, source: t.source })) ?? [],
    rasterBoxes: page?.regions.map(r => ({ ...r, box: { x:r.box.x*sx, y:r.box.y*sy,
      width:r.box.width*sx, height:r.box.height*sy } })) ?? [],
    // Keep the recorded proposal separate from the current, possibly manually edited, state.
    recordedProposedFields: snapshot?.fields.map(toField) ?? null,
    currentFields: pageGeometry.fields.map(toField),
    warnings: page?.warnings ?? [],
    persistedGeometryRevalidation: { snapshotOnly: true, finalFields: pageGeometry.fields.length },
  };
}
