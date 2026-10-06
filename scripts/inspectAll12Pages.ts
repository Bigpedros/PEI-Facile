import * as fs from 'fs';
import * as path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function inspect() {
  const pdfPath = path.resolve('./Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
  const buf = fs.readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  
  console.log(`=== ANALISI STRUTTURALE 12 PAGINE (Totale: ${doc.numPages}) ===`);
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const view = page.getViewport({ scale: 1.0 });
    const ops = await page.getOperatorList();
    const text = await page.getTextContent();
    
    const imageOps = ops.fnArray.filter((f: number) => f === 85 || f === 86 || f === 82 || f === 83 || f === 1);
    console.log(`Pagina ${i}: Dim=${view.width}x${view.height} | Ops=${ops.fnArray.length} | ImgOps=${imageOps.length} | TextItems=${text.items.length}`);
    for (let j = 0; j < ops.fnArray.length; j++) {
      if (ops.fnArray[j] === 85 || ops.fnArray[j] === 12) {
        console.log(`  Op ${j} (fn=${ops.fnArray[j]}):`, ops.argsArray[j]);
      }
    }
  }
}

inspect().catch(console.error);
