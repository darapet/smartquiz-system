import test from 'node:test'; import assert from 'node:assert/strict';
import { cleanText, splitIntoChunks, planUnits, recommendedCount, minCountToCover, SOURCE, validateSetup } from '../../js/mp-core.js';
const words = n => Array.from({length:n},(_,i)=>`word${i}`).join(' ');
const para = (i,len)=> `Section ${i}. ` + words(len);
test('chunks keep all text', () => {
  const text = Array.from({length:40},(_,i)=>para(i,200)).join('\n\n');
  const chunks = splitIntoChunks(text, 3000);
  assert.ok(chunks.every(c=>c.length<=3000));
  const norm = s=>s.replace(/\s+/g,' ');
  assert.equal(norm(chunks.join(' ')), norm(cleanText(text)));
});
test('one huge paragraph is cut at word breaks, nothing lost', () => {
  const text = words(5000);
  const chunks = splitIntoChunks(text, 2000);
  assert.ok(chunks.length>1 && chunks.every(c=>c.length<=2000));
  assert.equal(chunks.join(' ').split(' ').length, 5000);
});
test('plan: counts add up and every chunk gets questions', () => {
  const text = Array.from({length:30},(_,i)=>para(i,150)).join('\n\n');
  for (const count of [30, 31, 57, 200, 1500]) {
    const units = planUnits(text, count);
    assert.equal(units.reduce((n,u)=>n+u.count,0), count);
    assert.ok(units.every(u=>u.count>=1));
  }
});
test('plan with few questions still includes ALL text', () => {
  const text = Array.from({length:30},(_,i)=>para(i,150)).join('\n\n');
  const units = planUnits(text, 4);
  assert.equal(units.length, 4);
  assert.equal(units.reduce((n,u)=>n+u.count,0), 4);
  const all = units.map(u=>u.text).join(' ');
  for (let i=0;i<30;i++) assert.ok(all.includes(`Section ${i}.`), 'missing section '+i);
  assert.equal(planUnits(text,1).length, 1);
});
test('recommended count and validation', () => {
  assert.equal(recommendedCount(0),0); assert.equal(recommendedCount(450),1); assert.equal(recommendedCount(451),2);
  assert.equal(recommendedCount(10_000_000),1500);
  assert.equal(minCountToCover(24001),2);
  assert.equal(validateSetup({title:'x',seconds:20,count:5,prompt:'',hasSource:true}),'');
  assert.ok(validateSetup({title:'x',seconds:20,count:5,prompt:'',hasSource:false}));
});
