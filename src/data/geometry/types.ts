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
  | 'MANUAL_VERIFIED';

export type FieldGeometryStatus = 'MAPPED' | 'UNMAPPED' | 'REVIEW_REQUIRED';

export interface FieldGeometry {
  fieldId: string;
  label?: string;
  pageNumber: number;
  /** Distance from left edge of PDF page in standard points (72 pt = 1 inch, A4 width = 595.32 pt) */
  xPt: number;
  /** Distance from top edge of PDF page in standard points (A4 height = 841.92 pt) */
  yPt: number;
  /** Width in standard points */
  widthPt: number;
  /** Height in standard points */
  heightPt: number;
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
