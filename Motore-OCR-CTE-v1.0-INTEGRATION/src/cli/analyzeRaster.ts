import fs from 'node:fs/promises';
import { analyzePdfPageWithSystemTools, analyzePdfWithSystemTools } from '../node/systemPdfAnalyzer';

const args = process.argv.slice(2);
const inputPath = args[0];
if (!inputPath) {
  console.error('Usage: npm run analyze:raster -- <document.pdf> [output.json] [--page N]');
  process.exit(2);
}
let outputPath = args[1] && !args[1].startsWith('--') ? args[1] : 'raster-diagnostic.json';
const pageIndex = args.indexOf('--page');
const page = pageIndex >= 0 ? Number(args[pageIndex + 1]) : undefined;
const result = page ? analyzePdfPageWithSystemTools(inputPath, { page }) : analyzePdfWithSystemTools(inputPath);
await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(`Wrote ${outputPath}`);
