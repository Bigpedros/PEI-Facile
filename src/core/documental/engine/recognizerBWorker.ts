import type {OcrsWasmInstance,OcrsWasmRecognizerBOptions} from '../vendor/motore-ocr-ai/src/core/ocr/recognizerB';

/** WASM inference is synchronous; keep it off the UI thread and terminate on abort. */
export function createWorkerRuntime(options:OcrsWasmRecognizerBOptions):Promise<OcrsWasmInstance>{
 const worker=new Worker(new URL('./recognizerB.worker.ts',import.meta.url),{type:'module'});
 let nextId=0,disposed=false;
 const pending=new Map<number,{resolve:(value:string)=>void;reject:(error:Error)=>void}>();
 const fail=(error:Error)=>{for(const request of pending.values())request.reject(error);pending.clear();};
 worker.onmessage=({data})=>{const request=pending.get(data.id);if(!request)return;pending.delete(data.id);if(data.error)request.reject(new Error(data.error));else request.resolve(data.result);};
 worker.onerror=event=>{disposed=true;worker.terminate();fail(new Error(event.message||'Errore nel worker OCRS/RTen'));};
 worker.postMessage({kind:'initialize',options});
 return Promise.resolve({
  recognize_rgba(pixels,width,height){
   if(disposed)return Promise.reject(new Error('Worker OCRS terminato'));
   const id=nextId++;
   return new Promise<string>((resolve,reject)=>{
    pending.set(id,{resolve,reject});const buffer=pixels.buffer as ArrayBuffer;
    try{worker.postMessage({kind:'recognize',id,pixels:buffer,width,height},[buffer]);}
    catch(error){pending.delete(id);reject(error);}
   });
  },
  free(){disposed=true;worker.terminate();fail(new Error('Worker OCRS terminato'));},
 });
}
