import type { DocumentVariantName, GenericOcrQualityEvaluation } from './imagePreprocessing';

export interface OcrBoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
}

export interface OcrVariantResult {
  variant: DocumentVariantName;
  label: string;
  confidence: number;
  evaluation: GenericOcrQualityEvaluation;
  rawText: string;
  snippet: string;
  durationMs: number;
}

export interface GenericOcrResult {
  schema: 'PEI_FACILE_OCR_CORE_V1';
  input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    rotationDegrees: number;
  };
  selectedVariant: DocumentVariantName;
  confidence: number;
  rawText: string;
  words: OcrWord[];
  variants: OcrVariantResult[];
  durationMs: number;
}

export type EngineProgress = (message: string, percentage: number) => void;
