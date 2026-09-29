/**
 * @license
 * PEI FACILE — Executive Geometry Mapping Types (Phase 1A R01)
 * Canonical coordinate system and data model for ministerial and custom PEI models.
 */

export type GeometryDerivationMethod =
  | 'ACROFORM'
  | 'ANNOTATION'
  | 'VECTOR_BOUNDARY'
  | 'TEXT_ANCHOR'
  | 'TABLE_CELL'
  | 'SPATIAL_EMPTY_REGION'
  | 'GRID_CELL'
  | 'CHECKBOX_BOX'
  | 'VECTOR_BOX'
  | 'VECTOR_LINE'
  | 'MANUAL_VERIFIED';

export type LabelAssociationMethod =
  | 'LEFT_NEIGHBOR'
  | 'RIGHT_NEIGHBOR'
  | 'TOP_HEADER'
  | 'COLUMN_HEADER'
  | 'CONTAINED_PROMPT'
  | 'SAME_ROW'
  | 'CHECKBOX_LABEL'
  | 'UNASSOCIATED';

export type GeometricExtractionSource =
  | 'EMPTY_CELL'
  | 'PARTIAL_CELL'
  | 'UNDERLINE'
  | 'WHITE_REGION'
  | 'CHECKBOX'
  | 'NON_FILLABLE_GRAPHIC';

export type FieldGeometryStatus = 'MAPPED' | 'UNMAPPED' | 'REVIEW_REQUIRED';

export type FieldBackgroundMode = 'TRANSPARENT' | 'OPAQUE_WHITE';

export type FieldCalibrationStatus = 'PROPOSED' | 'CONFIRMED' | 'MODIFIED' | 'REJECTED';

export type FieldDetectionSource =
  | 'PDF_VECTOR'
  | 'TEXT_LAYER'
  | 'ACROFORM'
  | 'GEOMETRY'
  | 'TABLE_STRUCTURE'
  | 'COMBINED';

export interface FieldGeometry {
  fieldId: string;
  label?: string;
  semanticKey?: string | null;
  backgroundMode?: FieldBackgroundMode;
  calibrationStatus?: FieldCalibrationStatus;
  detectionSource?: FieldDetectionSource | string;
  suggestedLabel?: string;
  suggestedSemanticKey?: string | null;
  fieldType?: string;
  isModifiedAfterProposal?: boolean;
  pageNumber: number;
  /** Distance from left edge of PDF page in standard points (72 pt = 1 inch, A4 width = 595.32 pt) */
  xPt: number;
  /** Distance from top edge of PDF page in standard points (A4 height = 841.92 pt) */
  yPt: number;
  /** Width in standard points */
  widthPt: number;
  /** Height in standard points */
  heightPt: number;
  /** Normalized coordinates relative to page width and height (0.0 to 1.0) */
  xNorm?: number;
  yNorm?: number;
  wNorm?: number;
  hNorm?: number;
  /** Physical geometric extraction origin */
  geometrySource?: GeometricExtractionSource;
  /** Text from the official PDF used as spatial reference anchor */
  anchorText: string;
  /** Coordinates of anchor if measured */
  anchorCoordinates?: {
    xPt: number;
    yPt: number;
    widthPt: number;
    heightPt: number;
  };
  derivationMethod: GeometryDerivationMethod;
  /** Score from 0.00 to 1.00 */
  confidence: number;
  status: FieldGeometryStatus;
  /** Explanation if unmapped or requiring review */
  reason?: string;
  geometricConfidence?: number;
  heuristicConfidence?: number;
  labelConfidence?: number;
  semanticConfidence?: number;
  rawGeometricBBox?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  labelAssociationMethod?: LabelAssociationMethod;
}

export interface PageGeometry {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  fields: FieldGeometry[];
}

export interface ModelGeometry {
  schemaVersion: string;
  modelId: string;
  schoolOrder: string;
  modelName: string;
  sourcePdf: string;
  sourcePdfSha256: string;
  totalPages: number;
  pages: PageGeometry[];
}

export interface ViewportCoordinate {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}

export interface PdfBottomLeftCoordinate {
  x: number;
  yBottom: number;
  width: number;
  height: number;
}
