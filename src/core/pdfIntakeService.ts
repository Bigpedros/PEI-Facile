/**
 * @license
 * PEI FACILE — PDF Intake Service (Blocco 1 R1)
 * Servizio tecnico di ingestione, analisi e instradamento documentale local-first.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { analyzeDocumentImage } from './ocrEngine';
import {
  IntakePageResult,
  NativeTextItem,
  PageContentType,
  PdfIntakeOptions,
  PdfIntakeResult,
} from './pdfIntakeTypes';

// Configurazione standard del worker di PDF.js per ambienti browser e bundler
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export const DEFAULT_INTAKE_OPTIONS: Required<Omit<PdfIntakeOptions, 'customOcrRunner'>> = {
  renderScale: 2.0, // Base PDF.js 72 pt -> 2.0x corrisponde a ~144 DPI (ottimale per bilanciamento RAM/accuratezza OCR)
};

/**
 * Normalizza il buffer di input in Uint8Array.
 */
export function normalizeInputData(input: ArrayBuffer | Uint8Array | Blob | File): Promise<Uint8Array> {
  if (input instanceof Uint8Array || ArrayBuffer.isView(input)) {
    return Promise.resolve(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
  }
  if (input instanceof ArrayBuffer || (input && typeof (input as any).byteLength === 'number' && !(input as any).buffer)) {
    return Promise.resolve(new Uint8Array(input as ArrayBuffer));
  }
  if (typeof Blob !== 'undefined' && (input instanceof Blob || typeof (input as any)?.arrayBuffer === 'function')) {
    return (input as Blob).arrayBuffer().then(ab => new Uint8Array(ab));
  }
  throw new Error('Formato dati non supportato. Atteso Uint8Array, ArrayBuffer o Blob/File.');
}

/**
 * Analizza il text layer di una pagina PDF.js ed estrae gli elementi posizionali.
 */
export async function extractNativePageText(
  page: pdfjsLib.PDFPageProxy
): Promise<{ text: string; items: NativeTextItem[]; charCount: number }> {
  const textContent = await page.getTextContent();
  const items: NativeTextItem[] = [];
  const textParts: string[] = [];
  let totalChars = 0;

  for (const item of textContent.items) {
    if ('str' in item) {
      const str = item.str;
      if (str.length > 0) {
        totalChars += str.trim().length;
        textParts.push(str);

        const transform = item.transform; // [scaleX, skewY, skewX, scaleY, transX, transY]
        items.push({
          text: str,
          x: transform ? transform[4] : 0,
          y: transform ? transform[5] : 0,
          width: item.width ?? 0,
          height: item.height ?? 0,
          fontName: item.fontName,
          hasEOL: Boolean(item.hasEOL),
        });
      }
    }
  }

  let assembledText = '';
  for (let i = 0; i < items.length; i++) {
    assembledText += items[i].text;
    if (items[i].hasEOL) {
      assembledText += '\n';
    } else if (i < items.length - 1 && !items[i].text.endsWith(' ')) {
      assembledText += ' ';
    }
  }

  return {
    text: assembledText.trim(),
    items,
    charCount: totalChars,
  };
}

/**
 * Rileva il numero di oggetti immagine presenti negli operatori della pagina.
 */
export async function countRasterImagesInPage(page: pdfjsLib.PDFPageProxy): Promise<number> {
  try {
    const operatorList = await page.getOperatorList();
    let imageCount = 0;
    const ops = operatorList.fnArray;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (
        op === pdfjsLib.OPS.paintImageXObject ||
        op === pdfjsLib.OPS.paintXObject ||
        op === pdfjsLib.OPS.paintInlineImageXObject ||
        op === pdfjsLib.OPS.paintImageMaskXObject
      ) {
        imageCount++;
      }
    }
    return imageCount;
  } catch {
    return 0;
  }
}

/**
 * Classificazione tecnica minima e conservativa senza euristiche o soglie arbitrarie.
 * - TEXT_NATIVE: testo presente, nessun elemento raster rilevato
 * - IMAGE_ONLY: nessun testo presente (pagina scansionata o puramente grafica)
 * - MIXED_UNRESOLVED: presenza simultanea di testo nativo ed elementi grafici/raster
 */
export function classifyPageContent(
  nativeCharCount: number,
  rasterImageCount: number
): PageContentType {
  if (nativeCharCount > 0 && rasterImageCount === 0) {
    return 'TEXT_NATIVE';
  }
  if (nativeCharCount === 0) {
    return 'IMAGE_ONLY';
  }
  return 'MIXED_UNRESOLVED';
}

/**
 * Renderizza una pagina PDF su HTMLCanvasElement.
 * Base geometrica standard: 72 pt. Scala 2.0x equivale a ~144 DPI.
 */
