/**
 * Canonical Template Engine (CTE) - Release R08
 * StructuralDifferenceAnalyzer
 *
 * Core Responsibilities:
 * 1. Calculate structural differences without text/OCR inspection (purely geometry & layout).
 * 2. Detect added, removed, and shifted boxes/regions across pages.
 * 3. Quantify geometric, page count, and layout shifts.
 * 4. Classify similarity into 4 canonical levels: EXACT, SIMILAR, DERIVED, UNKNOWN.
 */

import {
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  PdfBox,
  StructuralSimilarityClassification,
  StructuralDifferenceResult,
  PageStructuralDifference,
  BoxShiftDifference,
  GeometricDifferenceSummary,
} from '../types';

export interface BoxComparisonOptions {
  shiftTolerancePoints?: number;
  dimensionTolerancePoints?: number;
  exactThreshold?: number; // default 99.5
  similarThreshold?: number; // default 80.0
  derivedThreshold?: number; // default 50.0
}

export class StructuralDifferenceAnalyzer {
  private options: Required<BoxComparisonOptions>;

  constructor(options?: BoxComparisonOptions) {
    this.options = {
      shiftTolerancePoints: options?.shiftTolerancePoints ?? 15,
      dimensionTolerancePoints: options?.dimensionTolerancePoints ?? 20,
      exactThreshold: options?.exactThreshold ?? 99.5,
      similarThreshold: options?.similarThreshold ?? 80.0,
      derivedThreshold: options?.derivedThreshold ?? 50.0,
    };
  }

  /**
   * Compares two document fingerprints and returns a comprehensive structural difference result.
   */
  public analyze(
    source: CanonicalDocumentFingerprint,
    candidate: CanonicalDocumentFingerprint
  ): StructuralDifferenceResult {
    // 0. Quick check for complete fingerprint identity
    const isExactHash =
      source.fingerprint === candidate.fingerprint ||
      (source.documentStructureHash === candidate.documentStructureHash &&
        source.documentGeometryHash === candidate.documentGeometryHash &&
        source.pageCount === candidate.pageCount);

    const pageDifferences: PageStructuralDifference[] = [];
    const allAddedBoxes: Array<{ pageIndex: number; box: PdfBox }> = [];
    const allRemovedBoxes: Array<{ pageIndex: number; box: PdfBox }> = [];
    const allShiftedBoxes: BoxShiftDifference[] = [];

    const maxPages = Math.max(source.pageCount || 0, candidate.pageCount || 0);
    let totalPageSimilarity = 0;

    for (let p = 0; p < maxPages; p++) {
      const sourcePage = source.pages?.[p];
      const candidatePage = candidate.pages?.[p];

      const pageDiff = this.analyzePage(p, sourcePage, candidatePage);
      pageDifferences.push(pageDiff);

      totalPageSimilarity += pageDiff.pageSimilarityScore;

      for (const box of pageDiff.addedBoxes) {
        allAddedBoxes.push({ pageIndex: p, box });
      }
      for (const box of pageDiff.removedBoxes) {
        allRemovedBoxes.push({ pageIndex: p, box });
      }
      for (const shift of pageDiff.shiftedBoxes) {
        allShiftedBoxes.push(shift);
      }
    }

    const avgPageSimilarity = maxPages > 0 ? totalPageSimilarity / maxPages : 0;
    const pageCountMatch = source.pageCount === candidate.pageCount;
    const pageCountPenalty = pageCountMatch
      ? 0
      : Math.min(40, (Math.abs(source.pageCount - candidate.pageCount) / Math.max(source.pageCount, 1)) * 40);

    const totalAdded = allAddedBoxes.length;
    const totalRemoved = allRemovedBoxes.length;
    const totalShifted = allShiftedBoxes.length;
    const hasAnyStructuralDiff = totalAdded > 0 || totalRemoved > 0 || totalShifted > 0 || !pageCountMatch;

    let rawSimilarity = Math.max(0, avgPageSimilarity - pageCountPenalty);
    if (isExactHash && !hasAnyStructuralDiff) {
      rawSimilarity = 100;
    } else if (hasAnyStructuralDiff) {
      // If there are structural differences, cap at 98.0 to ensure SIMILAR or DERIVED classification
      rawSimilarity = Math.min(98.0, rawSimilarity);
    }

    const similarityPercentage = Math.round(rawSimilarity * 100) / 100;

    const classification = this.classifySimilarity(similarityPercentage, hasAnyStructuralDiff);

    const geoSummary = this.summarizeGeometricDifferences(source, candidate);

    const layoutShiftScore = Math.min(
      100,
      Math.round((totalAdded * 3 + totalRemoved * 3 + totalShifted * 1.5 + pageCountPenalty) * 10) / 10
    );

    const contentPreservationScore = Math.max(
      0,
      Math.min(100, Math.round((100 - layoutShiftScore) * 10) / 10)
    );

    const summary = this.buildSummary(classification, similarityPercentage, totalAdded, totalRemoved, totalShifted, source.pageCount, candidate.pageCount);

    return {
      totalAddedBoxes: totalAdded,
      totalRemovedBoxes: totalRemoved,
      totalShiftedBoxes: totalShifted,
      addedBoxes: allAddedBoxes,
      removedBoxes: allRemovedBoxes,
      shiftedBoxes: allShiftedBoxes,
      pageDifferences,
      geometricDifferences: geoSummary,
      layoutShiftScore,
      contentPreservationScore,
      similarityPercentage,
      classification,
      summary,
    };
  }

