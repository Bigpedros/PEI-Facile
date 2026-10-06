/** Shared raster evidence for cells, checkboxes and writing lines. Coordinates stay
 * in the canonical raster; the image itself is never changed. */
export interface Segment {pos:number;start:number;end:number}
export function rasterStrokes(canvas:HTMLCanvasElement):{horizontal:Segment[];vertical:Segment[];writing:Segment[];scale:number;width:number;height:number} {
 const scale=Math.min(1,1400/canvas.width),width=Math.round(canvas.width*scale),height=Math.round(canvas.height*scale);
 const small=document.createElement('canvas');small.width=width;small.height=height;
 const ctx=small.getContext('2d')!;ctx.drawImage(canvas,0,0,width,height);
 const data=ctx.getImageData(0,0,width,height).data,ink=new Uint8Array(width*height);
 for(let i=0;i<ink.length;i++){
  const alpha=data[i*4+3]/255;
  ink[i]=((.299*data[i*4]+.587*data[i*4+1]+.114*data[i*4+2])*alpha+255*(1-alpha))<215?1:0;
 }
 const scan=(vertical:boolean,gap=3,density=.7,minLength=8):Segment[]=>{
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
      const previous=[...merged].reverse().find(m=>p-m.high<=3&&Math.min(last,m.end)-Math.max(start,m.start)>=Math.min(length,m.end-m.start)*.7&&p-m.low<=Math.max(5,Math.max(length,m.end-m.start)*.025));
      if(previous){previous.high=p;previous.pos=(previous.low+p)/2;previous.start=Math.min(previous.start,start);previous.end=Math.max(previous.end,last);}
      else merged.push({pos:p,start,end:last,low:p,high:p});
     }
     start=-1;count=0;
    }
   }
  }
  return merged.sort((a,b)=>(b.end-b.start)-(a.end-a.start)).slice(0,600).sort((a,b)=>a.pos-b.pos);
 };
 return {horizontal:scan(false),vertical:scan(true),writing:scan(false,8,.25,30),scale,width,height};
}
