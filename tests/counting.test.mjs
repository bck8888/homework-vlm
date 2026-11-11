import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassageCounter } from '../public/counting.js';
import fs from 'node:fs';
test('one count per center crossing, rearm only after leaving', () => {
 const c = new PassageCounter();
 assert.equal(c.observe({detected:true,centerX:640},1280),true);
 assert.equal(c.observe({detected:true,centerX:645},1280),false);
 assert.equal(c.observe({detected:false,centerX:640},1280),false);
 assert.equal(c.observe({detected:true,centerX:630},1280),true);
});
test('count match requires completed run and correct per-class counts', () => {
 const classes = [{id:'a'},{id:'b'}], c = new PassageCounter();
 for(let i=0;i<32;i++) c.add({status:'normal', best:{item:{id:'a'},score:.9}},i);
 assert.equal(c.report(classes,true).countMatch,false);
 assert.equal(c.report(classes).complete,false);
});
test('video manifest is four shuffled rounds of eight', () => {
 const {order,seconds} = JSON.parse(fs.readFileSync('public/assets/videos/inspection-conveyor-random-4x.json'));
 assert.equal(seconds,128); assert.equal(order.length,32);
 for(let i=0;i<4;i++) assert.equal(new Set(order.slice(i*8,i*8+8)).size,8);
});
