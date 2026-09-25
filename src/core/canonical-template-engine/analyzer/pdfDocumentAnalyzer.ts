import * as pdfjsLib from 'pdfjs-dist';
import {
  countRasterImagesInPage,
  extractNativePageText,
  normalizeInputData,
} from '../../pdfIntakeService';
import {
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  DocumentAnalysis,
  DocumentGeometricAnalysis,
  DocumentSourceType,
  GlobalQualityReport,
  PageAnalysis,
  PageQuality,
  PdfBox,
} from '../types';
import {
  generateDocumentStructuralFingerprint,
  generatePageStructuralFingerprint,
  PdfOperatorList,
} from './canonicalFingerprint';
import { GeometricAnalysisEngine } from '../geometry/geometricAnalysisEngine';
import { NormalizationPlanningEngine } from '../normalization/normalizationPlanningEngine';

// Ensure PDF.js worker is properly configured
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

/**
 * Standard PDF.js vector drawing operators.
 */
const VECTOR_OPERATORS: Set<number> = new Set([
  pdfjsLib.OPS.constructPath,
  pdfjsLib.OPS.stroke,
  pdfjsLib.OPS.closeStroke,
  pdfjsLib.OPS.fill,
  pdfjsLib.OPS.eoFill,
  pdfjsLib.OPS.fillStroke,
  pdfjsLib.OPS.eoFillStroke,
  pdfjsLib.OPS.closeFillStroke,
  pdfjsLib.OPS.closeEOFillStroke,
  pdfjsLib.OPS.lineTo,
  pdfjsLib.OPS.moveTo,
  pdfjsLib.OPS.curveTo,
  pdfjsLib.OPS.curveTo2,
  pdfjsLib.OPS.curveTo3,
  pdfjsLib.OPS.rectangle,
  pdfjsLib.OPS.shadingFill,
]);

/**
 * Computes a fast deterministic 32-bit FNV-1a fingerprint for raw buffer data.
 */
function computeBufferFingerprint(buffer: ArrayBuffer): string {
  if (!buffer || buffer.byteLength === 0) {
    return 'fp_empty_00000000';
  }
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return 'fp_' + (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Checks whether the buffer begins with the standard PDF header (%PDF-).
 */
function hasPdfMagicHeader(buffer: ArrayBuffer): boolean {
  if (!buffer || buffer.byteLength < 4) {
    return false;
  }
  const bytes = new Uint8Array(buffer);
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46    // F
  );
}

/**
 * Safely parses a 4-number array as a PdfBox.
 */
function parseBox(rawBox: unknown): PdfBox | undefined {
  if (Array.isArray(rawBox) && rawBox.length >= 4) {
    const x0 = Number(rawBox[0]);
    const y0 = Number(rawBox[1]);
    const x1 = Number(rawBox[2]);
    const y1 = Number(rawBox[3]);
    if (!isNaN(x0) && !isNaN(y0) && !isNaN(x1) && !isNaN(y1)) {
      return [x0, y0, x1, y1];
    }
  }
  return undefined;
}

/**
 * Scans raw PDF binary content to extract /BaseFont and /FontName declarations.
 */
function extractBaseFontsFromBuffer(buffer: Uint8Array): string[] {
  const result: string[] = [];
  try {
    const textDecoder = new TextDecoder('latin1');
    const raw = textDecoder.decode(buffer);
    const regex = /\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      if (match[1] && !result.includes(match[1])) {
        result.push(match[1]);
      }
    }
  } catch {
    // Non-blocking fallback
  }
  return result;
}

/**
 * Canonical Template Engine (CTE) - Release R02 Technical Analyzer
 * Component: PdfDocumentAnalyzer
 */
