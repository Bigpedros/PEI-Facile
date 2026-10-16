import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({worker:{setParameters:vi.fn(async(_params:Record<string,unknown>)=>{}),recognize:vi.fn(),terminate:vi.fn(async()=>{})},create:vi.fn(),sizes:[] as {width:number;height:number}[]}));
vi.mock('tesseract.js',()=>({createWorker:mocks.create}));
import {LocalRecognizer} from './engine/ocr';
const options={profile:'pei' as const,language:'ita' as const,forceOcr:true,contrast:true,rotation:0 as const,dpi:200,maxPages:1,segmentation:'auto' as const};
const region={box:{x:100,y:200,width:100,height:50},reason:'oversized-token',kind:'text' as const,tokenIds:['a'],priority:100};
beforeEach(()=>{vi.clearAllMocks();mocks.sizes=[];mocks.create.mockResolvedValue(mocks.worker);mocks.worker.recognize.mockImplementation(async(c:HTMLCanvasElement)=>{mocks.sizes.push({width:c.width,height:c.height});return {data:{text:'Nome',blocks:[{paragraphs:[{lines:[{words:[{text:'Nome',confidence:96,bbox:{x0:5,y0:6,x1:25,y1:16}}]}]}]}]}};});});
describe('Fase 5: rilettura locale Tesseract',()=>{
 it('riusa il worker, rimappa le coordinate del ritaglio e ripristina la segmentazione originale',async()=>{
  const c=Object.assign(document.createElement('canvas'),{width:800,height:1100}),before=c.toDataURL(),r=new LocalRecognizer(options);
  try{await r.recognize(c,1);const local=await r.recognizeRegions(c,1,[region]);expect(mocks.create).toHaveBeenCalledTimes(1);expect(mocks.sizes).toEqual([{width:800,height:1100},{width:116,height:66}]);expect(local[0]).toMatchObject({text:'Nome',box:{x:97,y:198,width:20,height:10},lineId:'p1-ar0-l0'});expect(mocks.worker.setParameters.mock.calls.map(c=>c[0].tessedit_pageseg_mode)).toEqual([3,11,3]);expect(c.toDataURL()).toBe(before);
  }finally{await r.terminate();}expect(mocks.worker.terminate).toHaveBeenCalledTimes(1);
 });
 it('ripristina i parametri anche se il riconoscimento regionale fallisce',async()=>{
  const c=Object.assign(document.createElement('canvas'),{width:800,height:1100}),r=new LocalRecognizer(options);try{await r.recognize(c,1);mocks.worker.recognize.mockRejectedValueOnce(Error('read failed'));await expect(r.recognizeRegions(c,1,[region])).rejects.toThrow('read failed');expect(mocks.worker.setParameters).toHaveBeenLastCalledWith({tessedit_pageseg_mode:3});}finally{await r.terminate();}
 });
 it('un annullamento antecedente non avvia alcun worker',async()=>{
  const c=new AbortController();c.abort();const r=new LocalRecognizer({...options,signal:c.signal});await expect(r.recognizeRegions(document.createElement('canvas'),1,[region])).rejects.toMatchObject({name:'AbortError'});expect(mocks.create).not.toHaveBeenCalled();await r.terminate();
 });
});
