import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyzeRasterPage } from '../core/headlessPageAnalyzer';
import { mergeOcrWordStreams, reconstructSemanticText, type OcrWordItem } from '../core/textReconstruction';
import type { RasterImageData } from '../core/rasterPrimitiveDetector';

export interface SystemPdfAnalyzeOptions {
  page?: number;
  dpi?: number;
  language?: string;
}

function parsePpm(buf: Buffer): RasterImageData {
  let i = 0;
  const token = () => {
    while (i < buf.length) {
      const c = buf[i];
      if (c === 35) { while (i < buf.length && buf[i] !== 10) i++; continue; }
      if (c <= 32) { i++; continue; }
      break;
    }
    const start = i;
    while (i < buf.length && buf[i] > 32) i++;
    return buf.subarray(start, i).toString('ascii');
  };
  const magic = token();
  const width = Number(token());
  const height = Number(token());
  const max = Number(token());
  if (magic !== 'P6' || !width || !height || max !== 255) throw new Error('Unsupported PPM raster');
  while (i < buf.length && buf[i] <= 32) i++;
  const rgb = buf.subarray(i);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, q = 0; p < width * height; p++, q += 3) {
    const j = p * 4;
    rgba[j] = rgb[q]; rgba[j + 1] = rgb[q + 1]; rgba[j + 2] = rgb[q + 2]; rgba[j + 3] = 255;
  }
  return { width, height, data: rgba };
}

function pageSizePt(pdfPath: string, page: number): [number, number] {
  const info = execFileSync('pdfinfo', ['-f', String(page), '-l', String(page), pdfPath], { encoding: 'utf8' });
  const m = info.match(/Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/i)
    || info.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/i);
  if (!m) throw new Error(`Cannot read page size for page ${page}`);
  return [Number(m[1]), Number(m[2])];
}

function pageCount(pdfPath: string): number {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const m = info.match(/^Pages:\s+(\d+)/mi);
  if (!m) throw new Error('Cannot read PDF page count');
  return Number(m[1]);
}

function tesseractWords(ppmPath: string, image: RasterImageData, pageWidthPt: number, pageHeightPt: number, language: string, psm = 6): OcrWordItem[] {
  const tsv = execFileSync('tesseract', [ppmPath, 'stdout', '-l', language, '--psm', String(psm), 'tsv'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const sx = pageWidthPt / image.width;
  const sy = pageHeightPt / image.height;
  const words: OcrWordItem[] = [];
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const c = line.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const str = c.slice(11).join('\t').trim();
    if (!str) continue;
    const confidence = Number(c[10]);
    const left = Number(c[6]), top = Number(c[7]), w = Number(c[8]), h = Number(c[9]);
    words.push({ x: left * sx, yTop: top * sy, w: w * sx, h: h * sy, str, confidence });
  }
  return words;
}

export function analyzePdfPageWithSystemTools(pdfPath: string, options: SystemPdfAnalyzeOptions = {}) {
  const page = options.page ?? 1;
  const dpi = options.dpi ?? 144;
  const language = options.language ?? 'ita';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-cte-node-'));
  try {
    const root = path.join(tmp, 'page');
    execFileSync('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-r', String(dpi), pdfPath, root], { stdio: 'ignore' });
    const ppmPath = `${root}.ppm`;
    const image = parsePpm(fs.readFileSync(ppmPath));
    const [pageWidthPt, pageHeightPt] = pageSizePt(pdfPath, page);
    // Two complementary OCR layouts: block mode is stable for prose, sparse mode
    // recovers isolated table labels and row values that block OCR often misses.
    const blockWords = tesseractWords(ppmPath, image, pageWidthPt, pageHeightPt, language, 6);
    const sparseWords = tesseractWords(ppmPath, image, pageWidthPt, pageHeightPt, language, 11);
    const words = mergeOcrWordStreams([blockWords, sparseWords]);
    const semanticTextItems = reconstructSemanticText(words);
    const analysis = analyzeRasterPage({
      pageNumber: page,
      pageWidthPt,
      pageHeightPt,
      image,
      geometryMaskTextItems: blockWords,
      semanticTextItems,
    });
    return {
      source: path.resolve(pdfPath),
      page,
      pageWidthPt,
      pageHeightPt,
      ocrWords: words,
      semanticTextItems,
      primitiveCounts: {
        horizontalLines: analysis.primitives.lines.length,
        verticalLines: analysis.primitives.verticalLines?.length ?? 0,
        boxes: analysis.primitives.boxes.length,
        checkboxes: analysis.primitives.boxes.filter((b) => b.isCheckbox).length,
      },
      hybridDiagnostics: analysis.hybrid.diagnostics,
      authoritativeFields: analysis.hybrid.authoritativeFields,
      results: analysis.hybrid.results,
      unresolvedPotentialLabels: analysis.hybrid.unresolvedPotentialLabels,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function analyzePdfWithSystemTools(pdfPath: string, options: Omit<SystemPdfAnalyzeOptions, 'page'> = {}) {
  const pages = [];
  const count = pageCount(pdfPath);
  for (let page = 1; page <= count; page++) pages.push(analyzePdfPageWithSystemTools(pdfPath, { ...options, page }));
  return { source: path.resolve(pdfPath), pageCount: count, pages };
}
