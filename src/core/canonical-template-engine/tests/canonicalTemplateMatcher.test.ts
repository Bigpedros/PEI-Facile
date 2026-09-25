/**
 * Canonical Template Engine (CTE) - Release R03
 * CanonicalTemplateMatcher & CanonicalTemplateCatalog Test Suite
 *
 * Verifies:
 * 1. Lo stesso PDF confrontato con sé stesso. Similarity = 100%.
 * 2. Due analisi indipendenti dello stesso PDF. Similarity = 100%.
 * 3. Due PDF con identica struttura ma contenuti differenti. Similarity = 100%.
 * 4. Confronto tra modelli ministeriali differenti. Similarity inferiore rispetto al template identico.
 * 5. Il matcher produce sempre un TemplateMatchResult completo.
 * 6. Catalog registry & best match discovery.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PdfDocumentAnalyzer } from '../analyzer/pdfDocumentAnalyzer';
import { CanonicalTemplateMatcher } from '../matcher/canonicalTemplateMatcher';
import {
  MATCH_THRESHOLDS,
  CLASSIFICATION_LABELS,
  classifyMatchScore,
} from '../matcher/thresholds';
import { CanonicalTemplateCatalog } from '../catalog/canonicalCatalog';
import {
  CanonicalDocumentFingerprint,
  CanonicalTemplate,
  TemplateMatchClassification,
  TemplateMatchResult,
} from '../types';

/**
 * Creates a deterministic custom PDF binary buffer for testing.
 */
