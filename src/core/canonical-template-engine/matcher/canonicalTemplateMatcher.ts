/**
 * Canonical Template Engine (CTE) - Release R03
 * CanonicalTemplateMatcher
 *
 * Core Principles:
 * 1. Independent of Compiled Text: Compares strictly geometric, structural, and layout characteristics.
 * 2. Independent of OCR and Semantics: Zero OCR, zero field detection, zero text interpretation.
 * 3. Deterministic & Repeatable: Identical fingerprints always yield 100% similarity score.
 */

import {
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  TemplateMatchResult,
} from '../types';
import {
  classifyMatchScore,
  MATCH_THRESHOLDS,
} from './thresholds';

/**
 * Detailed match result for an individual page pair.
 */
export interface PageMatchResult {
  pageIndex: number;
  geometryScore: number;
  structureScore: number;
  similarityScore: number;
  isMatch: boolean;
}

/**
 * Structural matching engine comparing two CanonicalDocumentFingerprints.
 */
export class CanonicalTemplateMatcher {
  /**
   * Evaluates geometric similarity between two pages based on geometryHash,
   * dimensions, vector primitive counts, and rotation.
   */
  comparePageGeometry(
    p1: CanonicalPageFingerprint,
    p2: CanonicalPageFingerprint
  ): number {
    if (p1.geometryHash === p2.geometryHash) {
      return 100.0;
    }

    // Dimensional fit (width and height differences)
    const dimDiff =
      Math.abs(p1.pageWidth - p2.pageWidth) + Math.abs(p1.pageHeight - p2.pageHeight);
    const dimSim = Math.max(0, 1 - dimDiff / 100);

    // Vector primitives count similarity
    const maxVec = Math.max(p1.vectorObjectCount, p2.vectorObjectCount, 1);
    const vecSim = Math.max(
      0,
      1 - Math.abs(p1.vectorObjectCount - p2.vectorObjectCount) / maxVec
    );

    // Orientation / rotation match
    const rotSim = p1.rotation === p2.rotation ? 1.0 : 0.5;

    // MediaBox boundary match
    const mediaBoxDiff = p1.mediaBox.reduce(
      (sum, val, idx) => sum + Math.abs(val - p2.mediaBox[idx]),
      0
    );
    const mediaBoxSim = Math.max(0, 1 - mediaBoxDiff / 200);

    const weightedScore =
      (dimSim * 0.35 + vecSim * 0.40 + rotSim * 0.15 + mediaBoxSim * 0.10) * 100;
    return Math.min(98.5, Math.round(weightedScore * 100) / 100);
  }

  /**
   * Evaluates structural layout similarity between two pages based on structureHash,
   * vector counts, raster image counts, text object counts, and font families.
   */
  comparePageStructure(
    p1: CanonicalPageFingerprint,
    p2: CanonicalPageFingerprint
  ): number {
    if (p1.structureHash === p2.structureHash) {
      return 100.0;
    }

    // Vector primitives count similarity
    const maxVec = Math.max(p1.vectorObjectCount, p2.vectorObjectCount, 1);
    const vecSim =
      1 - Math.abs(p1.vectorObjectCount - p2.vectorObjectCount) / maxVec;

    // Raster count similarity
    const maxRaster = Math.max(p1.rasterImageCount, p2.rasterImageCount, 1);
    const rasterSim =
      1 - Math.abs(p1.rasterImageCount - p2.rasterImageCount) / maxRaster;

    // Text object count similarity (density of text blocks, without reading text content)
    const maxText = Math.max(p1.textObjectCount, p2.textObjectCount, 1);
    const textSim =
      1 - Math.abs(p1.textObjectCount - p2.textObjectCount) / maxText;

    // Font families Jaccard similarity
    const fonts1 = new Set(p1.fontFamilies);
    const fonts2 = new Set(p2.fontFamilies);
    const intersection = [...fonts1].filter(f => fonts2.has(f)).length;
    const union = new Set([...p1.fontFamilies, ...p2.fontFamilies]).size;
    const fontSim = union === 0 ? 1.0 : intersection / union;

    const weightedScore =
      (vecSim * 0.30 + rasterSim * 0.20 + textSim * 0.20 + fontSim * 0.30) * 100;
    return Math.min(98.5, Math.round(weightedScore * 100) / 100);
  }

