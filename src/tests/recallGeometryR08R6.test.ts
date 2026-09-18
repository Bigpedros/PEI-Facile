import { describe, it, expect } from 'vitest';
import {
  calculateFitScale,
  calculateFitWidthScale,
  snapFieldToDetectedStructure,
  validateFieldGeometry,
  extractCellInteriorRect,
  calculateGeometryFitScore,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  pdfRectToOverlayRect,
  overlayRectToPdfRect,
} from '../data/geometry/geometryTransform';
import {
  clusterAndRefineCandidates,
  type RawLineCandidate,
  type RawRectCandidate,
  type RawTextItem,
} from '../core/fieldCandidateClustering';

describe('PEI FACILE — R08-R6 Recall Recovery & Geometry Anchoring', () => {
  // TEST A — RECALL RECOVERY
  it('TEST A — RECALL RECOVERY: recovers plausible unmapped structural cells without generating false positives', () => {
    // 15 real areas: 2 header labels with underlines, 1 multiline area (4 lines), 8 table cells (4 rows x 2 columns), 4 checkboxes
    const textItems: RawTextItem[] = [
      { str: 'Alunno:', x: 50, yTop: 60, w: 40, h: 12 },
      { str: 'Classe:', x: 300, yTop: 60, w: 40, h: 12 },
      { str: 'Quadro generale delle abilità e dei bisogni educativi:', x: 50, yTop: 100, w: 260, h: 12 },
      { str: 'Attività educativo-didattiche', x: 55, yTop: 225, w: 140, h: 12 },
      { str: 'Strategie e strumenti compensativi', x: 295, yTop: 225, w: 170, h: 12 },
      { str: 'Modalità di verifica', x: 50, yTop: 500, w: 110, h: 12 },
      { str: 'Scrittura facilitata', x: 75, yTop: 530, w: 90, h: 12 },
      { str: 'Tempi aggiuntivi', x: 200, yTop: 530, w: 80, h: 12 },
      { str: 'Uso calcolatrice', x: 320, yTop: 530, w: 85, h: 12 },
      { str: 'Mappe concettuali', x: 440, yTop: 530, w: 95, h: 12 },
    ];

    const rawLines: RawLineCandidate[] = [
      { x1: 50, y: 74, x2: 280 }, // Alunno line
      { x1: 300, y: 74, x2: 540 }, // Classe line
      // Multiline
      { x1: 50, y: 130, x2: 540 },
      { x1: 50, y: 150, x2: 540 },
      { x1: 50, y: 170, x2: 540 },
      { x1: 50, y: 190, x2: 540 },
    ];

    const rawRects: RawRectCandidate[] = [
      // Two-column table: row 1 (header), row 2 (inputs), row 3 (inputs), row 4 (inputs), row 5 (inputs)
      // Header row
      { x: 50, y: 220, w: 240, h: 22 },
      { x: 290, y: 220, w: 250, h: 22 },
      // Row 1 input cells
      { x: 50, y: 245, w: 240, h: 55 },
      { x: 290, y: 245, w: 250, h: 55 },
      // Row 2 input cells
      { x: 50, y: 305, w: 240, h: 55 },
      { x: 290, y: 305, w: 250, h: 55 },
      // Row 3 input cells
      { x: 50, y: 365, w: 240, h: 55 },
      { x: 290, y: 365, w: 250, h: 55 },
      // Row 4 input cells
      { x: 50, y: 425, w: 240, h: 55 },
      { x: 290, y: 425, w: 250, h: 55 },
      // 4 Checkboxes
      { x: 55, y: 530, w: 12, h: 12, isCheckbox: true },
      { x: 180, y: 530, w: 12, h: 12, isCheckbox: true },
      { x: 300, y: 530, w: 12, h: 12, isCheckbox: true },
      { x: 420, y: 530, w: 12, h: 12, isCheckbox: true },
    ];

    const { proposedFields, diagnostics } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines,
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    // Expected ~ 15 fields (2 short + 1 multiline + 8 table cells + 4 checkboxes = 15)
    expect(proposedFields.length).toBeGreaterThanOrEqual(13);
    expect(proposedFields.length).toBeLessThanOrEqual(16);
    expect(diagnostics.overDetectionSuspected).toBe(false);
  });

  // TEST B — LARGE RECT FIELD
  it('TEST B — LARGE RECT FIELD: detects large empty rectangle and outputs 1 field with inner interior rect', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 150, w: 495, h: 160 },
    ];
    const textItems: RawTextItem[] = [
      { str: 'Osservazioni e note di sintesi del consiglio:', x: 55, yTop: 155, w: 240, h: 12 },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBe(1);
    const field = proposedFields[0];
    expect(field.fieldType).toBe('TEXT_LONG');
    expect(field.xPt).toBeGreaterThanOrEqual(52);
    expect(field.yPt).toBeGreaterThanOrEqual(169); // Starts below the prompt header
    expect(field.widthPt).toBeCloseTo(491, 0);
  });

  // TEST C — TWO COLUMN TABLE
  it('TEST C — TWO COLUMN TABLE: produces 2 distinct fields for side-by-side compilable table cells', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 200, w: 240, h: 90 }, // Left cell (Attività)
      { x: 295, y: 200, w: 245, h: 90 }, // Right cell (Strategie)
    ];
    const textItems: RawTextItem[] = [
      { str: 'Attività didattiche', x: 55, yTop: 205, w: 110, h: 12 },
      { str: 'Strategie e strumenti', x: 300, yTop: 205, w: 120, h: 12 },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBe(2);
    const leftField = proposedFields.find((f) => f.xPt < 200);
    const rightField = proposedFields.find((f) => f.xPt > 250);

    expect(leftField).toBeDefined();
    expect(rightField).toBeDefined();
    expect(leftField?.widthPt).toBeLessThan(250);
    expect(rightField?.xPt).toBeGreaterThanOrEqual(295);
  });

  // TEST D — HEADER CELL
  it('TEST D — HEADER CELL: rejects pure table header cells with no input area', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 100, w: 495, h: 22 }, // Short header row
    ];
    const textItems: RawTextItem[] = [
      { str: 'SEZIONE 4 — INTERVENTI PER LA RIDUZIONE DEI FATTORI DI OSTACOLO', x: 55, yTop: 105, w: 420, h: 12 },
    ];

    const { proposedFields, diagnostics } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBe(0);
    expect(diagnostics.discardedReasons.HEADER_ONLY).toBe(1);
  });

  // TEST E — LABEL + UNDERLINE
  it('TEST E — LABEL + UNDERLINE: creates 1 short field resting properly on the baseline after prompt label', () => {
    const textItems: RawTextItem[] = [
      { str: 'Data di compilazione:', x: 50, yTop: 100, w: 105, h: 12 },
    ];
    const rawLines: RawLineCandidate[] = [
      { x1: 50, y: 114, x2: 280 },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines,
      rawRects: [],
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBe(1);
    const field = proposedFields[0];
    expect(field.fieldType).toBe('DATE');
    expect(field.xPt).toBeGreaterThanOrEqual(155); // Starts after 'Data di compilazione:' (50 + 105 = 155)
    expect(field.yPt + field.heightPt).toBeCloseTo(114, 4); // Rests on baseline y=114
  });

  // TEST F — LABEL EXCLUSION
  it('TEST F — LABEL EXCLUSION: ensures field bounding box never overlaps the prompt label text', () => {
    const box = { x: 50, y: 100, w: 400, h: 120 };
    const prompt = { x: 55, yTop: 105, w: 150, h: 12, str: 'Descrizione intervento:' };

    const interior = extractCellInteriorRect(box, prompt, 2);

    expect(interior.isHeaderOnly).toBe(false);
    expect(interior.yPt).toBeGreaterThanOrEqual(prompt.yTop + prompt.h);

    const fitScore = calculateGeometryFitScore(
      { xPt: interior.xPt, yPt: interior.yPt, widthPt: interior.widthPt, heightPt: interior.heightPt, fieldType: 'TEXT_LONG' },
      { promptLabelBounds: prompt, targetCellBounds: box }
    );

    expect(fitScore.labelExclusionScore).toBe(1.0);
    expect(fitScore.score).toBeGreaterThanOrEqual(0.85);
  });

  // TEST G — GEOMETRY FIT SCORE
  it('TEST G — GEOMETRY FIT SCORE: gives high score to well-aligned field and low score / reject to misaligned field', () => {
    const wellAligned = {
      xPt: 52,
      yPt: 125,
      widthPt: 396,
      heightPt: 90,
      fieldType: 'TEXT_LONG',
    };
    const targetCell = { x: 50, y: 100, w: 400, h: 120 };
    const prompt = { x: 55, yTop: 105, w: 120, h: 12 };

    const goodScore = calculateGeometryFitScore(wellAligned, {
      targetCellBounds: targetCell,
      promptLabelBounds: prompt,
    });
    expect(goodScore.score).toBeGreaterThanOrEqual(0.85);
    expect(goodScore.isSuspect).toBe(false);

    // Colliding with label text directly
    const collidingField = {
      xPt: 55,
      yPt: 105,
      widthPt: 200,
      heightPt: 50,
      fieldType: 'TEXT_LONG',
    };
    const badScore = calculateGeometryFitScore(collidingField, {
      targetCellBounds: targetCell,
      promptLabelBounds: prompt,
    });
    expect(badScore.score).toBeLessThan(0.60);
    expect(badScore.isSuspect).toBe(true);
    expect(badScore.reason).toBe('LABEL_COLLISION');
  });

  // TEST H — UNCOVERED REGION
  it('TEST H — UNCOVERED REGION: recovery pass correctly identifies unmapped plausible compilable regions', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 100, w: 480, h: 80 }, // Primary
      { x: 50, y: 220, w: 480, h: 80 }, // Missed initially
    ];
    const textItems: RawTextItem[] = [
      { str: 'Ambito Autonomia:', x: 55, yTop: 105, w: 100, h: 12 },
      { str: 'Ambito Comunicazione:', x: 55, yTop: 225, w: 110, h: 12 },
    ];

    const { proposedFields, diagnostics } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBe(2);
    expect(diagnostics.finalProposalsCount).toBe(2);
  });

  // TEST I — OVER-DETECTION PROTECTION
  it('TEST I — OVER-DETECTION PROTECTION: bounds final proposals even when page contains 100+ raw lines', () => {
    const rawLines: RawLineCandidate[] = [];
    for (let i = 0; i < 100; i++) {
      rawLines.push({
        x1: 50 + (i % 3) * 5,
        y: 100 + i * 6,
        x2: 500 - (i % 2) * 5,
      });
    }

    const { proposedFields, diagnostics } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines,
      rawRects: [],
      textItems: [],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    // Must not flood with 100 fields!
    expect(proposedFields.length).toBeLessThanOrEqual(32);
    expect(diagnostics.rawTotalCount).toBe(100);
  });

  // TEST J — BENCHMARK COUNT
  it('TEST J — BENCHMARK COUNT: achieves target benchmark of 12-16 proposals on standard ministerial PEI page', () => {
    // 14 real fields on page: 2 short info, 2 big narrative areas, 6 table cell boxes, 4 checkboxes
    const textItems: RawTextItem[] = [
      { str: 'Docente coordinatore:', x: 50, yTop: 60, w: 110, h: 12 },
      { str: 'Data riunione GLO:', x: 320, yTop: 60, w: 95, h: 12 },
      { str: 'Dimensione Socializzazione e Relazione:', x: 50, yTop: 95, w: 210, h: 12 },
      { str: 'Dimensione Comunicazione e Linguaggi:', x: 50, yTop: 240, w: 200, h: 12 },
      { str: 'Discipline', x: 55, yTop: 395, w: 70, h: 12 },
      { str: 'Obiettivi specifici', x: 205, yTop: 395, w: 90, h: 12 },
      { str: 'Valutazione', x: 385, yTop: 395, w: 65, h: 12 },
      { str: 'Verifiche equipollenti', x: 70, yTop: 620, w: 100, h: 12 },
      { str: 'Uso dizionario', x: 190, yTop: 620, w: 75, h: 12 },
      { str: 'Sintesi vocale', x: 300, yTop: 620, w: 70, h: 12 },
      { str: 'Interrogazioni programmate', x: 400, yTop: 620, w: 130, h: 12 },
    ];

    const rawLines: RawLineCandidate[] = [
      { x1: 50, y: 74, x2: 300 },
      { x1: 320, y: 74, x2: 540 },
    ];

    const rawRects: RawRectCandidate[] = [
      // 2 narrative boxes
      { x: 50, y: 90, w: 490, h: 130 },
      { x: 50, y: 235, w: 490, h: 130 },
      // Table 3 columns x 2 rows
      { x: 50, y: 390, w: 145, h: 22 }, // header 1
      { x: 200, y: 390, w: 175, h: 22 }, // header 2
      { x: 380, y: 390, w: 160, h: 22 }, // header 3
      // row 1 inputs
      { x: 50, y: 415, w: 145, h: 80 },
      { x: 200, y: 415, w: 175, h: 80 },
      { x: 380, y: 415, w: 160, h: 80 },
      // row 2 inputs
      { x: 50, y: 500, w: 145, h: 80 },
      { x: 200, y: 500, w: 175, h: 80 },
      { x: 380, y: 500, w: 160, h: 80 },
      // 4 checkboxes
      { x: 50, y: 620, w: 14, h: 14, isCheckbox: true },
      { x: 170, y: 620, w: 14, h: 14, isCheckbox: true },
      { x: 280, y: 620, w: 14, h: 14, isCheckbox: true },
      { x: 380, y: 620, w: 14, h: 14, isCheckbox: true },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines,
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    // Count is squarely within the 12–16 target benchmark!
    expect(proposedFields.length).toBeGreaterThanOrEqual(12);
    expect(proposedFields.length).toBeLessThanOrEqual(16);
  });

  // TEST K — COORDINATE ALIGNMENT
  it('TEST K — COORDINATE ALIGNMENT: every final bbox adheres to real physical cell and line boundaries', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 100, w: 400, h: 100 },
    ];
    const textItems: RawTextItem[] = [
      { str: 'Note didattiche:', x: 55, yTop: 105, w: 90, h: 12 },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    const f = proposedFields[0];
    expect(f.xPt).toBeGreaterThanOrEqual(50);
    expect(f.xPt + f.widthPt).toBeLessThanOrEqual(450.5);
    expect(f.yPt).toBeGreaterThanOrEqual(117);
    expect(f.yPt + f.heightPt).toBeLessThanOrEqual(200.5);
  });

  // TEST L — ZOOM / FIT REGRESSION
  it('TEST L — ZOOM / FIT REGRESSION: canonical coordinates remain strictly invariant across zoom scales', () => {
    const testField = { xPt: 52.4, yPt: 120.8, widthPt: 390.2, heightPt: 85.5 };

    const scales = [0.25, 0.60, 1.00, 1.50, 2.50];
    for (const s of scales) {
      const overlay = pdfRectToOverlayRect(testField, s);
      const restored = overlayRectToPdfRect(overlay, s);

      expect(restored.xPt).toBeCloseTo(testField.xPt, 1);
      expect(restored.yPt).toBeCloseTo(testField.yPt, 1);
      expect(restored.widthPt).toBeCloseTo(testField.widthPt, 1);
      expect(restored.heightPt).toBeCloseTo(testField.heightPt, 1);
    }
  });
});
