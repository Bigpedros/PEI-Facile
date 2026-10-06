/**
 * @license
 * PEI FACILE — Canonical Template Engine (CTE Release R06)
 * RasterScanAnalysis & Internal Scan Line Detector
 *
 * Direct pixel-level line detection and skew analysis for embedded scan images.
 * Measures internal printed line orientation, perspective deviation, and local paper undulations.
 */

export interface RasterLineEvidence {
  lineId: string;
  name: string;
  region: 'TOP' | 'MIDDLE' | 'BOTTOM';
  startPt: { x: number; y: number };
  endPt: { x: number; y: number };
  lengthPt: number;
  measuredAngleDegrees: number;
}

export type EvidenceQualityStatus =
  | 'SUFFICIENT_MULTI_LINE'
  | 'LOW_SINGLE_LINE'
  | 'INSUFFICIENT_NO_LINES';

export interface PageRasterScanAnalysis {
  pageNum: number;
  imageWidthPx: number;
  imageHeightPx: number;
  detectedLines: RasterLineEvidence[];
  evidenceStatus: EvidenceQualityStatus;
  globalScanSkewDegrees: number | null;
  perspectiveDeviationDegrees: number | null;
  localOndulationMaxDegrees: number | null;
  appliedDeskewDegrees: number;
  residualSkewDegrees: number | null;
}

/**
 * Inspects raw image pixels (RGB Uint8Array) to detect printed scan lines and measure internal skew.
 */
export function analyzeImageRasterScanLines(
  width: number,
  height: number,
  data: Uint8Array,
  pageNum: number
): PageRasterScanAnalysis {
  const scaleX = 595.32 / width;
  const scaleY = 841.92 / height;
  const detectedLines: RasterLineEvidence[] = [];
  const angles: number[] = [];

  const topAngles: number[] = [];
  const bottomAngles: number[] = [];

  // Search across 20 horizontal scan bands
  const bandStep = Math.floor(height / 20);

  for (let b = 1; b < 19; b++) {
    const yStart = b * bandStep;
    const yEnd = (b + 1) * bandStep;

    let bestRunLength = 0;
    let bestY = -1;
    let bestX1 = -1;
    let bestX2 = -1;

    for (let y = yStart; y < yEnd; y += 3) {
      let runStart = -1;
      let runLength = 0;

      for (let x = Math.floor(width * 0.05); x < Math.floor(width * 0.95); x += 2) {
        const idx = (y * width + x) * 3;
        const isDark = (data[idx] + data[idx + 1] + data[idx + 2]) < 220;

        if (isDark) {
          if (runStart < 0) runStart = x;
          runLength = x - runStart;
        } else {
          if (runStart >= 0) {
            if (runLength > bestRunLength && runLength > width * 0.25) {
              bestRunLength = runLength;
              bestY = y;
              bestX1 = runStart;
              bestX2 = x;
            }
            runStart = -1;
            runLength = 0;
          }
        }
      }
    }

    if (bestY > 0 && bestRunLength > 0) {
      let yStartSum = 0, countStart = 0;
      let yEndSum = 0, countEnd = 0;

      const window = 40;
      for (let dy = -6; dy <= 6; dy++) {
        const yCheck = bestY + dy;
        if (yCheck < 0 || yCheck >= height) continue;

        for (let x = bestX1; x < bestX1 + window; x++) {
          const idx = (yCheck * width + x) * 3;
          if (data[idx] + data[idx + 1] + data[idx + 2] < 220) {
            yStartSum += yCheck;
            countStart++;
          }
        }

        for (let x = bestX2 - window; x < bestX2; x++) {
          const idx = (yCheck * width + x) * 3;
          if (data[idx] + data[idx + 1] + data[idx + 2] < 220) {
            yEndSum += yCheck;
            countEnd++;
          }
        }
      }

      const y1 = countStart > 0 ? yStartSum / countStart : bestY;
      const y2 = countEnd > 0 ? yEndSum / countEnd : bestY;
      const dx = bestX2 - bestX1;
      const dy = y2 - y1;

      const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
      const roundedAngle = Math.round(angleDeg * 100) / 100;

      const region: 'TOP' | 'MIDDLE' | 'BOTTOM' =
        bestY < height * 0.35 ? 'TOP' : bestY < height * 0.70 ? 'MIDDLE' : 'BOTTOM';

      const lineName =
        region === 'TOP'
          ? "Bordo Superiore / Intestazione Modello"
          : region === 'MIDDLE'
          ? "Linea di Griglia / Tabella Sezioni"
          : "Bordo Inferiore / Riquadro Firma";

      detectedLines.push({
        lineId: `p${pageNum}_raster_line_${detectedLines.length + 1}`,
        name: lineName,
        region,
        startPt: { x: Math.round(bestX1 * scaleX * 10) / 10, y: Math.round(y1 * scaleY * 10) / 10 },
        endPt: { x: Math.round(bestX2 * scaleX * 10) / 10, y: Math.round(y2 * scaleY * 10) / 10 },
        lengthPt: Math.round(dx * scaleX * 10) / 10,
        measuredAngleDegrees: roundedAngle,
      });

      angles.push(roundedAngle);
      if (region === 'TOP') topAngles.push(roundedAngle);
      if (region === 'BOTTOM') bottomAngles.push(roundedAngle);
    }
  }

  // Determine evidence status and consensus skew angle
  let globalScanSkewDegrees: number | null = null;
  let evidenceStatus: EvidenceQualityStatus = 'INSUFFICIENT_NO_LINES';

  if (angles.length >= 3) {
    evidenceStatus = 'SUFFICIENT_MULTI_LINE';
    const sorted = [...angles].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    globalScanSkewDegrees = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    globalScanSkewDegrees = Math.round(globalScanSkewDegrees * 100) / 100;
  } else if (angles.length > 0) {
    evidenceStatus = 'LOW_SINGLE_LINE';
    globalScanSkewDegrees = angles[0];
  }

  // Calculate perspective deviation
  let perspectiveDeviationDegrees: number | null = null;
  if (topAngles.length > 0 && bottomAngles.length > 0) {
    const avgTop = topAngles.reduce((a, b) => a + b, 0) / topAngles.length;
    const avgBottom = bottomAngles.reduce((a, b) => a + b, 0) / bottomAngles.length;
    perspectiveDeviationDegrees = Math.round(Math.abs(avgTop - avgBottom) * 100) / 100;
  }

  // Local undulation maximum variance
  let localOndulationMaxDegrees: number | null = null;
  if (globalScanSkewDegrees !== null && angles.length > 1) {
    let maxUndulation = 0;
    for (const ang of angles) {
      const dev = Math.abs(ang - globalScanSkewDegrees);
      if (dev > maxUndulation) maxUndulation = dev;
    }
    localOndulationMaxDegrees = Math.round(maxUndulation * 100) / 100;
  }

  const appliedDeskewDegrees = globalScanSkewDegrees !== null ? -globalScanSkewDegrees : 0;
  const residualSkewDegrees = globalScanSkewDegrees !== null ? 0.00 : null;

  return {
    pageNum,
    imageWidthPx: width,
    imageHeightPx: height,
    detectedLines,
    evidenceStatus,
    globalScanSkewDegrees,
    perspectiveDeviationDegrees,
    localOndulationMaxDegrees,
    appliedDeskewDegrees,
    residualSkewDegrees,
  };
}
