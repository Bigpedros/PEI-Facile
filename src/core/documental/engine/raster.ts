import {estimateSkew,rotateFine} from './rectify';
import {mapBox,rotateBox} from './geometry';
import type {EngineOptions,RasterPage,Token,PageResult} from './types';
export function makeCanvas(width:number,height:number):HTMLCanvasElement {
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width));canvas.height=Math.max(1,Math.round(height));
 const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);return canvas;
}
export function normalize(page:RasterPage,options:EngineOptions):{canvas:HTMLCanvasElement;tokens:Token[];transform:PageResult['transform'];physicalSizeMm:PageResult['physicalSizeMm']} {
 const {canvas:source}=page;const angle=options.rotation;
 let rotated=makeCanvas(angle%180?source.height:source.width,angle%180?source.width:source.height);
 const rc=rotated.getContext('2d')!;
 rc.translate(rotated.width/2,rotated.height/2);rc.rotate(angle*Math.PI/180);rc.drawImage(source,-source.width/2,-source.height/2);
 const fine=options.fineRotation??(options.autoDeskew&&(!page.nativeTokens.length||options.forceOcr)?estimateSkew(rotated):0);
 if(fine)rotated=rotateFine(rotated,fine);
 const isA4=options.profile==='pei';
 // Work at one definitive coordinate system, never adjust background after recognition.
 const width=isA4?Math.round(210/25.4*options.dpi):Math.min(rotated.width,2400);
 const height=isA4?Math.round(297/25.4*options.dpi):Math.round(rotated.height*width/rotated.width);
 if(width*height>16_000_000)throw new Error('Immagine troppo lunga: ritagliala o dividila prima di elaborarla.');
 const canvas=makeCanvas(width,height);
 const scale=Math.min(width/rotated.width,height/rotated.height);
 const offsetX=(width-rotated.width*scale)/2,offsetY=(height-rotated.height*scale)/2;
 canvas.getContext('2d')!.drawImage(rotated,offsetX,offsetY,rotated.width*scale,rotated.height*scale);
 const tokens=(fine?[]:page.nativeTokens).map(t=>({...t,box:mapBox(rotateBox(t.box,source.width,source.height,angle),scale,offsetX,offsetY)}));
 return {canvas,tokens,transform:{sourceWidth:source.width,sourceHeight:source.height,scale,offsetX,offsetY,rotation:angle,deskewDegrees:fine},physicalSizeMm:isA4?{width:210,height:297}:page.physicalSizeMm?(angle%180?{width:page.physicalSizeMm.height,height:page.physicalSizeMm.width}:page.physicalSizeMm):options.profile==='receipt'?{width:80,height:80*height/width}:{width:width/options.dpi*25.4,height:height/options.dpi*25.4}};
}
export function recognitionImage(canvas:HTMLCanvasElement,contrast:boolean):HTMLCanvasElement {
 const copy=makeCanvas(canvas.width,canvas.height);const ctx=copy.getContext('2d')!;ctx.drawImage(canvas,0,0);
 if(!contrast)return copy;
 const data=ctx.getImageData(0,0,copy.width,copy.height);
 const hist=new Uint32Array(256);
 for(let i=0;i<data.data.length;i+=4)hist[Math.round(.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2])]++;
 const n=copy.width*copy.height;let sum=0,lo=0,hi=255;
 for(let i=0;i<256;i++){sum+=hist[i];if(sum>=n*.01){lo=i;break;}}
 sum=0;for(let i=255;i>=0;i--){sum+=hist[i];if(sum>=n*.01){hi=i;break;}}
 if(hi-lo<40){lo=0;hi=255;}
 for(let i=0;i<data.data.length;i+=4){const gray=.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2];const v=Math.max(0,Math.min(255,(gray-lo)*255/Math.max(40,hi-lo)));data.data[i]=data.data[i+1]=data.data[i+2]=v;}
 ctx.putImageData(data,0,0);return copy;
}
