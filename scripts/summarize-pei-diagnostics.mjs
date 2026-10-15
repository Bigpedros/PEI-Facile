// Read-only comparison: emits counts/reasons, never copies document text or images.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const baseline=JSON.parse(fs.readFileSync(new URL('../docs/baselines/pei-roma-20261015.json',import.meta.url),'utf8'));
export function summarizeDiagnostics(files){
 const byPage=new Map();
 for(const file of files){
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!d.document?.pageNumber)continue;
  const page=d.document.pageNumber;
  if(byPage.has(page))throw Error(`Più diagnostiche per pagina ${page}: scegliere una sola esecuzione.`);
  const audit=d.fieldInference?.firstPass;
  byPage.set(page,{page,diagnosticRevision:d.detectionRevision??null,
   proposedFields:d.finalProposedFields?.length??null,
   ocrWords:d.textItems?.length??null,regions:d.rasterBoxes?.length??null,
   secondReader:d.secondReader??null,exclusionReasons:audit?.summary.reasons??null,
   hasRegionAudit:!!audit,
  });
 }
 return {schema:'PEI_BASELINE_COMPARISON_V1',baselineProvenance:baseline.provenance,
  pages:baseline.pages.map(b=>({page:b.page,baselineVisibleFields:b.visibleFields,
   measured:byPage.get(b.page)??null,
   fieldCountDelta:byPage.get(b.page)?.proposedFields!=null?byPage.get(b.page).proposedFields-b.visibleFields:null})),
  suppliedPages:byPage.size,missingPages:baseline.pages.filter(b=>!byPage.has(b.page)).map(b=>b.page),
  note:'A field-count change is not an accuracy verdict. Missing measurements are null, never zero.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(!args.length){console.error('Uso: node scripts/summarize-pei-diagnostics.mjs <JSON o cartella> [...]');process.exitCode=1;}
 else{
  const files=args.flatMap(p=>fs.statSync(p).isDirectory()?fs.readdirSync(p).filter(n=>n.startsWith('PEI_diagnostica_')&&n.endsWith('.json')).map(n=>path.join(p,n)):[p]);
  console.log(JSON.stringify(summarizeDiagnostics(files),null,2));
 }
}
