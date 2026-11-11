import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LineTracker,InspectionQueue} from '../public/inspection-queue.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('crossing detected even when frames skip the narrow center band',()=>{
 const t=new LineTracker(),roi=x=>({detected:true,centerX:640+x});
 assert.equal(t.observe(roi(60),1280,0),null);
 assert.equal(t.observe(roi(-45),1280,.1).trackId,1);
 assert.equal(t.observe(roi(-55),1280,.2),null);
 t.observe(roi(150),1280,4);
 assert.equal(t.observe(roi(-10),1280,4.8).trackId,2);
});
test('slow inference preserves captured frames and reports queue overflow',async()=>{
 const results=[],dropped=[];let release;
 const q=new InspectionQueue({limit:2,worker:item=>new Promise(resolve=>{release=()=>resolve(item.frame);}),onResult:(item,result)=>results.push([item.id,result]),onError:()=>{},onDrop:item=>dropped.push(item.id)});
 q.enqueue({id:1,frame:'frame1'});q.enqueue({id:2,frame:'frame2'});q.enqueue({id:3,frame:'frame3'});
 assert.equal(q.pending,2);assert.deepEqual(dropped,[3]);
 release();await tick();assert.deepEqual(results,[[1,'frame1']]);
 release();await tick();assert.deepEqual(results,[[1,'frame1'],[2,'frame2']]);assert.equal(q.pending,0);
});
test('cancelled session never emits old results',async()=>{
 let release;const results=[];
 const q=new InspectionQueue({worker:()=>new Promise(r=>release=r),onResult:r=>results.push(r),onError:()=>{},onDrop:()=>{}});
 q.enqueue({id:1});q.cancel();release('old');await tick();assert.deepEqual(results,[]);
});
test('failed inference is recorded and next capture still runs',async()=>{
 const failed=[],done=[];const q=new InspectionQueue({worker:async i=>{if(i.id===1)throw Error('device');return i;},onResult:i=>done.push(i.id),onError:i=>failed.push(i.id),onDrop:()=>{}});
 q.enqueue({id:1});q.enqueue({id:2});await tick();assert.deepEqual(failed,[1]);assert.deepEqual(done,[2]);assert.equal(q.pending,0);
});
test('32 spaced passages generate 32 unique IDs despite repeated center frames',()=>{
 const tracker=new LineTracker(),ids=[];
 for(let n=0;n<32;n++)for(const [j,x] of [140,65,10,-8,-12,-60,-140].entries()){
  const event=tracker.observe({detected:true,centerX:640+x},1280,n*4+j*.08);
  if(event)ids.push(event.trackId);
 }
 assert.equal(ids.length,32);assert.equal(new Set(ids).size,32);
});
