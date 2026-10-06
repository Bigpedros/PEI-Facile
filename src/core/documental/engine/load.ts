import {makeField} from './fields';
import UTIF from 'utif';
import * as pdfjs from 'pdfjs-dist';
import '../../pdfWorker';
import {makeCanvas} from './raster';
import {assignLines} from './geometry';
import type {EngineOptions,RasterPage,Token} from './types';
const base=import.meta.env.BASE_URL;
export async function* loadPages(file:File,options:EngineOptions):AsyncGenerator<RasterPage> {
 const extension=file.name.split('.').pop()?.toLowerCase()||'';
 if(['doc','docx','odt','rtf','ppt','pptx','xls','xlsx'].includes(extension)){
 options.onProgress?.('Conversione Office in PDF tramite servizio locale',0);
 const response=await fetch(base+'api/convert?ext='+extension,{method:'POST',body:file,signal:options.signal});
 if(!response.ok){let message='Convertitore non disponibile. Avvia il progetto con npm run dev o npm run serve e installa LibreOffice.';try{const error=await response.json();message=error.error||message;}catch{}throw new Error(message);}
 const converted=new File([await response.blob()],file.name+'.pdf',{type:'application/pdf'});
 for await(const page of loadPages(converted,options)){page.warnings.push('Documento Office convertito in PDF. Verificare impaginazione e caratteri rispetto all’originale.');yield page;}return;
 }
 if(['tif','tiff'].includes(extension)){
 const data=await blobBytes(file);const frames=UTIF.decode(data);if(frames.length>options.maxPages)throw new Error('Troppe pagine TIFF.');
 for(let i=0;i<frames.length;i++){options.signal?.throwIfAborted();const frame=frames[i];if(Number((frame.t256 as number[])?.[0])*Number((frame.t257 as number[])?.[0])>60_000_000)throw new Error('Pagina TIFF oltre 60 megapixel.');UTIF.decodeImage(data,frame);const rgba=UTIF.toRGBA8(frame);const canvas=makeCanvas(frame.width,frame.height);canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba),frame.width,frame.height),0,0);yield{canvas,nativeTokens:[],pageNumber:i+1,warnings:[]};}return;
 }
 const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
 if(isPdf){
 const task=pdfjs.getDocument({data:new Uint8Array(await blobBytes(file)),cMapUrl:base+'vendor/cmaps/',cMapPacked:true,standardFontDataUrl:base+'vendor/standard_fonts/'});
 const abort=()=>{void task.destroy();};options.signal?.addEventListener('abort',abort,{once:true});
 try{
 const pdf=await task.promise;
 if(pdf.numPages>options.maxPages)throw new Error(`Il PDF contiene ${pdf.numPages} pagine; limite ${options.maxPages}. Dividilo in documenti più piccoli.`);
 for(let number=1;number<=pdf.numPages;number++){
 options.signal?.throwIfAborted();
 const page=await pdf.getPage(number);const initial=page.getViewport({scale:1});
 const scale=Math.min(options.dpi/72,3508/Math.max(initial.width,initial.height));
 const viewport=page.getViewport({scale});const canvas=makeCanvas(viewport.width,viewport.height);
 await page.render({canvasContext:canvas.getContext('2d')!,viewport}).promise;
 const nativeFields=await pdfWidgetFields(page,viewport);
 const content=await page.getTextContent();const tokens:Token[]=[];const warnings:string[]=[];
 for(const item of content.items){
 if(!('str'in item)||!item.str.trim())continue;
 const tx=(pdfjs as any).Util.transform(viewport.transform,item.transform);
 const font=content.styles[item.fontName];const h=Math.hypot(tx[2],tx[3]);const w=item.width*scale;
 // PDF ascent locates top relative to baseline; native spans remain spans, not invented word boxes.
 const ascent=font?.ascent??(font?.descent?1+font.descent:.8);
 const angle=Math.atan2(tx[1],tx[0]);
 if(Math.abs(angle)>.05){warnings.push('Testo PDF ruotato: usare «Forza OCR» per verificare le posizioni.');}
 const x=tx[4],y=tx[5]-h*ascent;
 tokens.push({id:`p${number}-t${tokens.length}`,text:item.str,box:{x,y,width:Math.max(1,w),height:Math.max(1,h)},confidence:null,source:'pdf',lineId:''});
 }
 const operators=await page.getOperatorList();
 const hasRasterImages=operators.fnArray.some((op:number)=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject].includes(op));
 yield {canvas,hasRasterImages,nativeFields,nativeTokens:assignLines(tokens),pageNumber:number,warnings:[...new Set(warnings)],physicalSizeMm:{width:initial.width/72*25.4,height:initial.height/72*25.4}};page.cleanup();
 }
 }finally{options.signal?.removeEventListener('abort',abort);await task.destroy();}
 return;
 }
 if(!/^image\/(png|jpeg|webp|bmp)$/.test(file.type)&&!/\.(png|jpe?g|webp|bmp)$/i.test(file.name))throw new Error('Formato non supportato. Usa PDF, PNG, JPG, WebP o BMP. Sono supportati anche TIFF e documenti Office tramite il convertitore locale.');
 const url=typeof createImageBitmap==='function'?null:URL.createObjectURL(file);
 let bitmap:ImageBitmap|undefined;
 try{
 const img=url?new Image():bitmap=await createImageBitmap(file);if(url){(img as HTMLImageElement).src=url;await (img as HTMLImageElement).decode();}
 const imageWidth=img.width,imageHeight=img.height;
 if(imageWidth*imageHeight>60_000_000)throw new Error('Immagine troppo grande (oltre 60 megapixel). Riducila prima di caricarla.');
 const scale=Math.min(1,3508/Math.max(imageWidth,imageHeight));
 const canvas=makeCanvas(imageWidth*scale,imageHeight*scale);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
 yield {canvas,nativeTokens:[],pageNumber:1,warnings:[]};
 }finally{if(url)URL.revokeObjectURL(url);bitmap?.close?.();}
}

async function blobBytes(file:Blob):Promise<ArrayBuffer>{
 if(typeof file.arrayBuffer==='function')return file.arrayBuffer();
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(file);});
}

/** Widget extraction shared by acquisition and recalibration. */
export async function pdfWidgetFields(page:any,viewport:any){
 const nativeFields=[];
 for(const ann of await page.getAnnotations()){
  if(ann.subtype!=='Widget'||!ann.rect||ann.fieldType==='Sig')continue;
  const rect=viewport.convertToViewportRectangle(ann.rect);
  const f=makeField({x:Math.min(rect[0],rect[2]),y:Math.min(rect[1],rect[3]),width:Math.abs(rect[2]-rect[0]),height:Math.abs(rect[3]-rect[1])},ann.alternativeText||ann.fieldName||'Campo PDF','manual');
  f.type=ann.fieldType==='Btn'?'checkbox':ann.fieldType==='Ch'?'select':ann.multiLine?'textarea':'text';
  f.value=f.type==='checkbox'?!!ann.fieldValue&&ann.fieldValue!=='Off':Array.isArray(ann.fieldValue)?ann.fieldValue.join(' '):ann.fieldValue??'';
  f.originalValue=f.value;f.observedText=String(f.value);f.options=(ann.options||[]).map((o:any)=>o.displayValue??o.exportValue??String(o));
  f.confidence=1;f.reason='Widget AcroForm esplicito; valore originale preservato, associazione PEI da verificare.';nativeFields.push(f);
 }
 return nativeFields;
}
