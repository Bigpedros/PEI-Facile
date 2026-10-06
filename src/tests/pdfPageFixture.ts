/** Test-only fixture renderer. Produces real pixels from old page proxy inputs;
 * detection output always comes from the production engine. */
import * as runtime from '../core/assistedFieldDetectionService';
export {detectVisualLinesFromCanvas,getFieldProvenance,type PageRuntimeDiagnosticTrace,type PageDetectionDiagnostics} from '../core/assistedFieldDetectionService';
export function renderablePage(input:any,canvas?:any) {
 if(input.render)return input;
 const size=input.getViewport({scale:1});const width=size.width,height=canvas?width*canvas.height/canvas.width:size.height;
 const page:any={...input,getViewport:({scale=1}:any)=>({width:width*scale,height:height*scale,scale,rotation:0,transform:[scale,0,0,-scale,0,height*scale],viewBox:[0,0,width,height],convertToViewportRectangle:(r:number[])=>[r[0]*scale,(height-r[1])*scale,r[2]*scale,(height-r[3])*scale]}),getAnnotations:input.getAnnotations??(async()=>[]),getOperatorList:input.getOperatorList??(async()=>({fnArray:[],argsArray:[]})),getTextContent:async()=>{const c=await input.getTextContent();return {...c,styles:c.styles??{},items:c.items.map((t:any)=>({...t,height:t.height||Math.abs(t.transform?.[3])||12,width:t.width||(t.height||Math.abs(t.transform?.[3])||12)*.5*t.str.length}))};}};
 page.render=({canvasContext:ctx,viewport}:any)=>({cancel(){},promise:(async()=>{
 const s=viewport.scale;ctx.fillStyle='white';ctx.fillRect(0,0,viewport.width,viewport.height);ctx.fillStyle='black';ctx.strokeStyle='black';ctx.lineWidth=s;
 const content=await page.getTextContent();
 for(const t of content.items??[]){const h=t.height||Math.abs(t.transform?.[3])||12;ctx.font=`${h*s}px Arial`;ctx.fillText(t.str,t.transform[4]*s,(height-t.transform[5])*s,t.width?s*t.width:undefined);}
 const operators=await page.getOperatorList();let px=0,py=0;
 for(let i=0;i<operators.fnArray.length;i++){const op=operators.fnArray[i],a=operators.argsArray[i];if(op===84)ctx.strokeRect(a[0]*s,(height-a[1]-a[3])*s,a[2]*s,a[3]*s);if(op===13){px=a[0];py=a[1];}if(op===14){ctx.beginPath();ctx.moveTo(px*s,(height-py)*s);ctx.lineTo(a[0]*s,(height-a[1])*s);ctx.stroke();px=a[0];py=a[1];}}
 })()});return page;
}
export function realCanvas(input:any){if(!input)return input;const c=document.createElement('canvas');c.width=input.width;c.height=input.height;const ctx=c.getContext('2d')!;const pixels=ctx.createImageData(input.width,input.height);pixels.data.set(input.getContext('2d').getImageData(0,0,input.width,input.height).data);ctx.putImageData(pixels,0,0);return c;}
function options(input:any={}){if(input?.getContext)return {canvasElement:realCanvas(input),customOcrRunner:async()=>({text:'',words:[]})};return {...input,canvasElement:input.canvasElement?realCanvas(input.canvasElement):undefined,customOcrRunner:input.customOcrRunner??(async()=>({text:'',words:[]}))};}
export const detectFieldsOnPdfPage=(p:any,n:number,e:any[]=[],o:any={})=>runtime.detectFieldsOnPdfPage(renderablePage(p,o.canvasElement|| (o.getContext?o:undefined)),n,e,options(o));
export const collectPageRuntimeDiagnostics=(p:any,o:any)=>runtime.collectPageRuntimeDiagnostics(renderablePage(p,o.canvasElement),options(o));
export const detectFieldsOnEntireDocument=(doc:any,e:any[],progress?:any,signal?:any)=>runtime.detectFieldsOnEntireDocument({...doc,getPage:async(n:number)=>renderablePage(await doc.getPage(n))},e,progress,signal);
