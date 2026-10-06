import {createWorker} from 'tesseract.js';
const OEM={LSTM_ONLY:1};
const PSM={AUTO:3,SINGLE_BLOCK:6,SPARSE_TEXT:11};
type Worker = Awaited<ReturnType<typeof createWorker>>;
import type {EngineOptions,Token} from './types';
export class LocalRecognizer {
 private worker:Worker|undefined;
 private terminated=false;
 constructor(private options:EngineOptions){}
 async recognize(canvas:HTMLCanvasElement,page:number):Promise<{tokens:Token[];text:string}> {
 this.options.signal?.throwIfAborted();
 if(!this.worker){
 const base=new URL(import.meta.env.BASE_URL,location.href).href;
 const creation=createWorker(this.options.language,OEM.LSTM_ONLY,{workerPath:base+'vendor/worker.min.js',corePath:base+'vendor/core',langPath:base+'vendor/lang',logger:m=>{if(!this.terminated&&!this.options.signal?.aborted)this.options.onProgress?.(`Pagina ${page} · ${translate(m.status)}`,m.progress);}});
 void creation.then(worker=>{if(this.terminated||this.options.signal?.aborted)void worker.terminate();},()=>{});
 const pending=await abortable(creation,this.options.signal);
 if(this.terminated||this.options.signal?.aborted){await pending.terminate();throw new DOMException('Interrotto','AbortError');}
 this.worker=pending;
 await this.worker.setParameters({tessedit_pageseg_mode:this.options.segmentation==='block'?PSM.SINGLE_BLOCK:this.options.segmentation==='sparse'?PSM.SPARSE_TEXT:PSM.AUTO,preserve_interword_spaces:'1',user_defined_dpi:String(this.options.dpi)});
 }
 const {data}=await abortable(this.worker.recognize(canvas,{}, {text:true,blocks:true}) as Promise<any>,this.options.signal);
 const tokens:Token[]=[];let lineIndex=0;
 for(const block of data.blocks||[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines){
 const lineId=`p${page}-l${lineIndex++}`;
 for(const word of line.words){const b=word.bbox;if(!word.text.trim())continue;tokens.push({id:`p${page}-t${tokens.length}`,text:word.text,confidence:word.confidence,source:'ocr',lineId,box:{x:b.x0,y:b.y0,width:b.x1-b.x0,height:b.y1-b.y0}});}
 }
 return {tokens,text:data.text};
 }
 async terminate(){this.terminated=true;const worker=this.worker;this.worker=undefined;if(worker)await worker.terminate();}
}
function translate(s:string){return ({'loading tesseract core':'caricamento OCR','initializing tesseract':'inizializzazione OCR','loading language traineddata':'caricamento lingua','initializing api':'preparazione lettura','recognizing text':'lettura testo'} as Record<string,string>)[s]||s;}

function abortable<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T> {
 if(!signal)return promise;
 if(signal.aborted)return Promise.reject(new DOMException('Interrotto','AbortError'));
 return new Promise((resolve,reject)=>{
 const stop=()=>reject(new DOMException('Interrotto','AbortError'));
 signal.addEventListener('abort',stop,{once:true});
 promise.then(value=>{signal.removeEventListener('abort',stop);resolve(value);},error=>{signal.removeEventListener('abort',stop);reject(error);});
 });
}
