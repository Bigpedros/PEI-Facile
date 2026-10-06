import * as fs from 'fs';
import * as path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as napi from '@napi-rs/canvas';

async function test() {
  const pdfPath = path.resolve('./Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
  const buf = fs.readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  const w = Math.floor(viewport.width);
  const h = Math.floor(viewport.height);
  
  const canvas = napi.createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  
  const ops = await page.getOperatorList();
  let currentTransform = [1, 0, 0, 1, 0, 0];
  const transformStack: number[][] = [];
  
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    
    if (fn === pdfjs.OPS.save) {
      transformStack.push([...currentTransform]);
    } else if (fn === pdfjs.OPS.restore) {
      if (transformStack.length > 0) {
        currentTransform = transformStack.pop()!;
      }
    } else if (fn === pdfjs.OPS.transform) {
      currentTransform = (pdfjs as any).Util.transform(currentTransform, args);
    } else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintXObject) {
      const imgName = args[0];
      await new Promise<void>((resolve) => {
        page.objs.get(imgName, (img: any) => {
          if (img && img.data && img.width && img.height) {
            const imgW = img.width;
            const imgH = img.height;
            const channels = Math.round(img.data.length / (imgW * imgH));
            const rgba = new Uint8ClampedArray(imgW * imgH * 4);
            for (let p = 0; p < imgW * imgH; p++) {
              if (channels === 3) {
                rgba[p * 4] = img.data[p * 3];
                rgba[p * 4 + 1] = img.data[p * 3 + 1];
                rgba[p * 4 + 2] = img.data[p * 3 + 2];
                rgba[p * 4 + 3] = 255;
              } else if (channels === 4) {
                rgba[p * 4] = img.data[p * 4];
                rgba[p * 4 + 1] = img.data[p * 4 + 1];
                rgba[p * 4 + 2] = img.data[p * 4 + 2];
                rgba[p * 4 + 3] = img.data[p * 4 + 3];
              } else {
                rgba[p * 4] = img.data[p];
                rgba[p * 4 + 1] = img.data[p];
                rgba[p * 4 + 2] = img.data[p];
                rgba[p * 4 + 3] = 255;
              }
            }
            const imgCanvas = napi.createCanvas(imgW, imgH);
            const imgCtx = imgCanvas.getContext('2d');
            const imgData = imgCtx.createImageData(imgW, imgH);
            imgData.data.set(rgba);
            imgCtx.putImageData(imgData, 0, 0);
            
            // Exact PDF matrix math
            const combined = (pdfjs as any).Util.transform(viewport.transform, currentTransform);
            ctx.save();
            ctx.transform(combined[0], combined[1], combined[2], combined[3], combined[4], combined[5]);
            ctx.drawImage(imgCanvas, 0, 0, 1, 1);
            ctx.restore();
          }
          resolve();
        });
      });
    }
  }
  
  const png = canvas.toBuffer('image/png');
  fs.writeFileSync('./public/downloads/test_exact_transform_page1.png', png);
  console.log('Saved test_exact_transform_page1.png, size:', png.length);
}

test().catch(console.error);
