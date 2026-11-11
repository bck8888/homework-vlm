// One object at a time crosses a right-to-left conveyor inspection line.
export class LineTracker {
 constructor(){this.nextId=1;this.track=null;}
 observe(roi,width,time){
  const x=roi.centerX-width/2;
  if(!roi.detected){if(this.track&&time-this.track.lastSeen>.5)this.track=null;return null;}
  let t=this.track;
  if(!t || (x>60 && x-t.x>90)) t=this.track={id:this.nextId++,x,lastSeen:time,counted:false,fresh:true};
  const crossed=!t.counted && ((t.x>0&&x<=0)||(t.fresh&&x<=0&&x>=-25));
  t.x=x;t.lastSeen=time;t.fresh=false;
  if(!crossed)return null;
  t.counted=true;return {trackId:t.id,videoTime:time};
 }
}
export class InspectionQueue {
 constructor({worker,onResult,onError,onDrop,onChange=()=>{},limit=16}){
  Object.assign(this,{worker,onResult,onError,onDrop,onChange,limit});this.items=[];this.active=false;this.busy=false;this.cancelled=false;
 }
 get pending(){return this.items.length+(this.active?1:0);}
 enqueue(item){
  if(this.cancelled)return;
  if(this.pending>=this.limit){this.onDrop(item);this.onChange();return;}
  this.items.push(item);this.onChange();void this.drain();
 }
 cancel(){this.cancelled=true;this.items=[];}
 async drain(){
  if(this.busy||this.cancelled)return;
  this.busy=true;
  while(this.items.length&&!this.cancelled){
   const item=this.items.shift();this.active=true;
   try{const result=await this.worker(item);this.active=false;if(!this.cancelled)this.onResult(item,result);}
   catch(error){this.active=false;if(!this.cancelled)this.onError(item,error);}
   this.onChange();
  }
  this.busy=false;if(!this.cancelled)this.onChange();
 }
}
