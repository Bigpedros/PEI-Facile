import { analyzeRasterPage } from './engine';
import { pdfWidgetFields } from './engine/load';
import * as pdfjs from 'pdfjs-dist';
import { LocalRecognizer } from './engine/ocr';
import { assignLines } from './engine/geometry';
import { pageCandidates } from './bridge';
import { renderPdfPageToCanvas } from '../pdfIntakeService';
import type { EngineOptions, Token } from './engine/types';
export async function detectCanonicalPageFields(page:any,number:number,custom?:any,suppliedCanvas?:HTMLCanvasElement){
 // Detection uses a dedicated PDF raster at a stable resolution. The preview
 // canvas varies with zoom and must not change OCR or field geometry.
 const scale=200/72;
 const canvas=await renderPdfPageToCanvas(page,scale);
 const content=await page.getTextContent();const tokens:Token[]=[];
 for(const item of content.items){if(!('str' in item)||!item.str.trim())continue;
  const tx=page.getViewport({scale}).transform;
  const x=tx[0]*item.transform[4]+tx[2]*item.transform[5]+tx[4];
  const baseline=tx[1]*item.transform[4]+tx[3]*item.transform[5]+tx[5];
  const height=(item.height||Math.hypot(item.transform[2],item.transform[3]))*scale;
  tokens.push({id:`p${number}-t${tokens.length}`,text:item.str,box:{x,y:baseline-height*(content.styles?.[item.fontName]?.ascent??.8),width:item.width*scale,height},source:'pdf',confidence:null,lineId:''});
 }
 const opts:EngineOptions={profile:'pei',language:'ita',forceOcr:false,contrast:true,rotation:0,dpi:200,maxPages:100,segmentation:'auto',customOcrRunner:custom?async c=>{const r=await custom(c);return {text:r.text??r.rawText??'',confidence:r.confidence,tokens:r.words?assignLines(r.words.map((w:any,i:number)=>({id:`p${number}-ocr${i}`,text:w.text,confidence:w.confidence,source:'ocr',lineId:'',box:{x:w.bbox.x0,y:w.bbox.y0,width:w.bbox.x1-w.bbox.x0,height:w.bbox.y1-w.bbox.y0}}))):undefined};}:undefined};
 const nativeFields=await pdfWidgetFields(page,page.getViewport({scale}));
 const operators=await page.getOperatorList();
 const hasRasterImages=operators.fnArray.some((op:number)=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject].includes(op));
 const recognizer=new LocalRecognizer(opts);
 try{const result=await analyzeRasterPage({canvas,hasRasterImages,nativeFields,nativeTokens:assignLines(tokens),pageNumber:number,warnings:[],physicalSizeMm:{width:canvas.width/scale/72*25.4,height:canvas.height/scale/72*25.4}},opts,recognizer,true);return {fields:pageCandidates(result),textItems:content.items.filter((i:any)=>'str'in i&&i.str.trim()).length,tokens:result.tokens.length,source:result.source,regions:result.regions.length,page:result};}
 finally{await recognizer.terminate();canvas.width=canvas.height=1;}
}
