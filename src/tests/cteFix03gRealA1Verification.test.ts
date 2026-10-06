/**
 * @license
 * PEI FACILE — CTE-FIX-03G: Real Ministerial A1 Document Verification Suite
 * Verifies on real PDF (ALLEGATO_A1_PEI_INFANZIA.pdf):
 * 1. Independent extraction of "Sezione" and "Plesso o sede" as distinct fields.
 * 2. Proper geometry alignment and physical bounds.
 * 3. Absence of orphan stamp false-positives at page bottom.
 */

import { describe, it, expect } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import * as fs from 'fs';
import * as path from 'path';
import { runHybridDetectionPipeline } from '../core/canonical-template-engine/geometry/hybridDetectionEngine';
import { detectFieldsOnPdfPage } from './pdfPageFixture';
import { pdfRectFromNativePdf } from '../data/geometry/geometryTransform';

describe('PEI FACILE — CTE-FIX-03G: Real A1 Document Verification', () => {
  it('detects separate fields for Sezione and Plesso on real A1 Page 1', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(fileBytes),
      isEvalSupported: false,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const rawItems = (textContent.items || []).filter((it: any) => it.str && it.str.trim().length > 0) as any[];

    const convertedItems = rawItems.map((item: any) => {
      const x = item.transform ? item.transform[4] : 0;
      const yBottom = item.transform ? item.transform[5] : 0;
      const w = item.width || 0;
      const h = item.height || (item.transform ? Math.abs(item.transform[0]) || Math.abs(item.transform[3]) : 10);
      const canonical = pdfRectFromNativePdf([x, yBottom, x + w, yBottom + h], viewport.height, viewport);
      return {
        str: item.str,
        x: canonical.xPt,
        yTop: canonical.yPt,
        w: canonical.widthPt,
        h: canonical.heightPt,
      };
    });

    const hybridOutput = runHybridDetectionPipeline({
      pageNumber: 1,
      pageWidthPt: 595.32,
      pageHeightPt: 841.92,
      rawLines: [],
      rawRects: [],
      textItems: convertedItems,
      existingFields: [],
    });

    console.log('--- EXACT UNRESOLVED LABELS ON A1 PAGE 1 ---', JSON.stringify(hybridOutput.unresolvedPotentialLabels, null, 2));

    const progettoItems = convertedItems.filter((it) => it.str.includes('PROGETTO') || it.str.includes('[') || it.str.includes('redatto') || it.str.includes('redigere'));
    console.log('--- PROGETTO ITEMS ---', JSON.stringify(progettoItems, null, 2));

    const sezioneCand = hybridOutput.authoritativeFields.find((f) => f.label.includes('Sezione'));
    const plessoCand = hybridOutput.authoritativeFields.find((f) => f.label.includes('Plesso'));

    expect(sezioneCand).toBeDefined();
    expect(plessoCand).toBeDefined();

    // Verify distinct positions and non-overlap
    expect(sezioneCand!.xPt).toBeLessThan(plessoCand!.xPt);
    expect(sezioneCand!.xPt + sezioneCand!.widthPt).toBeLessThanOrEqual(plessoCand!.xPt + 10);

    // Verify assisted detection on the page also produces both
    const proposed = await detectFieldsOnPdfPage(page as any, 1, []);
    const sezioneProp = proposed.find((p) => p.label.includes('Sezione'));
    const plessoProp = proposed.find((p) => p.label.includes('Plesso'));

    expect(sezioneProp).toBeDefined();
    expect(plessoProp).toBeDefined();

    // Verify no false-positive "Opzione" checkbox at page bottom
    const opzioneFields = proposed.filter((p) => p.label.toLowerCase().includes('opzione'));
    expect(opzioneFields.length).toBe(0);

    // Verify Point 1: Both caselle testuali of Progetto Individuale are proposed with separate geometries and appropriate labels
    const progRedatto = proposed.find(
      (p) =>
        p.label.toLowerCase().includes('progetto individuale') &&
        p.label.toLowerCase().includes('redatto')
    );
    const progRedigere = proposed.find(
      (p) =>
        p.label.toLowerCase().includes('progetto individuale') &&
        p.label.toLowerCase().includes('redigere')
    );

    expect(progRedatto).toBeDefined();
    expect(progRedigere).toBeDefined();
    expect(progRedatto!.inputType).toBe('checkbox');
    expect(progRedigere!.inputType).toBe('checkbox');

    // Geometrie separate e distinte (xPt disgiunti)
    expect(progRedatto!.xPt).toBeLessThan(progRedigere!.xPt);
    expect(progRedatto!.xPt + progRedatto!.widthPt).toBeLessThanOrEqual(progRedigere!.xPt + 5);

    // Etichette appropriate
    expect(progRedatto!.label).toBe('PROGETTO INDIVIDUALE: redatto in data');
    expect(progRedigere!.label).toBe('PROGETTO INDIVIDUALE: da redigere');
    expect(progRedatto!.semanticKey).toBeNull();
    expect(progRedatto!.calibrationStatus).toBe('PROPOSED');
    expect(progRedigere!.semanticKey).toBeNull();
    expect(progRedigere!.calibrationStatus).toBe('PROPOSED');

    // Parentesi quadre usate in intestazioni non diventano falsi campi
    const intestazioneFalseFields = proposed.filter((p) =>
      p.label.toLowerCase().includes('intestazione')
    );
    expect(intestazioneFalseFields.length).toBe(0);

    // L'avviso di sottorilevamento non e disattivato artificialmente
    let diagCaptured: any = null;
    await detectFieldsOnPdfPage(page as any, 1, [], {
      onDiagnostics: (d) => {
        diagCaptured = d;
      },
    });
    expect(diagCaptured).toBeDefined();
    expect(diagCaptured.uncoveredPlausibleRegionsCount).toBeGreaterThanOrEqual(0);
    expect(diagCaptured.underDetectionSuspected).toBe(diagCaptured.uncoveredPlausibleRegionsCount>0);
    expect(diagCaptured.finalProposalsCount).toBe(proposed.length);

    // Point 2: Preservazione dei campi SCARTATI (REJECTED) durante la ri-rilevazione
    const fieldToReject = { ...progRedatto!, calibrationStatus: 'REJECTED' as const };
    const reProposedWithRejected = await detectFieldsOnPdfPage(
      page as any,
      1,
      [fieldToReject]
    );
    // Il campo scartato NON deve essere riproposto
    const reDetectedRejected = reProposedWithRejected.find(
      (p) =>
        p.label.toLowerCase().includes('progetto individuale') &&
        p.label.toLowerCase().includes('redatto')
    );
    expect(reDetectedRejected).toBeUndefined();
  }, 60000);
});
