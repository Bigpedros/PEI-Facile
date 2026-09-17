/**
 * @license
 * PEI FACILE — Template Schema & Production Surface Types (Phase 1C R01)
 * Formal specification for persistent template schemas, field typing, overflow policies,
 * and multi-mode document surfaces (EDIT, PREVIEW, PRINT).
 */

import type { SchoolOrder, PeiDocument } from '../types/pei';
import type { ModelGeometry, PageGeometry } from '../data/geometry/types';

export type TemplateFieldType =
  | 'TEXT_SHORT'
  | 'TEXT_LONG'
  | 'DATE'
  | 'NUMBER'
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'TABLE'
  | 'STATIC_OR_NON_EDITABLE'
  | 'OTHER';

export type FieldOverflowPolicy = 'RIGID' | 'CONTINUABLE' | 'EXPANDABLE_OR_TABULAR';

export type TemplateFieldStatus =
  | 'CANDIDATE'
  | 'AUTO_VERIFIED'
  | 'MANUAL_VERIFIED'
  | 'REJECTED';

/**
 * Lifecycle states for custom and ministerial template calibration.
 * Strict Phase 1C policy:
 * Only templates with calibrationStatus === 'CALIBRATED' are permitted in production compilation.
 */
export type TemplateCalibrationStatus =
  | 'ACQUIRED'
  | 'AUTO_ANALYZED'
  | 'REVIEW_REQUIRED'
  | 'CALIBRATED'
  | 'ARCHIVED';

export type GeometryValidationStatus = 'PASS' | 'FAIL' | 'NOT_RUN';

/**
 * Strict audit requirement: Automated unit tests passing DOES NOT equal human visual review.
 * Stored explicitly and independently.
 */
export type VisualReviewStatus = 'REQUIRED' | 'IN_PROGRESS' | 'COMPLETED';

export interface TemplateFieldGeometry {
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}

export interface TemplateSchemaField {
  templateFieldId: string;
  pageNumber: number;
  geometry: TemplateFieldGeometry;
  label: string;
  fieldType: TemplateFieldType;
  required: boolean;
  overflowPolicy: FieldOverflowPolicy;
  status: TemplateFieldStatus;
  sourceEvidence?: string;
  sectionId?: string; // Associated PEI section when applicable
  options?: string[]; // Allowed options for SINGLE_CHOICE / MULTI_CHOICE
  placeholder?: string;
  defaultValue?: any;
}

export interface TemplateSchema {
  schemaId: string;
  templateId: string;
  sourceSha256: string;
  sourcePdfFileName: string;
  version: string;
  schoolOrder?: SchoolOrder;
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    widthPt: number;
    heightPt: number;
  }>;
  fields: TemplateSchemaField[];
  calibrationStatus: TemplateCalibrationStatus;
  geometryValidationStatus: GeometryValidationStatus;
  visualReviewStatus: VisualReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export type DocumentSurfaceMode = 'EDIT' | 'PREVIEW' | 'PRINT';

export interface DocumentSurfaceProps {
  document: PeiDocument;
  templateId: string;
  modelName?: string;
  schoolOrder: SchoolOrder;
  sourcePdfUrl?: string;
  sourcePdfBinary?: Uint8Array | null;
  geometryMapping?: ModelGeometry | null;
  templateSchema?: TemplateSchema | null;
  mode: DocumentSurfaceMode;
  zoomScale: number;
  pageNumber?: number; // Single page render (Compilazione)
  showAllPages?: boolean; // Continuous render (Anteprima / Print)
  activeFieldId?: string;
  onFieldFocus?: (fieldId: string) => void;
  onFieldValueChange?: (fieldId: string, value: any) => void;
  className?: string;
}

export type DocumentSurfaceErrorType =
  | 'TEMPLATE_SOURCE_MISSING'
  | 'MODEL_CALIBRATION_REQUIRED'
  | 'SHA_MISMATCH'
  | 'SCHEMA_MISSING';
