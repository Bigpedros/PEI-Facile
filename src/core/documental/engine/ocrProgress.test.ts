import {describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({logger:undefined as any}));
const worker=vi.hoisted(()=>({setParameters:vi.fn(async()=>{}),terminate:vi.fn(async()=>{}),recognize:vi.fn(async()=>{state.logger({status:'recognizing text',progress:.5});return {data:{text:'',blocks:[]}};})}));
vi.mock('tesseract.js',()=>({createWorker:vi.fn(async(_lang,_mode,options)=>{state.logger=options.logger;return worker;})}));
import {createWorker} from 'tesseract.js';
import {LocalRecognizer} from './ocr';
import type {EngineOptions} from './types';
describe('reused local OCR worker progress',()=>{
 it('reports the current page on a warm worker without reinitializing OCR',async()=>{
  const messages:string[]=[];
  const recognizer=new LocalRecognizer({profile:'pei',language:'ita',dpi:200,segmentation:'auto',forceOcr:false,contrast:true,rotation:0,maxPages:100,onProgress:message=>messages.push(message)} as EngineOptions);
  try{
   await recognizer.recognize({} as HTMLCanvasElement,1);
   await recognizer.recognize({} as HTMLCanvasElement,7);
   await recognizer.recognize({} as HTMLCanvasElement,12);
   expect(messages).toEqual(['Pagina 1 · lettura testo','Pagina 7 · lettura testo','Pagina 12 · lettura testo']);
   expect(createWorker).toHaveBeenCalledTimes(1);
  }finally{await recognizer.terminate();}
  expect(worker.terminate).toHaveBeenCalledTimes(1);
 });
});
