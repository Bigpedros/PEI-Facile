import type { FieldGeometry } from '../data/geometry/types';
import type { HybridDetectionResult, UnresolvedPotentialLabel } from '../core/canonical-template-engine/geometry/hybridDetectionEngine';
import {
  OCR_CTE_CONTRACT_VERSION,
  OCR_CTE_DIAGNOSTIC_SCHEMA_VERSION,
  OCR_CTE_ENGINE_NAME,
  OCR_CTE_ENGINE_VERSION,
} from './version';

export interface PrimitiveCountSummary {
  horizontalLines: number;
  verticalLines: number;
  boxes: number;
  checkboxes: number;
}

export interface HybridCountSummary {
  totalRegionsDetected: number;
  fillableFieldsCount: number;
  emptyCellsCount: number;
  partialCellsCount: number;
  underlineFieldsCount: number;
  checkboxesCount: number;
  headerCellsCount: number;
  structuralOnlyCount: number;
  nonFillableGraphicsCount: number;
  unresolvedCount: number;
  unresolvedPotentialLabelsCount: number;
}

export interface EnginePageDiagnostics {
  schemaVersion: string;
  contractVersion: string;
  engine: {
    name: string;
    version: string;
  };
  source?: string;
  pageNumber: number;
  pageWidthPt: number;
  pageHeightPt: number;
  textItemsCount: number;
  primitiveCounts: PrimitiveCountSummary;
  hybridDiagnostics: HybridCountSummary;
  authoritativeFields: FieldGeometry[];
  unresolvedPotentialLabels: UnresolvedPotentialLabel[];
  /** Detailed classification trace. Stable enough for diagnostics, not required by clients. */
  results?: HybridDetectionResult[];
}

export interface EngineDocumentDiagnostics {
  schemaVersion: string;
  contractVersion: string;
  engine: {
    name: string;
    version: string;
  };
  source?: string;
  pageCount: number;
  pages: EnginePageDiagnostics[];
}

export function createDiagnosticEnvelopeBase() {
  return {
    schemaVersion: OCR_CTE_DIAGNOSTIC_SCHEMA_VERSION,
    contractVersion: OCR_CTE_CONTRACT_VERSION,
    engine: {
      name: OCR_CTE_ENGINE_NAME,
      version: OCR_CTE_ENGINE_VERSION,
    },
  } as const;
}