  /**
   * Compares a single page pair across source and candidate fingerprints.
   */
  public analyzePage(
    pageIndex: number,
    sourcePage?: CanonicalPageFingerprint,
    candidatePage?: CanonicalPageFingerprint
  ): PageStructuralDifference {
    if (!sourcePage && !candidatePage) {
      return this.emptyPageDiff(pageIndex, false, false, 100);
    }

    if (!sourcePage && candidatePage) {
      const addedBoxes = this.extractBoxesFromPage(candidatePage);
      return {
        pageIndex,
        sourcePageExists: false,
        candidatePageExists: true,
        addedBoxesCount: addedBoxes.length,
        removedBoxesCount: 0,
        shiftedBoxesCount: 0,
        addedBoxes,
        removedBoxes: [],
        shiftedBoxes: [],
        vectorDelta: candidatePage.vectorObjectCount,
        rasterDelta: candidatePage.rasterImageCount,
        textObjectDelta: candidatePage.textObjectCount,
        dimensionDelta: {
          widthDelta: candidatePage.pageWidth,
          heightDelta: candidatePage.pageHeight,
          aspectRatioDelta: candidatePage.pageHeight > 0 ? candidatePage.pageWidth / candidatePage.pageHeight : 0,
        },
        rotationDelta: candidatePage.rotation,
        pageSimilarityScore: 0,
      };
    }

    if (sourcePage && !candidatePage) {
      const removedBoxes = this.extractBoxesFromPage(sourcePage);
      return {
        pageIndex,
        sourcePageExists: true,
        candidatePageExists: false,
        addedBoxesCount: 0,
        removedBoxesCount: removedBoxes.length,
        shiftedBoxesCount: 0,
        addedBoxes: [],
        removedBoxes,
        shiftedBoxes: [],
        vectorDelta: -sourcePage.vectorObjectCount,
        rasterDelta: -sourcePage.rasterImageCount,
        textObjectDelta: -sourcePage.textObjectCount,
        dimensionDelta: {
          widthDelta: -sourcePage.pageWidth,
          heightDelta: -sourcePage.pageHeight,
          aspectRatioDelta: sourcePage.pageHeight > 0 ? -sourcePage.pageWidth / sourcePage.pageHeight : 0,
        },
        rotationDelta: -sourcePage.rotation,
        pageSimilarityScore: 0,
      };
    }

    // Both pages exist
    const p1 = sourcePage!;
    const p2 = candidatePage!;

    // Identical hashes
    if (p1.geometryHash === p2.geometryHash && p1.structureHash === p2.structureHash) {
      return {
        pageIndex,
        sourcePageExists: true,
        candidatePageExists: true,
        addedBoxesCount: 0,
        removedBoxesCount: 0,
        shiftedBoxesCount: 0,
        addedBoxes: [],
        removedBoxes: [],
        shiftedBoxes: [],
        vectorDelta: 0,
        rasterDelta: 0,
        textObjectDelta: 0,
        dimensionDelta: { widthDelta: 0, heightDelta: 0, aspectRatioDelta: 0 },
        rotationDelta: 0,
        pageSimilarityScore: 100,
      };
    }

    const sourceBoxes = this.extractBoxesFromPage(p1);
    const candidateBoxes = this.extractBoxesFromPage(p2);

    const { added, removed, shifted } = this.compareBoxSets(pageIndex, sourceBoxes, candidateBoxes);

    const vectorDelta = p2.vectorObjectCount - p1.vectorObjectCount;
    const rasterDelta = p2.rasterImageCount - p1.rasterImageCount;
    const textObjectDelta = p2.textObjectCount - p1.textObjectCount;

    const widthDelta = p2.pageWidth - p1.pageWidth;
    const heightDelta = p2.pageHeight - p1.pageHeight;
    const ar1 = p1.pageHeight > 0 ? p1.pageWidth / p1.pageHeight : 1;
    const ar2 = p2.pageHeight > 0 ? p2.pageWidth / p2.pageHeight : 1;
    const aspectRatioDelta = Math.round((ar2 - ar1) * 1000) / 1000;
    const rotationDelta = p2.rotation - p1.rotation;

    // Calculate structural similarity for this page
    const dimScore = Math.max(0, 1 - (Math.abs(widthDelta) + Math.abs(heightDelta)) / 200);
    const maxVec = Math.max(p1.vectorObjectCount, p2.vectorObjectCount, 1);
    const vecScore = Math.max(0, 1 - Math.abs(vectorDelta) / maxVec);
    const maxText = Math.max(p1.textObjectCount, p2.textObjectCount, 1);
    const textScore = Math.max(0, 1 - Math.abs(textObjectDelta) / maxText);
    const maxBoxes = Math.max(sourceBoxes.length, candidateBoxes.length, 1);
    const boxMatchScore = Math.max(0, 1 - (added.length + removed.length + shifted.length * 0.5) / maxBoxes);

    const pageSimilarityScore = Math.round(
      (dimScore * 0.2 + vecScore * 0.25 + textScore * 0.25 + boxMatchScore * 0.3) * 10000
    ) / 100;

    return {
      pageIndex,
      sourcePageExists: true,
      candidatePageExists: true,
      addedBoxesCount: added.length,
      removedBoxesCount: removed.length,
      shiftedBoxesCount: shifted.length,
      addedBoxes: added,
      removedBoxes: removed,
      shiftedBoxes: shifted,
      vectorDelta,
      rasterDelta,
      textObjectDelta,
      dimensionDelta: {
        widthDelta,
        heightDelta,
        aspectRatioDelta,
      },
      rotationDelta,
      pageSimilarityScore: Math.min(100, pageSimilarityScore),
    };
  }