function createCustomPdf(options: {
  pages: Array<{
    text?: string;
    width?: number;
    height?: number;
    rotate?: number;
    hasVectors?: boolean;
  }>;
  baseFont?: string;
}): ArrayBuffer {
  const fontName = options.baseFont || 'Helvetica';
  const objects: Array<{ id: number; content: string }> = [];

  const fontObjId = 3;
  objects.push({
    id: fontObjId,
    content: `<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} >>`,
  });

  const pageObjIds: number[] = [];
  let nextId = 4;

  options.pages.forEach((p, idx) => {
    const pageId = nextId++;
    const contentId = nextId++;
    pageObjIds.push(pageId);

    const w = p.width ?? 595.28;
    const h = p.height ?? 841.89;
    const rot = p.rotate ?? 0;

    let stream = '';
    if (p.hasVectors) {
      stream += '10 10 200 100 re S\n';
      stream += '50 500 500 50 re S\n';
    }
    if (p.text && p.text.length > 0) {
      const sanitized = p.text.replace(/[()]/g, '');
      stream += `BT /F1 12 Tf 50 750 Td (${sanitized}) Tj ET\n`;
    }

    const streamLen = Buffer.byteLength(stream, 'latin1');
    const contentObj = `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`;
    objects.push({ id: contentId, content: contentObj });

    const resources = `<< /Font << /F1 ${fontObjId} 0 R >> >>`;
    let pageDict = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentId} 0 R /Resources ${resources}`;
    if (rot !== 0) {
      pageDict += ` /Rotate ${rot}`;
    }
    pageDict += ' >>';

    objects.push({ id: pageId, content: pageDict });
  });

  const catalogObj = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pagesObj = `<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${options.pages.length} >>`;

  objects.unshift({ id: 2, content: pagesObj });
  objects.unshift({ id: 1, content: catalogObj });
  objects.sort((a, b) => a.id - b.id);

  let pdfStr = '%PDF-1.4\n';
  const offsets: number[] = [0];

  objects.forEach(obj => {
    offsets.push(pdfStr.length);
    pdfStr += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
  });

  const startXref = pdfStr.length;
  pdfStr += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const offset = String(offsets[i]).padStart(10, '0');
    pdfStr += `${offset} 00000 n \n`;
  }

  pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  const buf = Buffer.from(pdfStr, 'binary');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('Canonical Template Engine (CTE) - Release R03 Structural Matching Engine', () => {
  const analyzer = new PdfDocumentAnalyzer();
  const matcher = new CanonicalTemplateMatcher();

  // Helper to load file from public/models
  const loadModelBuffer = (filename: string): ArrayBuffer => {
    const filePath = path.resolve(process.cwd(), 'public/models', filename);
    const fileBytes = fs.readFileSync(filePath);
    return fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );
  };

  it('TEST 1: Lo stesso PDF confrontato con sé stesso produce Similarity = 100%', async () => {
    const buffer = loadModelBuffer('ALLEGATO_A1_PEI_INFANZIA.pdf');
    const analysis = await analyzer.analyze(buffer);
    const fingerprint = analysis.structuralFingerprint;

    const result = matcher.match(fingerprint, fingerprint);

    expect(result.similarityScore).toBe(100);
    expect(result.geometryScore).toBe(100);
    expect(result.structureScore).toBe(100);
    expect(result.matchedPages).toBe(12);
    expect(result.totalPages).toBe(12);
    expect(result.confidence).toBe(1.0);
    expect(result.classification).toBe(TemplateMatchClassification.IDENTICAL);
    expect(result.classificationLabel).toBe('Template Identico');
  });

  it('TEST 2: Due analisi indipendenti dello stesso PDF producono Similarity = 100%', async () => {
    const buffer1 = loadModelBuffer('ALLEGATO_A1_PEI_INFANZIA.pdf');
    const buffer2 = loadModelBuffer('ALLEGATO_A1_PEI_INFANZIA.pdf');

    const analysis1 = await analyzer.analyze(buffer1);
    const analysis2 = await analyzer.analyze(buffer2);

    const result = matcher.match(
      analysis1.structuralFingerprint,
      analysis2.structuralFingerprint
    );

    expect(result.similarityScore).toBe(100);
    expect(result.geometryScore).toBe(100);
    expect(result.structureScore).toBe(100);
    expect(result.matchedPages).toBe(analysis1.totalPages);
    expect(result.totalPages).toBe(analysis2.totalPages);
    expect(result.confidence).toBe(1.0);
    expect(result.classification).toBe('IDENTICAL');
    expect(result.classificationLabel).toBe('Template Identico');
  });

  it('TEST 3: Due PDF con identica struttura ma contenuti differenti producono Similarity = 100%', async () => {
    // Document A: compiled with Mario Rossi
    const docABuffer = createCustomPdf({
      baseFont: 'Helvetica',
      pages: [
        {
          text: 'STUDENTE: MARIO ROSSI - NATO IL 15/04/2018 A ROMA - CODICE FISCALE: RSSMRA18D15H501Y',
          width: 595.28,
          height: 841.89,
          hasVectors: true,
        },
        {
          text: 'QUADRO OSSERVATIVO GENERALE: ALUNNO COLLABORATIVO NELLE ATTIVITA GRAFICO-MOTORIE',
          width: 595.28,
          height: 841.89,
          hasVectors: true,
        },
      ],
    });

    // Document B: compiled with Giuseppe Verdi (different text values and lengths)
    const docBBuffer = createCustomPdf({
      baseFont: 'Helvetica',
      pages: [
        {
          text: 'STUDENTE: GIUSEPPE VERDI - NATO IL 03/11/2017 A MILANO - CODICE FISCALE: VRDGPP17S03F205K',
          width: 595.28,
          height: 841.89,
          hasVectors: true,
        },
        {
          text: 'QUADRO OSSERVATIVO GENERALE: ALUNNO PARTECIPE E INTERESSATO AI LABORATORI MUSICALI',
          width: 595.28,
          height: 841.89,
          hasVectors: true,
        },
      ],
    });

    const analysisA = await analyzer.analyze(docABuffer);
    const analysisB = await analyzer.analyze(docBBuffer);

    // Verify text is demonstrably different
    expect(analysisA.pages[0].text).not.toBe(analysisB.pages[0].text);
    expect(analysisA.pages[1].text).not.toBe(analysisB.pages[1].text);

    const matchResult = matcher.match(
      analysisA.structuralFingerprint,
      analysisB.structuralFingerprint
    );

    // Structural similarity must be 100% independent of compiled text
    expect(matchResult.similarityScore).toBe(100);
    expect(matchResult.geometryScore).toBe(100);
    expect(matchResult.structureScore).toBe(100);
    expect(matchResult.matchedPages).toBe(2);
    expect(matchResult.totalPages).toBe(2);
    expect(matchResult.classification).toBe(TemplateMatchClassification.IDENTICAL);
    expect(matchResult.classificationLabel).toBe('Template Identico');
  });

  it('TEST 4: Confronto tra modelli ministeriali differenti produce Similarity inferiore rispetto al template identico', async () => {
    const a1Buf = loadModelBuffer('ALLEGATO_A1_PEI_INFANZIA.pdf');
    const a2Buf = loadModelBuffer('ALLEGATO_A2_PEI_PRIMARIA.pdf');
    const a3Buf = loadModelBuffer('ALLEGATO_A3_PEI_SEC_1_GRADO.pdf');

    const a1 = await analyzer.analyze(a1Buf);
    const a2 = await analyzer.analyze(a2Buf);
    const a3 = await analyzer.analyze(a3Buf);

    // Identical template match (A1 vs A1)
    const identicalMatch = matcher.match(
      a1.structuralFingerprint,
      a1.structuralFingerprint
    );
    expect(identicalMatch.similarityScore).toBe(100);

    // Cross-model matches (A1 vs A2, A1 vs A3)
    const crossMatchA1A2 = matcher.match(
      a1.structuralFingerprint,
      a2.structuralFingerprint
    );
    const crossMatchA1A3 = matcher.match(
      a1.structuralFingerprint,
      a3.structuralFingerprint
    );

    // Cross-model similarity must be strictly less than 100%
    expect(crossMatchA1A2.similarityScore).toBeLessThan(identicalMatch.similarityScore);
    expect(crossMatchA1A3.similarityScore).toBeLessThan(identicalMatch.similarityScore);

    // A1 (12 pages) vs A2 (13 pages) have different section structures
    expect(crossMatchA1A2.totalPages).toBe(13);
    expect(crossMatchA1A2.classification).toBe(TemplateMatchClassification.DIFFERENT);
    expect(crossMatchA1A2.classificationLabel).toBe('Template Differente');

    // A1 vs A3 share 12 pages with partial table variations (classified as DERIVED or DIFFERENT)
    expect(crossMatchA1A3.similarityScore).toBeLessThan(MATCH_THRESHOLDS.IDENTICAL);
  });

  it('TEST 5: Il matcher produce sempre un TemplateMatchResult completo', async () => {
    const a1Buf = loadModelBuffer('ALLEGATO_A1_PEI_INFANZIA.pdf');
    const a1 = await analyzer.analyze(a1Buf);

    // Empty fallback fingerprint
    const emptyFingerprint: CanonicalDocumentFingerprint = {
      pageCount: 0,
      pages: [],
      documentGeometryHash: 'dgh_none',
      documentStructureHash: 'dsh_none',
      fingerprint: 'cdfp_none',
    };

    const result = matcher.match(a1.structuralFingerprint, emptyFingerprint);

    // Assert all required fields are present and typed correctly
    expect(typeof result.similarityScore).toBe('number');
    expect(typeof result.geometryScore).toBe('number');
    expect(typeof result.structureScore).toBe('number');
    expect(typeof result.matchedPages).toBe('number');
    expect(typeof result.totalPages).toBe('number');
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.diagnosticSummary).toBe('string');
    expect(result.diagnosticSummary.length).toBeGreaterThan(0);
    expect(typeof result.classification).toBe('string');
    expect(typeof result.classificationLabel).toBe('string');

    // No undefined or NaN values
    expect(Number.isNaN(result.similarityScore)).toBe(false);
    expect(Number.isNaN(result.geometryScore)).toBe(false);
    expect(Number.isNaN(result.structureScore)).toBe(false);
    expect(Number.isNaN(result.confidence)).toBe(false);
  });

  it('TEST 6: CanonicalTemplateCatalog registra modelli ministeriali e identifica il best match corretto', async () => {
    const a1Buf = loadModelBuffer('ALLEGATO_A1_PEI_INFANZIA.pdf');
    const a2Buf = loadModelBuffer('ALLEGATO_A2_PEI_PRIMARIA.pdf');
    const a3Buf = loadModelBuffer('ALLEGATO_A3_PEI_SEC_1_GRADO.pdf');
    const a4Buf = loadModelBuffer('ALLEGATO_A4_PEI_SEC_2_GRADO.pdf');

    const [a1, a2, a3, a4] = await Promise.all([
      analyzer.analyze(a1Buf),
      analyzer.analyze(a2Buf),
      analyzer.analyze(a3Buf),
      analyzer.analyze(a4Buf),
    ]);

    const catalog = new CanonicalTemplateCatalog([
      {
        id: 'MINISTERIAL_A1',
        nome: "Modello Nazionale PEI - Scuola dell'Infanzia",
        versione: 'D.I. 153/2023',
        fingerprint: a1.structuralFingerprint,
      },
      {
        id: 'MINISTERIAL_A2',
        nome: 'Modello Nazionale PEI - Scuola Primaria',
        versione: 'D.I. 153/2023',
        fingerprint: a2.structuralFingerprint,
      },
      {
        id: 'MINISTERIAL_A3',
        nome: 'Modello Nazionale PEI - Scuola Secondaria di I Grado',
        versione: 'D.I. 153/2023',
        fingerprint: a3.structuralFingerprint,
      },
      {
        id: 'MINISTERIAL_A4',
        nome: 'Modello Nazionale PEI - Scuola Secondaria di II Grado',
        versione: 'D.I. 153/2023',
        fingerprint: a4.structuralFingerprint,
      },
    ]);

    expect(catalog.count()).toBe(4);
    expect(catalog.has('MINISTERIAL_A1')).toBe(true);
    expect(catalog.get('MINISTERIAL_A1')?.nome).toContain('Infanzia');

    // Best match test: query with A1 must match MINISTERIAL_A1 at 100%
    const bestMatchA1 = catalog.findBestMatch(a1.structuralFingerprint);
    expect(bestMatchA1).not.toBeNull();
    expect(bestMatchA1?.template.id).toBe('MINISTERIAL_A1');
    expect(bestMatchA1?.match.similarityScore).toBe(100);
    expect(bestMatchA1?.match.classification).toBe(TemplateMatchClassification.IDENTICAL);

    // Best match test: query with A4 must match MINISTERIAL_A4 at 100%
    const bestMatchA4 = catalog.findBestMatch(a4.structuralFingerprint);
    expect(bestMatchA4).not.toBeNull();
    expect(bestMatchA4?.template.id).toBe('MINISTERIAL_A4');
    expect(bestMatchA4?.match.similarityScore).toBe(100);
    expect(bestMatchA4?.match.classification).toBe(TemplateMatchClassification.IDENTICAL);
  });
});
