/**
 * @license
 * PEI FACILE — Test Suite R08-R4
 * CANDIDATE CLUSTERING + OVER-DETECTION REDUCTION + FIELD SEGMENTATION REFINEMENT
 */

import { describe, it, expect } from 'vitest';
import {
  mergeColinearHorizontalLines,
  clusterMultilineAreas,
  filterTableStructureLines,
  clusterAndRefineCandidates,
  areFieldsSameArea,
  type RawLineCandidate,
  type RawRectCandidate,
} from '../core/fieldCandidateClustering';
import type { FieldGeometry } from '../data/geometry/types';

describe('PEI FACILE — R08-R4 Candidate Clustering & Over-Detection Reduction', () => {
  const PAGE_W = 595.32;
  const PAGE_H = 841.92;

  describe('1. Colinear Horizontal Line Merging', () => {
    it('merges collinear line segments on the same horizontal level (dx gap <= 20pt)', () => {
      const lines: RawLineCandidate[] = [
        { x1: 50, y: 200, x2: 120 },
        { x1: 130, y: 200.5, x2: 250 }, // 10pt gap, 0.5pt y-diff
        { x1: 260, y: 199.8, x2: 400 }, // 10pt gap
      ];

      const merged = mergeColinearHorizontalLines(lines);
      expect(merged.length).toBe(1);
      expect(merged[0].x1).toBe(50);
      expect(merged[0].x2).toBe(400);
      expect(merged[0].y).toBeCloseTo(200, 1);
    });

    it('keeps separate lines on different horizontal levels or with large gap (> 20pt)', () => {
      const lines: RawLineCandidate[] = [
        { x1: 50, y: 200, x2: 150 },
        { x1: 220, y: 200, x2: 350 }, // 70pt gap -> should NOT merge
        { x1: 50, y: 250, x2: 350 },  // Different Y -> should NOT merge
      ];

      const merged = mergeColinearHorizontalLines(lines);
      expect(merged.length).toBe(3);
    });
  });

  describe('2. Multiline Area Clustering (e.g. Ruled Writing Sections)', () => {
    it('clusters vertically stacked horizontal lines with regular pitch into a single TEXT_LONG block', () => {
      // Simulating a ruled writing section with 6 consecutive lines spaced by 20pt
      const lines: RawLineCandidate[] = [
        { x1: 60, y: 300, x2: 520 },
        { x1: 60, y: 320, x2: 520 },
        { x1: 60, y: 340, x2: 520 },
        { x1: 60, y: 360, x2: 520 },
        { x1: 60, y: 380, x2: 520 },
        { x1: 60, y: 400, x2: 520 },
      ];

      const textItems = [
        { x: 60, yTop: 275, w: 200, h: 14, str: 'Note e osservazioni sul percorso formativo:' },
      ];

      const { multilineClusters, remainingLines } = clusterMultilineAreas(
        lines,
        textItems
      );

      // Exactly 1 multiline cluster of 6 lines instead of 6 individual line fields!
      expect(multilineClusters.length).toBe(1);
      expect(multilineClusters[0].lines.length).toBe(6);
      expect(remainingLines.length).toBe(0);
      expect(multilineClusters[0].prompt?.str).toContain('Note e osservazioni');
    });

    it('does not cluster isolated single lines into multiline areas', () => {
      const lines: RawLineCandidate[] = [
        { x1: 50, y: 150, x2: 250 },
        { x1: 50, y: 450, x2: 250 }, // 300pt gap
      ];

      const { multilineClusters, remainingLines } = clusterMultilineAreas(
        lines,
        []
      );

      expect(multilineClusters.length).toBe(0);
      expect(remainingLines.length).toBe(2);
    });
  });

  describe('3. Structural Table & Header/Footer Line Filtering', () => {
    it('filters out horizontal lines that span full page width or act as header/footer dividers', () => {
      const lines: RawLineCandidate[] = [
        { x1: 20, y: 40, x2: 575 },   // Header divider spanning almost 100% of page width
        { x1: 20, y: 810, x2: 575 },  // Footer divider
        { x1: 60, y: 250, x2: 300 },  // Real compilation line
      ];

      const { filteredLines, structuralLinesCount } = filterTableStructureLines(lines, [], PAGE_W);
      expect(filteredLines.length).toBe(1);
      expect(filteredLines[0].y).toBe(250);
      expect(structuralLinesCount).toBe(2);
    });

    it('filters out vertical lines that belong to table grid columns', () => {
      const lines: RawLineCandidate[] = [
        { x1: 60, y: 200, x2: 60, y2: 400, isVertical: true },  // Table column separator
        { x1: 200, y: 200, x2: 200, y2: 400, isVertical: true }, // Table column separator
        { x1: 80, y: 250, x2: 280, isVertical: false },         // Compilation line inside table
      ];

      const { filteredLines, structuralLinesCount } = filterTableStructureLines(lines, [], PAGE_W);
      expect(filteredLines.length).toBe(1);
      expect(filteredLines[0].isVertical).toBeFalsy();
      expect(structuralLinesCount).toBe(2);
    });
  });

  describe('4. Master clusterAndRefineCandidates Pipeline', () => {
    it('solves real-world over-detection: reduces dozens of raw candidates to minimal coherent proposals', () => {
      // Simulating a page with 1 ruled multiline section (8 lines) + 2 form fields + 2 table separators
      const rawLines: RawLineCandidate[] = [
        // Table header & footer dividers
        { x1: 20, y: 35, x2: 575 },
        { x1: 20, y: 810, x2: 575 },
        // Ruled multiline area (8 lines)
        { x1: 60, y: 300, x2: 500 },
        { x1: 60, y: 320, x2: 500 },
        { x1: 60, y: 340, x2: 500 },
        { x1: 60, y: 360, x2: 500 },
        { x1: 60, y: 380, x2: 500 },
        { x1: 60, y: 400, x2: 500 },
        { x1: 60, y: 420, x2: 500 },
        { x1: 60, y: 440, x2: 500 },
        // 2 separate form lines
        { x1: 150, y: 150, x2: 350 },
        { x1: 150, y: 180, x2: 350 },
      ];

      const textItems = [
        { x: 60, yTop: 140, w: 80, h: 12, str: 'Nome Alunno:' },
        { x: 60, yTop: 170, w: 80, h: 12, str: 'Data Nascita:' },
        { x: 60, yTop: 280, w: 180, h: 12, str: 'Interventi educativi previsti:' },
      ];

      const { proposedFields, diagnostics } = clusterAndRefineCandidates({
        pageNumber: 1,
        pageWidthPt: PAGE_W,
        pageHeightPt: PAGE_H,
        rawLines,
        rawRects: [],
        textItems,
        acroformCandidates: [],
        textLayerCandidates: [],
        existingFields: [],
      });

      // Instead of 12 raw candidates, we get only 3 coherent fields:
      // 1 multiline area + 2 single-line fields!
      expect(proposedFields.length).toBe(3);
      expect(diagnostics.rawLinesCount).toBe(rawLines.length);
      expect(diagnostics.mergedCount).toBeGreaterThanOrEqual(1);
      expect(diagnostics.filteredStructureCount).toBeGreaterThanOrEqual(2);

      // Verify the multiline area field
      const multilineField = proposedFields.find((f) => f.fieldType === 'TEXT_LONG');
      expect(multilineField).toBeDefined();
      expect(multilineField?.label).toContain('Interventi educativi');
      expect(multilineField?.heightPt).toBeGreaterThan(100);
    });

    it('correctly associates label and checkboxes from raw rects', () => {
      const rawRects: RawRectCandidate[] = [
        { x: 80, y: 100, w: 16, h: 16, isCheckbox: true },
        { x: 80, y: 130, w: 16, h: 16, isCheckbox: true },
      ];

      const textItems = [
        { x: 105, yTop: 102, w: 80, h: 12, str: 'Opzione A' },
        { x: 105, yTop: 132, w: 80, h: 12, str: 'Opzione B' },
      ];

      const { proposedFields } = clusterAndRefineCandidates({
        pageNumber: 1,
        pageWidthPt: PAGE_W,
        pageHeightPt: PAGE_H,
        rawLines: [],
        rawRects,
        textItems,
        acroformCandidates: [],
        textLayerCandidates: [],
        existingFields: [],
      });

      expect(proposedFields.length).toBe(2);
      expect(proposedFields[0].fieldType).toBe('SINGLE_CHOICE');
      expect(proposedFields[0].label).toContain('Opzione A');
      expect(proposedFields[1].label).toContain('Opzione B');
    });

    it('does not re-propose candidates in areas already occupied by CONFIRMED or MODIFIED fields', () => {
      const existingFields: FieldGeometry[] = [
        {
          fieldId: 'fld_existing_1',
          label: 'Nome Alunno',
          semanticKey: 'student.fullName',
          fieldType: 'TEXT_SHORT',
          backgroundMode: 'OPAQUE_WHITE',
          calibrationStatus: 'CONFIRMED',
          pageNumber: 1,
          xPt: 100,
          yPt: 150,
          widthPt: 200,
          heightPt: 24,
          derivationMethod: 'MANUAL_VERIFIED',
          detectionSource: 'GEOMETRY',
          confidence: 1.0,
          status: 'MAPPED',
          anchorText: 'Nome Alunno',
        },
      ];

      const rawLines: RawLineCandidate[] = [
        { x1: 100, y: 172, x2: 300 }, // Exactly matches fld_existing_1 area
      ];

      const { proposedFields } = clusterAndRefineCandidates({
        pageNumber: 1,
        pageWidthPt: PAGE_W,
        pageHeightPt: PAGE_H,
        rawLines,
        rawRects: [],
        textItems: [],
        acroformCandidates: [],
        textLayerCandidates: [],
        existingFields,
      });

      // The line overlapping the confirmed field must NOT be proposed
      expect(proposedFields.length).toBe(0);
    });

    it('triggers overDetectionSuspected diagnostic flag when raw candidate count exceeds 40', () => {
      const manyLines: RawLineCandidate[] = [];
      for (let i = 0; i < 45; i++) {
        manyLines.push({ x1: 50, y: 50 + i * 15, x2: 500 });
      }

      const { diagnostics } = clusterAndRefineCandidates({
        pageNumber: 1,
        pageWidthPt: PAGE_W,
        pageHeightPt: PAGE_H,
        rawLines: manyLines,
        rawRects: [],
        textItems: [],
        acroformCandidates: [],
        textLayerCandidates: [],
        existingFields: [],
      });

      expect(diagnostics.rawTotalCount).toBeGreaterThanOrEqual(45);
      expect(diagnostics.overDetectionSuspected).toBe(true);
    });
  });

  describe('5. Spatial Overlap Utilities (areFieldsSameArea)', () => {
    it('returns true when two fields overlap significantly (IoU > 0.45)', () => {
      const a = { xPt: 100, yPt: 200, widthPt: 200, heightPt: 30 };
      const b = { xPt: 110, yPt: 202, widthPt: 190, heightPt: 28 };
      expect(areFieldsSameArea(a, b)).toBe(true);
    });

    it('returns false when fields are distinct or adjacent without overlap', () => {
      const a = { xPt: 100, yPt: 200, widthPt: 200, heightPt: 30 };
      const b = { xPt: 100, yPt: 250, widthPt: 200, heightPt: 30 };
      expect(areFieldsSameArea(a, b)).toBe(false);
    });
  });
});
