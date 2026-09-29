/**
 * Motore OCR-CTE v1.0 — Stable public surface.
 *
 * Only domain-neutral, versioned integration contracts are exported here.
 * Historical/internal CTE modules remain implementation details and are not
 * part of the v1.0 compatibility promise.
 */
export * from './contracts';
export * from './core/engineApi';
export * from './core/ocrEngine';
export * from './core/pdfIntakeService';
export * from './core/pdfIntakeTypes';
export * from './core/imagePreprocessing';
export * from './core/textReconstruction';
export type { RasterImageData, RasterTextItem } from './core/rasterPrimitiveDetector';
export type { RawTextItem } from './core/fieldCandidateClustering';
export type { FieldGeometry, FieldGeometryStatus, FieldCalibrationStatus, FieldBackgroundMode, GeometryDerivationMethod, LabelAssociationMethod, GeometricExtractionSource, FieldDetectionSource } from './data/geometry/types';