  /**
   * Compares two CanonicalDocumentFingerprints and returns a complete TemplateMatchResult.
   */
  match(
    source: CanonicalDocumentFingerprint,
    target: CanonicalDocumentFingerprint
  ): TemplateMatchResult {
    // 1. Direct fingerprint identity shortcut
    if (
      source.fingerprint === target.fingerprint &&
      source.documentGeometryHash === target.documentGeometryHash &&
      source.documentStructureHash === target.documentStructureHash &&
      source.pageCount === target.pageCount
    ) {
      const { classification, label } = classifyMatchScore(100);
      return {
        similarityScore: 100,
        geometryScore: 100,
        structureScore: 100,
        matchedPages: source.pageCount,
        totalPages: source.pageCount,
        confidence: 1.0,
        diagnosticSummary: `Template Identico (100%): corrispondenza geometrica e strutturale perfetta su ${source.pageCount}/${source.pageCount} pagine.`,
        classification,
        classificationLabel: label,
      };
    }

    // 2. Multi-page comparison
    const totalPages = Math.max(source.pageCount, target.pageCount);
    if (totalPages === 0) {
      const { classification, label } = classifyMatchScore(0);
      return {
        similarityScore: 0,
        geometryScore: 0,
        structureScore: 0,
        matchedPages: 0,
        totalPages: 0,
        confidence: 0,
        diagnosticSummary: 'Documenti privi di pagine confrontabili.',
        classification,
        classificationLabel: label,
      };
    }

    const minPages = Math.min(source.pageCount, target.pageCount);
    let totalGeomScore = 0;
    let totalStructScore = 0;
    let matchedPagesCount = 0;

    for (let i = 0; i < minPages; i++) {
      const p1 = source.pages[i];
      const p2 = target.pages[i];

      const pageGeom = this.comparePageGeometry(p1, p2);
      const pageStruct = this.comparePageStructure(p1, p2);
      const pageSim = (pageGeom + pageStruct) / 2;

      totalGeomScore += pageGeom;
      totalStructScore += pageStruct;

      if (pageSim >= MATCH_THRESHOLDS.COMPATIBLE) {
        matchedPagesCount++;
      }
    }

    // Compute document level averages normalized over totalPages
    const geometryScore = Math.round((totalGeomScore / totalPages) * 100) / 100;
    const structureScore = Math.round((totalStructScore / totalPages) * 100) / 100;
    const similarityScore =
      Math.round((geometryScore * 0.5 + structureScore * 0.5) * 100) / 100;

    const { classification, label } = classifyMatchScore(similarityScore);

    // Confidence evaluation
    const pageRatio = minPages / totalPages;
    const avgSourceConf =
      source.pages.reduce((acc, p) => acc + (p.confidence ?? 1.0), 0) /
      (source.pageCount || 1);
    const avgTargetConf =
      target.pages.reduce((acc, p) => acc + (p.confidence ?? 1.0), 0) /
      (target.pageCount || 1);
    const confidence =
      Math.round(Math.min(avgSourceConf, avgTargetConf) * pageRatio * 100) / 100;

    let diagnosticSummary: string;
    if (classification === 'IDENTICAL') {
      diagnosticSummary = `Template Identico (${similarityScore}%): ${matchedPagesCount}/${totalPages} pagine corrispondenti.`;
    } else if (classification === 'COMPATIBLE') {
      diagnosticSummary = `Template Compatibile (${similarityScore}%): ${matchedPagesCount}/${totalPages} pagine corrispondenti con elevata affinità strutturale.`;
    } else if (classification === 'DERIVED') {
      diagnosticSummary = `Template Derivato (${similarityScore}%): struttura di base comune con variazioni layout (${matchedPagesCount}/${totalPages} pagine).`;
    } else {
      diagnosticSummary = `Template Differente (${similarityScore}%): discrepanza tra modelli (${matchedPagesCount}/${totalPages} pagine compatibili, ${source.pageCount} vs ${target.pageCount} pagine).`;
    }

    return {
      similarityScore,
      geometryScore,
      structureScore,
      matchedPages: matchedPagesCount,
      totalPages,
      confidence,
      diagnosticSummary,
      classification,
      classificationLabel: label,
    };
  }
}
