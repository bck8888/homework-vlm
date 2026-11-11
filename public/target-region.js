// Keep the largest connected dark component, so labels are not merged with the part.
export function targetBounds(rgba, side, stride=2) {
 const n=Math.ceil(side/stride), mask=new Uint8Array(n*n), queue=new Int32Array(n*n);
 for(let gy=0;gy<n;gy++)for(let gx=0;gx<n;gx++){
  const i=((gy*stride)*side+gx*stride)*4;
  mask[gy*n+gx]=(rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722)<205?1:0;
 }
 let best=null;
 for(let start=0;start<mask.length;start++){
  if(!mask[start])continue;
  mask[start]=0;queue[0]=start;let read=0,write=1,x0=n,y0=n,x1=0,y1=0;
  while(read<write){
   const p=queue[read++],x=p%n,y=Math.floor(p/n);
   x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy;
    if(nx<0||nx>=n||ny<0||ny>=n)continue;
    const q=ny*n+nx;if(mask[q]){mask[q]=0;queue[write++]=q;}
   }
  }
  if((x1-x0)*stride>side*.12 && (y1-y0)*stride>side*.12 && (!best||write>best.area))
   best={minX:x0*stride,minY:y0*stride,maxX:x1*stride,maxY:y1*stride,area:write};
 }
 return best;
}
