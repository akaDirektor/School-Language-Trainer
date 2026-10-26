import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState,applyCatalog,resetProgress,recordAnswer,beginArticleMatch,answerGermanArticle,backup,parseBackup,summarize,activity} from '../core.js';
const vocabulary=JSON.parse(await readFile(new URL('../data/en.json',import.meta.url),'utf8'));
test('progress reset clears all exercises, articles, directions, days and cycles but preserves the vocabulary',()=>{
  let s=applyCatalog(emptyState(),vocabulary).state;
  s=recordAnswer(s,'en','en-s2-account','recall',true,'2026-10-26','forward');s=recordAnswer(s,'en','en-s2-account','recall',false,'2026-10-26','reverse');s=recordAnswer(s,'en','en-s2-account','context',false,'2026-10-26');
  s=beginArticleMatch(s,'en','en-s2-account','matching');s=answerGermanArticle(s,'en','en-s2-account','das').state;s=beginArticleMatch(s,'en','en-s2-application','pending');
  s.languages.en.cycles.recall=['en-s2-account'];s.languages.en.hidden=['en-s2-zoo'];s.languages.es.lessons=[{id:'spanish',name:'Keep'}];
  const original=structuredClone(s),saved=backup(s),r=resetProgress(s,'en');
  assert.deepEqual(s,original);assert.deepEqual(r.languages.en.stats,{});assert.deepEqual(r.languages.en.cycles,{});
  for(const field of ['words','lessons','hidden','catalogBatches'])assert.deepEqual(r.languages.en[field],original.languages.en[field]);
  assert.deepEqual(r.languages.es,original.languages.es);assert.equal(summarize(r.languages.en).correct,0);assert.equal(summarize(r.languages.en).ready,0);assert.equal(summarize(r.languages.en).recallCorrect,0);assert.equal(summarize(r.languages.en).contextWrong,0);assert.ok(activity(r.languages.en).every(d=>d.count===0));assert.deepEqual(parseBackup(saved),original);
});
test('reset is idempotent, rejects unknown languages and supports a fresh learning start',()=>{const s=applyCatalog(emptyState(),vocabulary).state;const r=resetProgress(s,'en');assert.deepEqual(resetProgress(r,'en'),r);assert.throws(()=>resetProgress(s,'de'));const fresh=recordAnswer(r,'en','en-s2-account','recall',true,'2026-10-26','reverse');assert.equal(fresh.languages.en.stats['en-s2-account'].recallReverseCorrect,1);assert.equal(fresh.languages.en.words.length,35);});
