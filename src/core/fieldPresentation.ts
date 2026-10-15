import type {TemplateSchemaField} from './templateSchemaTypes';
/** Per-document overrides: calibrated template and source PDF remain unchanged. */
export interface FieldPresentation {widthPt?:number;heightPt?:number;fontSizePt?:number;bold?:boolean;italic?:boolean;underline?:boolean}
export function defaultFieldFontSize(field:TemplateSchemaField):number{return field.fieldType==='TEXT_LONG'?10:Math.min(11,Math.max(8,field.geometry.heightPt*.55));}
function bounded(value:number|undefined,fallback:number,min:number,max:number):number{return Math.min(max,Math.max(Math.min(min,max),Number.isFinite(value)?value!:fallback));}
export function applyFieldPresentation(field:TemplateSchemaField,override:FieldPresentation|undefined,page:{widthPt:number;heightPt:number}):TemplateSchemaField {
 if(!override||!Object.keys(override).length)return field;
 return {...field,sourceGeometry:field.geometry,presentation:{...override,fontSizePt:bounded(override.fontSizePt,defaultFieldFontSize(field),6,72)},geometry:{...field.geometry,widthPt:bounded(override.widthPt,field.geometry.widthPt,6,Math.max(1,page.widthPt-field.geometry.xPt)),heightPt:bounded(override.heightPt,field.geometry.heightPt,6,Math.max(1,page.heightPt-field.geometry.yPt))}};
}
