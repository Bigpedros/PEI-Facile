/**
 * @license
 * PEI FACILE — Dynamic Template Acquisition Engine Types (Phase 1B R01)
 * Canonical specifications for dynamic document intake, field candidates, and calibration.
 */

import type {
  FieldGeometry,
  PageGeometry,
  GeometryDerivationMethod,
  FieldGeometryStatus,
} from '../data/geometry/types';
import type { TemplateCalibrationStatus } from './templateSchemaTypes';

export type TemplateAcquisitionStatus = 'READY' | 'REVIEW_REQUIRED' | 'FAILED';

export interface UnresolvedRegion {
  pageNumber: number;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  evidence: string;
  reason: string;
  confidence: number;
}

export interface CandidateFieldGeometry extends FieldGeometry {
  inputType?: 'checkbox' | 'select';
  options?: string[];
  defaultValue?: string | boolean;
  originalValue?: string | boolean;
  observedText?: string;
  evidence?: string;
  suggestedSectionId?: string;
  fieldType?: any;
  rawAcroFieldType?: string;
  rawAcroFieldName?: string;
  overflowPolicy?: any;
  required?: boolean;
}

import type { PageCoordinateTransform, AcquisitionProgress } from '../types/documentAcquisitionTypes';
import type { RectificationMetrics } from './geometry/geometricRectificationEngine';

export class AcquisitionAbortedError extends Error {
  constructor(message = 'Acquisizione annullata dall’utente.') {
    super(message);
    this.name = 'AcquisitionAbortedError';
  }
}

export interface AcquireTemplateOptions {
  forceReanalysis?: boolean;
  onProgress?: (progress: AcquisitionProgress) => void;
  signal?: AbortSignal;
}

export interface TemplateAcquisitionResult {
  templateId: string;
  sourceFileName: string;
  sourceSha256: string;
  normalizedSha256?: string;
  normalizationSucceeded?: boolean;
  fileSizeBytes: number;
  pageCount: number;
  pages: PageGeometry[];
  geometryCandidates: CandidateFieldGeometry[];
  unmappedRegions: UnresolvedRegion[];
  confidence: number;
  status: TemplateAcquisitionStatus;
  isMinisterialFastPath: boolean;
  warnings: string[];
  docxNotice?: 'DOCX CANONICALIZATION: NOT IMPLEMENTED';
  canonicalDocument?: Uint8Array;
  coordinateTransform?: PageCoordinateTransform & { pageTransforms?: PageCoordinateTransform[] };
  engineUsed?: string;
  globalSkewDegrees?: number;
  perspectiveApplied?: boolean;
  dewarpingMapApplied?: boolean;
  localCurvatureMaxDeviationPx?: number;
  normalizationReport?: any;
  pageMetrics?: RectificationMetrics[];
}

export interface PersistedTemplateRecord {
  templateId: string;
  name: string;
  schoolOrder: string;
  sourceFileName: string;
  sourceSha256: string;
  normalizedSha256?: string;
  normalizationSucceeded?: boolean;
  fileSizeBytes: number;
  pageCount: number;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  calibrationStatus: TemplateCalibrationStatus | 'DRAFT' | 'READY';
  pages: PageGeometry[];
  pdfBinary?: Uint8Array;
  canonicalDocument?: Uint8Array;
  coordinateTransform?: PageCoordinateTransform & { pageTransforms?: PageCoordinateTransform[] };
  engineUsed?: string;
  globalSkewDegrees?: number;
  perspectiveApplied?: boolean;
  dewarpingMapApplied?: boolean;
  localCurvatureMaxDeviationPx?: number;
  normalizationReport?: any;
  pageMetrics?: RectificationMetrics[];
}
