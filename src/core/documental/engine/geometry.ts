import type {Box,Token} from './types';
export function mapBox(box:Box,scale:number,offsetX:number,offsetY:number):Box {
 return {x:box.x*scale+offsetX,y:box.y*scale+offsetY,width:box.width*scale,height:box.height*scale};
}
export function rotateBox(b:Box,w:number,h:number,angle:number):Box {
 if(angle===90)return {x:h-b.y-b.height,y:b.x,width:b.height,height:b.width};
 if(angle===180)return {x:w-b.x-b.width,y:h-b.y-b.height,width:b.width,height:b.height};
 if(angle===270)return {x:b.y,y:w-b.x-b.width,width:b.height,height:b.width};
 return {...b};
}
export function intersectionRatio(a:Box,b:Box):number {
 const w=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
 const h=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
 return w*h/Math.max(1,a.width*a.height);
}
export function tokensToText(tokens:Token[]):string {
 const lines=new Map<string,Token[]>();
 for(const t of tokens){const line=lines.get(t.lineId)||[];line.push(t);lines.set(t.lineId,line);}
 return [...lines.values()].sort((a,b)=>Math.min(...a.map(t=>t.box.y))-Math.min(...b.map(t=>t.box.y)))
 .map(line=>line.sort((a,b)=>a.box.x-b.box.x).map(t=>t.text).join(' ')).join('\n');
}
export function assignLines(tokens:Token[]):Token[] {
 const rows:{y:number;h:number;id:string}[]=[];
 return [...tokens].sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x).map(t=>{
 const center=t.box.y+t.box.height/2;
 let row=rows.find(r=>Math.abs(center-r.y)<Math.max(3,Math.min(r.h,t.box.height)*0.55));
 if(!row){row={y:center,h:t.box.height,id:`line-${rows.length}`};rows.push(row);}
 return {...t,lineId:row.id};
 });
}
