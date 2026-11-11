import test from 'node:test';
import assert from 'node:assert/strict';
import { Siamese } from '../public/siamese.js';
test('shared contrastive encoder learns positive and negative distances', () => {
  const m = new Siamese(4, 8);
  const a = [1,0,0,0], p = [.9,.1,0,0], n = [0,0,1,0];
  const before = m.distance(m.encode(a), m.encode(n));
  for(let i=0;i<400;i++) { m.trainPair(a,p,true); m.trainPair(a,n,false); }
  assert.ok(m.distance(m.encode(a),m.encode(n)) > before + .5);
  assert.ok(m.distance(m.encode(a),m.encode(p)) < .1);
  assert.deepEqual(m.encode(a),m.encode(a));
});
