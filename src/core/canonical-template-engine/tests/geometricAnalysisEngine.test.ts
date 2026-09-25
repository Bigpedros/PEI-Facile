/**
 * Canonical Template Engine (CTE) - Release R04
 * GeometricAnalysisEngine Test Suite
 *
 * Verifies:
 * 1. Documento perfettamente allineato.
 * 2. Documento inclinato (skewed).
 * 3. Documento ruotato (page rotation).
 * 4. Documento con margini differenti (asimmetria).
 * 5. Documento raster.
 * 6. Documento vettoriale.
 * 7. Documento misto.
 * 8. Integrazione con Canonical Structural Fingerprint e DocumentAnalysis.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { GeometricAnalysisEngine } from '../geometry/geometricAnalysisEngine';
import { PdfDocumentAnalyzer } from '../analyzer/pdfDocumentAnalyzer';

/**
 * Creates a deterministic custom PDF binary buffer for geometric testing.
 */
function createGeometricTestPdf(options: {
  width?: number;
  height?: number;
  rotate?: number;
  text?: string;
  textTransform?: [number, number, number, number, number, number];
  vectors?: Array<{ x: number; y: number; w: number; h: number }>;
  hasImage?: boolean;
}): ArrayBuffer {
  const w = options.width ?? 595.28;
  const h = options.height ?? 841.89;
  const rot = options.rotate ?? 0;

  const fontObjId = 3;
  let nextId = 4;
  const pageObjIds: number[] = [];
  const objects: Array<{ id: number; content: string }> = [];

  objects.push({
    id: fontObjId,
    content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  });

  const pageId = nextId++;
  const contentId = nextId++;
  pageObjIds.push(pageId);

  let imageObjId = 0;
  if (options.hasImage) {
    imageObjId = nextId++;
    const rawPixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    const imageObj = `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 12 >>\nstream\n${rawPixels.toString('binary')}\nendstream`;
    objects.push({ id: imageObjId, content: imageObj });
  }

  let stream = '';

  // Raster image drawing
  if (options.hasImage && imageObjId > 0) {
    stream += 'q 100 0 0 100 50 650 cm /Im1 Do Q\n';
  }

  // Vector rectangles
  if (options.vectors && options.vectors.length > 0) {
    for (const v of options.vectors) {
      stream += `${v.x} ${v.y} ${v.w} ${v.h} re S\n`;
    }
  }

  // Text
  if (options.text) {
    const sanitized = options.text.replace(/[()]/g, '');
    if (options.textTransform) {
      const [a, b, c, d, e, f] = options.textTransform;
      stream += `BT /F1 12 Tf ${a} ${b} ${c} ${d} ${e} ${f} Tm (${sanitized}) Tj ET\n`;
    } else {
      stream += `BT /F1 12 Tf 50 750 Td (${sanitized}) Tj ET\n`;
    }
  }

  const streamLen = Buffer.byteLength(stream, 'latin1');
  const contentObj = `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`;
  objects.push({ id: contentId, content: contentObj });

  let resources = `<< /Font << /F1 ${fontObjId} 0 R >>`;
  if (options.hasImage && imageObjId > 0) {
    resources += ` /XObject << /Im1 ${imageObjId} 0 R >>`;
  }
  resources += ' >>';

  let pageDict = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentId} 0 R /Resources ${resources}`;
  if (rot !== 0) {
    pageDict += ` /Rotate ${rot}`;
  }
  pageDict += ' >>';
  objects.push({ id: pageId, content: pageDict });

  const catalogObj = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pagesObj = `<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count 1 >>`;

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

describe('Canonical Template Engine (CTE) - Release R04 Geometric Analysis Engine', () => {
  const engine = new GeometricAnalysisEngine();
  const analyzer = new PdfDocumentAnalyzer();

  it('TEST 1: Documento perfettamente allineato', async () => {
    // Standard ministerial A1 model is digitally aligned with 0° skew
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(fileBytes),
      isEvalSupported: false,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const result = await engine.analyzePage(page, 0);

    expect(result.pageIndex).toBe(0);
    expect(result.width).toBeCloseTo(595.28, 0);
    expect(result.height).toBeCloseTo(841.89, 0);
    expect(result.skewAngle).toBe(0);
    expect(result.pageRotation).toBe(0);
    expect(result.perspectiveScore).toBe(100);
    expect(result.borderConsistency).toBe(100);
    expect(result.overallGeometryScore).toBeGreaterThanOrEqual(90);
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.diagnosticSummary).toContain('Geometria eccellente');
  });

  it('TEST 2: Documento inclinato (skewed)', async () => {
    // Generate text transformed with 3.5 degrees rotation
    const angleRad = (3.5 * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const pdfBuffer = createGeometricTestPdf({
      text: 'TESTO INCLINATO CON ANGOLO DI PROVA',
      textTransform: [cosA, sinA, -sinA, cosA, 60, 700],
    });

    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const result = await engine.analyzePage(page, 0);

    // Skew angle must accurately reflect the ~3.5° rotation
    expect(result.skewAngle).toBeGreaterThan(3.0);
    expect(result.skewAngle).toBeLessThan(4.0);

    // Distortion score and overall geometry score must reflect the skew
    expect(result.distortionScore).toBeLessThan(100);
    expect(result.diagnosticSummary).toContain('Inclinazione rilevata');
  });

  it('TEST 3: Documento ruotato (page rotation)', async () => {
    // A standard portrait page rotated by 90 degrees produces a landscape viewport
    const pdfBuffer = createGeometricTestPdf({
      rotate: 90,
      text: 'TESTO SU PAGINA RUOTATA A 90 GRADI',
    });

    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const result = await engine.analyzePage(page, 0);

    expect(result.pageRotation).toBe(90);
    expect(result.orientation).toBe('landscape');
    expect(result.width).toBeCloseTo(841.89, 0);
    expect(result.height).toBeCloseTo(595.28, 0);
  });

  it('TEST 4: Documento con margini differenti (asimmetria)', async () => {
    // Text placed with severe horizontal asymmetry: x = 160 pt, leaving very small right margin
    const pdfBuffer = createGeometricTestPdf({
      vectors: [{ x: 160, y: 100, w: 400, h: 600 }],
    });

    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const result = await engine.analyzePage(page, 0);

    // Left margin must be significantly larger than right margin
    expect(result.margins.left).toBeGreaterThanOrEqual(150);
    expect(result.margins.right).toBeLessThan(50);
    // Symmetry must drop due to margin gap
    expect(result.symmetry).toBeLessThan(60);
    expect(result.alignmentScore).toBeLessThan(90);
  });

  it('TEST 5: Documento raster', async () => {
    const pdfBuffer = createGeometricTestPdf({
      hasImage: true,
    });

    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const result = await engine.analyzePage(page, 0);

    expect(result.width).toBeCloseTo(595.28, 0);
    expect(result.height).toBeCloseTo(841.89, 0);
    expect(result.margins.left).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.overallGeometryScore).toBeGreaterThan(0);
  });

  it('TEST 6: Documento vettoriale', async () => {
    const pdfBuffer = createGeometricTestPdf({
      vectors: [
        { x: 50, y: 50, w: 495, h: 740 },
        { x: 60, y: 60, w: 200, h: 100 },
      ],
    });

    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const result = await engine.analyzePage(page, 0);

    expect(result.margins.left).toBeCloseTo(50, 0);
    expect(result.margins.top).toBeCloseTo(51.9, 1);
    expect(result.alignmentScore).toBeGreaterThanOrEqual(80);
    expect(result.borderConsistency).toBe(100);
  });

  it('TEST 7: Documento misto (testo, vettori e raster)', async () => {
    const pdfBuffer = createGeometricTestPdf({
      hasImage: true,
      text: 'TESTO INTEGRATO NEL DOCUMENTO MISTO',
      vectors: [{ x: 40, y: 40, w: 515, h: 760 }],
    });

    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const result = await engine.analyzePage(page, 0);

    expect(result.margins.left).toBeCloseTo(40, 0);
    expect(result.overallGeometryScore).toBeGreaterThanOrEqual(85);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('TEST 8: Integrazione completa con PdfDocumentAnalyzer e CanonicalDocumentFingerprint', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const buffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const analysis = await analyzer.analyze(buffer);

    // Verify geometricAnalysis is connected to DocumentAnalysis
    expect(analysis.geometricAnalysis).toBeDefined();
    expect(analysis.geometricAnalysis?.totalPages).toBe(12);
    expect(analysis.geometricAnalysis?.overallSkewAngle).toBe(0);
    expect(analysis.geometricAnalysis?.overallGeometryScore).toBeGreaterThanOrEqual(90);

    // Verify geometricAnalysis is connected to CanonicalDocumentFingerprint without breaking hashes
    expect(analysis.structuralFingerprint.geometricAnalysis).toBeDefined();
    expect(analysis.structuralFingerprint.geometricAnalysis?.pages.length).toBe(12);
    expect(analysis.structuralFingerprint.documentGeometryHash.startsWith('dgh_')).toBe(true);
    expect(analysis.structuralFingerprint.documentStructureHash.startsWith('dsh_')).toBe(true);

    // Verify each page analysis has its geometricAnalysis attached
    for (let i = 0; i < analysis.pages.length; i++) {
      const page = analysis.pages[i];
      expect(page.geometricAnalysis).toBeDefined();
      expect(page.geometricAnalysis?.pageIndex).toBe(i);
      expect(page.structuralFingerprint.geometricAnalysis).toBeDefined();
      expect(page.quality.skewAngle).toBe(page.geometricAnalysis?.skewAngle);
    }
  });
});
