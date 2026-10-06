import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { processDocumentAcquisition } from '../src/core/documentAcquisitionService';
import { computeSha256 } from '../src/core/templateSourceResolver';

pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.mjs');

async function main() {
  const fixturePath = path.resolve(process.cwd(), 'Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
  const rawBytes = fs.readFileSync(fixturePath);

  console.log('3. Verificando inizialmente soltanto pagina 1 tramite processDocumentAcquisition...');
  const acquisitionResult = await processDocumentAcquisition(
    rawBytes.buffer.slice(0),
    'PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf',
    {
      customOcrRunner: async () => ({ text: 'Mock OCR text', confidence: 90 }),
    }
  );

  if (!acquisitionResult.canonicalDocument) {
    throw new Error('ERRORE: canonicalDocument non generato.');
  }

  const normPdfBytes = new Uint8Array(acquisitionResult.canonicalDocument);
  const outputSha256 = await computeSha256(normPdfBytes);
  console.log('=== NUOVO PDF VERIFICATO SHA-256 ===', outputSha256);

  const downloadDir = path.resolve(process.cwd(), 'public/downloads');
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }
  const outputPdfPath = path.join(downloadDir, 'PEI_Comune_Roma_Rettificato_A4.pdf');
  fs.writeFileSync(outputPdfPath, normPdfBytes);

  console.log('5. Riapertura e renderizzazione di controllo del PDF finale...');
  const outDoc = await pdfjsLib.getDocument({ data: normPdfBytes, useSystemFonts: true, disableWorker: true } as any).promise;
  console.log('Pagine totali PDF finale:', outDoc.numPages);
  if (outDoc.numPages !== 12) {
    throw new Error(`Attese 12 pagine, trovate ${outDoc.numPages}`);
  }

  const page1 = await outDoc.getPage(1);
  const page3 = await outDoc.getPage(3);
  if (!page1 || !page3) {
    throw new Error('Impossibile caricare pagina 1 o pagina 3 dal PDF finale.');
  }

  console.log('Pagina 1 e Pagina 3 caricate e verificate con successo dal PDF finale.');
  console.log('VERIFICA COMPLETATA CON SUCCESSO.');
}

main().catch(err => {
  console.error('Errore esecuzione script:', err);
  process.exit(1);
});
