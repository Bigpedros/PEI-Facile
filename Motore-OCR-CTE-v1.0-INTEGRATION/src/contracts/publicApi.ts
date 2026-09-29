import type { RasterImageData, RasterTextItem } from '../core/rasterPrimitiveDetector';
import type { RawTextItem } from '../core/fieldCandidateClustering';
import type { FieldGeometry } from '../data/geometry/types';
import type { HybridDetectionResult, UnresolvedPotentialLabel } from '../core/canonical-template-engine/geometry/hybridDetectionEngine';
import type { EnginePageDiagnostics } from './diagnostics';

export interface AnalyzePageInput {
  pageNumber: number;
  pageWidthPt: number;
  pageHeightPt: number;
  image: RasterImageData;
  /** Word-level OCR boxes used to prevent glyph strokes becoming geometry. */
  geometryMaskTextItems?: RasterTextItem[];
  /** Reconstructed semantic text items used for label association and semantic adapters. */
  semanticTextItems?: RawTextItem[];
  source?: string;
  includeDetailedResults?: boolean;
}

export interface AnalyzePageOutput {
  fields: FieldGeometry[];
  unresolvedPotentialLabels: UnresolvedPotentialLabel[];
  diagnostics: EnginePageDiagnostics;
  /** Optional detailed trace for calibration/debug tools. */
  results?: HybridDetectionResult[];
}

export interface EngineCapabilities {
  rasterInput: true;
  /** Node-only adapter; requires external pdftoppm/pdfinfo/tesseract binaries. */
  pdfSystemAdapter: 'OPTIONAL_SYSTEM_TOOLS';
  domainNeutralCore: true;
  optionalSemanticAdapter: true;
  physicalGeometryFirst: true;
  supportedPhysicalRegions: readonly ['CLOSED_CELL', 'UNDERLINE', 'CHECKBOX', 'OPEN_STRUCTURE', 'NON_FILLABLE_SHAPE'];
}

export interface EngineSemanticConfiguration {
  semanticResolver?: import('../core/semanticCatalog').SemanticResolver | null;
  promptKeywordMatcher?: import('../core/promptHeuristics').PromptKeywordMatcher | null;
}
