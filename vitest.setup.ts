/**
 * Vitest environment setup for DOM/Canvas globals in Node.js
 */

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: PredefinedColorSpace = 'srgb';
    constructor(dataOrWidth: any, widthOrHeight: any, height?: any) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? (dataOrWidth.length / (widthOrHeight * 4));
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  } as any;
}

import { createCanvas, DOMMatrix, Path2D } from '@napi-rs/canvas';
if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix as any;
if (!globalThis.Path2D) globalThis.Path2D = Path2D as any;
try {
  if (typeof document !== 'undefined') {
    const origCreateElement = document.createElement.bind(document);
    document.createElement = function (tagName: string, options?: any) {
      if (tagName.toLowerCase() === 'canvas') {
        const c = createCanvas(300, 150);
        return c as any;
      }
      return origCreateElement(tagName, options);
    };
  }
} catch {
  // Fallback mocks
}


import {ImageData as NativeImageData,loadImage} from '@napi-rs/canvas';
(globalThis as any).ImageData=NativeImageData;
(globalThis as any).createImageBitmap=async(blob:Blob)=>{const bytes=typeof blob.arrayBuffer==='function'?await blob.arrayBuffer():await new Promise<ArrayBuffer>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as ArrayBuffer);r.onerror=()=>reject(r.error);r.readAsArrayBuffer(blob);});return loadImage(Buffer.from(bytes));};

// Real browser libraries adapted to Node I/O, without replacing OCR/render results.
// PDF.js and Tesseract cannot fetch Vite's /vendor URLs inside a Node worker.
import {vi} from 'vitest';
vi.mock('pdfjs-dist',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('pdfjs-dist')>();
 return {...actual,getDocument:(input:any)=>actual.getDocument(typeof input==='object'?{...input,
  standardFontDataUrl:process.cwd()+'/public/vendor/standard_fonts/',
  cMapUrl:process.cwd()+'/public/vendor/cmaps/',cMapPacked:true}:input)};
});
vi.mock('tesseract.js',async()=>{
 const {createRequire}=await import('node:module');
 const require=createRequire(import.meta.url);
 const savedWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const savedDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 let actual:any;
 try{Object.defineProperty(globalThis,'window',{value:undefined,configurable:true});Object.defineProperty(globalThis,'document',{value:undefined,configurable:true});actual=require('tesseract.js');}
 finally{if(savedWindow)Object.defineProperty(globalThis,'window',savedWindow);if(savedDocument)Object.defineProperty(globalThis,'document',savedDocument);}
 return {...actual,createWorker:async(language:any,oem:any,options:any)=>{
  const worker=await actual.createWorker(language,oem,{...options,
   workerPath:process.cwd()+'/node_modules/tesseract.js/src/worker-script/node/index.js',
   langPath:process.cwd()+'/public/vendor/lang/'});
  const recognize=worker.recognize.bind(worker);
  worker.recognize=(image:any,...args:any[])=>recognize(typeof image?.toDataURL==='function'?image.toDataURL('image/png'):image,...args);
  return worker;
 }};
});
