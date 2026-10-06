/**
 * @license
 * PEI FACILE — CTE-FIX-02Y Phase 4 Candidate Creation Recovery Verification Suite
 * Verifies spatial empty region candidate generation for text prompts without vector geometry.
 */

import { describe, it, expect } from 'vitest';
import { detectFieldsOnPdfPage } from './pdfPageFixture';

describe('CTE-FIX-02Y — Phase 4 Candidate Creation Recovery Suite', () => {

  // TEST A: BAMBINO/A
  it('TEST A: BAMBINO/A prompt with physical cell generates a raw candidate', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'ALUNNO/A:', transform: [12, 0, 0, 12, 40.2, 700.5] },
          { str: 'BAMBINO/A', transform: [12, 0, 0, 12, 40.2, 680.5] },
          { str: 'Codice Fiscale:', transform: [12, 0, 0, 12, 300.0, 680.5] },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[110.0, 680.0, 180.0, 22.0]],
      }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const bambino = proposals.find((p) =>
      (p.anchorText && (p.anchorText.toUpperCase().includes('BAMBINO') || p.anchorText.toUpperCase().includes('ALUNNO'))) ||
      (p.label && (p.label.toUpperCase().includes('BAMBINO') || p.label.toUpperCase().includes('ALUNNO')))
    );

    expect(bambino).toBeDefined();
    expect(bambino?.widthPt).toBeGreaterThanOrEqual(30);
  });

  // TEST B: SEZIONE
  it('TEST B: Sezione prompt with physical cell generates a raw candidate', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'Classe:', transform: [12, 0, 0, 12, 40.0, 650.0] },
          { str: 'Sezione', transform: [12, 0, 0, 12, 180.0, 650.0] },
          { str: 'Scuola:', transform: [12, 0, 0, 12, 320.0, 650.0] },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[225.0, 650.0, 80.0, 14.0]],
      }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const sezione = proposals.find((p) => p.label.toLowerCase().includes('sezione'));

    expect(sezione).toBeDefined();
    expect(sezione?.widthPt).toBeGreaterThanOrEqual(30);
  });

  // TEST C: PLESSO
  it('TEST C: Plesso o sede prompt with physical cell generates a raw candidate', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'Plesso o sede', transform: [12, 0, 0, 12, 40.0, 620.0] },
          { str: 'Indirizzo:', transform: [12, 0, 0, 12, 280.0, 620.0] },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[120.0, 620.0, 150.0, 22.0]],
      }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const plesso = proposals.find((p) => p.label.toLowerCase().includes('plesso'));

    expect(plesso).toBeDefined();
  });

  // TEST D: DATA:
  it('TEST D: "Data:" with structural colon prompt with physical cell produces candidate', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'Data:', transform: [12, 0, 0, 12, 40.0, 580.0] },
          { str: 'Luogo:', transform: [12, 0, 0, 12, 250.0, 580.0] },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[80.0, 580.0, 150.0, 14.0]],
      }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const dataProposal = proposals.find((p) => (p.anchorText && p.anchorText.toLowerCase().includes('data')) || (p.label && p.label.toLowerCase().includes('data')));

    expect(dataProposal).toBeDefined();
    expect(dataProposal?.fieldType).toBe('DATE');
  });

  // TEST E: NEGATIVE CONTROL — No usable whitespace
  it('TEST E: Prompt label with no available whitespace to right or below generates candidateCreated = false', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'Nome:', transform: [12, 0, 0, 12, 40.0, 500.0] },
          { str: 'Cognome:', transform: [12, 0, 0, 12, 75.0, 500.0] }, // Right space < 30pt
          { str: 'Indirizzo:', transform: [12, 0, 0, 12, 40.0, 510.0] }, // Below space < 20pt
        ],
      }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const nomeProposal = proposals.find((p) => p.label.toLowerCase() === 'nome');

    expect(nomeProposal).toBeUndefined(); // correctly rejected due to insufficient whitespace
  });

  // TEST F: NARRATIVE TEXT CONTROL
  it('TEST F: Narrative sentence containing "data" does not produce artificial candidates', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'In data 15/03/2024 si è riunito il consiglio di classe per approvare il PEI.', transform: [12, 0, 0, 12, 40.0, 450.0] },
        ],
      }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    expect(proposals.length).toBe(0);
  });

  // TEST G: FALSE POSITIVE REGRESSION (02K)
  it('TEST G: Garbage OCR fragments like "L]" or "i)" are rejected', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'L]', transform: [12, 0, 0, 12, 40.0, 400.0] },
          { str: 'i)', transform: [12, 0, 0, 12, 100.0, 400.0] },
        ],
      }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    expect(proposals.length).toBe(0);
  });

  // TEST H & I: VECTOR GEOMETRY / UNDERLINE CONTROL & DEDUPLICATION
  it('TEST H & I: When explicit underline geometry exists (5B), 5C does not run or create duplicate candidates', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'Nome:', transform: [12, 0, 0, 12, 40.0, 350.0] },
          { str: '_______________________', transform: [12, 0, 0, 12, 85.0, 350.0] },
        ],
      }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const nomeProposals = proposals.filter((p) => p.label.toLowerCase().includes('nome'));

    expect(nomeProposals.length).toBe(1); // Exactly 1 candidate created (from 5B), no duplicates!
    expect(nomeProposals[0].derivationMethod).toBeDefined();
  });
});
