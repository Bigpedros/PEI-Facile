export type OcrCteErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_INPUT'
  | 'PDF_TOOL_UNAVAILABLE'
  | 'OCR_TOOL_UNAVAILABLE'
  | 'RASTERIZATION_FAILED'
  | 'OCR_FAILED'
  | 'GEOMETRY_FAILED'
  | 'SEMANTIC_ADAPTER_FAILED'
  | 'INTERNAL_ERROR';

export interface OcrCteErrorDetails {
  stage?: 'INPUT' | 'RASTERIZE' | 'OCR' | 'GEOMETRY' | 'HEURISTIC' | 'SEMANTIC' | 'OUTPUT';
  pageNumber?: number;
  causeName?: string;
  causeMessage?: string;
  recoverable?: boolean;
  [key: string]: unknown;
}

export class OcrCteEngineError extends Error {
  readonly code: OcrCteErrorCode;
  readonly details: OcrCteErrorDetails;

  constructor(code: OcrCteErrorCode, message: string, details: OcrCteErrorDetails = {}) {
    super(message);
    this.name = 'OcrCteEngineError';
    this.code = code;
    this.details = details;
  }
}

export function normalizeEngineError(error: unknown, fallbackCode: OcrCteErrorCode = 'INTERNAL_ERROR'): OcrCteEngineError {
  if (error instanceof OcrCteEngineError) return error;
  const causeName = error instanceof Error ? error.name : typeof error;
  const causeMessage = error instanceof Error ? error.message : String(error);
  return new OcrCteEngineError(fallbackCode, causeMessage || 'Unknown engine error', {
    causeName,
    causeMessage,
    recoverable: false,
  });
}
