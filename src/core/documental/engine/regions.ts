import type {Region,Token} from './types';
import {intersectionRatio} from './geometry';
import {rasterStrokes,type Segment} from './strokes';
export function detectRegions(canvas:HTMLCanvasElement,tokens:Token[]):Region[] {
 const {horizontal:hs,vertical:vs,scale,width:w,height:h}=rasterStrokes(canvas);
 const heights=tokens.map(t=>t.box.height).filter(n=>n>5).sort((a,b)=>a-b);const minCheck=(heights[Math.floor(heights.length/2)]||16)*.6;
 const regions:Region[]=[];const seen=new Set<string>();
 for(const top of hs){
 const bottoms=hs.filter(b=>b.pos-top.pos>=8&&b.pos-top.pos<=h*.4&&Math.min(b.end,top.end)-Math.max(b.start,top.start)>=Math.max(8,Math.max(b.end-b.start,top.end-top.start)*.5));
 for(const bottom of bottoms.slice(0,30)){
 const left=Math.max(top.start,bottom.start),right=Math.min(top.end,bottom.end);
 const sides=vs.filter(v=>v.pos>=left-10&&v.pos<=right+10&&v.start<=top.pos+10&&v.end>=bottom.pos-10).sort((a,b)=>a.pos-b.pos);
 const unique:Segment[]=[];for(const s of sides)if(!unique.length||s.pos-unique[unique.length-1].pos>4)unique.push(s);
 for(let i=0;i<unique.length-1;i++){
 const x=unique[i].pos,y=top.pos,bw=unique[i+1].pos-x,bh=bottom.pos-y;
 if(bw<8||bh<8)continue;
 if(bw<60&&bh<60&&unique.slice(i,i+2).some(v=>v.start>y+3||v.end<bottom.pos-3))continue;
 // A horizontal divider inside the proposed rectangle makes it a group, not a cell.
 if(hs.some(line=>line.pos>y+4&&line.pos<bottom.pos-10&&line.start<=x+4&&line.end>=x+bw-4))continue;
 const key=[x,y,bw,bh].map(v=>Math.round(v/4)).join(':');if(seen.has(key))continue;seen.add(key);
 const box={x:x/scale,y:y/scale,width:bw/scale,height:bh/scale};
 const inside=tokens.filter(t=>intersectionRatio(t.box,box)>.6);
 const checkbox=bw>=8&&bh>=8&&bw<=Math.max(35,w*.045)&&bh<=Math.max(35,w*.045)&&bw/bh>.65&&bw/bh<1.5;
 if(!checkbox&&(bw<50||bh<20))continue;
 if(checkbox&&Math.min(bw,bh)/scale<minCheck)continue;
 if(checkbox&&tokens.some(t=>t.text.replace(/[^a-zà-ù]/gi,'').length>1&&intersectionRatio(box,t.box)>.25))continue;
 regions.push({id:`r-${regions.length}`,kind:checkbox?'checkbox':'cell',box,text:inside.map(t=>t.text).join(' '),status:'review',checked:null});
 if(regions.length>=500)return regions;
 }
 }
 }
 return regions.filter((r,i)=>!regions.slice(0,i).some(other=>other.kind===r.kind&&intersectionRatio(r.box,other.box)>.75&&intersectionRatio(other.box,r.box)>.75)).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
}
