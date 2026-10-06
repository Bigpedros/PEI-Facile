import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { processDocumentAcquisition } from '../src/core/documentAcquisitionService';
import { computeSha256 } from '../src/core/templateSourceResolver';

pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.mjs');

async function main() {
  const fixturePath = path.resolve(process.cwd(), 'Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
  if (!fs.existsSync(fixturePath)) {
    console.error('Fixture non trovata:', fixturePath);
    process.exit(1);
  }

  const rawBytes = fs.readFileSync(fixturePath);
  console.log('Esecuzione pipeline reale di acquisizione (GeometricRectificationEngine + buildCanonicalA4Pdf)...');

  const acquisitionResult = await processDocumentAcquisition(
    rawBytes.buffer.slice(0),
    'PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf',
    {
      customOcrRunner: async () => ({ text: 'Mock OCR text', confidence: 90 }),
    }
  );

  if (!acquisitionResult.canonicalDocument) {
    console.error('Errore: canonicalDocument non generato.');
    process.exit(1);
  }

  const normPdfBytes = new Uint8Array(acquisitionResult.canonicalDocument);
  const outputSha256 = await computeSha256(normPdfBytes);
  console.log('=== NUOVO PDF RASTERIZZATO EFFICACE SHA-256 ===', outputSha256);

  const downloadDir = path.resolve(process.cwd(), 'public/downloads');
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }
  const outputPdfPath = path.join(downloadDir, 'PEI_Comune_Roma_Rettificato_A4.pdf');
  fs.writeFileSync(outputPdfPath, normPdfBytes);
  console.log('PDF salvato in:', outputPdfPath);
}

main().catch(err => {
  console.error('Errore esecuzione script:', err);
  process.exit(1);
});
