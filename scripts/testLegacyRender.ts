import * as fs from 'fs';
import * as path from 'path';

async function test() {
  const napi = await import('@napi-rs/canvas');
  if (!globalThis.DOMMatrix && napi.DOMMatrix) {
    (globalThis as any).DOMMatrix = napi.DOMMatrix;
  }
  if (!globalThis.ImageData && napi.ImageData) {
    (globalThis as any).ImageData = napi.ImageData;
  }
  if (!globalThis.Path2D && napi.Path2D) {
    (globalThis as any).Path2D = napi.Path2D;
  }

  class NodeCanvasFactory {
    create(width: number, height: number) {
      console.log(`NodeCanvasFactory.create: ${width}x${height}`);
      const canvas = napi.createCanvas(width, height);
      return {
        canvas,
        context: canvas.getContext('2d'),
      };
    }
    reset(canvasAndContext: any, width: number, height: number) {
      console.log(`NodeCanvasFactory.reset: ${width}x${height}`);
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
    destroy(canvasAndContext: any) {
      console.log(`NodeCanvasFactory.destroy`);
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const pdfPath = path.resolve('./Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf');
  const buf = fs.readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  const w = Math.floor(viewport.width);
  const h = Math.floor(viewport.height);

  const canvas = napi.createCanvas(w, h);
  const realCtx = canvas.getContext('2d');

  console.log('Starting render...');
  const renderTask = page.render({
    canvasContext: realCtx as any,
    viewport,
    canvasFactory: new NodeCanvasFactory() as any,
  });
  await renderTask.promise;
  console.log('Done!');
}

test().catch(console.error);
