/// <reference lib="webworker" />
import type {OcrsWasmRecognizerBOptions} from '../vendor/motore-ocr-ai/src/core/ocr/recognizerB';
const scope=self as unknown as DedicatedWorkerGlobalScope;
interface Runtime{recognize_rgba(pixels:Uint8Array,width:number,height:number):string}
let runtime:Promise<Runtime>|undefined;
async function bytes(url:string){
 const response=await fetch(url);if(!response.ok)throw Error(`${response.status} per ${url}`);
 if(response.headers.get('content-type')?.includes('text/html'))throw Error(`Asset modello non valido (HTML): ${url}`);
 const data=new Uint8Array(await response.arrayBuffer());if(!data.length)throw Error(`Asset vuoto: ${url}`);return data;
}
async function load(options:OcrsWasmRecognizerBOptions):Promise<Runtime>{
 const [module,detection,recognition]=await Promise.all([
  import(/* @vite-ignore */ options.moduleUrl!),bytes(options.detectionModelUrl!),bytes(options.recognitionModelUrl!),
 ]);
 await module.default();if(typeof module.OcrsRecognizer!=='function')throw Error('OcrsRecognizer non esportato');
 return new module.OcrsRecognizer(detection,recognition);
}
scope.onmessage=async({data})=>{
 if(data.kind==='initialize'){runtime=load(data.options);void runtime.catch(()=>{});return;}
 if(data.kind!=='recognize')return;
 try{if(!runtime)throw Error('Worker OCRS non inizializzato');const engine=await runtime;
  const result=engine.recognize_rgba(new Uint8Array(data.pixels),data.width,data.height);scope.postMessage({id:data.id,result});
 }catch(error){scope.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)});}
};
