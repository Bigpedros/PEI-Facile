import type { RawTextItem } from './fieldCandidateClustering';
import type { RasterTextItem } from './rasterPrimitiveDetector';

export interface OcrWordItem extends RasterTextItem {
  confidence?: number;
}

export interface TextReconstructionOptions {
  sameLineTolerancePt?: number;
  maxWordGapPt?: number;
  overlapTolerancePt?: number;
}

function normalizeToken(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function unionItems(items: OcrWordItem[]): RawTextItem {
  const left = Math.min(...items.map((x) => x.x));
  const top = Math.min(...items.map((x) => x.yTop));
  const right = Math.max(...items.map((x) => x.x + x.w));
  const bottom = Math.max(...items.map((x) => x.yTop + x.h));
  const confidences = items.map((x) => x.confidence).filter((x): x is number => Number.isFinite(x));
  return {
    x: left,
    yTop: top,
    w: right - left,
    h: bottom - top,
    str: items.map((x) => normalizeToken(x.str || '')).filter(Boolean).join(' '),
    confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined,
  };
}

/** Merge OCR word streams from different page-segmentation passes.
 * Near-identical observations are de-duplicated and the higher-confidence word wins.
 * This lets sparse-text passes recover table labels missed by block OCR without
 * duplicating the semantic stream.
 */
export function mergeOcrWordStreams(streams: OcrWordItem[][]): OcrWordItem[] {
  const all = streams.flat().filter((w) => normalizeToken(w.str || '').length > 0 && w.w > 0 && w.h > 0);
  const out: OcrWordItem[] = [];
  const norm = (s: string) => normalizeToken(s).toLocaleLowerCase();
  const iou = (a: OcrWordItem, b: OcrWordItem) => {
    const l = Math.max(a.x, b.x), t = Math.max(a.yTop, b.yTop);
    const r = Math.min(a.x + a.w, b.x + b.w), bot = Math.min(a.yTop + a.h, b.yTop + b.h);
    const inter = Math.max(0, r - l) * Math.max(0, bot - t);
    const union = a.w * a.h + b.w * b.h - inter;
    return union > 0 ? inter / union : 0;
  };
  for (const word of all.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
    const duplicate = out.findIndex((x) => {
      const sameText = norm(x.str) === norm(word.str);
      const cx = Math.abs((x.x + x.w / 2) - (word.x + word.w / 2));
      const cy = Math.abs((x.yTop + x.h / 2) - (word.yTop + word.h / 2));
      const scale = Math.max(4, Math.min(x.h, word.h) * 0.55);
      return (sameText && cx <= Math.max(scale, Math.min(x.w, word.w) * 0.22) && cy <= scale) || iou(x, word) >= 0.68;
    });
    if (duplicate < 0) out.push({ ...word, str: normalizeToken(word.str) });
  }
  return out.sort((a, b) => a.yTop - b.yTop || a.x - b.x);
}

/**
 * Reconstructs one non-overlapping semantic text stream from word-level OCR.
 * Unlike the old PEI runtime path, it does NOT concatenate words + phrases into
 * the same list, preventing labels such as "PEI PEI PROVVISORIO PROVVISORIO".
 */
export function reconstructSemanticText(
  words: OcrWordItem[],
  options: TextReconstructionOptions = {}
): RawTextItem[] {
  const usable = words
    .filter((w) => normalizeToken(w.str || '').length > 0 && w.w > 0 && w.h > 0)
    .map((w) => ({ ...w, str: normalizeToken(w.str || '') }))
    .sort((a, b) => a.yTop - b.yTop || a.x - b.x);

  if (!usable.length) return [];

  const heights = usable.map((w) => w.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 18;
  const sameLineTolerance = options.sameLineTolerancePt ?? Math.max(5, medianH * 0.42);
  const maxWordGap = options.maxWordGapPt ?? Math.max(18, medianH * 1.15);
  const overlapTolerance = options.overlapTolerancePt ?? Math.max(2, medianH * 0.12);

  const rows: OcrWordItem[][] = [];
  for (const word of usable) {
    let bestRow: OcrWordItem[] | undefined;
    let bestDistance = Infinity;
    for (const row of rows) {
      const rowCenter = row.reduce((s, x) => s + x.yTop + x.h / 2, 0) / row.length;
      const d = Math.abs(word.yTop + word.h / 2 - rowCenter);
      if (d <= sameLineTolerance && d < bestDistance) {
        bestRow = row;
        bestDistance = d;
      }
    }
    if (bestRow) bestRow.push(word);
    else rows.push([word]);
  }

  const out: RawTextItem[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let group: OcrWordItem[] = [];
    let lastRight = -Infinity;
    for (const word of row) {
      const gap = word.x - lastRight;
      if (!group.length || (gap >= -overlapTolerance && gap <= maxWordGap)) {
        group.push(word);
      } else {
        out.push(unionItems(group));
        group = [word];
      }
      lastRight = Math.max(lastRight, word.x + word.w);
    }
    if (group.length) out.push(unionItems(group));
  }

  return out.sort((a, b) => a.yTop - b.yTop || a.x - b.x);
}
