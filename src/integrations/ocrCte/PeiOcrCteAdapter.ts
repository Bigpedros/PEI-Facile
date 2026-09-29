/**
 * @license
 * PEI FACILE — Motore OCR-CTE v1.0 Adapter
 *
 * Primary adapter linking PEI FACILE to Motore OCR-CTE v1.0.
 * Strictly uses the versioned public API of Motore OCR-CTE v1.0.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Motore OCR-CTE v1.0 is the SINGLE PRIMARY source of automatic geometry.
 * 2. Geometry is derived strictly from observable physical structure.
 * 3. Geometry (bbox, pageNumber) is 100% PRESERVED through engine -> state -> persistence -> renderer.
 * 4. Protected fields (USER_CONFIRMED, MANUAL_CREATED, NATIVE_FORM) are strictly preserved.
 * 5. Diagnostics are READ-ONLY objects for observability.
 * 6. Semantics (semanticKey) assign meaning to observed geometry; they NEVER alter coordinates.
 */

import {
  analyzePage,
  configureEngineSemantics,
  getEngineCapabilities,
  OcrCteEngineError,
  normalizeEngineError,
  type AnalyzePageInput,
  type AnalyzePageOutput,
  type FieldGeometry,
  type EnginePageDiagnostics,
  type RasterImageData,
  type RasterTextItem,
  type RawTextItem,
} from 'motore-ocr-cte';

import type { PageGeometry } from '../../data/geometry/types';
import { suggestSemanticKey } from '../../core/semanticCatalog';
import { getFieldProvenance } from '../../core/assistedFieldDetectionService';

export interface PeiOcrCteDetectionOptions {
  canvasElement?: HTMLCanvasElement | null;
  geometryMaskTextItems?: RasterTextItem[];
  semanticTextItems?: RawTextItem[];
  existingFields?: FieldGeometry[];
  source?: string;
  includeDetailedResults?: boolean;
}

export interface PeiOcrCteAdapterResult {
  fields: FieldGeometry[];
  unresolvedPotentialLabels: any[];
  diagnostics: EnginePageDiagnostics;
  protectedFieldsCount: number;
  newProposalsCount: number;
}

export class PeiOcrCteAdapter {
  private static initialized = false;

  /**
   * Initializes the adapter and registers PEI-specific semantic catalog suggestions.
   * Does NOT alter physical geometry.
   */
  public static init(): void {
    if (this.initialized) return;

    const PEI_PROMPT_KEYWORDS =
      /^(?:anno\s+scolastico|a\.s\.|bambin[oa](?:\s+e\s+nome)?|nome|nominativo|codice\s*fiscale|c\.f\.|nat[oa]|classe|sez(?:ione)?|plesso|sede|scuola|istituto|data|firma|firme|oepac|aec|ore|punti)$/i;

    configureEngineSemantics({
      semanticResolver: (label: string) => suggestSemanticKey(label),
      promptKeywordMatcher: (cleanLabel: string) => PEI_PROMPT_KEYWORDS.test(cleanLabel),
    });

    this.initialized = true;
  }

  /**
   * Retrieves engine capabilities declare by Motore OCR-CTE v1.0.
   */
  public static getCapabilities() {
    return getEngineCapabilities();
  }

  /**
   * Primary page detection entry point for PEI FACILE.
   * Directs page analysis to Motore OCR-CTE v1.0 while enforcing:
   * - BBox & PageNumber coordinate preservation
   * - Protected fields non-destructive persistence
   * - Read-only diagnostics forwarding
   */
  public static detectPageFields(
    pageNumber: number,
    pageWidthPt: number,
    pageHeightPt: number,
    opts: PeiOcrCteDetectionOptions = {}
  ): PeiOcrCteAdapterResult {
    this.init();

    // 1. Convert Canvas to RGBA Image Data or construct page-proportional raster buffer
    const canvas = opts.canvasElement;
    const w = canvas?.width || Math.round(pageWidthPt) || 595;
    const h = canvas?.height || Math.round(pageHeightPt) || 842;
    let rgbaData: Uint8Array;

    if (canvas) {
      try {
        const ctx = canvas.getContext('2d');
        const imgData = ctx?.getImageData(0, 0, w, h);
        rgbaData = imgData ? new Uint8Array(imgData.data.buffer) : new Uint8Array(w * h * 4).fill(255);
      } catch {
        rgbaData = new Uint8Array(w * h * 4).fill(255);
      }
    } else {
      rgbaData = new Uint8Array(w * h * 4).fill(255);
    }

    const image: RasterImageData = {
      width: w,
      height: h,
      data: rgbaData,
    };

    // 2. Build domain-neutral Motore OCR-CTE v1.0 AnalyzePageInput
    const input: AnalyzePageInput = {
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      image,
      geometryMaskTextItems: opts.geometryMaskTextItems,
      semanticTextItems: opts.semanticTextItems,
      source: opts.source || `PEI_FACILE_PAGE_${pageNumber}`,
      includeDetailedResults: opts.includeDetailedResults ?? true,
    };

    // 3. Execute Motore OCR-CTE v1.0 Public API
    let output: AnalyzePageOutput;
    try {
      output = analyzePage(input);
    } catch (err) {
      const normalized = normalizeEngineError(err, 'GEOMETRY_FAILED');
      throw normalized;
    }

    // 4. Extract protected fields from existing state
    const existingFields = opts.existingFields || [];
    const protectedFields = existingFields.filter((f) => {
      const prov = getFieldProvenance(f);
      return prov === 'USER_CONFIRMED' || prov === 'MANUAL_CREATED' || prov === 'NATIVE_FORM';
    });

    // 5. Deduplicate and merge newly proposed fields with protected fields
    const verifiedProposals: FieldGeometry[] = [];

    for (const prop of output.fields) {
      // Coordinate Preservation Invariant Check
      const verifiedField: FieldGeometry = {
        ...prop,
        pageNumber, // Preserved
        xPt: prop.xPt, // Preserved
        yPt: prop.yPt, // Preserved
        widthPt: prop.widthPt, // Preserved
        heightPt: prop.heightPt, // Preserved
      };

      // Ensure no collision with protected fields
      const isProtectedConflict = protectedFields.some((prot) => {
        if (prot.pageNumber !== pageNumber) return false;
        const xOverlap = Math.max(0, Math.min(verifiedField.xPt + verifiedField.widthPt, prot.xPt + prot.widthPt) - Math.max(verifiedField.xPt, prot.xPt));
        const yOverlap = Math.max(0, Math.min(verifiedField.yPt + verifiedField.heightPt, prot.yPt + prot.heightPt) - Math.max(verifiedField.yPt, prot.yPt));
        const inter = xOverlap * yOverlap;
        const minArea = Math.min(verifiedField.widthPt * verifiedField.heightPt, prot.widthPt * prot.heightPt);
        return minArea > 0 && inter / minArea >= 0.5;
      });

      if (!isProtectedConflict) {
        verifiedProposals.push(verifiedField);
      }
    }

    const mergedFields = [...protectedFields, ...verifiedProposals];

    return {
      fields: mergedFields,
      unresolvedPotentialLabels: output.unresolvedPotentialLabels,
      diagnostics: Object.freeze(output.diagnostics), // READ-ONLY diagnostics
      protectedFieldsCount: protectedFields.length,
      newProposalsCount: verifiedProposals.length,
    };
  }
}
