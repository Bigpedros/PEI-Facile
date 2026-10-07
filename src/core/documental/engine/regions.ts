import type {Region,Token} from './types';
import {intersectionRatio} from './geometry';
import {rasterStrokes,segmentAt,borderIntersection,type Segment} from './strokes';
export function detectRegions(canvas:HTMLCanvasElement,tokens:Token[]):Region[] {
 const evidence=rasterStrokes(canvas);
 const {scale,width:w,height:h}=evidence;
 const heights=tokens.map(t=>t.box.height).filter(n=>n>5).sort((a,b)=>a-b);const minCheck=(heights[Math.floor(heights.length/2)]||16)*.6;
 const regions:Region[]=[];const seen=new Set<string>();
 for(const pass of ['checkbox','cell'] as const){
 const hs=pass==='checkbox'?evidence.checkboxHorizontal:evidence.horizontal,vs=pass==='checkbox'?evidence.checkboxVertical:evidence.vertical;
 for(const top of hs){
 const bottoms=hs.filter(b=>b.pos-top.pos>=8&&b.pos-top.pos<=h*.4&&Math.min(b.end,top.end)-Math.max(b.start,top.start)>=Math.max(8,Math.max(b.end-b.start,top.end-top.start)*.5));
 for(const bottom of bottoms.slice(0,30)){
 const left=Math.max(top.start,bottom.start),right=Math.min(top.end,bottom.end);
 // A photocopy may lose a short corner of an otherwise long border. Both
 // measured side strokes must still span top and bottom intersections.
 const cornerGap=pass==='cell'?Math.max(10,Math.min(35,Math.min(top.end-top.start,bottom.end-bottom.start)*.03)):10;
 const sides=vs.filter(v=>{const a=borderIntersection(top,v),b=borderIntersection(bottom,v);return a.x>=left-cornerGap&&a.x<=right+cornerGap&&b.x>=left-cornerGap&&b.x<=right+cornerGap&&v.start<=a.y+10&&v.end>=b.y-10;}).sort((a,b)=>segmentAt(a,(top.pos+bottom.pos)/2)-segmentAt(b,(top.pos+bottom.pos)/2));
 const unique:Segment[]=[];for(const s of sides)if(!unique.length||s.pos-unique[unique.length-1].pos>4)unique.push(s);
 for(let i=0;i<unique.length-1;i++){
 const corners=[borderIntersection(top,unique[i]),borderIntersection(top,unique[i+1]),borderIntersection(bottom,unique[i]),borderIntersection(bottom,unique[i+1])];
 const x=Math.min(...corners.map(p=>p.x)),y=Math.min(...corners.map(p=>p.y)),bw=Math.max(...corners.map(p=>p.x))-x,bh=Math.max(...corners.map(p=>p.y))-y;
 if(bw<8||bh<8)continue;
 if(bw<60&&bh<60&&unique.slice(i,i+2).some(v=>v.start>y+3||v.end<bottom.pos-3))continue;
 // A horizontal divider inside the proposed rectangle makes it a group, not a cell.
 if(hs.some(line=>{const midpoint=x+bw/2,py=segmentAt(line,midpoint);return py>segmentAt(top,midpoint)+4&&py<segmentAt(bottom,midpoint)-10&&line.start<=x+6&&line.end>=x+bw-6;}))continue;
 const key=pass+':'+[x,y,bw,bh].map(v=>Math.round(v/4)).join(':');if(seen.has(key))continue;seen.add(key);
 const box={x:x/scale,y:y/scale,width:bw/scale,height:bh/scale};
 const inside=tokens.filter(t=>intersectionRatio(t.box,box)>.6);
 const checkbox=bw>=8&&bh>=8&&bw<=Math.max(35,w*.045)&&bh<=Math.max(35,w*.045)&&bw/bh>.65&&bw/bh<1.5;
 if(checkbox!==(pass==='checkbox'))continue;
 if(!checkbox&&(bw<50||bh<20))continue;
 if(checkbox&&Math.min(bw,bh)/scale<minCheck)continue;
 if(checkbox&&tokens.some(t=>t.text.replace(/[^a-zà-ù]/gi,'').length>1&&intersectionRatio(box,t.box)>.25))continue;
 regions.push({id:`r-${regions.length}`,kind:checkbox?'checkbox':'cell',box,text:inside.map(t=>t.text).join(' '),status:'review',checked:null});
 if(regions.length>=500)return regions;
 }
 }
 }
 }
 return regions.filter((r,i)=>!regions.slice(0,i).some(other=>other.kind===r.kind&&intersectionRatio(r.box,other.box)>.75&&intersectionRatio(other.box,r.box)>.75)).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
}
