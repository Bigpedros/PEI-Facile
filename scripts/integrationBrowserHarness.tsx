import {savePeiDocument,loadSavedPeiDocument} from '../src/core/documentPersistence';
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as pdfjs from 'pdfjs-dist';
import {PDFDocument, StandardFonts} from 'pdf-lib';
import {processDocumentAcquisition} from '../src/core/documentAcquisitionService';
import {acquirePdfTemplate,computeSha256} from '../src/core/templateAcquisitionService';
import * as storage from '../src/core/templateStorage';
import {createTemplateSchemaFromCandidates,saveTemplateSchema,getTemplateSchema} from '../src/core/templateSchemaService';
import {pageCandidates,canonicalRasterPdf} from '../src/core/documental/bridge';
import {inferFields} from '../src/core/documental/engine/fields';
import {fieldTokens} from '../src/core/documental/engine';
import {detectFieldsOnPdfPage} from '../src/core/assistedFieldDetectionService';
import {resolveTemplateSource} from '../src/core/templateSourceResolver';
import {documentSchema} from '../src/core/documental/bridge';
import {DocumentSurface} from '../src/components/document/DocumentSurface';
import {PageSurface} from '../src/components/document/PageSurface';
import {AnteprimaScreen} from '../src/components/screens/AnteprimaScreen';
import '../src/index.css';
const root=createRoot(document.getElementById('root')!);
function EditableSurface({pdfDoc,fields,values}:any){
 const [current,setCurrent]=useState(values);(window as any).editedValues=current;
 return <PageSurface pageNumber={1} pdfDoc={pdfDoc} fields={fields} values={current} mode="EDIT" zoomScale={1} onFieldValueChange={(id,value)=>setCurrent((old:any)=>({...old,[id]:value}))}/>;
}
function PropertiesDocument({document:initial}:any){
 const [doc,setDoc]=useState(initial);(window as any).propertiesDocument=doc;
 return <DocumentSurface document={doc} schoolOrder={doc.schoolOrder} mode="EDIT" zoomScale={1} onFieldPropertiesChange={(id,patch)=>setDoc((old:any)=>{
  const fieldProperties={...old.fieldProperties};if(patch===null)delete fieldProperties[id];else fieldProperties[id]={...fieldProperties[id],...patch};
  const next={...old,fieldProperties};void savePeiDocument(next);return next;
 })}/>;
}
/** Uses production all-page editor and preview; test state is also persisted through production storage. */
function LifecycleDocument({document:initial,preview=false}:any){
 const [doc,setDoc]=useState(initial);(window as any).lifecycleDocument=doc;
 const update=(next:any)=>{(window as any).lifecycleSave=savePeiDocument(next);return next;};
 if(preview)return <AnteprimaScreen document={doc} sections={[]} onBackToCompilazione={()=>{}} zoomScale={1} onChangeZoom={()=>{}} onOpenShareModal={()=>{}}/>;
 return <DocumentSurface document={doc} schoolOrder={doc.schoolOrder} mode="EDIT" zoomScale={1} showAllPages
  onFieldValueChange={(id,value)=>setDoc((old:any)=>update({...old,values:{...old.values,[id]:value}}))}
  onFieldPropertiesChange={(id,patch)=>setDoc((old:any)=>{const fieldProperties={...old.fieldProperties};if(patch===null)delete fieldProperties[id];else fieldProperties[id]={...fieldProperties[id],...patch};return update({...old,fieldProperties});})}/>;
}
let lifecycleMount=0;
(window as any).integration={processDocumentAcquisition,acquirePdfTemplate,computeSha256,storage,
 createTemplateSchemaFromCandidates,saveTemplateSchema,getTemplateSchema,pageCandidates,canonicalRasterPdf,
 savePeiDocument,loadSavedPeiDocument,resolveTemplateSource,documentSchema,
 mountLifecycleDocument:(document:any,preview=false)=>root.render(<LifecycleDocument key={++lifecycleMount} document={document} preview={preview}/>),
 mountEditableSurface:(pdfDoc:any,fields:any[],values:any)=>root.render(<EditableSurface pdfDoc={pdfDoc} fields={fields} values={values}/>),
 mountDocument:(document:any)=>root.render(<DocumentSurface document={document} schoolOrder={document.schoolOrder} mode="EDIT" zoomScale={1}/>),
 mountPropertiesDocument:(document:any)=>root.render(<PropertiesDocument document={document}/>),
 inferFields,fieldTokens,detectFieldsOnPdfPage,pdfjs,PDFDocument,StandardFonts,
 mountSurface:(pdfDoc:any,fields:any[],values:any,mode:any='PRINT')=>root.render(<PageSurface pageNumber={1} pdfDoc={pdfDoc} widthPt={210/25.4*72} heightPt={297/25.4*72} fields={fields} values={values} mode={mode} zoomScale={1}/>)};
