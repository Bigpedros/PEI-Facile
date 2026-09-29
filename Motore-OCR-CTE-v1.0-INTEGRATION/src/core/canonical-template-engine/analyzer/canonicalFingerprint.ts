/**
 * Canonical Template Engine (CTE) - Release R02.1
 * Canonical Structural Fingerprint Generator
 *
 * Core Principles:
 * 1. Geometric & Structural Determinism: Depends purely on layout, vector paths, boxes, and raster profiles.
 * 2. Independent of Compiled Text: Two identical templates filled with different student data produce the exact same fingerprint.
 * 3. Zero OCR, zero semantic interpretation, zero field detection.
 */

import * as pdfjsLib from 'pdfjs-dist';
import {
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  PdfBox,
} from '../types';

/**
 * Computes a deterministic 64-bit FNV-1a hash formatted as a 16-character hex string.
 */
export function computeFnv1a64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch >> 8), 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Represents the operator list returned by page.getOperatorList().
 */
export interface PdfOperatorList {
  fnArray: number[];
  argsArray: any[];
}

/**
 * Parameter payload for constructing a page's structural fingerprint.
 */
export interface PageFingerprintInput {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  mediaBox: PdfBox;
  cropBox: PdfBox;
  operatorList?: PdfOperatorList | null;
  rasterImageCount: number;
  textObjectCount: number;
  fontFamilies: string[];
}

/**
 * Extracts geometric primitives (rectangles, lines, checkboxes, curves) from PDF.js operator list
 * and constructs the canonical geometryHash and structureHash.
 */