  /**
   * Compares two sets of bounding boxes to find added, removed, and shifted boxes.
   */
  private compareBoxSets(
    pageIndex: number,
    sourceBoxes: PdfBox[],
    candidateBoxes: PdfBox[]
  ): { added: PdfBox[]; removed: PdfBox[]; shifted: BoxShiftDifference[] } {
    const matchedCandidateIndices = new Set<number>();
    const matchedSourceIndices = new Set<number>();
    const shifted: BoxShiftDifference[] = [];

    // 1. Exact or near-identical matches
    for (let sIdx = 0; sIdx < sourceBoxes.length; sIdx++) {
      const sBox = sourceBoxes[sIdx];
      for (let cIdx = 0; cIdx < candidateBoxes.length; cIdx++) {
        if (matchedCandidateIndices.has(cIdx)) continue;
        const cBox = candidateBoxes[cIdx];

        if (this.areBoxesEqual(sBox, cBox, 1.0)) {
          matchedSourceIndices.add(sIdx);
          matchedCandidateIndices.add(cIdx);
          break;
        }
      }
    }

    // 2. Shifted / translated boxes
    for (let sIdx = 0; sIdx < sourceBoxes.length; sIdx++) {
      if (matchedSourceIndices.has(sIdx)) continue;
      const sBox = sourceBoxes[sIdx];

      for (let cIdx = 0; cIdx < candidateBoxes.length; cIdx++) {
        if (matchedCandidateIndices.has(cIdx)) continue;
        const cBox = candidateBoxes[cIdx];

        const deltaX = cBox[0] - sBox[0];
        const deltaY = cBox[1] - sBox[1];
        const deltaWidth = (cBox[2] - cBox[0]) - (sBox[2] - sBox[0]);
        const deltaHeight = (cBox[3] - cBox[1]) - (sBox[3] - sBox[1]);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (
          distance <= this.options.shiftTolerancePoints &&
          Math.abs(deltaWidth) <= this.options.dimensionTolerancePoints &&
          Math.abs(deltaHeight) <= this.options.dimensionTolerancePoints
        ) {
          matchedSourceIndices.add(sIdx);
          matchedCandidateIndices.add(cIdx);
          shifted.push({
            sourceBox: sBox,
            candidateBox: cBox,
            pageIndex,
            deltaX: Math.round(deltaX * 100) / 100,
            deltaY: Math.round(deltaY * 100) / 100,
            deltaWidth: Math.round(deltaWidth * 100) / 100,
            deltaHeight: Math.round(deltaHeight * 100) / 100,
            distance: Math.round(distance * 100) / 100,
          });
          break;
        }
      }
    }

    // 3. Unmatched candidate boxes are added
    const added: PdfBox[] = [];
    for (let cIdx = 0; cIdx < candidateBoxes.length; cIdx++) {
      if (!matchedCandidateIndices.has(cIdx)) {
        added.push(candidateBoxes[cIdx]);
      }
    }

    // 4. Unmatched source boxes are removed
    const removed: PdfBox[] = [];
    for (let sIdx = 0; sIdx < sourceBoxes.length; sIdx++) {
      if (!matchedSourceIndices.has(sIdx)) {
        removed.push(sourceBoxes[sIdx]);
      }
    }

    return { added, removed, shifted };
  }

