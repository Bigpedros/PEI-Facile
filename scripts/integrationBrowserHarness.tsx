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
import '../src/index.css';
const root=createRoot(document.getElementById('root')!);
function EditableSurface({pdfDoc,fields,values}:any){
 const [current,setCurrent]=useState(values);(window as any).editedValues=current;
 return <PageSurface pageNumber={1} pdfDoc={pdfDoc} fields={fields} values={current} mode="EDIT" zoomScale={1} onFieldValueChange={(id,value)=>setCurrent((old:any)=>({...old,[id]:value}))}/>;
}
(window as any).integration={processDocumentAcquisition,acquirePdfTemplate,computeSha256,storage,
 createTemplateSchemaFromCandidates,saveTemplateSchema,getTemplateSchema,pageCandidates,canonicalRasterPdf,
 savePeiDocument,loadSavedPeiDocument,resolveTemplateSource,documentSchema,
 mountEditableSurface:(pdfDoc:any,fields:any[],values:any)=>root.render(<EditableSurface pdfDoc={pdfDoc} fields={fields} values={values}/>),
 mountDocument:(document:any)=>root.render(<DocumentSurface document={document} schoolOrder={document.schoolOrder} mode="EDIT" zoomScale={1}/>),
 inferFields,fieldTokens,detectFieldsOnPdfPage,pdfjs,PDFDocument,StandardFonts,
 mountSurface:(pdfDoc:any,fields:any[],values:any,mode:any='PRINT')=>root.render(<PageSurface pageNumber={1} pdfDoc={pdfDoc} widthPt={210/25.4*72} heightPt={297/25.4*72} fields={fields} values={values} mode={mode} zoomScale={1}/>)};
