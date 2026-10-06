export type Profile = 'document' | 'pei' | 'receipt';
export interface Box { x:number; y:number; width:number; height:number }
export interface Point {x:number;y:number}
export interface Token {fragments?:Token[];corrected?:boolean;originalText?:string;id:string;text:string;box:Box;confidence:number|null;source:'pdf'|'ocr';lineId:string}
export interface Region {id:string;kind:'cell'|'checkbox';box:Box;text:string;status:'review';checked:boolean|null}
export type FieldType='text'|'date'|'textarea'|'checkbox'|'select';
export interface FormField {
 id:string;box:Box;label:string;semanticKey:string;type:FieldType;value:string|boolean;
 originalValue:string|boolean;observedText:string;status:'review'|'confirmed'|'ignored';
 origin:'cell'|'checkbox'|'line'|'inline'|'manual';confidence:number;reason:string;
 options:string[];required:boolean;fontSize:number;maskOriginal:boolean;
}
export interface PageResult {
 pageNumber:number;width:number;height:number;unit:'px';image:string;text:string;
 tokens:Token[];regions:Region[];fields:FormField[];source:'pdf'|'ocr';
 transform:{sourceWidth:number;sourceHeight:number;scale:number;offsetX:number;offsetY:number;rotation:number;deskewDegrees?:number;rectification?:string};
 physicalSizeMm:{width:number;height:number}|null;warnings:string[];elapsedMs:number;
}
export interface ReceiptItem {description:string;amount:number;line:string}
export interface ReceiptResult {merchant:string|null;date:string|null;total:number|null;items:ReceiptItem[];itemsSum:number;difference:number|null;warnings:string[];status:'review'}
export interface DocumentResult {
 schemaVersion:'2.0';engineVersion:'0.2.0';id:string;filename:string;profile:Profile;
 createdAt:string;updatedAt:string;pages:PageResult[];receipt:ReceiptResult|null;warnings:string[];
}
export interface EngineOptions {
 profile:Profile;language:'ita'|'eng'|'ita+eng';forceOcr:boolean;contrast:boolean;
 rotation:0|90|180|270;segmentation:'auto'|'block'|'sparse';dpi:number;maxPages:number;
 autoDeskew?:boolean;fineRotation?:number;signal?:AbortSignal;
 customOcrRunner?:(canvas:HTMLCanvasElement)=>Promise<{text:string;confidence?:number;tokens?:Token[]}>;
 onProgress?:(message:string,progress:number)=>void;onPage?:(page:PageResult)=>void;
}
export interface RasterPage {hasRasterImages?:boolean;nativeFields?:FormField[];canvas:HTMLCanvasElement;nativeTokens:Token[];pageNumber:number;warnings:string[];physicalSizeMm?:{width:number;height:number}}
