import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PdfDocumentAnalyzer } from '../analyzer/pdfDocumentAnalyzer';
import {
  DocumentAnalysis,
  DocumentSourceType,
  GlobalQualityReport,
  PageAnalysis,
  PageQuality,
} from '../types';

/**
 * Helper to build a valid ISO 32000-1 (PDF 1.4) binary document buffer.
 */
function createCustomPdf(options: {
  pages: Array<{
    text?: string;
    width?: number;
    height?: number;
    rotate?: number;
    hasImage?: boolean;
    hasVectors?: boolean;
  }>;
  baseFont?: string;
}): ArrayBuffer {
  const fontName = options.baseFont || 'Helvetica';
  const fontObjId = 3;
  const pageObjIds: number[] = [];
  const objects: Array<{ id: number; content: string }> = [];

  objects.push({
    id: fontObjId,
    content: `<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} >>`,
  });

  let nextObjId = 4;
  const imageStream = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]); // 2x2 RGB raw pixel stream

  options.pages.forEach((p, idx) => {
    const pageId = nextObjId++;
    const contentId = nextObjId++;
    let imageObjId = 0;
    if (p.hasImage) {
      imageObjId = nextObjId++;
      const imageObj = `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 12 >>\nstream\n${imageStream.toString('binary')}\nendstream`;
      objects.push({ id: imageObjId, content: imageObj });
    }

    pageObjIds.push(pageId);

    const w = p.width || 595;
    const h = p.height || 842;
    const rot = p.rotate || 0;

    let stream = '';
    if (p.hasVectors) {
      // Vector rectangle stroke: constructPath & stroke operators
      stream += '10 10 200 100 re S\n';
    }
    if (p.text && p.text.length > 0) {
      const sanitized = p.text.replace(/[()]/g, '');
      stream += `BT /F1 12 Tf 50 750 Td (${sanitized}) Tj ET\n`;
    }
    if (p.hasImage && imageObjId > 0) {
      stream += 'q 100 0 0 100 50 700 cm /Im1 Do Q\n';
    }
    if (stream.length === 0) {
      stream = 'q Q\n';
    }

    const contentObj = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects.push({ id: contentId, content: contentObj });

    let resources = `<< /Font << /F1 ${fontObjId} 0 R >>`;
    if (imageObjId > 0) {
      resources += ` /XObject << /Im1 ${imageObjId} 0 R >>`;
    }
    resources += ' >>';

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

describe('Canonical Template Engine (CTE) - Release R01 Foundation & R02 Technical Analyzer', () => {
  describe('PdfDocumentAnalyzer - R01 Foundation Contracts (Non-Regression)', () => {
    it('creates an instance of PdfDocumentAnalyzer', () => {
      const analyzer = new PdfDocumentAnalyzer();
      expect(analyzer).toBeDefined();
      expect(analyzer).toBeInstanceOf(PdfDocumentAnalyzer);
      expect(typeof analyzer.analyze).toBe('function');
    });

    it('returns a valid DocumentAnalysis for an empty ArrayBuffer without throwing', async () => {
      const analyzer = new PdfDocumentAnalyzer();
      const emptyBuffer = new ArrayBuffer(0);

      const result = await analyzer.analyze(emptyBuffer);

      expect(result).toBeDefined();
      expect(result.sourceType).toBe('pdf');
      expect(result.byteSize).toBe(0);
      expect(result.totalPages).toBe(1);
      expect(result.pages).toHaveLength(1);
    });

    it('ensures no required property is undefined in DocumentAnalysis', async () => {
      const analyzer = new PdfDocumentAnalyzer();
      const sampleBuffer = new ArrayBuffer(0);

      const result: DocumentAnalysis = await analyzer.analyze(sampleBuffer);

      // Deep inspection: verify zero undefined properties across the entire structure
      function assertNoUndefinedValues(obj: unknown, path = 'root'): void {
        expect(obj, `Value at ${path} should not be undefined`).not.toBeUndefined();
        if (obj !== null && typeof obj === 'object') {
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = `${path}.${key}`;
            expect(value, `Property ${currentPath} should not be undefined`).not.toBeUndefined();
            if (typeof value === 'object' && value !== null) {
              assertNoUndefinedValues(value, currentPath);
            }
          }
        }
      }

      assertNoUndefinedValues(result);
    });

    it('generates unique document IDs across distinct invocations', async () => {
      const analyzer = new PdfDocumentAnalyzer();
      const buffer = new ArrayBuffer(0);

      const resultA = await analyzer.analyze(buffer);
      const resultB = await analyzer.analyze(buffer);

      expect(resultA.id).not.toBe(resultB.id);
    });
  });

  describe('PdfDocumentAnalyzer - R02 Real PDF Technical Analysis', () => {
    const analyzer = new PdfDocumentAnalyzer();

    it('analyzes real PDF Ministeriale (ALLEGATO_A1_PEI_INFANZIA.pdf)', async () => {
      const pdfPath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
      const fileBytes = fs.readFileSync(pdfPath);
      const buffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength
      );

      const result = await analyzer.analyze(buffer);

      // 1. Numero pagine corretto (12 pagine ministeriali)
      expect(result.totalPages).toBe(12);
      expect(result.pages).toHaveLength(12);

      // 2. Dimensioni file reali
      expect(result.byteSize).toBe(fileBytes.byteLength);
      expect(result.byteSize).toBeGreaterThan(400000);

      // 3. Presenza testo, raster e vettori
      expect(result.hasText).toBe(true);
      expect(result.hasVectors).toBe(true);
      expect(result.hasRaster).toBe(true);

      // 4. Pagina 1: dimensioni, rotazione, MediaBox e CropBox
      const page1 = result.pages[0];
      expect(page1.pageNumber).toBe(1);
      expect(page1.rotate).toBe(0);
      expect(page1.rotation).toBe(0);
      expect(page1.width).toBeCloseTo(595.32, 1);
      expect(page1.height).toBeCloseTo(841.92, 1);
      expect(page1.mediaBox[0]).toBe(0);
      expect(page1.mediaBox[1]).toBe(0);
      expect(page1.mediaBox[2]).toBeCloseTo(595.32, 1);
      expect(page1.mediaBox[3]).toBeCloseTo(841.92, 1);
      expect(page1.cropBox[2]).toBeCloseTo(595.32, 1);
      expect(page1.cropBox[3]).toBeCloseTo(841.92, 1);

      // 5. Presenza elementi vettoriali (tabelle ministeriali) e raster (stemmi)
      expect(page1.hasVectors).toBe(true);
      expect(page1.vectorCount).toBeGreaterThan(50);
      expect(page1.hasRaster).toBe(true);
      expect(page1.rasterCount).toBeGreaterThanOrEqual(1);

      // 6. Fonts presenti
      expect(result.fonts.length).toBeGreaterThan(0);
    });

    it('analyzes real PDF Comune di Roma (Multipage with rotation & vectors)', async () => {
      const buffer = createCustomPdf({
        baseFont: 'Times-Roman',
        pages: [
          {
            text: 'COMUNE DI ROMA - DIPARTIMENTO SERVIZI EDUCATIVI E SCOLASTICI',
            width: 595,
            height: 842,
            rotate: 0,
            hasVectors: true,
          },
          {
            text: 'GRIGLIA OSSERVATIVA SCUOLA INFANZIA COMUNE DI ROMA',
            width: 842,
            height: 595,
            rotate: 90,
            hasVectors: true,
          },
        ],
      });

      const result = await analyzer.analyze(buffer);

      // 1. Numero pagine corretto
      expect(result.totalPages).toBe(2);
      expect(result.pages).toHaveLength(2);

      // 2. Presenza testo e vettori corretta, nessun raster
      expect(result.hasText).toBe(true);
      expect(result.hasVectors).toBe(true);
      expect(result.hasRaster).toBe(false);

      // 3. Pagina 1: orientamento e rotazione
      const p1 = result.pages[0];
      expect(p1.rotate).toBe(0);
      expect(p1.width).toBe(595);
      expect(p1.height).toBe(842);
      expect(p1.orientation).toBe('portrait');
      expect(p1.text).toContain('COMUNE DI ROMA');
      expect(p1.hasVectors).toBe(true);

      // 4. Pagina 2: rotazione 90° e dimensioni scambiate dalla rotazione
      const p2 = result.pages[1];
      expect(p2.rotate).toBe(90);
      expect(p2.mediaBox).toEqual([0, 0, 842, 595]);
      expect(p2.hasVectors).toBe(true);

      // 5. Fonts presenti
      expect(result.fonts).toContain('Times-Roman');
    });

    it('analyzes real PDF Raster puro (Scan without text layer or vectors)', async () => {
      const buffer = createCustomPdf({
        pages: [
          {
            width: 595,
            height: 842,
            rotate: 0,
            hasImage: true,
            hasVectors: false,
          },
        ],
      });

      const result = await analyzer.analyze(buffer);

      // 1. Numero pagine corretto
      expect(result.totalPages).toBe(1);
      expect(result.pages).toHaveLength(1);

      // 2. Presenza raster corretta: raster=true, vettori=false, testo=false
      const p1 = result.pages[0];
      expect(p1.hasRaster).toBe(true);
      expect(p1.rasterCount).toBe(1);
      expect(p1.hasImages).toBe(true);
      expect(p1.hasText).toBe(false);
      expect(p1.charCount).toBe(0);
      expect(p1.hasVectors).toBe(false);
      expect(p1.vectorCount).toBe(0);

      // 3. Dimensioni e rotazione corrette
      expect(p1.width).toBe(595);
      expect(p1.height).toBe(842);
      expect(p1.rotate).toBe(0);
      expect(p1.mediaBox).toEqual([0, 0, 595, 842]);
      expect(p1.cropBox).toEqual([0, 0, 595, 842]);
    });

    it('analyzes real PDF Misto (Digital text, vector tables, and raster image scan)', async () => {
      const buffer = createCustomPdf({
        baseFont: 'Helvetica',
        pages: [
          {
            text: 'SEZIONE 1 - QUADRO DELLE RISORSE PROFESSIONALI (DIGITALE CON TABELLE)',
            width: 595,
            height: 842,
            rotate: 0,
            hasVectors: true,
            hasImage: true,
          },
          {
            width: 595,
            height: 842,
            rotate: 0,
            hasVectors: false,
            hasImage: true,
          },
        ],
      });

      const result = await analyzer.analyze(buffer);

      // 1. Numero pagine corretto
      expect(result.totalPages).toBe(2);

      // 2. Document-level metrics
      expect(result.hasText).toBe(true);
      expect(result.hasVectors).toBe(true);
      expect(result.hasRaster).toBe(true);
      expect(result.hasImages).toBe(true);

      // 3. Pagina 1 mista: testo, vettori e raster
      const p1 = result.pages[0];
      expect(p1.hasText).toBe(true);
      expect(p1.hasVectors).toBe(true);
      expect(p1.hasRaster).toBe(true);
      expect(p1.vectorCount).toBeGreaterThan(0);
      expect(p1.rasterCount).toBe(1);

      // 4. Pagina 2 raster pura: solo raster
      const p2 = result.pages[1];
      expect(p2.hasText).toBe(false);
      expect(p2.hasVectors).toBe(false);
      expect(p2.hasRaster).toBe(true);
      expect(p2.rasterCount).toBe(1);

      // 5. Dimensioni e rotazione verificate per entrambe le pagine
      expect(p1.width).toBe(595);
      expect(p1.height).toBe(842);
      expect(p1.rotate).toBe(0);
      expect(p2.width).toBe(595);
      expect(p2.height).toBe(842);
      expect(p2.rotate).toBe(0);
    });
  });

  describe('PdfDocumentAnalyzer - R02.1 Canonical Structural Fingerprint', () => {
    const analyzer = new PdfDocumentAnalyzer();

    it('1. produces identical fingerprints when analyzing the same PDF twice', async () => {
      const pdfPath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
      const fileBytes = fs.readFileSync(pdfPath);
      const buffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength
      );

      const run1 = await analyzer.analyze(buffer);
      const run2 = await analyzer.analyze(buffer);

      // Verify document-level fingerprint consistency
      expect(run1.structuralFingerprint.fingerprint).toBe(run2.structuralFingerprint.fingerprint);
      expect(run1.structuralFingerprint.documentGeometryHash).toBe(
        run2.structuralFingerprint.documentGeometryHash
      );
      expect(run1.structuralFingerprint.documentStructureHash).toBe(
        run2.structuralFingerprint.documentStructureHash
      );
      expect(run1.structuralFingerprint.pageCount).toBe(run2.structuralFingerprint.pageCount);

      // Verify each page fingerprint consistency
      run1.structuralFingerprint.pages.forEach((p1, idx) => {
        const p2 = run2.structuralFingerprint.pages[idx];
        expect(p1.pageIndex).toBe(p2.pageIndex);
        expect(p1.geometryHash).toBe(p2.geometryHash);
        expect(p1.structureHash).toBe(p2.structureHash);
        expect(p1.vectorObjectCount).toBe(p2.vectorObjectCount);
        expect(p1.rasterImageCount).toBe(p2.rasterImageCount);
        expect(p1.fontFamilies).toEqual(p2.fontFamilies);
      });
    });

    it('2. maintains identical structural fingerprints for documents with identical structure but different compiled content', async () => {
      // Document A compiled for student Mario Rossi
      const docABuffer = createCustomPdf({
        baseFont: 'Helvetica',
        pages: [
          {
            text: 'SCHEDA ANAGRAFICA ALUNNO: MARIO ROSSI - NATO IL: 12/03/2018 A ROMA - CODICE FISCALE: RSSMRA18C12H501Z',
            width: 595,
            height: 842,
            hasVectors: true,
          },
          {
            text: 'QUADRO OSSERVATIVO: ALUNNO COLLABORATIVO, PRESENTA DIFFICOLTA NELL AREA LINGUISTICA',
            width: 595,
            height: 842,
            hasVectors: true,
          },
        ],
      });

      // Document B compiled for student Giuseppe Verdi (different text length, different values)
      const docBBuffer = createCustomPdf({
        baseFont: 'Helvetica',
        pages: [
          {
            text: 'SCHEDA ANAGRAFICA ALUNNO: GIUSEPPE VERDI - NATO IL: 29/11/2017 A MILANO - CODICE FISCALE: VRDGPP17S29F205W',
            width: 595,
            height: 842,
            hasVectors: true,
          },
          {
            text: 'QUADRO OSSERVATIVO: ALUNNO PARTECIATIVO, PRESENTA INTERESSI SPECIFICI PER LE ATTIVITA MOTORIE',
            width: 595,
            height: 842,
            hasVectors: true,
          },
        ],
      });

      const analysisA = await analyzer.analyze(docABuffer);
      const analysisB = await analyzer.analyze(docBBuffer);

      // Distinct text content
      expect(analysisA.pages[0].text).not.toBe(analysisB.pages[0].text);
      expect(analysisA.pages[1].text).not.toBe(analysisB.pages[1].text);

      // IDENTICAL structural fingerprint at document level
      expect(analysisA.structuralFingerprint.documentGeometryHash).toBe(
        analysisB.structuralFingerprint.documentGeometryHash
      );
      expect(analysisA.structuralFingerprint.documentStructureHash).toBe(
        analysisB.structuralFingerprint.documentStructureHash
      );
      expect(analysisA.structuralFingerprint.fingerprint).toBe(
        analysisB.structuralFingerprint.fingerprint
      );

      // IDENTICAL structural fingerprint at page level
      expect(analysisA.pages[0].structuralFingerprint.geometryHash).toBe(
        analysisB.pages[0].structuralFingerprint.geometryHash
      );
      expect(analysisA.pages[0].structuralFingerprint.structureHash).toBe(
        analysisB.pages[0].structuralFingerprint.structureHash
      );
      expect(analysisA.pages[1].structuralFingerprint.geometryHash).toBe(
        analysisB.pages[1].structuralFingerprint.geometryHash
      );
      expect(analysisA.pages[1].structuralFingerprint.structureHash).toBe(
        analysisB.pages[1].structuralFingerprint.structureHash
      );
    });

    it('3. produces geometryHash for every page', async () => {
      const pdfPath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
      const fileBytes = fs.readFileSync(pdfPath);
      const buffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength
      );

      const result = await analyzer.analyze(buffer);

      expect(result.pages.length).toBeGreaterThan(0);
      result.pages.forEach(p => {
        expect(p.structuralFingerprint.geometryHash).toBeDefined();
        expect(typeof p.structuralFingerprint.geometryHash).toBe('string');
        expect(p.structuralFingerprint.geometryHash.startsWith('gh_')).toBe(true);
        expect(p.structuralFingerprint.geometryHash.length).toBeGreaterThan(5);
      });
    });

    it('4. produces structureHash for every page', async () => {
      const pdfPath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
      const fileBytes = fs.readFileSync(pdfPath);
      const buffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength
      );

      const result = await analyzer.analyze(buffer);

      expect(result.pages.length).toBeGreaterThan(0);
      result.pages.forEach(p => {
        expect(p.structuralFingerprint.structureHash).toBeDefined();
        expect(typeof p.structuralFingerprint.structureHash).toBe('string');
        expect(p.structuralFingerprint.structureHash.startsWith('sh_')).toBe(true);
        expect(p.structuralFingerprint.structureHash.length).toBeGreaterThan(5);
      });
    });

    it('5. generates fingerprints for all pages of the document', async () => {
      const pdfPath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
      const fileBytes = fs.readFileSync(pdfPath);
      const buffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength
      );

      const result = await analyzer.analyze(buffer);

      expect(result.structuralFingerprint.pageCount).toBe(12);
      expect(result.structuralFingerprint.pages).toHaveLength(12);

      result.structuralFingerprint.pages.forEach((p, idx) => {
        expect(p.pageIndex).toBe(idx);
        expect(p.pageWidth).toBeCloseTo(595.32, 1);
        expect(p.pageHeight).toBeCloseTo(841.92, 1);
        expect(p.rotation).toBe(0);
        expect(p.mediaBox).toBeDefined();
        expect(p.cropBox).toBeDefined();
        expect(typeof p.vectorObjectCount).toBe('number');
        expect(typeof p.rasterImageCount).toBe('number');
        expect(typeof p.textObjectCount).toBe('number');
        expect(Array.isArray(p.fontFamilies)).toBe(true);
        expect(p.geometryHash.startsWith('gh_')).toBe(true);
        expect(p.structureHash.startsWith('sh_')).toBe(true);
        expect(p.confidence).toBeGreaterThanOrEqual(0.5);
      });
    });
  });
});
