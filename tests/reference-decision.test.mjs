import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideReference} from '../public/reference-decision.js';
import {targetBounds} from '../public/target-region.js';
const scores=(a,b,c)=>[{item:{id:'a',group:'normal'},score:a},{item:{id:'b',group:'normal'},score:b},{item:{id:'c',group:'defect'},score:c}];
test('low absolute similarity is review, even if nearest',()=>assert.equal(decideReference(scores(.4,.3,.5)).status,'review'));
test('ambiguous normal/defect is review',()=>assert.equal(decideReference(scores(.96,.95,.965)).status,'review'));
test('normal references can tie without rejection',()=>assert.equal(decideReference(scores(.99,.99,.92)).status,'normal'));
test('distinct defect accepted',()=>assert.equal(decideReference(scores(.91,.9,.99)).status,'defect'));
test('label components excluded from object bounds',()=>{
 const side=100,p=new Uint8ClampedArray(side*side*4).fill(255);
 const dot=(x,y)=>{for(let c=0;c<3;c++)p[(y*side+x)*4+c]=0;};
 for(let y=40;y<=80;y++)for(let x=30;x<=70;x++)dot(x,y);
 for(let y=10;y<16;y++)for(let x=40;x<44;x++)dot(x,y);
 assert.deepEqual(targetBounds(p,side,1),{minX:30,minY:40,maxX:70,maxY:80,area:1681});
});
