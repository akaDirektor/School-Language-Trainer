import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState,validateVocabulary,validateState,applyCatalog,resetLanguage,mergeVocabulary,recordAnswer,checkContext,backup,parseBackup} from '../core.js';
const corpus=JSON.parse(await readFile(new URL('../data/en.json',import.meta.url),'utf8'));
test('only the visually reviewed blue entries are included in their correct station',()=>{
  const v=validateVocabulary(corpus);assert.equal(v.words.length,35);
  assert.equal(v.words.filter(w=>w.lessonIds.includes('station-2')).length,29);assert.equal(v.words.filter(w=>w.lessonIds.includes('station-3')).length,6);
  const expected=['account','stylish','sunglasses','to step forward','gun','to take out','buck','to turn (a)round','to handle','to fool','robber','lucky day','robbery','autograph','latest','to rob','to walk sb','foot, feet','breath','mix-up','talented','application','to keep up','loss','zoo','to host','eyewitness','time slot','apartment','Islamist','to hijack','airplane','story','survivor','to shake, shook, shaken'];
  assert.deepEqual(v.words.map(w=>w.term),expected);
  for(const excluded of ['at the latest','banking app','ATM','transaction','to process','grubby','mint','to apply (to)','incredible','scientist','musician','curiosity','to tuck sb in','to whistle','walrus','to frustrate','cheek','chest','from rags to riches','stock market'])assert.ok(!v.words.some(w=>w.term===excluded));
  assert.deepEqual(v.words.filter(w=>w.lessonIds.includes('station-3')).map(w=>w.term),['Islamist','to hijack','airplane','story','survivor','to shake, shook, shaken']);
});
test('all words have literal reversible gaps, German translations and honest provenance',()=>{
  const v=validateVocabulary(corpus);let exact=0,generated=0;
  for(const w of v.words){assert.equal(w.examples.length,1);const e=w.examples[0];assert.ok(e.translation);assert.equal(e.sentence.split('{{word}}').length,2);assert.ok(!e.sentence.replace('{{word}}',e.answer).includes('{{word}}'));if(w.type==='noun')assert.match(w.de,/^(der|die|das) /);if(e.source==='textbook')exact++;else generated++;}
  assert.equal(exact,4);assert.equal(generated,31);
  const around=v.words.find(w=>w.term==='to turn (a)round').examples[0];assert.equal(checkContext('turned around',around),true);assert.equal(checkContext('turned round',around),true);
});
test('catalogue arrives once and preserves existing counters on reload',()=>{
  let s=applyCatalog(emptyState(),corpus).state;s=recordAnswer(s,'en','en-s2-account','cards',true,'2026-10-26');
  assert.deepEqual(applyCatalog(s,corpus).state,s);assert.equal(s.languages.en.stats['en-s2-account'].correct,1);assert.equal(s.languages.es.words.length,0);
});
test('reset affects only English and old test vocabulary does not silently reappear',()=>{
  let s=applyCatalog(emptyState(),corpus).state;s.languages.es.lessons.push({id:'keep',name:'Keep Spanish'});s=recordAnswer(s,'en','en-s2-account','cards',true,'2026-10-26');
  const original=structuredClone(s),saved=backup(s),reset=resetLanguage(s,'en');
  assert.deepEqual(s,original);assert.equal(reset.languages.en.words.length,0);assert.equal(reset.languages.en.lessons.length,0);assert.deepEqual(reset.languages.en.stats,{});assert.deepEqual(reset.languages.es,s.languages.es);
  assert.equal(applyCatalog(reset,corpus).state.languages.en.words.length,0);assert.deepEqual(parseBackup(saved),s);
  const explicit=mergeVocabulary(reset,corpus).state;assert.equal(explicit.languages.en.words.length,35);assert.deepEqual(explicit.languages.en.stats,{});
});
test('old schema-one backups without catalogue metadata still restore',()=>{
  const old=emptyState();delete old.languages.en.catalogBatches;delete old.languages.es.catalogBatches;
  assert.deepEqual(validateState(old),emptyState());
});
