import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./engine',()=>({analyzeDocument:vi.fn()}));
import {analyzeDocument} from './engine';
import {runDocumental} from './bridge';
import type {EngineOptions,PageResult,DocumentResult} from './engine/types';
const page=(pageNumber:number)=>({pageNumber} as PageResult);
function simulate(count:number){
 return async (_file:File,options:EngineOptions)=>{
  options.onPageCount?.(count);
  for(let i=1;i<=count;i++){
   options.onProgress?.(`Pagina ${i} · lettura testo`,.8);
   options.onProgress?.(`Pagina ${i} · analisi di celle e righe`,0);
   options.onPage?.(page(i));
  }
  return {pages:Array.from({length:count},(_,i)=>page(i+1))} as DocumentResult;
 };
}
describe('document acquisition progress',()=>{
 beforeEach(()=>{vi.mocked(analyzeDocument).mockReset();});
 it('reports all 12 pages, known total and monotonic progress below final review',async()=>{
  vi.mocked(analyzeDocument).mockImplementation(simulate(12));
  const progress:any[]=[],completed:PageResult[]=[];
  await runDocumental(new File(['pdf'],'test.pdf'),'test.pdf',{onProgress:p=>progress.push(p),onDocumentalPage:p=>completed.push(p)});
  expect([...new Set(progress.map(p=>p.currentPage))]).toEqual(Array.from({length:12},(_,i)=>i+1));
  expect(progress.every(p=>p.totalPages===12)).toBe(true);
  expect(progress.map(p=>p.percentage)).toEqual(progress.map(p=>p.percentage).sort((a,b)=>a-b));
  expect(progress.at(-1).percentage).toBe(85);
  expect(completed.map(p=>p.pageNumber)).toEqual(Array.from({length:12},(_,i)=>i+1));
 });
 it('offsets page callbacks and labels across multiple input files',async()=>{
  vi.mocked(analyzeDocument).mockImplementationOnce(simulate(2)).mockImplementationOnce(simulate(3));
  const progress:any[]=[],completed:PageResult[]=[];
  const result=await runDocumental([new File(['a'],'a.pdf'),new File(['b'],'b.pdf')],'all.pdf',{onProgress:p=>progress.push(p),onDocumentalPage:p=>completed.push(p)});
  expect(result.pages.map(p=>p.pageNumber)).toEqual([1,2,3,4,5]);
  expect(completed.map(p=>p.pageNumber)).toEqual([1,2,3,4,5]);
  expect(progress.find(p=>p.currentPage===3).stageLabel).toBe('Pagina 3 · lettura testo');
  expect(progress.at(-1).totalPages).toBe(5);
  expect(progress.at(-1).percentage).toBe(85);
 });
 it('propagates cancellation without returning a partial acquisition',async()=>{
  const controller=new AbortController();controller.abort();
  vi.mocked(analyzeDocument).mockImplementation(async(_file,options)=>{options.signal?.throwIfAborted();throw new Error('unreachable');});
  await expect(runDocumental(new File(['a'],'a.pdf'),'a.pdf',{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 });
});
