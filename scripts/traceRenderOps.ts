import * as fs from 'fs';
import * as path from 'path';

async function test() {
  const napi = await import('@napi-rs/canvas');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const pdfPath = path.resolve('./Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
  const buf = fs.readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  console.log('Total ops:', ops.fnArray.length);
  for (let i = 0; i < ops.fnArray.length; i++) {
    console.log(`Op ${i}: fn=${ops.fnArray[i]} args=`, ops.argsArray[i]);
  }
}

test().catch(console.error);
