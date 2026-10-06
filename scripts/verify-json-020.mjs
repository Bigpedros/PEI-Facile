import {createServer} from 'vite';import {chromium} from '@playwright/test';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),dir=process.env.PEI_TEST_JSON_DIR||path.resolve(root,'../upload'),out=path.join(root,'test-output/integration-020');
const server=await createServer({root,server:{host:'127.0.0.1',port:3198,hmr:false,watch:null,fs:{allow:[root,dir]}}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();const reports=[];
try{await page.goto('http://127.0.0.1:3198/scripts/integration-check.html');await page.waitForFunction(()=>window.integration);
 for(const name of (await fs.readdir(dir)).filter(n=>n.endsWith('.ocr.json'))){
  const summary=await page.evaluate(async filename=>{
   const doc=await fetch('/@fs/'+filename).then(r=>r.json()),api=window.integration;let values=0,preserved=0,oldCount=0,newCount=0;const pages=[];
   for(const p of doc.pages){
    const mapped=api.pageCandidates(p);oldCount+=p.fields.length;
    for(let i=0;i<p.fields.filter(f=>f.status!=='ignored').length;i++){const original=p.fields.filter(f=>f.status!=='ignored')[i];if(original.value!==''&&original.value!==false)values++;if(mapped[i].defaultValue===original.value&&mapped[i].originalValue===original.originalValue)preserved++;}
    const img=new Image();img.src=p.image;await img.decode();const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;canvas.getContext('2d').drawImage(img,0,0);
    const fields=api.inferFields(canvas,api.fieldTokens(p.tokens,p.regions),p.regions);newCount+=fields.length;
    pages.push({page:p.pageNumber,source:p.source,previousCandidates:p.fields.length,recomputedCandidates:fields.length,textCharacters:p.text.length});canvas.width=canvas.height=1;
   }
   return {pages,oldCount,newCount,nonemptyValues:values,adapterPreserved:preserved,expectedPreserved:doc.pages.reduce((n,p)=>n+p.fields.filter(f=>f.status!=='ignored').length,0)};
  },path.join(dir,name));assert.equal(summary.adapterPreserved,summary.expectedPreserved);reports.push({file:name,...summary});
 }
 await fs.writeFile(path.join(out,'json-verification.json'),JSON.stringify(reports,null,2));console.log(reports.map(r=>({pages:r.pages.length,old:r.oldCount,new:r.newCount,preserved:r.adapterPreserved})));
}finally{await browser.close();await server.close();}
