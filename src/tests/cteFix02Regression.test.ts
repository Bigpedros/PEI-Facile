/**
 * @license
 * PEI FACILE — CTE-FIX-02B Regression Test Suite
 * Structural Field Detection, Cell Header Distinction, Deduplication & Viewport Coordinate Alignment
 */

import { describe, it, expect } from 'vitest';
import {
  filterTableStructureLines,
  clusterMultilineAreas,
  clusterAndRefineCandidates,
  areFieldsSameArea,
  calculateIoU,
  type RawLineCandidate,
  type RawRectCandidate,
  type RawTextItem,
} from '../core/fieldCandidateClustering';
import {
  extractCellInteriorRect,
  pdfRectFromNativePdf,
  calculateGeometryFitScore,
} from '../data/geometry/geometryTransform';
import { detectDocumentFormat } from '../core/documentAdapters/baseAdapter';
import { DocxFormatAdapter } from '../core/documentAdapters/docxAdapter';

describe('CTE-FIX-02B — Realistic Field Detection & Coordinate Alignment Suite', () => {
  const PAGE_W = 595.32;
  const PAGE_H = 841.92;

  // =========================================================================
  // TEST 1: Cella header pura -> NON diventa campo (isHeaderOnly = true)
  // =========================================================================
  it('TEST 1: Cella header pura (testo occupa tutta la cella) -> NON diventa campo', () => {
    // Cella di intestazione tabella larga 500pt e alta 24pt, con testo che occupa 480pt
    const headerBox = { x: 50, y: 50, w: 500, h: 24 };
    const headerPrompt = { x: 55, yTop: 54, w: 480, h: 14, str: 'PIANO EDUCATIVO INDIVIDUALIZZATO — SEZIONE 1' };

    const interior = extractCellInteriorRect(headerBox, headerPrompt);
    expect(interior.isHeaderOnly).toBe(true);

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects: [{ x: 50, y: 50, w: 500, h: 24, isCheckbox: false }],
      textItems: [headerPrompt],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    // Zero campi generati da una cella puramente di intestazione
    expect(proposedFields.length).toBe(0);
  });

  // =========================================================================
  // TEST 2: Cella [ Label | Spazio libero ] -> campo generato a destra della label
  // =========================================================================
  it('TEST 2: Cella [ Label | Spazio libero ] -> campo generato a destra della label', () => {
    // Cella da 400pt con label "Codice:" (50pt) a sinistra
    const cellBox = { x: 50, y: 100, w: 400, h: 26 };
    const prompt = { x: 55, yTop: 104, w: 50, h: 12, str: 'Codice:' };

    const interior = extractCellInteriorRect(cellBox, prompt);
    expect(interior.isHeaderOnly).toBe(false);
    expect(interior.xPt).toBeGreaterThanOrEqual(55 + 50); // Deve partire a destra della label
    expect(interior.widthPt).toBeGreaterThanOrEqual(250); // Spazio libero rimanente

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects: [{ x: 50, y: 100, w: 400, h: 26, isCheckbox: false }],
      textItems: [prompt],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBe(1);
    expect(proposedFields[0].xPt).toBeGreaterThanOrEqual(105);
  });

  // =========================================================================
  // TEST 3: BAMBINO/A + area a destra -> campo TEXT_SHORT senza sovrapposizione
  // =========================================================================
  it('TEST 3: BAMBINO/A + area a destra -> campo TEXT_SHORT a destra della label', () => {
    const boxBambino = { x: 50, y: 140, w: 470, h: 26 };
    const promptBambino = { x: 55, yTop: 144, w: 90, h: 12, str: 'BAMBINO/A:' };

    const interior = extractCellInteriorRect(boxBambino, promptBambino);
    expect(interior.isHeaderOnly).toBe(false);
    expect(interior.xPt).toBeGreaterThanOrEqual(145);
    expect(interior.widthPt).toBeGreaterThanOrEqual(300);

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects: [{ ...boxBambino, isCheckbox: false }],
      textItems: [promptBambino],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBe(1);
    const field = proposedFields[0];
    expect(field.label.toLowerCase()).toContain('bambin');
    expect(field.fieldType).toBe('TEXT_SHORT');
    expect(field.xPt).toBeGreaterThanOrEqual(promptBambino.x + promptBambino.w);
  });

  // =========================================================================
  // TEST 4: ANNO SCOLASTICO + area a destra -> campo proposto correttamente
  // =========================================================================
  it('TEST 4: ANNO SCOLASTICO + area a destra -> campo proposto a destra di ANNO SCOLASTICO', () => {
    const boxAnno = { x: 50, y: 110, w: 300, h: 24 };
    const promptAnno = { x: 55, yTop: 113, w: 110, h: 12, str: 'ANNO SCOLASTICO:' };

    const interior = extractCellInteriorRect(boxAnno, promptAnno);
    expect(interior.isHeaderOnly).toBe(false);
    expect(interior.xPt).toBeGreaterThanOrEqual(165);

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects: [{ ...boxAnno, isCheckbox: false }],
      textItems: [promptAnno],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBe(1);
    expect(proposedFields[0].label.toLowerCase()).toContain('anno');
    expect(proposedFields[0].xPt).toBeGreaterThanOrEqual(165);
  });

  // =========================================================================
  // TEST 5: Due celle compilabili nella stessa riga -> due campi distinti
  // =========================================================================
  it('TEST 5: Due celle compilabili nella stessa riga -> due campi distinti', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 200, w: 230, h: 26, isCheckbox: false },  // Cella Cognome
      { x: 290, y: 200, w: 230, h: 26, isCheckbox: false }, // Cella Nome
    ];

    const textItems: RawTextItem[] = [
      { x: 55, yTop: 204, w: 60, h: 12, str: 'Cognome:' },
      { x: 295, yTop: 204, w: 50, h: 12, str: 'Nome:' },
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
    expect(proposedFields[0].xPt).toBeLessThan(proposedFields[1].xPt);
    expect(areFieldsSameArea(proposedFields[0], proposedFields[1])).toBe(false);
  });

  // =========================================================================
  // TEST 6: Coordinate TextItem / VectorBox con viewport offset -> rimangono allineate
  // =========================================================================
  it('TEST 6: Coordinate TextItem / VectorBox con viewport offset -> rimangono allineate', () => {
    // Simula un viewport PDF.js con scale 1.0 e offset
    const mockViewport = {
      scale: 1.0,
      convertToViewportRectangle: (nativeRect: [number, number, number, number]) => {
        // Native PDF bottom-up [x1, y1, x2, y2] -> viewport top-down [x1, yTop, x2, yBottom]
        const [x1, y1, x2, y2] = nativeRect;
        const yTop = PAGE_H - y2;
        const yBottom = PAGE_H - y1;
        return [x1, yTop, x2, yBottom];
      },
    };

    const nativeNativeRect: [number, number, number, number] = [50, 700, 250, 725];
    const canonicalFromNative = pdfRectFromNativePdf(nativeNativeRect, PAGE_H, mockViewport);

    expect(canonicalFromNative.xPt).toBe(50);
    expect(canonicalFromNative.yPt).toBeCloseTo(PAGE_H - 725, 1);
    expect(canonicalFromNative.widthPt).toBe(200);
    expect(canonicalFromNative.heightPt).toBe(25);
  });

  // =========================================================================
  // TEST 7: Campo generato non deve sovrapporsi alla label
  // =========================================================================
  it('TEST 7: Campo generato non deve sovrapporsi alla label (labelExclusion)', () => {
    const box = { x: 50, y: 150, w: 400, h: 26 };
    const prompt = { x: 55, yTop: 154, w: 80, h: 12, str: 'SEZIONE:' };

    const interior = extractCellInteriorRect(box, prompt);
    const fitEval = calculateGeometryFitScore(
      {
        xPt: interior.xPt,
        yPt: interior.yPt,
        widthPt: interior.widthPt,
        heightPt: interior.heightPt,
        fieldType: 'TEXT_SHORT',
      },
      {
        promptLabelBounds: prompt,
        targetCellBounds: box,
        anchorType: interior.anchorType,
      }
    );

    // Il punteggio di label exclusion deve essere 1.0 (nessuna collisione)
    expect(fitEval.labelExclusionScore).toBe(1.0);
    expect(fitEval.isSuspect).toBe(false);
    expect(interior.xPt).toBeGreaterThanOrEqual(prompt.x + prompt.w);
  });

  // =========================================================================
  // TEST 8: DOCX, PDF, TIFF e formati -> nessuna regressione
  // =========================================================================
  it('TEST 8: Formati supportati (DOCX, PDF, TIFF, JPG, PNG) operativi', () => {
    expect(detectDocumentFormat('scheda.docx')).toBe('DOCX');
    expect(detectDocumentFormat('modello.pdf')).toBe('PDF');
    expect(detectDocumentFormat('scansione.tiff')).toBe('IMAGE_TIFF');
    expect(detectDocumentFormat('foto.jpg')).toBe('IMAGE_JPEG');
    expect(detectDocumentFormat('immagine.png')).toBe('IMAGE_PNG');
  });

  // =========================================================================
  // TEST 9: Simulazione REALISTICA Modello Comune di Roma (Pagina 1 con celle reali)
  // =========================================================================
  it('TEST 9: Simulazione REALISTICA modello Comune di Roma Infanzia (Pagina 1 con rawRects di cella)', () => {
    // 1. TextItems realistici estratti dal PDF
    const textItems: RawTextItem[] = [
      { x: 180, yTop: 40, w: 235, h: 16, str: 'COMUNE DI ROMA' },
      { x: 150, yTop: 65, w: 295, h: 14, str: 'PIANO EDUCATIVO INDIVIDUALIZZATO' },
      { x: 55, yTop: 113, w: 105, h: 12, str: 'ANNO SCOLASTICO:' },
      { x: 55, yTop: 143, w: 85, h: 12, str: 'BAMBINO/A:' },
      { x: 55, yTop: 173, w: 65, h: 12, str: 'NATO/A IL:' },
      { x: 265, yTop: 173, w: 25, h: 12, str: 'A:' },
      { x: 385, yTop: 173, w: 35, h: 12, str: 'PROV:' },
      { x: 55, yTop: 203, w: 105, h: 12, str: 'CODICE FISCALE:' },
      { x: 55, yTop: 233, w: 85, h: 12, str: 'RESIDENTE A:' },
      { x: 325, yTop: 233, w: 30, h: 12, str: 'VIA:' },
      { x: 55, yTop: 263, w: 55, h: 12, str: 'SCUOLA:' },
      { x: 325, yTop: 263, w: 55, h: 12, str: 'PLESSO:' },
      { x: 55, yTop: 293, w: 60, h: 12, str: 'SEZIONE:' },
      { x: 55, yTop: 334, w: 220, h: 14, str: 'QUADRO INFORMATIVO GENERALE' },
      // Tabella inferiore firme e date
      { x: 55, yTop: 684, w: 180, h: 12, str: 'Data Profilo di Funzionamento:' },
      { x: 305, yTop: 684, w: 120, h: 12, str: 'Firma Dirigente Scolastico:' },
    ];

    // 2. rawRects reali corrispondenti alle celle tabellari del PDF
    const rawRects: RawRectCandidate[] = [
      // Header puro
      { x: 50, y: 35, w: 470, h: 25, isCheckbox: false },
      // Celle anagrafiche superiori (h <= 30pt con spazio libero per compilazione)
      { x: 50, y: 108, w: 470, h: 26, isCheckbox: false }, // Anno scolastico
      { x: 50, y: 138, w: 470, h: 26, isCheckbox: false }, // Bambino
      { x: 50, y: 168, w: 200, h: 26, isCheckbox: false }, // Data nascita
      { x: 255, y: 168, w: 120, h: 26, isCheckbox: false }, // Luogo nascita
      { x: 380, y: 168, w: 140, h: 26, isCheckbox: false }, // Prov nascita
      { x: 50, y: 198, w: 470, h: 26, isCheckbox: false }, // Codice fiscale
      { x: 50, y: 228, w: 265, h: 26, isCheckbox: false }, // Residenza
      { x: 320, y: 228, w: 200, h: 26, isCheckbox: false }, // Via
      { x: 50, y: 258, w: 265, h: 26, isCheckbox: false }, // Scuola
      { x: 320, y: 258, w: 200, h: 26, isCheckbox: false }, // Plesso
      { x: 50, y: 288, w: 470, h: 26, isCheckbox: false }, // Sezione
      // Multi-line area quadro informativo
      { x: 50, y: 330, w: 470, h: 120, isCheckbox: false },
      // Tabella inferiore firme/date
      { x: 50, y: 678, w: 240, h: 30, isCheckbox: false },
      { x: 300, y: 678, w: 220, h: 30, isCheckbox: false },
    ];

    // 3. rawLines interne alle tabelle
    const rawLines: RawLineCandidate[] = [
      { x1: 50, y: 134, x2: 520 },
      { x1: 50, y: 164, x2: 520 },
      { x1: 50, y: 194, x2: 520 },
      { x1: 50, y: 224, x2: 520 },
      { x1: 50, y: 254, x2: 520 },
      { x1: 50, y: 284, x2: 520 },
      { x1: 50, y: 314, x2: 520 },
      { x1: 50, y: 708, x2: 520 },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines,
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    // Con le celle reali presenti, NON dobbiamo più avere solo 3 campi, ma tutte le sezioni anagrafiche
    expect(proposedFields.length).toBeGreaterThanOrEqual(10);
    expect(proposedFields.some((f) => f.label.toLowerCase().includes('bambin'))).toBe(true);
    expect(proposedFields.some((f) => f.label.toLowerCase().includes('anno'))).toBe(true);
    expect(proposedFields.some((f) => f.label.toLowerCase().includes('fiscale'))).toBe(true);
    expect(proposedFields.some((f) => f.label.toLowerCase().includes('sezione'))).toBe(true);
    expect(proposedFields.some((f) => f.label.toLowerCase().includes('scuola'))).toBe(true);

    // Nessun campo deve chiamarsi genericamente 'Note e osservazioni'
    expect(proposedFields.every((f) => f.label !== 'Note e osservazioni')).toBe(true);
  });
});
