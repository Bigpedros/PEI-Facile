import type {Point} from './types';
import {makeCanvas} from './raster';
export function estimateSkew(canvas:HTMLCanvasElement):number {
 const s=Math.min(1,650/canvas.width);const w=Math.round(canvas.width*s),h=Math.round(canvas.height*s);
 const c=makeCanvas(w,h);const ctx=c.getContext('2d')!;ctx.drawImage(canvas,0,0,w,h);const data=ctx.getImageData(0,0,w,h).data;
 const points:Point[]=[];
 for(let y=10;y<h-10;y+=2)for(let x=10;x<w-10;x+=2){const i=(y*w+x)*4;if(data[i]+data[i+1]+data[i+2]<390)points.push({x:x-w/2,y:y-h/2});}
 if(points.length<80)return 0;
 const score=(angle:number)=>{const rad=angle*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);const bins=new Float64Array(h+w);for(const p of points){const y=Math.round(p.x*sin+p.y*cos+(h+w)/2);if(y>=0&&y<bins.length)bins[y]++;}let sum=0;for(const n of bins)sum+=n*n;return sum;};
 let best=0,bestScore=score(0);const original=bestScore;
 for(let a=-8;a<=8;a+=.5){const n=score(a);if(n>bestScore){bestScore=n;best=a;}}
 const center=best;for(let a=center-.4;a<=center+.4;a+=.1){const n=score(a);if(n>bestScore){bestScore=n;best=a;}}
 return bestScore>original*1.035&&Math.abs(best)>.15?Math.round(best*10)/10:0;
}
export function rotateFine(canvas:HTMLCanvasElement,angle:number):HTMLCanvasElement {
 if(Math.abs(angle)<.01)return canvas;
 const a=angle*Math.PI/180,cos=Math.abs(Math.cos(a)),sin=Math.abs(Math.sin(a));
 const out=makeCanvas(canvas.width*cos+canvas.height*sin,canvas.width*sin+canvas.height*cos);const ctx=out.getContext('2d')!;
 ctx.translate(out.width/2,out.height/2);ctx.rotate(a);ctx.drawImage(canvas,-canvas.width/2,-canvas.height/2);return out;
}
function solve(a:number[][],b:number[]):number[]{
 const n=b.length;const m=a.map((row,i)=>[...row,b[i]]);
 for(let k=0;k<n;k++){let pivot=k;for(let r=k+1;r<n;r++)if(Math.abs(m[r][k])>Math.abs(m[pivot][k]))pivot=r;[m[k],m[pivot]]=[m[pivot],m[k]];if(Math.abs(m[k][k])<1e-10)throw new Error('Punti di rettifica degeneri.');const d=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=d;for(let r=0;r<n;r++)if(r!==k){const q=m[r][k];for(let j=k;j<=n;j++)m[r][j]-=q*m[k][j];}}
 return m.map(row=>row[n]);
}
export function homography(corners:Point[]):(u:number,v:number)=>Point {
 if(corners.length!==4)throw new Error('Servono quattro angoli.');
 const uv=[[0,0],[1,0],[1,1],[0,1]];const a:number[][]=[],b:number[]=[];
 for(let i=0;i<4;i++){const [u,v]=uv[i],{x,y}=corners[i];a.push([u,v,1,0,0,0,-u*x,-v*x]);b.push(x);a.push([0,0,0,u,v,1,-u*y,-v*y]);b.push(y);}
 const t=solve(a,b);return(u,v)=>{const d=t[6]*u+t[7]*v+1;return{x:(t[0]*u+t[1]*v+t[2])/d,y:(t[3]*u+t[4]*v+t[5])/d};};
}
export function meshMap(points:Point[]):(u:number,v:number)=>Point {
 if(points.length!==9)throw new Error('Servono nove punti della griglia.');
 return(u,v)=>{const col=Math.min(1,Math.floor(u*2)),row=Math.min(1,Math.floor(v*2)),x=u*2-col,y=v*2-row;const a=points[row*3+col],b=points[row*3+col+1],c=points[(row+1)*3+col],d=points[(row+1)*3+col+1];return{x:a.x*(1-x)*(1-y)+b.x*x*(1-y)+c.x*(1-x)*y+d.x*x*y,y:a.y*(1-x)*(1-y)+b.y*x*(1-y)+c.y*(1-x)*y+d.y*x*y};};
}
export function validControlPoints(points:Point[],mode:'perspective'|'mesh'):boolean {
 if(points.length!==(mode==='mesh'?9:4)||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))return false;
 const grids=mode==='mesh'?[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]]:[[0,1,2,3]];
 for(const ids of grids){for(let i=0;i<4;i++){const a=points[ids[i]],b=points[ids[(i+1)%4]],c=points[ids[(i+2)%4]];if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<.001)return false;}}
 return true;
}
export async function warpImage(image:string,points:Point[],mode:'perspective'|'mesh',signal?:AbortSignal):Promise<HTMLCanvasElement>{
 if(!validControlPoints(points,mode))throw new Error('La griglia si incrocia o è troppo stretta. Riposiziona i punti.');
 const img=new Image();img.src=image;await img.decode();const source=makeCanvas(img.naturalWidth,img.naturalHeight);const ctx=source.getContext('2d')!;ctx.drawImage(img,0,0);
 const px=points.map(p=>({x:p.x*(source.width-1),y:p.y*(source.height-1)}));const map=mode==='mesh'?meshMap(px):homography(px);
 const out=makeCanvas(source.width,source.height);const oc=out.getContext('2d')!;const input=ctx.getImageData(0,0,source.width,source.height).data;const output=oc.createImageData(out.width,out.height);
 for(let y=0;y<out.height;y++){
 if(y%80===0){signal?.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,0));}
 for(let x=0;x<out.width;x++){const p=map(x/(out.width-1),y/(out.height-1));const sx=Math.min(source.width-1,Math.max(0,p.x)),sy=Math.min(source.height-1,Math.max(0,p.y)),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;const i=(y*out.width+x)*4;
 for(let channel=0;channel<3;channel++){const sample=(xx:number,yy:number)=>input[(Math.min(source.height-1,yy)*source.width+Math.min(source.width-1,xx))*4+channel];output.data[i+channel]=sample(ix,iy)*(1-fx)*(1-fy)+sample(ix+1,iy)*fx*(1-fy)+sample(ix,iy+1)*(1-fx)*fy+sample(ix+1,iy+1)*fx*fy;}output.data[i+3]=255;
 }}oc.putImageData(output,0,0);return out;
}