export function generatePageStructuralFingerprint(
  input: PageFingerprintInput
): CanonicalPageFingerprint {
  const {
    pageIndex,
    pageWidth,
    pageHeight,
    rotation,
    mediaBox,
    cropBox,
    operatorList,
    rasterImageCount,
    textObjectCount,
    fontFamilies,
  } = input;

  const geomTokens: string[] = [];
  let vectorObjectCount = 0;
  const quadrantCounts = [0, 0, 0, 0]; // Q1 (TL), Q2 (TR), Q3 (BL), Q4 (BR)

  const midX = pageWidth / 2;
  const midY = pageHeight / 2;

  const recordQuadrant = (x: number, y: number) => {
    if (x < midX && y < midY) quadrantCounts[0]++;
    else if (x >= midX && y < midY) quadrantCounts[1]++;
    else if (x < midX && y >= midY) quadrantCounts[2]++;
    else quadrantCounts[3]++;
  };

  if (operatorList && Array.isArray(operatorList.fnArray) && Array.isArray(operatorList.argsArray)) {
    const fns = operatorList.fnArray;
    const args = operatorList.argsArray;

    // Transformation matrix stack tracking
    let ctm = [1, 0, 0, 1, 0, 0];
    const ctmStack: number[][] = [];

    const multiplyCtm = (m: number[]) => {
      ctm = [
        ctm[0] * m[0] + ctm[1] * m[2],
        ctm[0] * m[1] + ctm[1] * m[3],
        ctm[2] * m[0] + ctm[3] * m[2],
        ctm[2] * m[1] + ctm[3] * m[3],
        ctm[4] * m[0] + ctm[5] * m[2] + m[4],
        ctm[4] * m[1] + ctm[5] * m[3] + m[5],
      ];
    };

    const applyCtm = (x: number, y: number): [number, number] => {
      return [
        ctm[0] * x + ctm[2] * y + ctm[4],
        ctm[1] * x + ctm[3] * y + ctm[5],
      ];
    };

    for (let i = 0; i < fns.length; i++) {
      const fn = fns[i];
      const arg = args[i];

      // Matrix transformations
      if (fn === pdfjsLib.OPS.save || fn === 28) {
        ctmStack.push([...ctm]);
      } else if (fn === pdfjsLib.OPS.restore || fn === 29) {
        if (ctmStack.length > 0) {
          ctm = ctmStack.pop()!;
        }
      } else if ((fn === pdfjsLib.OPS.transform || fn === 30) && Array.isArray(arg) && arg.length >= 6) {
        multiplyCtm(arg);
      } else if (fn === pdfjsLib.OPS.constructPath && Array.isArray(arg) && Array.isArray(arg[0])) {
        const subOps = arg[0];
        const coords = arg[1] || [];
        let cIdx = 0;

        for (const op of subOps) {
          vectorObjectCount++;

          if (op === 19 || op === pdfjsLib.OPS.rectangle) {
            // Rectangle
            const rx = coords[cIdx++] || 0;
            const ry = coords[cIdx++] || 0;
            const rw = coords[cIdx++] || 0;
            const rh = coords[cIdx++] || 0;

            const [p1x, p1y] = applyCtm(rx, ry);
            const [p2x, p2y] = applyCtm(rx + rw, ry + rh);

            const minX = Math.round(Math.min(p1x, p2x));
            const minY = Math.round(Math.min(p1y, p2y));
            const widthPt = Math.round(Math.abs(p2x - p1x));
            const heightPt = Math.round(Math.abs(p2y - p1y));

            const isCheckbox = widthPt >= 7 && widthPt <= 26 && heightPt >= 7 && heightPt <= 26;
            const tag = isCheckbox ? 'CB' : 'R';
            geomTokens.push(`${tag}:${minX}:${minY}:${widthPt}:${heightPt}`);
            recordQuadrant(minX + widthPt / 2, minY + heightPt / 2);
          } else if (op === 14 || op === pdfjsLib.OPS.lineTo) {
            // Line
            const lx = coords[cIdx++] || 0;
            const ly = coords[cIdx++] || 0;
            const [tx, ty] = applyCtm(lx, ly);
            const qx = Math.round(tx);
            const qy = Math.round(ty);
            geomTokens.push(`L:${qx}:${qy}`);
            recordQuadrant(qx, qy);
          } else if (op === 13 || op === pdfjsLib.OPS.moveTo) {
            // MoveTo point
            const mx = coords[cIdx++] || 0;
            const my = coords[cIdx++] || 0;
            const [tx, ty] = applyCtm(mx, my);
            const qx = Math.round(tx);
            const qy = Math.round(ty);
            geomTokens.push(`M:${qx}:${qy}`);
          } else if (op === 15 || op === pdfjsLib.OPS.curveTo) {
            // Curve
            const x1 = coords[cIdx++] || 0;
            const y1 = coords[cIdx++] || 0;
            cIdx += 2; // skip control point 2
            const x3 = coords[cIdx++] || 0;
            const y3 = coords[cIdx++] || 0;
            const [tx1, ty1] = applyCtm(x1, y1);
            const [tx3, ty3] = applyCtm(x3, y3);
            geomTokens.push(`C:${Math.round(tx1)}:${Math.round(ty1)}:${Math.round(tx3)}:${Math.round(ty3)}`);
          } else if (op === 18) {
            geomTokens.push('Z');
          }
        }
      } else if (fn === pdfjsLib.OPS.rectangle && Array.isArray(arg) && arg.length >= 4) {
        vectorObjectCount++;
        const [rx, ry, rw, rh] = arg;
        const [p1x, p1y] = applyCtm(rx, ry);
        const [p2x, p2y] = applyCtm(rx + rw, ry + rh);
        const minX = Math.round(Math.min(p1x, p2x));
        const minY = Math.round(Math.min(p1y, p2y));
        const widthPt = Math.round(Math.abs(p2x - p1x));
        const heightPt = Math.round(Math.abs(p2y - p1y));
        geomTokens.push(`R:${minX}:${minY}:${widthPt}:${heightPt}`);
        recordQuadrant(minX + widthPt / 2, minY + heightPt / 2);
      } else if ((fn === pdfjsLib.OPS.stroke || fn === pdfjsLib.OPS.fill || fn === pdfjsLib.OPS.eoFill) && vectorObjectCount === 0) {
        vectorObjectCount++;
      }
    }
  }

  // 1. Build Geometry Hash
  let geometryHash: string;
  if (geomTokens.length > 0) {
    geomTokens.sort();
    const joined = geomTokens.join(';');
    geometryHash = 'gh_' + computeFnv1a64(joined);
  } else if (rasterImageCount > 0) {
    // Pure raster scan without vector paths: geometric bounding canvas
    const rasterGeomDescriptor = `RASTER_SURFACE:${Math.round(pageWidth)}x${Math.round(pageHeight)}:COUNT=${rasterImageCount}`;
    geometryHash = 'gh_' + computeFnv1a64(rasterGeomDescriptor);
  } else {
    // Blank page canvas
    const emptyGeomDescriptor = `EMPTY_PAGE:${Math.round(pageWidth)}x${Math.round(pageHeight)}`;
    geometryHash = 'gh_' + computeFnv1a64(emptyGeomDescriptor);
  }

  // 2. Build Structure Hash
  // Captures layout, dimensions, rotation, boxes, counts and fonts without textual values
  const sortedFonts = Array.from(new Set(fontFamilies)).sort().join(',');
  const structurePayload = [
    `dim:${Math.round(pageWidth)}x${Math.round(pageHeight)}`,
    `rot:${rotation}`,
    `mb:${mediaBox.map(Math.round).join(',')}`,
    `cb:${cropBox.map(Math.round).join(',')}`,
    `vecCount:${vectorObjectCount}`,
    `rasterCount:${rasterImageCount}`,
    `quads:${quadrantCounts.join(',')}`,
    `fonts:${sortedFonts}`,
  ].join('|');
  const structureHash = 'sh_' + computeFnv1a64(structurePayload);

  // 3. Confidence evaluation
  let confidence = 1.0;
  if (vectorObjectCount === 0 && rasterImageCount === 0 && textObjectCount === 0) {
    confidence = 0.5; // Blank or unpopulated page
  } else if (vectorObjectCount > 0 && fontFamilies.length > 0) {
    confidence = 1.0; // High structural certainty
  } else if (vectorObjectCount > 0 || rasterImageCount > 0) {
    confidence = 0.95;
  }

  return {
    pageIndex,
    pageWidth,
    pageHeight,
    rotation,
    mediaBox,
    cropBox,
    vectorObjectCount,
    rasterImageCount,
    textObjectCount,
    fontFamilies: Array.from(new Set(fontFamilies)).sort(),
    geometryHash,
    structureHash,
    confidence,
  };
}

/**
 * Builds the canonical document fingerprint by aggregating all page structural fingerprints.
 */
export function generateDocumentStructuralFingerprint(
  pages: CanonicalPageFingerprint[]
): CanonicalDocumentFingerprint {
  const pageCount = pages.length;
  const geomChain = pages.map(p => `p${p.pageIndex}:${p.geometryHash}`).join(';');
  const structChain = pages.map(p => `p${p.pageIndex}:${p.structureHash}`).join(';');

  const documentGeometryHash = 'dgh_' + computeFnv1a64(geomChain);
  const documentStructureHash = 'dsh_' + computeFnv1a64(structChain);
  const fingerprint = 'cdfp_' + computeFnv1a64(`${documentGeometryHash}|${documentStructureHash}|${pageCount}`);

  return {
    pageCount,
    pages,
    documentGeometryHash,
    documentStructureHash,
    fingerprint,
  };
}
