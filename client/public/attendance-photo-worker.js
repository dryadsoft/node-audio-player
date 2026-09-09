/* Perspective resampling runs off the UI thread; no network or external services. */
self.onmessage = function (event) {
  try {
    var p=event.data,src=new Uint8ClampedArray(p.buffer),out=new Uint8ClampedArray(p.width*p.height*4),m=p.matrix;
    for(var y=0;y<p.height;y++) for(var x=0;x<p.width;x++) {
      var u=x/Math.max(1,p.width-1),v=y/Math.max(1,p.height-1),q=m[6]*u+m[7]*v+1;
      var sx=Math.max(0,Math.min(p.sourceWidth-1,(m[0]*u+m[1]*v+m[2])/q*(p.sourceWidth-1)));
      var sy=Math.max(0,Math.min(p.sourceHeight-1,(m[3]*u+m[4]*v+m[5])/q*(p.sourceHeight-1)));
      var x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(p.sourceWidth-1,x0+1),y1=Math.min(p.sourceHeight-1,y0+1),fx=sx-x0,fy=sy-y0;
      for(var c=0;c<3;c++) out[(y*p.width+x)*4+c]=src[(y0*p.sourceWidth+x0)*4+c]*(1-fx)*(1-fy)+src[(y0*p.sourceWidth+x1)*4+c]*fx*(1-fy)+src[(y1*p.sourceWidth+x0)*4+c]*(1-fx)*fy+src[(y1*p.sourceWidth+x1)*4+c]*fx*fy;
      out[(y*p.width+x)*4+3]=255;
    }
    self.postMessage({buffer:out.buffer},[out.buffer]);
  } catch (error) { self.postMessage({error:'사진 보정에 실패했습니다.'}); }
};
