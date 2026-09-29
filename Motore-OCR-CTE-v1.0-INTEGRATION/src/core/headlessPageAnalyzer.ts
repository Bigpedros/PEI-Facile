import { detectVisualPrimitivesFromImageData, type RasterImageData, type RasterTextItem } from './rasterPrimitiveDetector';
import { runHybridDetectionPipeline, type HybridDetectionPipelineOutput } from './canonical-template-engine/geometry/hybridDetectionEngine';
import type { RawLineCandidate, RawRectCandidate, RawTextItem } from './fieldCandidateClustering';

export interface HeadlessPageAnalyzeInput {
  pageNumber: number;
  pageWidthPt: number;
  pageHeightPt: number;
  image: RasterImageData;
  /** Word-level boxes used only as a raster text mask. */
  geometryMaskTextItems?: RasterTextItem[];
  /** Reconstructed/merged text used for label association and semantics. */
  semanticTextItems?: RawTextItem[];
}

export interface HeadlessPageAnalyzeResult {
  primitives: ReturnType<typeof detectVisualPrimitivesFromImageData>;
  rawLines: RawLineCandidate[];
  rawRects: RawRectCandidate[];
  hybrid: HybridDetectionPipelineOutput;
}

/**
 * Domain-neutral headless page pipeline.
 * No DOM, React, IndexedDB or application state is required.
 * Client semantics can be registered through the semantic/prompt adapters before calling.
 */
export function analyzeRasterPage(input: HeadlessPageAnalyzeInput): HeadlessPageAnalyzeResult {
  const maskText = input.geometryMaskTextItems ?? input.semanticTextItems ?? [];
  const semanticText = input.semanticTextItems ?? (input.geometryMaskTextItems ?? []).map((t) => ({
    x: t.x,
    yTop: t.yTop,
    w: t.w,
    h: t.h,
    str: t.str ?? '',
  }));

  const primitives = detectVisualPrimitivesFromImageData(
    input.image,
    input.pageWidthPt,
    input.pageHeightPt,
    maskText
  );

  const rawLines: RawLineCandidate[] = [
    ...primitives.lines.map((line) => ({
      x1: line.x1,
      y: line.y,
      x2: line.x2,
      y2: line.y,
      isVertical: false,
      source: (line.kind === 'DOTTED' ? 'RASTER_DOTTED' : 'RASTER') as 'RASTER_DOTTED' | 'RASTER',
    })),
    ...(primitives.verticalLines ?? []).map((line) => ({
      x1: line.x,
      y: line.y1,
      x2: line.x,
      y2: line.y2,
      isVertical: true,
      source: 'RASTER' as const,
    })),
  ];

  const rawRects: RawRectCandidate[] = primitives.boxes.map((box) => ({
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    isCheckbox: box.isCheckbox,
    source: 'RASTER' as const,
  }));

  const hybrid = runHybridDetectionPipeline({
    pageNumber: input.pageNumber,
    pageWidthPt: input.pageWidthPt,
    pageHeightPt: input.pageHeightPt,
    rawLines,
    rawRects,
    textItems: semanticText,
  });

  return { primitives, rawLines, rawRects, hybrid };
}
