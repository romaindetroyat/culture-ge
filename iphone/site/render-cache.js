/** Tight bounds for static RGBA sprites; no reduction in image resolution. */
export function alphaBounds(data,width,height,padding=2){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length<width*height*4)throw new TypeError('Dimensions du sprite invalides');
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){
  if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;
 }
 if(right<0)return null;
 const margin=Math.max(0,Math.floor(padding));
 left=Math.max(0,left-margin);top=Math.max(0,top-margin);right=Math.min(width-1,right+margin);bottom=Math.min(height-1,bottom+margin);
 return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
/** The source is a reusable scratch canvas. Keep the origin after trimming. */
export function cacheSprite(source,originX=0,originY=0){
 const c=source.getContext('2d');
 const box=alphaBounds(c.getImageData(0,0,source.width,source.height).data,source.width,source.height);
 if(!box)return null;
 const canvas=document.createElement('canvas');canvas.width=box.width;canvas.height=box.height;
 canvas.getContext('2d').drawImage(source,box.x,box.y,box.width,box.height,0,0,box.width,box.height);
 return {canvas,offsetX:box.x-originX,offsetY:box.y-originY,pixels:box.width*box.height,sourcePixels:source.width*source.height};
}