export class PdfDocumentAnalyzer {
  /**
   * Analyzes an input PDF document provided as an ArrayBuffer.
   * Extracts real technical metrics: page count, dimensions, MediaBox, CropBox,
   * Rotate, text, raster, vectors, and font declarations.
   */
  async analyze(pdf: ArrayBuffer): Promise<DocumentAnalysis> {
    const byteSize = pdf ? pdf.byteLength : 0;
    const fingerprint = computeBufferFingerprint(pdf);
    const isStandardPdf = hasPdfMagicHeader(pdf);
    const timestamp = new Date().toISOString();
    const documentId = `cte_pdf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    // Handle empty or zero-length buffer gracefully (non-regression for R01)
    if (!pdf || byteSize === 0) {
      const pageQuality: PageQuality = {
        score: 1.0,
        isReadable: true,
        skewAngle: 0,
        isSkewed: false,
        isBlurry: false,
        contrast: 1.0,
        brightness: 1.0,
        dpi: 300,
        hasArtifacts: false,
        issues: [],
      };

      const defaultPageFingerprint: CanonicalPageFingerprint = {
        pageIndex: 0,
        pageWidth: 595.28,
        pageHeight: 841.89,
        rotation: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        cropBox: [0, 0, 595.28, 841.89],
        vectorObjectCount: 0,
        rasterImageCount: 0,
        textObjectCount: 0,
        fontFamilies: [],
        geometryHash: 'gh_empty_00000000',
        structureHash: 'sh_empty_00000000',
        confidence: 0.5,
      };

      const defaultDocFingerprint: CanonicalDocumentFingerprint = {
        pageCount: 1,
        pages: [defaultPageFingerprint],
        documentGeometryHash: 'dgh_empty_00000000',
        documentStructureHash: 'dsh_empty_00000000',
        fingerprint: 'cdfp_empty_00000000',
      };

      const defaultPage: PageAnalysis = {
        pageNumber: 1,
        width: 595.28,
        height: 841.89,
        orientation: 'portrait',
        rotation: 0,
        rotate: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        cropBox: [0, 0, 595.28, 841.89],
        text: '',
        charCount: 0,
        hasText: false,
        hasImages: false,
        hasRaster: false,
        hasVectors: false,
        rasterCount: 0,
        vectorCount: 0,
        fonts: [],
        hasTables: false,
        hasForms: false,
        confidence: 1.0,
        quality: pageQuality,
        structuralFingerprint: defaultPageFingerprint,
      };

      const qualityReport: GlobalQualityReport = {
        overallScore: 1.0,
        isAcceptable: true,
        averagePageQuality: 1.0,
        pageCount: 1,
        degradedPages: [],
        issues: [],
        recommendations: [],
        summary: 'Analysis completed successfully with baseline profile for empty input.',
      };

      return {
        id: documentId,
        sourceType: DocumentSourceType.PDF,
        totalPages: 1,
        pages: [defaultPage],
        quality: qualityReport,
        fingerprint,
        structuralFingerprint: defaultDocFingerprint,
        byteSize: 0,
        createdAt: timestamp,
        status: 'completed',
        fonts: [],
        hasText: false,
        hasImages: false,
        hasRaster: false,
        hasVectors: false,
        metadata: {
          engine: 'CTE-R02.1-CANONICAL-STRUCTURAL-FINGERPRINT',
          format: 'PDF',
          isStandardPdfSignature: false,
          emptyBuffer: true,
        },
      };
    }

    try {
      const safeBuffer = pdf.slice(0);
      const normalizedData = await normalizeInputData(safeBuffer);
      const rawBaseFonts = extractBaseFontsFromBuffer(normalizedData);

      const loadingTask = pdfjsLib.getDocument({
        data: normalizedData,
        useSystemFonts: true,
        isEvalSupported: false,
      });

      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;
      const pages: PageAnalysis[] = [];
      const documentFontsSet = new Set<string>(rawBaseFonts);

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);

        // 1. Boxes and rotation
        const view = (page.view as [number, number, number, number]) || [0, 0, 595.28, 841.89];
        const defaultBox: PdfBox = [view[0], view[1], view[2], view[3]];
        const pageInfo = (page as any)._pageInfo;
        const mediaBox: PdfBox = parseBox(pageInfo?.mediaBox) || defaultBox;
        const cropBox: PdfBox = parseBox(pageInfo?.cropBox) || defaultBox;
        const rotate: number =
          typeof page.rotate === 'number'
            ? page.rotate
            : (typeof pageInfo?.rotate === 'number' ? pageInfo.rotate : 0);

        // 2. Dimensions & orientation
        const viewport = page.getViewport({ scale: 1.0 });
        const width = viewport.width;
        const height = viewport.height;
        const orientation: 'portrait' | 'landscape' = width >= height ? 'landscape' : 'portrait';

        // 3. Text extraction (reusing extractNativePageText from pdfIntakeService)
        const { text: nativeText, items: nativeItems, charCount } =
          await extractNativePageText(page);
        const hasText = charCount > 0 || nativeItems.length > 0;

        // 4. Fonts extraction (page styles, items & baseFonts, avoiding internal session IDs)
        const pageFontsSet = new Set<string>();
        try {
          const textContent = await page.getTextContent();
          if (textContent && textContent.styles) {
            for (const style of Object.values(textContent.styles)) {
              if (style && (style as any).fontFamily) {
                const family = String((style as any).fontFamily).trim();
                if (family && !/^g_d\d+_/.test(family)) {
                  pageFontsSet.add(family);
                  documentFontsSet.add(family);
                }
              }
            }
          }
          if (textContent && textContent.items) {
            for (const item of textContent.items) {
              if ('fontName' in item && item.fontName) {
                const fName = String(item.fontName).trim();
                const resolvedFamily = textContent.styles?.[fName]?.fontFamily;
                if (resolvedFamily && !/^g_d\d+_/.test(resolvedFamily)) {
                  pageFontsSet.add(resolvedFamily);
                  documentFontsSet.add(resolvedFamily);
                } else if (!/^g_d\d+_/.test(fName)) {
                  pageFontsSet.add(fName);
                  documentFontsSet.add(fName);
                }
              }
            }
          }
        } catch {
          // Non-blocking font inspection
        }
        for (const f of rawBaseFonts) {
          pageFontsSet.add(f);
          documentFontsSet.add(f);
        }
        const pageFonts = Array.from(pageFontsSet).sort();

        // 5. Raster image detection (reusing countRasterImagesInPage from pdfIntakeService)
        const rasterCount = await countRasterImagesInPage(page);
        const hasRaster = rasterCount > 0;
        const hasImages = hasRaster;

        // 6. Vector operator detection
        let operatorList: PdfOperatorList | null = null;
        let vectorCount = 0;
        try {
          operatorList = await page.getOperatorList();
          const ops = operatorList.fnArray;
          for (let i = 0; i < ops.length; i++) {
            if (VECTOR_OPERATORS.has(ops[i])) {
              vectorCount++;
            }
          }
        } catch {
          // Non-blocking vector inspection
        }
        const hasVectors = vectorCount > 0;

        // 7. Canonical Structural Fingerprint generation
        const pageStructuralFingerprint = generatePageStructuralFingerprint({
          pageIndex: pageNum - 1,
          pageWidth: width,
          pageHeight: height,
          rotation: rotate,
          mediaBox,
          cropBox,
          operatorList,
          rasterImageCount: rasterCount,
          textObjectCount: nativeItems.length,
          fontFamilies: pageFonts,
        });

        // 8. R04 Geometric Analysis Engine measurement
        const geometricEngine = new GeometricAnalysisEngine();
        let pageGeometricAnalysis;
        try {
          pageGeometricAnalysis = await geometricEngine.analyzePage(
            page,
            pageNum - 1
          );
        } catch {
          // Non-blocking fallback
          pageGeometricAnalysis = undefined;
        }

        if (pageGeometricAnalysis) {
          pageStructuralFingerprint.geometricAnalysis = pageGeometricAnalysis;
        }

        // 9. Page Quality
        const pageIssues: string[] = [];
        if (!hasText && !hasRaster && !hasVectors) {
          pageIssues.push('Pagina priva di contenuti grafici o testuali rilevati');
        }

        const measuredSkew = pageGeometricAnalysis?.skewAngle ?? 0;
        const pageQuality: PageQuality = {
          score: 1.0,
          isReadable: hasText || hasRaster || hasVectors,
          skewAngle: measuredSkew,
          isSkewed: Math.abs(measuredSkew) > 0.5,
          isBlurry: false,
          contrast: 1.0,
          brightness: 1.0,
          dpi: 72,
          hasArtifacts: false,
          issues: pageIssues,
        };

        const pageAnalysis: PageAnalysis = {
          pageNumber: pageNum,
          width,
          height,
          orientation,
          rotation: rotate,
          rotate,
          mediaBox,
          cropBox,
          text: nativeText,
          charCount,
          hasText,
          hasImages,
          hasRaster,
          hasVectors,
          rasterCount,
          vectorCount,
          fonts: pageFonts,
          hasTables: false,
          hasForms: false,
          confidence: 1.0,
          quality: pageQuality,
          structuralFingerprint: pageStructuralFingerprint,
          geometricAnalysis: pageGeometricAnalysis,
        };

        pages.push(pageAnalysis);
      }

      const allDocFonts = Array.from(documentFontsSet);
      const docHasText = pages.some(p => p.hasText);
      const docHasImages = pages.some(p => p.hasImages);
      const docHasRaster = pages.some(p => p.hasRaster);
      const docHasVectors = pages.some(p => p.hasVectors);

      const docStructuralFingerprint = generateDocumentStructuralFingerprint(
        pages.map(p => p.structuralFingerprint)
      );

      const geoPages = pages
        .map(p => p.geometricAnalysis)
        .filter((g): g is NonNullable<typeof g> => Boolean(g));

      const docGeometricAnalysis: DocumentGeometricAnalysis = {
        totalPages,
        overallSkewAngle:
          geoPages.length > 0
            ? Math.round(
                (geoPages.reduce((acc, p) => acc + p.skewAngle, 0) /
                  geoPages.length) *
                  100
              ) / 100
            : 0,
        overallGeometryScore:
          geoPages.length > 0
            ? Math.round(
                (geoPages.reduce((acc, p) => acc + p.overallGeometryScore, 0) /
                  geoPages.length) *
                  100
              ) / 100
            : 100,
        overallConfidence:
          geoPages.length > 0
            ? Math.round(
                (geoPages.reduce((acc, p) => acc + p.confidence, 0) /
                  geoPages.length) *
                  100
              ) / 100
            : 1.0,
        pages: geoPages,
        diagnosticSummary: `Analisi geometrica globale completata (${totalPages} pagine analizzate).`,
      };

      docStructuralFingerprint.geometricAnalysis = docGeometricAnalysis;

      // R05 Normalization Planning Engine
      const planningEngine = new NormalizationPlanningEngine();
      let docNormalizationPlan;
      try {
        docNormalizationPlan = planningEngine.createPlan({
          fingerprint: docStructuralFingerprint,
          geometricAnalysis: docGeometricAnalysis,
        });
      } catch {
        docNormalizationPlan = undefined;
      }

      if (docNormalizationPlan) {
        docStructuralFingerprint.normalizationPlan = docNormalizationPlan;
        for (let i = 0; i < pages.length; i++) {
          const pagePlan = docNormalizationPlan.pagePlans[i];
          if (pagePlan) {
            pages[i].normalizationPlan = pagePlan;
            if (pages[i].structuralFingerprint) {
              pages[i].structuralFingerprint.normalizationPlan = pagePlan;
            }
          }
        }
      }

      const qualityReport: GlobalQualityReport = {
        overallScore: 1.0,
        isAcceptable: true,
        averagePageQuality: 1.0,
        pageCount: totalPages,
        degradedPages: [],
        issues: [],
        recommendations: [],
        summary: `Document analysis completed successfully. Processed ${totalPages} page(s).`,
      };

      return {
        id: documentId,
        sourceType: DocumentSourceType.PDF,
        totalPages,
        pages,
        quality: qualityReport,
        fingerprint: docStructuralFingerprint.fingerprint,
        structuralFingerprint: docStructuralFingerprint,
        geometricAnalysis: docGeometricAnalysis,
        normalizationPlan: docNormalizationPlan,
        byteSize,
        createdAt: timestamp,
        status: 'completed',
        fonts: allDocFonts,
        hasText: docHasText,
        hasImages: docHasImages,
        hasRaster: docHasRaster,
        hasVectors: docHasVectors,
        metadata: {
          engine: 'CTE-R02.1-CANONICAL-STRUCTURAL-FINGERPRINT',
          format: 'PDF',
          isStandardPdfSignature: isStandardPdf,
          pageCount: totalPages,
          documentGeometryHash: docStructuralFingerprint.documentGeometryHash,
          documentStructureHash: docStructuralFingerprint.documentStructureHash,
        },
      };
    } catch (error: any) {
      // Graceful fallback on malformed or unsupported byte buffers
      const fallbackQuality: GlobalQualityReport = {
        overallScore: 0.0,
        isAcceptable: false,
        averagePageQuality: 0.0,
        pageCount: 1,
        degradedPages: [1],
        issues: [`Errore durante l'analisi tecnica del PDF: ${error?.message || String(error)}`],
        recommendations: ['Verificare che il file sia un PDF valido e non sia danneggiato.'],
        summary: 'Errore durante la lettura del flusso PDF.',
      };

