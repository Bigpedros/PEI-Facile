/** Shared raster evidence for cells, checkboxes and writing lines. Coordinates stay
 * in the canonical raster; the image itself is never changed. */
export interface Segment {pos:number;start:number;end:number;slope?:number}
/** Position of a measured border along its major axis. */
export const segmentAt=(line:Segment,axis:number)=>line.pos+(line.slope??0)*(axis-(line.start+line.end)/2);
export function borderIntersection(horizontal:Segment,vertical:Segment):{x:number;y:number} {
 const h=horizontal.slope??0,v=vertical.slope??0;
 const hb=horizontal.pos-h*(horizontal.start+horizontal.end)/2;
 const vb=vertical.pos-v*(vertical.start+vertical.end)/2;
 const x=(vb+v*hb)/(1-v*h);return {x,y:hb+h*x};
}
export function rasterStrokes(canvas:HTMLCanvasElement):{horizontal:Segment[];vertical:Segment[];writing:Segment[];checkboxHorizontal:Segment[];checkboxVertical:Segment[];scale:number;width:number;height:number} {
 const scale=Math.min(1,1400/canvas.width),width=Math.round(canvas.width*scale),height=Math.round(canvas.height*scale);
 const small=document.createElement('canvas');small.width=width;small.height=height;
 const ctx=small.getContext('2d')!;ctx.drawImage(canvas,0,0,width,height);
 const data=ctx.getImageData(0,0,width,height).data,ink=new Uint8Array(width*height),faintInk=new Uint8Array(width*height);
 for(let i=0;i<ink.length;i++){
  const alpha=data[i*4+3]/255;
  const gray=(.299*data[i*4]+.587*data[i*4+1]+.114*data[i*4+2])*alpha+255*(1-alpha);
  ink[i]=gray<215?1:0;faintInk[i]=gray<240?1:0;
 }
 const scan=(vertical:boolean,gap=3,density=.7,minLength=8,thickness=.004):Segment[]=>{
  const rows=vertical?width:height,cols=vertical?height:width,merged:(Segment&{low:number;high:number})[]=[];
  for(let p=0;p<rows;p++){
   let start=-1,last=-1,count=0;
   for(let c=0;c<=cols;c++){
    let dark=false;
    if(c<cols)for(let d=-1;d<=1;d++){const q=p+d;if(q>=0&&q<rows&&ink[vertical?c*width+q:q*width+c]){dark=true;break;}}
    if(dark){if(start<0)start=c;last=c;count++;}
    if(start>=0&&((!dark&&c-last>gap)||c===cols)){
     const length=last-start;
     if(length>=minLength&&count/(length+1)>density){
      const previous=[...merged].reverse().find(m=>p-m.high<=3&&Math.min(last,m.end)-Math.max(start,m.start)>=Math.min(length,m.end-m.start)*.7&&p-m.low<=Math.max(5,Math.max(length,m.end-m.start)*thickness));
      if(previous){previous.high=p;previous.pos=(previous.low+p)/2;previous.start=Math.min(previous.start,start);previous.end=Math.max(previous.end,last);}
      else merged.push({pos:p,start,end:last,low:p,high:p});
     }
     start=-1;count=0;
    }
   }
  }
  return merged.sort((a,b)=>(b.end-b.start)-(a.end-a.start)).slice(0,600).sort((a,b)=>a.pos-b.pos);
 };
 // Scan projected rows as well as exact rows: photocopied tables often
 // have a different small inclination on each border. Preserve that measured
 // slope so intersections can be found without rotating the document image.
 const sloped=(vertical:boolean):Segment[]=>{
  const rows=vertical?width:height,cols=vertical?height:width,found:Segment[]=[];
  for(let step=-8;step<=8;step++){
   const slope=Math.tan(step*.25*Math.PI/180);
   const shifts=Int16Array.from({length:cols},(_,c)=>Math.round((c-cols/2)*slope));
   for(let p=0;p<rows;p++){
    let start=-1,last=-1,count=0;
    for(let c=0;c<=cols;c++){
     const q=p+(shifts[c]??0);
     let dark=false;
     if(c<cols&&q>0&&q<rows-1){
      const index=vertical?c*width+q:q*width+c;
      const stride=vertical?1:width;
      dark=!!(faintInk[index-stride]||faintInk[index]||faintInk[index+stride]);
     }
     if(dark){if(start<0)start=c;last=c;count++;}
     if(start>=0&&((!dark&&c-last>4)||c===cols)){
      const length=last-start;
      if(length>=80&&count/(length+1)>.78){
       const line={pos:p+((start+last)/2-cols/2)*slope,start,end:last,slope};
       const previous=found.find(m=>Math.abs(m.pos-line.pos)<5&&Math.min(last,m.end)-Math.max(start,m.start)>Math.min(length,m.end-m.start)*.8);
       if(!previous)found.push(line);
       else if(length>previous.end-previous.start)Object.assign(previous,line);
      }
      start=-1;count=0;
     }
    }
   }
  }
  return found;
 };
 const combine=(axis:boolean)=>{
  const lines=[...scan(axis),...sloped(axis)].sort((a,b)=>(b.end-b.start)-(a.end-a.start));
  const kept:Segment[]=[];
  for(const l of lines){
   if(kept.some(m=>{
    const start=Math.max(l.start,m.start),end=Math.min(l.end,m.end),mid=(start+end)/2;
    return end-start>Math.min(l.end-l.start,m.end-m.start)*.8&&Math.abs(segmentAt(l,mid)-segmentAt(m,mid))<5;
   }))continue;
   kept.push(l);
  }
  return kept.slice(0,600).sort((a,b)=>a.pos-b.pos);
 };
 return {horizontal:combine(false),vertical:combine(true),writing:scan(false,8,.25,30),checkboxHorizontal:scan(false,3,.7,8,.025),checkboxVertical:scan(true,3,.7,8,.025),scale,width,height};
}
