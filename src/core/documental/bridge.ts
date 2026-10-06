import { createTemplateSchemaFromCandidates } from '../templateSchemaService';
/** Single acquisition/detection bridge. Final raster pixels -> top-left PDF points. */
import { PDFDocument } from 'pdf-lib';
import { analyzeDocument } from './engine';
import type { DocumentResult, PageResult } from './engine/types';
import type { CandidateFieldGeometry } from '../templateAcquisitionTypes';
import type { DocumentAcquisitionOptions, PageCoordinateTransform } from '../../types/documentAcquisitionTypes';
import { suggestSemanticKey } from '../semanticCatalog';

export function pageCandidates(page: PageResult): CandidateFieldGeometry[] {
  const sx = (page.physicalSizeMm?.width ?? 210) / 25.4 * 72 / page.width;
  const sy = (page.physicalSizeMm?.height ?? 297) / 25.4 * 72 / page.height;
  return page.fields.filter(f => f.status !== 'ignored').map((f, i) => {
    const suggestion = suggestSemanticKey(f.label);
    return {
      fieldId: `doc-p${page.pageNumber}-${i + 1}`, label: f.label,
      pageNumber: page.pageNumber, xPt: f.box.x*sx, yPt: f.box.y*sy,
      widthPt: f.box.width*sx, heightPt: f.box.height*sy,
      xNorm: f.box.x/page.width, yNorm: f.box.y/page.height,
      wNorm: f.box.width/page.width, hNorm: f.box.height/page.height,
      fieldType: f.type==='date'?'DATE':f.type==='textarea'?'TEXT_LONG':f.type==='checkbox'?'MULTI_CHOICE':f.type==='select'?'SINGLE_CHOICE':'TEXT_SHORT', anchorText: f.label, confidence: f.confidence,
      suggestedLabel:f.label, status: 'REVIEW_REQUIRED', calibrationStatus: 'PROPOSED',
      derivationMethod: f.reason.startsWith('Widget AcroForm') ? 'ACROFORM' : f.origin === 'checkbox' ? 'CHECKBOX_BOX' : f.origin === 'cell' ? 'TABLE_CELL' : f.origin === 'line' ? 'VECTOR_LINE' : 'TEXT_ANCHOR',
      detectionSource: f.reason.startsWith('Widget AcroForm')?'ACROFORM':'DOCUMENTAL_020', evidence: f.reason,
      // Suggestions are not confirmed PEI associations.
      semanticKey: null, suggestedSemanticKey: suggestion.confidence >= .75 ? suggestion.semanticKey : null,
      inputType: f.type === 'checkbox' || f.type === 'select' ? f.type : undefined,
      options: f.options,
      defaultValue: f.value, originalValue: f.originalValue, observedText: f.observedText,
      backgroundMode: f.maskOriginal || f.type === 'checkbox' || (f.value !== '' && f.value !== false) ? 'OPAQUE_WHITE' : 'TRANSPARENT',
    };
  });
}

export async function canonicalRasterPdf(result: DocumentResult): Promise<Uint8Array> {
  if (!result.pages.length) throw new Error('Nessuna pagina canonica.');
  const pdf = await PDFDocument.create();
  for (const p of result.pages) {
    if (!p.image.startsWith('data:image/png;base64,') || !p.width || !p.height) throw new Error(`Raster non valido p.${p.pageNumber}`);
    const image = await pdf.embedPng(p.image);
    if (image.width !== p.width || image.height !== p.height) throw new Error(`Dimensioni raster incoerenti p.${p.pageNumber}`);
    const pp = pdf.addPage([210/25.4*72, 297/25.4*72]);
    pp.drawImage(image, {x:0,y:0,width:pp.getWidth(),height:pp.getHeight()});
  }
  return pdf.save();
}

export function pageTransform(page: PageResult): PageCoordinateTransform {
  const t = page.transform;
  const pxToPtX = 210/25.4*72/page.width, pxToPtY = 297/25.4*72/page.height;
  const scaleX = t.scale*pxToPtX, scaleY=t.scale*pxToPtY;
  const deltaX=t.offsetX*pxToPtX, deltaY=t.offsetY*pxToPtY;
  // Automatic acquisition uses no fine rotation: exact source pixel -> A4 point affine.
  return {sourceUnit:'px',targetUnit:'pt',pageIndex:page.pageNumber-1,originalSize:{width:t.sourceWidth,height:t.sourceHeight},
    targetSize:{width:210/25.4*72,height:297/25.4*72},scaleX,scaleY,
    rotationCorrection:0,skewCorrection:0,deltaX,deltaY,
    affineMatrix:[scaleX,0,0,scaleY,deltaX,deltaY],
    inverseMatrix:[1/scaleX,0,0,1/scaleY,-deltaX/scaleX,-deltaY/scaleY],isNormalizedA4:true};
}

export async function runDocumental(input: File | File[] | ArrayBuffer | Uint8Array, name: string, options: DocumentAcquisitionOptions = {}): Promise<DocumentResult> {
  const files = Array.isArray(input) ? input : [input instanceof File ? input : new File([input as BlobPart], name)];
  const pages: PageResult[] = [];
  let first: DocumentResult | undefined;
  for (const file of files) {
    const result = await analyzeDocument(file, {profile:'pei',language:'ita',forceOcr:false,contrast:true,
      rotation:0,autoDeskew:false,dpi:200,segmentation:'auto',maxPages:100,signal:options.signal,
      customOcrRunner:options.customOcrRunner,
      onProgress:(message,progress)=>options.onProgress?.({currentPage:pages.length+1,totalPages:0,
        percentage:Math.min(85,Math.round(progress*85)),stage:message.includes('lettura')||message.includes('OCR')?'OCR':'READING',stageLabel:message})});
    first ??= result;
    const offset=pages.length;
    pages.push(...result.pages.map(p=>({...p,pageNumber:p.pageNumber+offset})));
  }
  return {...first!,filename:name,pages};
}

export function documentSchema(result:DocumentResult,hash:string,order:any){
 const pages=result.pages.map(p=>({pageNumber:p.pageNumber,widthPt:210/25.4*72,heightPt:297/25.4*72,fields:pageCandidates(p)}));
 return createTemplateSchemaFromCandidates(`doc_${result.id}`,result.filename,hash,pages,pages.flatMap(p=>p.fields),'REVIEW_REQUIRED',order);
}