export async function renderPdfPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  scale = 2.0
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const width = Math.floor(viewport.width) || 800;
  const height = Math.floor(viewport.height) || 1100;

  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context) {
      const renderContext = {
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      };
      await page.render(renderContext).promise;
      return canvas;
    }
  }

  // Supporto fallback per ambienti Node / Headless
  const mockContext = {
    drawImage: () => {},
    putImageData: () => {},
    getImageData: (sx: number, sy: number, sw: number, sh: number) => {
      const data = new Uint8ClampedArray(sw * sh * 4);
      data.fill(255);
      return { data, width: sw, height: sh, colorSpace: 'srgb' } as ImageData;
    },
    fillRect: () => {},
    clearRect: () => {},
  };

  const canvasObj = {
    width,
    height,
    getContext: (type: string) => (type === '2d' ? mockContext : null),
  } as unknown as HTMLCanvasElement;

  try {
    const renderContext = {
      canvasContext: mockContext as unknown as CanvasRenderingContext2D,
      viewport,
    };
    if (page.render) {
      const renderTask = page.render(renderContext);
      if (renderTask && renderTask.promise) {
        await renderTask.promise;
      }
    }
  } catch {
    // Non-blocking in headless testing
  }

  return canvasObj;
}

/**
 * Servizio principale per l'ingestione e analisi tecnica del documento PDF.
 */
export async function processPdfDocument(
  input: ArrayBuffer | Uint8Array | Blob | File,
  fileName = 'document.pdf',
  options: PdfIntakeOptions = {}
): Promise<PdfIntakeResult> {
  const startTime = Date.now();
  const normalizedData = await normalizeInputData(input);

  const renderScale = options.renderScale ?? DEFAULT_INTAKE_OPTIONS.renderScale;

  const loadingTask = pdfjsLib.getDocument({
    data: normalizedData,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const pageResults: IntakePageResult[] = [];
  let textNativeCount = 0;
  let imageOnlyCount = 0;
  let mixedCount = 0;
  const globalWarnings: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const pageWarnings: string[] = [];

    // 1. Estrazione del text layer nativo
    const { text: nativeText, items: nativeItems, charCount: nativeCharCount } =
      await extractNativePageText(page);

    // 2. Rilevazione immagini raster
    const rasterCount = await countRasterImagesInPage(page);

    // 3. Classificazione tecnica conservativa della pagina
    const pageType = classifyPageContent(nativeCharCount, rasterCount);

    let finalPageText = '';
    let ocrConfidence: number | undefined;
    let ocrVariantUsed: string | undefined;
    let ocrResultObj: any;

    if (pageType === 'TEXT_NATIVE') {
      textNativeCount++;
      finalPageText = nativeText;
      // ZERO chiamate OCR per pagine con testo nativo e assenza di raster
    } else if (pageType === 'IMAGE_ONLY') {
      imageOnlyCount++;
      pageWarnings.push('Pagina identificata come raster puro: avviato fallback OCR locale.');

      // Rendering su canvas e chiamata al fallback OCR
      const canvas = await renderPdfPageToCanvas(page, renderScale);
      const ocrRunner = options.customOcrRunner ?? (async (c: HTMLCanvasElement) => {
        const dataUrl = c.toDataURL ? c.toDataURL('image/png') : '';
        const arr = dataUrl.split(',');
        const bstr = atob(arr[1] || '');
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const file = new File([u8arr], `page-${pageNum}.png`, { type: 'image/png' });
        const res = await analyzeDocumentImage(file);
        return {
          text: res.rawText,
          confidence: res.confidence,
          variant: res.selectedVariant,
          rawResult: res,
        };
      });
      const ocrResult = await ocrRunner(canvas);

      finalPageText = ocrResult.text;
      ocrConfidence = ocrResult.confidence;
      ocrVariantUsed = ocrResult.variant;
      ocrResultObj = ocrResult.rawResult ?? ocrResult;
    } else {
      // MIXED_UNRESOLVED — Preserva incondizionatamente il testo nativo già accertato
      mixedCount++;
      pageWarnings.push(
        `Pagina mista non risolta (${nativeCharCount} caratteri nativi, ${rasterCount} elementi raster): conservato testo nativo.`
      );
      finalPageText = nativeText;
    }

    pageResults.push({
      pageNumber: pageNum,
      pageType,
      text: finalPageText,
      nativeItems: nativeItems.length > 0 ? nativeItems : undefined,
      nativeCharCount,
      rasterImageCount: rasterCount,
      ocrConfidence,
      ocrVariantUsed,
      ocrResult: ocrResultObj,
      hasWarnings: pageWarnings.length > 0,
      warnings: pageWarnings,
    });
  }

  const fullText = pageResults.map(p => `--- Pagina ${p.pageNumber} (${p.pageType}) ---\n${p.text}`).join('\n\n');
  const processingTimeMs = Date.now() - startTime;

  return {
    fileName,
    totalPages,
    textNativePageCount: textNativeCount,
    imageOnlyPageCount: imageOnlyCount,
    mixedPageCount: mixedCount,
    pages: pageResults,
    fullText,
    processingTimeMs,
    warnings: globalWarnings,
  };
}
