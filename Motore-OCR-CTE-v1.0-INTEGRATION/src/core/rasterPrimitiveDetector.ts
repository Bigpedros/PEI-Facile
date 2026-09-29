/**
 * Domain-neutral raster primitive detector.
 * Pure RGBA input: no DOM, React, IndexedDB, or PEI application state.
 * Extracted from CTE-FIX-03E so the same cleanup algorithm can run headlessly.
 */
export interface RasterImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface RasterTextItem {
  x: number;
  yTop: number;
  w: number;
  h: number;
  str?: string;
}

export interface RasterPrimitiveResult {
  lines: Array<{ x1: number; y: number; x2: number; kind?: 'SOLID' | 'DOTTED' }>;
  boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }>;
  verticalLines?: Array<{ x: number; y1: number; y2: number }>;
}

export function detectVisualPrimitivesFromImageData(
  image: RasterImageData,
  pageWidthPt: number,
  pageHeightPt: number,
  textItems?: Array<{ x: number; yTop: number; w: number; h: number; str?: string }>
): {
  lines: Array<{ x1: number; y: number; x2: number; kind?: 'SOLID' | 'DOTTED' }>;
  boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }>;
  verticalLines?: Array<{ x: number; y1: number; y2: number }>;
} {
  const lines: Array<{ x1: number; y: number; x2: number; kind?: 'SOLID' | 'DOTTED' }> = [];
  const verticalLines: Array<{ x: number; y1: number; y2: number }> = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }> = [];

  try {
    const width = image.width;
    const height = image.height;
    if (width <= 0 || height <= 0) return { lines, boxes, verticalLines };
    if (!image.data || image.data.length < width * height * 4) return { lines, boxes, verticalLines };

    const scaleX = width / pageWidthPt;
    const scaleY = height / pageHeightPt;
    const data = image.data;

    // Helper: test if pixel is dark (ink/border)
    const isDarkAt = (px: number, py: number): boolean => {
      if (px < 0 || px >= width || py < 0 || py >= height) return false;
      const idx = (py * width + px) * 4;
      const a = data[idx + 3];
      if (a < 90) return false;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Fast integer luminance: (0.299R + 0.587G + 0.114B) < 155
      return (r * 299 + g * 587 + b * 114) < 155000;
    };

    // Softer ink threshold used only for compact border validation (e.g. faint checkbox outlines).
    // Keeping this separate prevents the main line detector from exploding on antialiased text.
    const isSoftDarkAt = (px: number, py: number): boolean => {
      if (px < 0 || px >= width || py < 0 || py >= height) return false;
      const idx = (py * width + px) * 4;
      const a = data[idx + 3];
      if (a < 90) return false;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      return (r * 299 + g * 587 + b * 114) < 240000;
    };


    // Generic checkbox validation: a checkbox is a mostly-empty quadrilateral,
    // not merely a small rectangle produced by a logo, glyph, or dense graphic.
    const isPlausibleCheckbox = (xPt: number, yPt: number, wPt: number, hPt: number): boolean => {
      if (wPt < 8 || wPt > 28 || hPt < 8 || hPt > 28) return false;
      const ratio = wPt / hPt;
      if (ratio < 0.78 || ratio > 1.28) return false;

      const x0 = Math.round(xPt * scaleX);
      const y0 = Math.round(yPt * scaleY);
      const x1 = Math.round((xPt + wPt) * scaleX);
      const y1 = Math.round((yPt + hPt) * scaleY);
      if (x1 - x0 < 5 || y1 - y0 < 5) return false;

      const darkNear = (x: number, y: number, radius = 2): boolean => {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (isDarkAt(x + dx, y + dy)) return true;
          }
        }
        return false;
      };

      const edgeSamples = 9;
      let top = 0, bottom = 0, left = 0, right = 0;
      for (let i = 0; i < edgeSamples; i++) {
        const t = i / (edgeSamples - 1);
        const x = Math.round(x0 + t * (x1 - x0));
        const y = Math.round(y0 + t * (y1 - y0));
        if (darkNear(x, y0)) top++;
        if (darkNear(x, y1)) bottom++;
        if (darkNear(x0, y)) left++;
        if (darkNear(x1, y)) right++;
      }
      const edgeMin = Math.ceil(edgeSamples * 0.55);
      if (top < edgeMin || bottom < edgeMin || left < edgeMin || right < edgeMin) return false;

      // A real checkbox has four physical corners. Curves/circle fragments can satisfy
      // edge-density checks but usually have no ink at the rectangle corners.
      const cornerRadius = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) * 0.08));
      const cornerHits = [
        darkNear(x0, y0, cornerRadius),
        darkNear(x1, y0, cornerRadius),
        darkNear(x0, y1, cornerRadius),
        darkNear(x1, y1, cornerRadius),
      ].filter(Boolean).length;
      if (cornerHits < 3) return false;

      // Empty checkboxes have a largely white interior. Dense logos/symbols do not.
      let interiorDark = 0;
      let interiorTotal = 0;
      const grid = 7;
      for (let gy = 1; gy <= grid; gy++) {
        for (let gx = 1; gx <= grid; gx++) {
          const fx = gx / (grid + 1);
          const fy = gy / (grid + 1);
          const px = Math.round(x0 + fx * (x1 - x0));
          const py = Math.round(y0 + fy * (y1 - y0));
          interiorTotal++;
          if (isDarkAt(px, py)) interiorDark++;
        }
      }
      return interiorTotal === 0 || interiorDark / interiorTotal <= 0.18;
    };

    // Calculate median text height for proportional thresholds
    let medianTextH = 10;
    if (textItems && textItems.length > 0) {
      const heights = textItems.map((t) => t.h).filter((h) => h >= 4 && h <= 40).sort((a, b) => a - b);
      if (heights.length > 0) {
        medianTextH = heights[Math.floor(heights.length / 2)];
      }
    }

    const minHorizLineLenPx = Math.max(10, Math.round(11 * scaleX));
    const minVertLineLenPx = Math.max(10, Math.round(11 * scaleY));

    const stepY = Math.max(1, Math.round(2 * scaleY));
    const stepX = Math.max(1, Math.round(1.5 * scaleX));

    // 1. Scan horizontal line segments
    const rawH: Array<{ x1: number; y: number; x2: number }> = [];
    for (let py = 4; py < height - 4; py += stepY) {
      let startX = -1;
      for (let px = 4; px < width - 4; px += stepX) {
        if (isDarkAt(px, py)) {
          if (startX === -1) startX = px;
        } else {
          if (startX !== -1) {
            const len = px - startX;
            if (len >= minHorizLineLenPx) {
              rawH.push({
                x1: Math.round((startX / scaleX) * 10) / 10,
                y: Math.round((py / scaleY) * 10) / 10,
                x2: Math.round((px / scaleX) * 10) / 10,
              });
            }
            startX = -1;
          }
        }
      }
      if (startX !== -1 && (width - 4 - startX) >= minHorizLineLenPx) {
        rawH.push({
          x1: Math.round((startX / scaleX) * 10) / 10,
          y: Math.round((py / scaleY) * 10) / 10,
          x2: Math.round(((width - 4) / scaleX) * 10) / 10,
        });
      }
    }

    // Filter raw horizontal segments against Text Mask (Phase 2 & 3)
    const filteredH: Array<{ x1: number; y: number; x2: number }> = [];
    for (const hSeg of rawH) {
      const len = hSeg.x2 - hSeg.x1;
      if (len < 8) continue; // Micro-segment elimination

      if (textItems && textItems.length > 0) {
        // Check if horizontal segment lies strictly inside text body (internal character strokes/serifs)
        const insideTextBody = textItems.some((t) => {
          // If the segment is horizontally contained inside an OCR word box, use a
          // slightly expanded vertical mask. This removes bottom strokes/serifs that
          // sit on the OCR bbox edge, while preserving real form underlines that begin
          // after the label rather than inside its horizontal extent.
          const inY = hSeg.y >= t.yTop - 1.5 && hSeg.y <= t.yTop + t.h + 2;
          const inX = hSeg.x1 >= t.x - 2 && hSeg.x2 <= t.x + t.w + 2;
          return inY && inX;
        });
        if (insideTextBody) continue;
      }
      filteredH.push(hSeg);
    }

    // Merge colinear horizontal segments. Raster stroke thickness can produce the
    // same physical border on several nearby scan rows; use text-height-relative
    // tolerance and bridge modest gaps caused by photocopy noise.
    const hBandTol = Math.max(3, Math.min(10, medianTextH * 0.22));
    const hBridgeGap = Math.max(18, Math.min(60, medianTextH * 1.35));
    const sortedH = [...filteredH].sort((a, b) => (Math.abs(a.y - b.y) <= hBandTol ? a.x1 - b.x1 : a.y - b.y));
    const mergedH: Array<{ x1: number; y: number; x2: number }> = [];
    for (const seg of sortedH) {
      let merged = false;
      for (let i = mergedH.length - 1; i >= 0; i--) {
        const prev = mergedH[i];
        if (seg.y - prev.y > hBandTol) break;
        const overlap = Math.max(0, Math.min(prev.x2, seg.x2) - Math.max(prev.x1, seg.x1));
        const minLen = Math.max(1, Math.min(prev.x2 - prev.x1, seg.x2 - seg.x1));
        const gap = Math.max(0, Math.max(prev.x1, seg.x1) - Math.min(prev.x2, seg.x2));
        if (Math.abs(prev.y - seg.y) <= hBandTol && (overlap / minLen >= 0.55 || gap <= hBridgeGap)) {
          const prevLen = prev.x2 - prev.x1;
          const segLen = seg.x2 - seg.x1;
          prev.x1 = Math.min(prev.x1, seg.x1);
          prev.x2 = Math.max(prev.x2, seg.x2);
          prev.y = Math.round(((prev.y * prevLen + seg.y * segLen) / Math.max(1, prevLen + segLen)) * 10) / 10;
          merged = true;
          break;
        }
      }
      if (!merged) mergedH.push({ ...seg });
    }
    for (const h of mergedH) {
      if (h.x2 - h.x1 >= 8) {
        lines.push(h);
      }
    }

    // 2. Scan vertical line segments (Phase 4 - Critical Cleanup)
    const stepX_v = Math.max(1, Math.round(2 * scaleX));
    const stepY_v = Math.max(1, Math.round(1.5 * scaleY));

    const rawV: Array<{ x: number; y1: number; y2: number }> = [];
    for (let px = 4; px < width - 4; px += stepX_v) {
      let startY = -1;
      for (let py = 4; py < height - 4; py += stepY_v) {
        if (isDarkAt(px, py)) {
          if (startY === -1) startY = py;
        } else {
          if (startY !== -1) {
            const len = py - startY;
            if (len >= minVertLineLenPx) {
              rawV.push({
                x: Math.round((px / scaleX) * 10) / 10,
                y1: Math.round((startY / scaleY) * 10) / 10,
                y2: Math.round((py / scaleY) * 10) / 10,
              });
            }
            startY = -1;
          }
        }
      }
      if (startY !== -1 && (height - 4 - startY) >= minVertLineLenPx) {
        rawV.push({
          x: Math.round((px / scaleX) * 10) / 10,
          y1: Math.round((startY / scaleY) * 10) / 10,
          y2: Math.round(((height - 4) / scaleY) * 10) / 10,
        });
      }
    }

    // Filter vertical segments (Text Mask + Lateral Dark Pixel Density Check)
    const filteredV: Array<{ x: number; y1: number; y2: number }> = [];
    for (const vSeg of rawV) {
      const vLen = vSeg.y2 - vSeg.y1;
      if (vLen < 12) continue; // Micro vertical segment elimination

      // Text Mask Check: Is this vertical segment a character stem ('l', 'I', '1', 't', 'b', 'd', 'M', 'H', etc.)?
      if (textItems && textItems.length > 0) {
        const isGlyphStem = textItems.some((t) => {
          const inX = vSeg.x >= t.x - 3 && vSeg.x <= t.x + t.w + 3;
          const inY = vSeg.y1 >= t.yTop - 2 && vSeg.y2 <= t.yTop + t.h + 2;
          const isGlyphHeight = vLen <= t.h * 1.35;
          return inX && inY && isGlyphHeight;
        });
        if (isGlyphStem) continue;
      }

      // Lateral Dark Pixel Density Check:
      // Real structural vertical dividers have white background on left or right.
      // Character stems inside words ('M', 'W', 'H', 'B', 'E', 'K') have dark pixels 3px to left & right.
      const pxCanvas = Math.round(vSeg.x * scaleX);
      const py1Canvas = Math.round(vSeg.y1 * scaleY);
      const py2Canvas = Math.round(vSeg.y2 * scaleY);
      const samples = Math.max(3, Math.floor((py2Canvas - py1Canvas) / 4));
      let bothSidesDarkCount = 0;

      for (let s = 0; s < samples; s++) {
        const sy = py1Canvas + Math.round((s / (samples - 1 || 1)) * (py2Canvas - py1Canvas));
        const leftDark = isDarkAt(pxCanvas - 3, sy) || isDarkAt(pxCanvas - 4, sy);
        const rightDark = isDarkAt(pxCanvas + 3, sy) || isDarkAt(pxCanvas + 4, sy);
        if (leftDark && rightDark) {
          bothSidesDarkCount++;
        }
      }

      // If > 40% of sampled points have dark pixels on BOTH left and right, it's inside a glyph/word
      if (samples > 0 && bothSidesDarkCount / samples >= 0.4) {
        continue;
      }

      filteredV.push(vSeg);
    }

    // Merge colinear vertical segments
    const sortedV = [...filteredV].sort((a, b) => (Math.abs(a.x - b.x) <= 3.0 ? a.y1 - b.y1 : a.x - b.x));
    const mergedV: Array<{ x: number; y1: number; y2: number }> = [];
    for (const seg of sortedV) {
      const last = mergedV[mergedV.length - 1];
      if (last && Math.abs(last.x - seg.x) <= 3.0 && seg.y1 <= last.y2 + 12) {
        last.y2 = Math.max(last.y2, seg.y2);
      } else {
        mergedV.push({ ...seg });
      }
    }

    // Structural Connection Check:
    // Short vertical lines (< 35pt) must touch or intersect at least one horizontal structural line
    for (const v of mergedV) {
      const len = v.y2 - v.y1;
      if (len >= 35) {
        verticalLines.push(v);
      } else if (len >= 8) {
        const touchesHorizontal = lines.some(
          (h) =>
            h.x1 <= v.x + 6 &&
            h.x2 >= v.x - 6 &&
            (Math.abs(v.y1 - h.y) <= 8 || Math.abs(v.y2 - h.y) <= 8)
        );
        if (touchesHorizontal) {
          verticalLines.push(v);
        }
      }
    }

    // 3. Assemble Boxes / Cells / Checkboxes (Phase 5 & 6)
    const candidateBoxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }> = [];

    // Method A: Intersection of horizontal lines and vertical lines (Grid & Cell Detection)
    for (let i = 0; i < lines.length; i++) {
      const topL = lines[i];
      for (let j = i + 1; j < lines.length; j++) {
        const botL = lines[j];
        const dy = botL.y - topL.y;
        if (dy < 8) continue;
        if (dy > Math.max(350, pageHeightPt * 0.22)) break;

        const xOverlapStart = Math.max(topL.x1, botL.x1);
        const xOverlapEnd = Math.min(topL.x2, botL.x2);
        if (xOverlapEnd - xOverlapStart < 8) continue;

        const matchingV = verticalLines.filter(
          (v) =>
            v.x >= xOverlapStart - 8 &&
            v.x <= xOverlapEnd + 8 &&
            v.y1 <= topL.y + 8 &&
            v.y2 >= botL.y - 8
        );

        if (matchingV.length >= 2) {
          matchingV.sort((a, b) => a.x - b.x);
          for (let k = 0; k < matchingV.length - 1; k++) {
            const vLeft = matchingV[k];
            const vRight = matchingV[k + 1];
            const cellW = vRight.x - vLeft.x;
            if (cellW >= 8 && cellW <= pageWidthPt * 0.96) {
              const hasIntermediateDivider = lines.some((mid) => {
                if (mid.y <= topL.y + 8 || mid.y >= botL.y - 8) return false;
                const overlap = Math.max(0, Math.min(vRight.x, mid.x2) - Math.max(vLeft.x, mid.x1));
                return cellW > 0 && overlap / cellW >= 0.78;
              });
              if (hasIntermediateDivider) continue;
              const isCheckbox = isPlausibleCheckbox(vLeft.x, topL.y, cellW, dy);
              candidateBoxes.push({
                x: Math.round(vLeft.x * 10) / 10,
                y: Math.round(topL.y * 10) / 10,
                w: Math.round(cellW * 10) / 10,
                h: Math.round(dy * 10) / 10,
                isCheckbox,
              });
            }
          }
        }
      }
    }

    // Method A2: grid-consistency reconstruction of atomic cells.
    //
    // Scanned forms often contain a regular table where one vertical divider is faint or
    // temporarily interrupted by text/photocopy noise in a few rows. Method A requires a
    // single vertical segment to span the whole row height, which can miss otherwise obvious
    // atomic cells. Here we learn stable column x-coordinates from repeated physical vertical
    // evidence elsewhere in the same grid and allow them to bridge local gaps when the row
    // still has strong top/bottom borders and at least weak local pixel support. This remains
    // domain-neutral: no PEI labels or document-specific coordinates are used.
    {
      const minGridSpan = Math.max(120, pageWidthPt * 0.24);
      const minCellWidth = Math.max(28, medianTextH * 1.25);
      const minCellHeight = Math.max(14, medianTextH * 0.75);
      const maxCellHeight = Math.max(220, pageHeightPt * 0.12);
      const xTol = Math.max(5, Math.min(12, medianTextH * 0.35));

      const softVerticalCoverage = (xPt: number, y1Pt: number, y2Pt: number): number => {
        if (y2Pt <= y1Pt) return 0;
        const samples = 13;
        let hits = 0;
        const px = Math.round(xPt * scaleX);
        for (let i = 0; i < samples; i++) {
          const t = i / (samples - 1);
          const py = Math.round((y1Pt + (y2Pt - y1Pt) * t) * scaleY);
          let hit = false;
          for (let dx = -5; dx <= 5 && !hit; dx++) hit = isSoftDarkAt(px + dx, py);
          if (hit) hits++;
        }
        return hits / samples;
      };

      const softHorizontalCoverage = (yPt: number, x1Pt: number, x2Pt: number): number => {
        if (x2Pt <= x1Pt) return 0;
        const samples = 17;
        let hits = 0;
        const py = Math.round(yPt * scaleY);
        for (let i = 0; i < samples; i++) {
          const t = i / (samples - 1);
          const px = Math.round((x1Pt + (x2Pt - x1Pt) * t) * scaleX);
          let hit = false;
          for (let dy = -4; dy <= 4 && !hit; dy++) hit = isSoftDarkAt(px, py + dy);
          if (hit) hits++;
        }
        return hits / samples;
      };

      // Scan/photocopy artifacts can split one physical horizontal border into fragments whose
      // detected baselines differ by a few points. For table reconstruction, search a narrow
      // vertical neighborhood and use the best physically observed continuation. This is not a
      // synthetic line: every accepted sample still requires dark pixels in the raster.
      const softHorizontalCoverageNear = (
        yPt: number, x1Pt: number, x2Pt: number, tolerancePt = Math.max(6, medianTextH * 0.35)
      ): number => {
        let best = softHorizontalCoverage(yPt, x1Pt, x2Pt);
        const steps = 4;
        for (let i = 1; i <= steps; i++) {
          const dy = tolerancePt * i / steps;
          best = Math.max(
            best,
            softHorizontalCoverage(yPt - dy, x1Pt, x2Pt),
            softHorizontalCoverage(yPt + dy, x1Pt, x2Pt)
          );
        }
        return best;
      };

      // Cluster repeated vertical segments by x. A stable table divider can be fragmented in y
      // but should recur at nearly the same x-position over several rows.
      const xClusters: Array<{ x: number; totalLen: number; segments: Array<{ y1:number; y2:number }> }> = [];
      for (const v of [...verticalLines].sort((a,b) => a.x - b.x)) {
        let cluster = xClusters.find(c => Math.abs(c.x - v.x) <= xTol);
        const len = Math.max(0, v.y2 - v.y1);
        if (!cluster) {
          cluster = { x: v.x, totalLen: 0, segments: [] };
          xClusters.push(cluster);
        }
        const oldWeight = Math.max(1, cluster.totalLen);
        cluster.x = (cluster.x * oldWeight + v.x * Math.max(1, len)) / (oldWeight + Math.max(1, len));
        cluster.totalLen += len;
        cluster.segments.push({ y1: v.y1, y2: v.y2 });
      }

      const structuralHorizontals = lines
        .filter(h => h.x2 - h.x1 >= minGridSpan)
        .sort((a,b) => a.y - b.y);

      // Collapse thick raster strokes so adjacent scan rows do not generate microscopic cells.
      const gridRows: Array<{ x1:number; x2:number; y:number }> = [];
      for (const h of structuralHorizontals) {
        const last = gridRows[gridRows.length - 1];
        if (last && Math.abs(last.y - h.y) <= Math.max(6, medianTextH * 0.25)) {
          const overlap = Math.max(0, Math.min(last.x2,h.x2) - Math.max(last.x1,h.x1));
          const minLen = Math.max(1, Math.min(last.x2-last.x1,h.x2-h.x1));
          if (overlap/minLen >= 0.65) {
            last.x1 = Math.min(last.x1,h.x1);
            last.x2 = Math.max(last.x2,h.x2);
            last.y = (last.y + h.y) / 2;
            continue;
          }
        }
        gridRows.push({ ...h });
      }

      for (let r = 0; r < gridRows.length - 1; r++) {
        const top = gridRows[r], bottom = gridRows[r+1];
        const rowH = bottom.y - top.y;
        if (rowH < minCellHeight || rowH > maxCellHeight) continue;
        // v0.8 residual recovery is intentionally limited to dense/atomic grid rows. Tall
        // narrative/signature cells must continue to rely on direct four-border evidence.
        const denseAtomicRow = rowH <= Math.max(125, medianTextH * 3.5);
        const detectedOverlapL = Math.max(top.x1, bottom.x1);
        const detectedOverlapR = Math.min(top.x2, bottom.x2);
        const detectedOverlapW = detectedOverlapR - detectedOverlapL;
        const unionL = Math.min(top.x1, bottom.x1);
        const unionR = Math.max(top.x2, bottom.x2);
        if (detectedOverlapW < minGridSpan * 0.55) continue;

        // Grid reconstruction is deliberately limited to repeated row bands. A single pair of
        // long horizontal rules can simply be a section box or narrative container; three or
        // more similarly aligned row intervals are strong physical evidence of a tabular grid.
        let repeatedBandCount = 0;
        for (let q = 0; q < gridRows.length - 1; q++) {
          const qt = gridRows[q], qb = gridRows[q + 1];
          const qh = qb.y - qt.y;
          if (qh < minCellHeight || qh > maxCellHeight) continue;
          const qOverlap = Math.min(qt.x2, qb.x2) - Math.max(qt.x1, qb.x1);
          if (qOverlap < minGridSpan * 0.55) continue;
          const qLeft = Math.min(qt.x1, qb.x1);
          const qRight = Math.max(qt.x2, qb.x2);
          if (Math.abs(qLeft - unionL) <= Math.max(90, pageWidthPt * 0.055) &&
              Math.abs(qRight - unionR) <= Math.max(140, pageWidthPt * 0.085)) {
            repeatedBandCount++;
          }
        }
        if (repeatedBandCount < 3) continue;

        // Horizontal raster strokes are often truncated in one row by photocopy noise. Recover
        // a stable outer table boundary from a recurrent vertical divider when faint horizontal
        // pixels still support the missing tail. This allows later rows of the same grid to keep
        // the same column structure without inventing geometry from whitespace alone.
        let overlapL = detectedOverlapL;
        let overlapR = detectedOverlapR;
        const recurringClusters = xClusters.filter(c => {
          const ys = c.segments.flatMap(seg => [seg.y1, seg.y2]);
          const ySpan = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
          return c.totalLen >= Math.max(rowH * 1.8, medianTextH * 5) && ySpan >= rowH * 2.2;
        });
        const extensionLimit = Math.max(90, pageWidthPt * 0.09);
        for (const c of recurringClusters) {
          if (c.x < overlapL && overlapL - c.x <= extensionLimit) {
            const topCov = denseAtomicRow
              ? softHorizontalCoverageNear(top.y, c.x, overlapL)
              : softHorizontalCoverage(top.y, c.x, overlapL);
            const botCov = denseAtomicRow
              ? softHorizontalCoverageNear(bottom.y, c.x, overlapL)
              : softHorizontalCoverage(bottom.y, c.x, overlapL);
            if (topCov >= 0.18 && botCov >= 0.18) overlapL = c.x;
          } else if (c.x > overlapR && c.x - overlapR <= extensionLimit) {
            const topCov = denseAtomicRow
              ? softHorizontalCoverageNear(top.y, overlapR, c.x)
              : softHorizontalCoverage(top.y, overlapR, c.x);
            const botCov = denseAtomicRow
              ? softHorizontalCoverageNear(bottom.y, overlapR, c.x)
              : softHorizontalCoverage(bottom.y, overlapR, c.x);
            if (topCov >= 0.18 && botCov >= 0.18) overlapR = c.x;
          }
        }
        const overlapW = overlapR - overlapL;
        if (overlapW < minGridSpan) continue;

        // A candidate divider is accepted when it either physically spans a useful part of this
        // row, or is a stable repeated divider with weak-but-real local pixel evidence.
        const candidateXs: number[] = [overlapL, overlapR];
        for (const c of xClusters) {
          if (c.x <= overlapL + 3 || c.x >= overlapR - 3) continue;
          let localCovered = 0;
          for (const seg of c.segments) {
            localCovered += Math.max(0, Math.min(bottom.y,seg.y2) - Math.max(top.y,seg.y1));
          }
          const localRatio = Math.min(1, localCovered / Math.max(1,rowH));
          // A divider can recur in several independent tables at the same x. Recurrence is
          // therefore evaluated locally around this row, never across the whole page.
          const neighborhoodPad = Math.max(rowH * 3, medianTextH * 7);
          let nearbyCovered = 0;
          for (const seg of c.segments) {
            nearbyCovered += Math.max(
              0,
              Math.min(bottom.y + neighborhoodPad, seg.y2) - Math.max(top.y - neighborhoodPad, seg.y1)
            );
          }
          const recurring = nearbyCovered >= Math.max(rowH * 1.8, medianTextH * 5);
          const bridgeAbove = c.segments.some(seg => seg.y2 <= top.y + xTol && seg.y2 >= top.y - neighborhoodPad);
          const bridgeBelow = c.segments.some(seg => seg.y1 >= bottom.y - xTol && seg.y1 <= bottom.y + neighborhoodPad);
          const bridgesGap = bridgeAbove && bridgeBelow;
          const pixelCoverage = softVerticalCoverage(c.x, top.y, bottom.y);

          // v0.8: infer stable column topology only inside this physical table band. A divider
          // may be clearly present in several sibling rows yet locally faint in one row. Count
          // how many similarly aligned row intervals in the same table contain direct segment
          // evidence at this x. Projection is allowed only with local raster support, so a column
          // from another table cannot leak through whitespace.
          let bandEvidenceRows = 0;
          let bandRowCount = 0;
          for (let q = 0; q < gridRows.length - 1; q++) {
            const qt = gridRows[q], qb = gridRows[q + 1];
            const qh = qb.y - qt.y;
            if (qh < minCellHeight || qh > maxCellHeight) continue;
            const qLeft = Math.min(qt.x1, qb.x1);
            const qRight = Math.max(qt.x2, qb.x2);
            if (Math.abs(qLeft - unionL) > Math.max(90, pageWidthPt * 0.055) ||
                Math.abs(qRight - unionR) > Math.max(140, pageWidthPt * 0.085)) continue;
            // Keep the learned topology local in Y as well: gaps larger than roughly six row
            // heights indicate another table/section even if the outer x-bounds coincide.
            const qMid = (qt.y + qb.y) / 2;
            const rowMid = (top.y + bottom.y) / 2;
            const localBandPad = Math.max(rowH * 6, medianTextH * 16);
            if (Math.abs(qMid - rowMid) > localBandPad) continue;
            bandRowCount++;
            let covered = 0;
            for (const seg of c.segments) {
              covered += Math.max(0, Math.min(qb.y, seg.y2) - Math.max(qt.y, seg.y1));
            }
            if (covered / Math.max(1, qh) >= 0.35) bandEvidenceRows++;
          }
          const stableInBand = bandRowCount >= 3 && bandEvidenceRows >= 2;

          // Recurrence may bridge an interrupted divider, but it must not extrapolate a column
          // beyond the end of a table. v0.8 permits band-level recovery only when the missing
          // row itself still contains weak physical pixel evidence.
          if (localRatio >= 0.62 ||
              (recurring && bridgesGap && pixelCoverage >= 0.35) ||
              (denseAtomicRow && stableInBand && pixelCoverage >= 0.18)) candidateXs.push(c.x);
        }

        // Horizontal endpoints can also be genuine side borders even if the vertical scanner
        // fragmented them. Require local soft-pixel support before using them as boundaries.
        const xs = candidateXs
          .sort((a,b)=>a-b)
          .filter((x,i,arr)=>i===0 || Math.abs(x-arr[i-1]) > xTol);
        if (xs.length < 2) continue;

        for (let i = 0; i < xs.length - 1; i++) {
          const x1 = xs[i], x2 = xs[i+1];
          const w = x2 - x1;
          if (w < minCellWidth) continue;
          const leftCov = softVerticalCoverage(x1, top.y, bottom.y);
          const rightCov = softVerticalCoverage(x2, top.y, bottom.y);
          // Outer endpoints can be slightly weaker due clipping/scan fade; internal dividers
          // need stronger evidence unless they are recurrent x-clusters.
          const recurringNearRow = (x:number): boolean => xClusters.some(c => {
            if (Math.abs(c.x-x)>xTol) return false;
            const neighborhoodPad = Math.max(rowH * 3, medianTextH * 7);
            let nearbyCovered = 0;
            for (const seg of c.segments) {
              nearbyCovered += Math.max(
                0,
                Math.min(bottom.y + neighborhoodPad, seg.y2) - Math.max(top.y - neighborhoodPad, seg.y1)
              );
            }
            const recurring = nearbyCovered >= Math.max(rowH * 1.8, medianTextH * 5);
            const bridgeAbove = c.segments.some(seg => seg.y2 <= top.y + xTol && seg.y2 >= top.y - neighborhoodPad);
            const bridgeBelow = c.segments.some(seg => seg.y1 >= bottom.y - xTol && seg.y1 <= bottom.y + neighborhoodPad);
            return recurring && bridgeAbove && bridgeBelow;
          });
          const leftRecurring = recurringNearRow(x1);
          const rightRecurring = recurringNearRow(x2);
          const leftOk = leftCov >= 0.28 || (leftRecurring && leftCov >= 0.25);
          const rightOk = rightCov >= 0.28 || (rightRecurring && rightCov >= 0.25);
          if (!leftOk || !rightOk) continue;

          // Top and bottom lines must physically cover most of the proposed atomic cell.
          const topOverlap = Math.max(0, Math.min(x2,top.x2)-Math.max(x1,top.x1));
          const bottomOverlap = Math.max(0, Math.min(x2,bottom.x2)-Math.max(x1,bottom.x1));
          const topSupport = Math.max(
            topOverlap/w,
            denseAtomicRow ? softHorizontalCoverageNear(top.y, x1, x2) : softHorizontalCoverage(top.y, x1, x2)
          );
          const bottomSupport = Math.max(
            bottomOverlap/w,
            denseAtomicRow ? softHorizontalCoverageNear(bottom.y, x1, x2) : softHorizontalCoverage(bottom.y, x1, x2)
          );
          if (topSupport < 0.62 || bottomSupport < 0.62) continue;

          candidateBoxes.push({
            x: Math.round(x1*10)/10,
            y: Math.round(top.y*10)/10,
            w: Math.round(w*10)/10,
            h: Math.round(rowH*10)/10,
            isCheckbox: isPlausibleCheckbox(x1, top.y, w, rowH),
          });
        }
      }
    }

    // Method B: Rectangular border confirmation from horizontal line pairs with dark edge pixels
    for (let i = 0; i < lines.length; i++) {
      const topL = lines[i];
      for (let j = i + 1; j < lines.length; j++) {
        const botL = lines[j];
        const dy = botL.y - topL.y;
        if (dy < 8) continue;
        if (dy > Math.max(250, pageHeightPt * 0.22)) break;

        const xA = Math.max(topL.x1, botL.x1);
        const xB = Math.min(topL.x2, botL.x2);
        const w = xB - xA;
        if (w < 8) continue;

        const overlapRatio = w / Math.max(1, Math.min(topL.x2 - topL.x1, botL.x2 - botL.x1));
        const startsCompatible = Math.abs(topL.x1 - botL.x1) <= Math.max(24, pageWidthPt * 0.025);
        if (overlapRatio >= 0.72 && startsCompatible) {
          const samples = 7;
          const verticalCoverage = (xPt: number): number => {
            let hits = 0;
            const px = Math.round(xPt * scaleX);
            for (let s = 1; s <= samples; s++) {
              const yPt = topL.y + (s / (samples + 1)) * dy;
              const py = Math.round(yPt * scaleY);
              let hit = false;
              for (let dx = -5; dx <= 5 && !hit; dx++) hit = isSoftDarkAt(px + dx, py);
              if (hit) hits++;
            }
            return hits / samples;
          };

          // Raster text masking can truncate one of the horizontal borders before
          // the true side edge. Recover the physical left/right boundary by testing
          // both endpoints and selecting the one with stronger vertical evidence.
          const leftCandidates = [topL.x1, botL.x1];
          const rightCandidates = [topL.x2, botL.x2];
          const leftScored = leftCandidates.map((x) => ({ x, cov: verticalCoverage(x) })).sort((a, b) => b.cov - a.cov);
          const rightScored = rightCandidates.map((x) => ({ x, cov: verticalCoverage(x) })).sort((a, b) => b.cov - a.cov);
          const leftEdge = leftScored[0];
          const rightEdge = rightScored[0];
          if (leftEdge.cov < 0.55 || rightEdge.cov < 0.55 || rightEdge.x - leftEdge.x < 8) continue;

          const bxA = leftEdge.x;
          const bxB = rightEdge.x;
          const boxW = bxB - bxA;

          // Only adjacent physical borders should form a cell. If a strong horizontal
          // border lies between them across most of the same width, the outer pair is
          // a table/container span rather than one fillable cell.
          const hasIntermediateDivider = lines.some((mid) => {
            if (mid.y <= topL.y + 8 || mid.y >= botL.y - 8) return false;
            const overlap = Math.max(0, Math.min(bxB, mid.x2) - Math.max(bxA, mid.x1));
            return boxW > 0 && overlap / boxW >= 0.78;
          });
          if (hasIntermediateDivider) continue;

          const isCheckbox = isPlausibleCheckbox(bxA, topL.y, boxW, dy);
          candidateBoxes.push({
            x: Math.round(bxA * 10) / 10,
            y: Math.round(topL.y * 10) / 10,
            w: Math.round(boxW * 10) / 10,
            h: Math.round(dy * 10) / 10,
            isCheckbox,
          });
        }
      }
    }

    // Method C: faint checkbox recovery.
    // Some scanned/photocopied forms render checkbox borders much lighter than text/table ink.
    // Detect compact paired horizontal borders with a softer luminance threshold, then require
    // all four borders and a mostly-empty interior. This remains domain-neutral.
    {
      const minSidePt = Math.max(8, medianTextH * 0.48);
      const maxSidePt = Math.max(32, medianTextH * 2.0);
      const minRunPx = Math.max(6, Math.round(minSidePt * scaleX));
      const maxRunPx = Math.max(minRunPx + 2, Math.round(maxSidePt * scaleX));
      const rowStep = Math.max(1, Math.round(1.5 * scaleY));
      const xStep = Math.max(1, Math.round(1.0 * scaleX));
      const softH: Array<{ x1: number; x2: number; y: number }> = [];

      for (let py = 3; py < height - 3; py += rowStep) {
        let start = -1;
        let lastDark = -1;
        let gap = 0;
        for (let px = 3; px < width - 3; px += xStep) {
          if (isSoftDarkAt(px, py)) {
            if (start < 0) start = px;
            lastDark = px;
            gap = 0;
          } else if (start >= 0) {
            gap += xStep;
            if (gap > Math.max(2, xStep * 2)) {
              const len = lastDark - start;
              if (len >= minRunPx && len <= maxRunPx) {
                softH.push({ x1: start / scaleX, x2: lastDark / scaleX, y: py / scaleY });
              }
              start = -1;
              lastDark = -1;
              gap = 0;
            }
          }
        }
      }

      const edgeCoverage = (x0: number, y0: number, x1: number, y1: number, horizontal: boolean): number => {
        const samples = 11;
        let dark = 0;
        for (let i = 0; i < samples; i++) {
          const t = i / (samples - 1);
          const px = Math.round((x0 + (x1 - x0) * t) * scaleX);
          const py = Math.round((y0 + (y1 - y0) * t) * scaleY);
          let hit = false;
          // Search a narrow band to tolerate antialiasing/skew.
          for (let d = -2; d <= 2 && !hit; d++) {
            hit = horizontal ? isSoftDarkAt(px, py + d) : isSoftDarkAt(px + d, py);
          }
          if (hit) dark++;
        }
        return dark / samples;
      };

      const overlapsMeaningfulTextStrongly = (x: number, y: number, w: number, h: number): boolean => {
        if (!textItems || textItems.length === 0) return false;
        const area = w * h;
        if (area <= 0) return true;
        return textItems.some((t) => {
          const raw = (t.str || '').trim();
          // OCR often misreads a real empty checkbox as a tiny symbol such as '1)', '[]', '0'.
          // Such short non-alphabetic tokens must not veto strong physical geometry.
          const nonAlphabeticTinyToken = raw.length <= 3 && !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(raw);
          // Empty squares are often OCR'd as one compact letter-like glyph (O, D, C, etc.).
          // Treat a one/two-character compact token as OCR noise only when its bbox is
          // approximately the size of the candidate square; this does not exempt normal words.
          const compactGlyphToken = raw.length <= 2 &&
            t.w <= w * 1.9 && t.h <= h * 1.9 &&
            t.w >= w * 0.35 && t.h >= h * 0.35;
          const checkboxLikeOcrNoise = nonAlphabeticTinyToken || compactGlyphToken;
          if (checkboxLikeOcrNoise) return false;
          const ix1 = Math.max(x, t.x);
          const iy1 = Math.max(y, t.yTop);
          const ix2 = Math.min(x + w, t.x + t.w);
          const iy2 = Math.min(y + h, t.yTop + t.h);
          if (ix2 <= ix1 || iy2 <= iy1) return false;
          return ((ix2 - ix1) * (iy2 - iy1)) / area >= 0.35;
        });
      };

      for (let i = 0; i < softH.length; i++) {
        const top = softH[i];
        const topW = top.x2 - top.x1;
        for (let j = i + 1; j < softH.length; j++) {
          const bottom = softH[j];
          const hPt = bottom.y - top.y;
          if (hPt < minSidePt) continue;
          if (hPt > maxSidePt) break;
          const bottomW = bottom.x2 - bottom.x1;
          const wPt = (topW + bottomW) / 2;
          if (wPt < minSidePt || wPt > maxSidePt) continue;
          const ratio = wPt / hPt;
          if (ratio < 0.68 || ratio > 1.45) continue;
          const x = (top.x1 + bottom.x1) / 2;
          if (Math.abs(top.x1 - bottom.x1) > 4 || Math.abs(top.x2 - bottom.x2) > 4) continue;
          if (overlapsMeaningfulTextStrongly(x, top.y, wPt, hPt)) continue;

          const topCov = edgeCoverage(x, top.y, x + wPt, top.y, true);
          const bottomCov = edgeCoverage(x, bottom.y, x + wPt, bottom.y, true);
          const leftCov = edgeCoverage(x, top.y, x, bottom.y, false);
          const rightCov = edgeCoverage(x + wPt, top.y, x + wPt, bottom.y, false);
          if (topCov < 0.55 || bottomCov < 0.55 || leftCov < 0.55 || rightCov < 0.55) continue;

          // Interior must remain mostly blank.
          let darkInterior = 0;
          let totalInterior = 0;
          for (let gy = 1; gy <= 5; gy++) {
            for (let gx = 1; gx <= 5; gx++) {
              const px = Math.round((x + (gx / 6) * wPt) * scaleX);
              const py = Math.round((top.y + (gy / 6) * hPt) * scaleY);
              totalInterior++;
              if (isSoftDarkAt(px, py)) darkInterior++;
            }
          }
          if (totalInterior && darkInterior / totalInterior > 0.32) continue;

          candidateBoxes.push({
            x: Math.round(x * 10) / 10,
            y: Math.round(top.y * 10) / 10,
            w: Math.round(wPt * 10) / 10,
            h: Math.round(hPt * 10) / 10,
            isCheckbox: true,
          });
        }
      }
    }

    // 4. Recover dotted / leader underlines after box assembly so they cannot become table
    // borders. Forms frequently use "........" instead of a continuous rule. The detector
    // searches for repeated short dark runs on one baseline outside OCR text bodies, requiring
    // enough periodic components and a mostly-white span. This is domain-neutral and does not
    // inspect any label vocabulary.
    {
      const dottedCandidates: Array<{ x1:number; y:number; x2:number }> = [];
      const rowStep = Math.max(1, Math.round(1.5 * scaleY));
      const xStep = Math.max(1, Math.round(1.0 * scaleX));
      const maxDotRunPx = Math.max(4, Math.round(7 * scaleX));
      const maxGapPx = Math.max(4, Math.round(10 * scaleX));
      const minSpanPx = Math.max(45, Math.round(Math.max(42, medianTextH * 2.4) * scaleX));

      const insideTextBodyPx = (px:number, py:number): boolean => {
        if (!textItems || textItems.length === 0) return false;
        const xPt = px / scaleX, yPt = py / scaleY;
        return textItems.some(t =>
          xPt >= t.x - 2 && xPt <= t.x + t.w + 2 &&
          yPt >= t.yTop - 2 && yPt <= t.yTop + t.h + 2
        );
      };

      for (let py = 4; py < height - 4; py += rowStep) {
        const runs: Array<{a:number;b:number}> = [];
        let start = -1;
        for (let px = 4; px < width - 4; px += xStep) {
          const dark = !insideTextBodyPx(px, py) && isDarkAt(px, py);
          if (dark) {
            if (start < 0) start = px;
          } else if (start >= 0) {
            const end = px - xStep;
            if (end - start + xStep <= maxDotRunPx) runs.push({a:start,b:end});
            start = -1;
          }
        }
        if (runs.length < 5) continue;

        let cStart = 0;
        for (let i = 1; i <= runs.length; i++) {
          const breakCluster = i === runs.length || runs[i].a - runs[i-1].b > maxGapPx;
          if (!breakCluster) continue;
          const cluster = runs.slice(cStart, i);
          cStart = i;
          if (cluster.length < 5) continue;
          const span = cluster[cluster.length-1].b - cluster[0].a;
          if (span < minSpanPx) continue;
          const ink = cluster.reduce((sum,r)=>sum + (r.b-r.a+1),0);
          const fill = ink / Math.max(1,span);
          if (fill < 0.06 || fill > 0.58) continue;
          dottedCandidates.push({
            x1: Math.round((cluster[0].a/scaleX)*10)/10,
            y: Math.round((py/scaleY)*10)/10,
            x2: Math.round((cluster[cluster.length-1].b/scaleX)*10)/10,
          });
        }
      }

      // Dots have thickness too; collapse neighboring raster rows into one canonical baseline.
      dottedCandidates.sort((a,b)=>a.y-b.y || a.x1-b.x1);
      const mergedDots: Array<{x1:number;y:number;x2:number}> = [];
      const yTol = Math.max(3, Math.min(8, medianTextH * 0.22));
      for (const d of dottedCandidates) {
        const prev = mergedDots[mergedDots.length-1];
        if (prev && Math.abs(prev.y-d.y)<=yTol) {
          const overlap = Math.max(0,Math.min(prev.x2,d.x2)-Math.max(prev.x1,d.x1));
          const minLen = Math.max(1,Math.min(prev.x2-prev.x1,d.x2-d.x1));
          if (overlap/minLen >= 0.55) {
            prev.x1=Math.min(prev.x1,d.x1); prev.x2=Math.max(prev.x2,d.x2); prev.y=(prev.y+d.y)/2;
            continue;
          }
        }
        mergedDots.push({...d});
      }
      for (const d of mergedDots) {
        const duplicateSolid = lines.some(h => Math.abs(h.y-d.y)<=yTol && Math.max(0,Math.min(h.x2,d.x2)-Math.max(h.x1,d.x1))/Math.max(1,d.x2-d.x1)>=0.70);
        if (!duplicateSolid) lines.push({ ...d, kind: 'DOTTED' });
      }
    }

    // Deduplicate candidate boxes. Reject tall, very narrow non-checkbox fragments unless
    // they recur as a genuine column over several row bands. OCR glyph stems and scan tears can
    // otherwise form 30-50pt pseudo-cells inside a much larger table cell.
    const repeatedSkinnyColumns = candidateBoxes.filter(b => !b.isCheckbox && b.w < b.h * 0.62).filter((b, _, arr) =>
      arr.filter(o => Math.abs(o.x - b.x) <= Math.max(5, medianTextH * 0.3) && Math.abs(o.w - b.w) <= Math.max(8, b.w * 0.25)).length >= 3
    );
    candidateBoxes.sort((a, b) => b.w * b.h - a.w * a.h);
    for (const cand of candidateBoxes) {
      if (!cand.isCheckbox && cand.w < cand.h * 0.62) {
        const repeated = repeatedSkinnyColumns.some(o => Math.abs(o.x-cand.x) <= Math.max(5, medianTextH*0.3) && Math.abs(o.w-cand.w) <= Math.max(8,cand.w*0.25));
        if (!repeated) continue;
      }
      if (cand.x < 0 || cand.y < 0 || cand.x + cand.w > pageWidthPt + 2 || cand.y + cand.h > pageHeightPt + 2) {
        continue;
      }
      const duplicate = boxes.some((existing) => {
        const x1 = Math.max(cand.x, existing.x);
        const y1 = Math.max(cand.y, existing.y);
        const x2 = Math.min(cand.x + cand.w, existing.x + existing.w);
        const y2 = Math.min(cand.y + cand.h, existing.y + existing.h);
        if (x2 <= x1 || y2 <= y1) return false;
        const inter = (x2 - x1) * (y2 - y1);
        const union = cand.w * cand.h + existing.w * existing.h - inter;
        return union > 0 && inter / union >= 0.55;
      });
      if (!duplicate) {
        boxes.push(cand);
      }
    }
  } catch {
    // Non-fatal if canvas pixels cannot be accessed
  }

  return { lines, boxes, verticalLines };
}