      const fallbackPageQuality: PageQuality = {
        score: 0.0,
        isReadable: false,
        skewAngle: 0,
        isSkewed: false,
        isBlurry: false,
        contrast: 0.0,
        brightness: 0.0,
        dpi: 72,
        hasArtifacts: false,
        issues: [`Lettura fallita: ${error?.message || String(error)}`],
      };

      const fallbackPageFingerprint: CanonicalPageFingerprint = {
        pageIndex: 0,
        pageWidth: 595.28,
        pageHeight: 841.89,
        rotation: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        cropBox: [0, 0, 595.28, 841.89],
        vectorObjectCount: 0,
        rasterImageCount: 0,
        textObjectCount: 0,
        fontFamilies: [],
        geometryHash: 'gh_error_00000000',
        structureHash: 'sh_error_00000000',
        confidence: 0.0,
      };

      const fallbackDocFingerprint: CanonicalDocumentFingerprint = {
        pageCount: 1,
        pages: [fallbackPageFingerprint],
        documentGeometryHash: 'dgh_error_00000000',
        documentStructureHash: 'dsh_error_00000000',
        fingerprint: 'cdfp_error_00000000',
      };

      const fallbackPage: PageAnalysis = {
        pageNumber: 1,
        width: 595.28,
        height: 841.89,
        orientation: 'portrait',
        rotation: 0,
        rotate: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        cropBox: [0, 0, 595.28, 841.89],
        text: '',
        charCount: 0,
        hasText: false,
        hasImages: false,
        hasRaster: false,
        hasVectors: false,
        rasterCount: 0,
        vectorCount: 0,
        fonts: [],
        hasTables: false,
        hasForms: false,
        confidence: 0.0,
        quality: fallbackPageQuality,
        structuralFingerprint: fallbackPageFingerprint,
      };

      return {
        id: documentId,
        sourceType: DocumentSourceType.PDF,
        totalPages: 1,
        pages: [fallbackPage],
        quality: fallbackQuality,
        fingerprint,
        structuralFingerprint: fallbackDocFingerprint,
        byteSize,
        createdAt: timestamp,
        status: 'failed',
        fonts: [],
        hasText: false,
        hasImages: false,
        hasRaster: false,
        hasVectors: false,
        metadata: {
          engine: 'CTE-R02.1-CANONICAL-STRUCTURAL-FINGERPRINT',
          format: 'PDF',
          isStandardPdfSignature: isStandardPdf,
          error: error?.message || String(error),
        },
      };
    }
  }
}