  /**
   * Helper to determine if two boxes are geometrically equivalent within epsilon.
   */
  private areBoxesEqual(b1: PdfBox, b2: PdfBox, epsilon: number = 1.0): boolean {
    return (
      Math.abs(b1[0] - b2[0]) <= epsilon &&
      Math.abs(b1[1] - b2[1]) <= epsilon &&
      Math.abs(b1[2] - b2[2]) <= epsilon &&
      Math.abs(b1[3] - b2[3]) <= epsilon
    );
  }

  /**
   * Generates structural bounding boxes from page fingerprint primitives.
   */
  private extractBoxesFromPage(page: CanonicalPageFingerprint): PdfBox[] {
    const boxes: PdfBox[] = [];
    if (page.cropBox) {
      boxes.push([...page.cropBox]);
    }
    if (page.mediaBox && !this.areBoxesEqual(page.mediaBox, page.cropBox || [0, 0, 0, 0])) {
      boxes.push([...page.mediaBox]);
    }

    // Synthetic or extracted grid boxes based on vector/text object distribution
    const w = page.pageWidth || 595.28;
    const h = page.pageHeight || 841.89;
    const textObjects = page.textObjectCount || 0;
    const vectorObjects = page.vectorObjectCount || 0;

    const sections = Math.min(10, Math.max(1, Math.floor((textObjects + vectorObjects) / 5)));
    const sectionHeight = (h - 100) / sections;

    for (let i = 0; i < sections; i++) {
      const y0 = 50 + i * sectionHeight;
      const y1 = y0 + sectionHeight - 10;
      boxes.push([50, y0, w - 50, y1]);
    }

    return boxes;
  }

