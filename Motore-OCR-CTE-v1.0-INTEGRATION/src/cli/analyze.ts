import fs from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { collectPageRuntimeDiagnostics } from '../core/assistedFieldDetectionService';

const [, , inputPath, outputPath = 'diagnostic.json'] = process.argv;
if (!inputPath) {
  console.error('Usage: npm run analyze -- <document.pdf> [output.json]');
  process.exit(2);
}
const bytes = new Uint8Array(await fs.readFile(inputPath));
const pdf = await pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise;
const pages = [];
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
  const page = await pdf.getPage(pageNumber);
  // Vector/text path works in Node. Raster canvas path is enabled by a future CanvasAdapter.
  pages.push(await collectPageRuntimeDiagnostics(page, { pageNumber }));
}
await fs.writeFile(outputPath, JSON.stringify({ source: inputPath, pages }, null, 2));
console.log(`Wrote ${outputPath}`);