  /**
   * Classifies similarity percentage into EXACT, SIMILAR, DERIVED, UNKNOWN.
   */
  public classifySimilarity(
    similarityPercentage: number,
    hasAnyStructuralDiff?: boolean
  ): StructuralSimilarityClassification {
    if (similarityPercentage >= this.options.exactThreshold && !hasAnyStructuralDiff) {
      return StructuralSimilarityClassification.EXACT;
    }
    if (similarityPercentage >= this.options.similarThreshold) {
      return StructuralSimilarityClassification.SIMILAR;
    }
    if (similarityPercentage >= this.options.derivedThreshold) {
      return StructuralSimilarityClassification.DERIVED;
    }
    return StructuralSimilarityClassification.UNKNOWN;
  }

  private summarizeGeometricDifferences(
    source: CanonicalDocumentFingerprint,
    candidate: CanonicalDocumentFingerprint
  ): GeometricDifferenceSummary {
    const sourceGeo = source.geometricAnalysis;
    const candGeo = candidate.geometricAnalysis;

    const geoScoreDelta = (candGeo?.overallGeometryScore ?? 95) - (sourceGeo?.overallGeometryScore ?? 95);
    const skewDelta = (candGeo?.overallSkewAngle ?? 0) - (sourceGeo?.overallSkewAngle ?? 0);
    const pageCountDelta = (candidate.pageCount || 0) - (source.pageCount || 0);

    const sP0 = source.pages?.[0];
    const cP0 = candidate.pages?.[0];

    const dimConsistent =
      sP0 && cP0
        ? Math.abs(sP0.pageWidth - cP0.pageWidth) < 2 && Math.abs(sP0.pageHeight - cP0.pageHeight) < 2
        : true;

    const ar1 = sP0 && sP0.pageHeight > 0 ? sP0.pageWidth / sP0.pageHeight : 1;
    const ar2 = cP0 && cP0.pageHeight > 0 ? cP0.pageWidth / cP0.pageHeight : 1;
    const arConsistent = Math.abs(ar1 - ar2) < 0.05;

    return {
      overallGeometryScoreDelta: Math.round(geoScoreDelta * 100) / 100,
      skewAngleDelta: Math.round(skewDelta * 100) / 100,
      dimensionConsistent: dimConsistent,
      aspectRatioConsistent: arConsistent,
      pageCountDelta,
      averageAlignmentDelta: 0,
    };
  }

  private emptyPageDiff(
    pageIndex: number,
    sourceExists: boolean,
    candidateExists: boolean,
    score: number
  ): PageStructuralDifference {
    return {
      pageIndex,
      sourcePageExists: sourceExists,
      candidatePageExists: candidateExists,
      addedBoxesCount: 0,
      removedBoxesCount: 0,
      shiftedBoxesCount: 0,
      addedBoxes: [],
      removedBoxes: [],
      shiftedBoxes: [],
      vectorDelta: 0,
      rasterDelta: 0,
      textObjectDelta: 0,
      dimensionDelta: { widthDelta: 0, heightDelta: 0, aspectRatioDelta: 0 },
      rotationDelta: 0,
      pageSimilarityScore: score,
    };
  }

  private buildSummary(
    classification: StructuralSimilarityClassification,
    similarity: number,
    added: number,
    removed: number,
    shifted: number,
    srcPages: number,
    candPages: number
  ): string {
    return (
      `Analisi strutturale completata. Classificazione: ${classification} (${similarity}%). ` +
      `Box aggiunti: ${added}, rimossi: ${removed}, spostati: ${shifted}. ` +
      `Pagine: sorgente ${srcPages}, candidato ${candPages}.`
    );
  }
}
