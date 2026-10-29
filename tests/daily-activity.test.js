import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState,applyCatalog,recordAnswer,activity,writingPage,gradeWritingPage,beginArticleMatch,answerGermanArticle,backup,parseBackup,validateState,resetProgress} from '../core.js';
const corpus=JSON.parse(await readFile(new URL('../data/en.json',import.meta.url),'utf8'));
const make=()=>applyCatalog(emptyState(),corpus).state;
const day='2026-10-29',id='en-s2-account';
const today=s=>activity(s.languages.en,day).at(-1);
test('daily chart counts unique successful words per exercise, not attempts or wrong answers',()=>{
 let s=make();for(let i=0;i<3;i++)s=recordAnswer(s,'en',id,'cards',true,day);
 s=recordAnswer(s,'en',id,'recall',true,day,'forward');s=recordAnswer(s,'en',id,'recall',true,day,'reverse');s=recordAnswer(s,'en',id,'context',false,day);
 s=recordAnswer(s,'en','en-s2-latest','context',true,day);s=recordAnswer(s,'en','en-s2-gun','recall',false,day);
 assert.deepEqual(today(s).successes,{cards:1,recall:1,context:1,writing:0});assert.equal(today(s).succeeded,2);assert.equal(today(s).count,3);
 const before=structuredClone(s);activity(s.languages.en,day);assert.deepEqual(s,before);
 s=recordAnswer(s,'en',id,'cards',true,'2026-10-28');assert.equal(activity(s.languages.en,day).at(-2).successes.cards,1);assert.equal(today(s).successes.cards,1);
});
test('written successes have their own daily series and do not also count as mental recall',()=>{
 let s=make();const page=writingPage(s.languages.en,{mode:'recall',lessonIds:['station-3'],focus:'all',type:'all',period:'all'},15);
 const answers=page.words.map(w=>w.de);answers[0]='wrong';s=gradeWritingPage(s,'en',page,answers,'forward',day).state;
 assert.equal(today(s).successes.writing,5);assert.equal(today(s).successes.recall,0);assert.equal(s.languages.en.stats[page.words[1].id].recallCorrect,1);
 const retry=writingPage(s.languages.en,{mode:'recall',lessonIds:['station-3'],focus:'all',type:'all',period:'all'},15);s=gradeWritingPage(s,'en',retry,retry.words.map(w=>w.de),'forward',day).state;
 assert.equal(today(s).successes.writing,6);assert.equal(today(s).succeeded,6);
 assert.deepEqual(parseBackup(backup(s)),s);
});
test('article questions count matching success only after all required articles are correct',()=>{
 let s=beginArticleMatch(make(),'en','en-s2-application','test',day);assert.equal(today(s).successes.cards,0);
 s=answerGermanArticle(s,'en','en-s2-application','die',day).state;assert.equal(today(s).successes.cards,0);
 s=answerGermanArticle(s,'en','en-s2-application','der',day).state;assert.equal(today(s).successes.cards,1);
 let bad=beginArticleMatch(make(),'en',id,'test',day);bad=answerGermanArticle(bad,'en',id,'der',day).state;assert.equal(today(bad).successes.cards,0);
});
test('legacy days retain activity without fabricated success types; hidden words and languages stay isolated',()=>{
 let s=recordAnswer(make(),'en',id,'cards',true,day);delete s.languages.en.stats[id].dailyResults;
 const legacy=today(s);assert.equal(legacy.count,1);assert.equal(legacy.legacyWords,1);assert.equal(legacy.trackedWords,0);assert.deepEqual(legacy.successes,{cards:0,recall:0,context:0,writing:0});
 assert.deepEqual(validateState(s),s);
 s=recordAnswer(s,'en','en-s2-gun','recall',true,day);s.languages.en.hidden=['en-s2-gun'];assert.equal(today(s).successes.recall,0);
 assert.equal(activity(s.languages.es,day).at(-1).succeeded,0);assert.equal(today(resetProgress(s,'en')).legacyWords,0);
});
test('daily history rejects malformed dates and modes and retains at most 366 dates',()=>{
 let s=recordAnswer(make(),'en',id,'cards',true,day);
 const bad=structuredClone(s);bad.languages.en.stats[id].dailyResults={'2026-02-30':['cards']};assert.throws(()=>validateState(bad));bad.languages.en.stats[id].dailyResults={[day]:['invented']};assert.throws(()=>validateState(bad));
 for(let i=0;i<370;i++){const d=new Date('2025-01-01T12:00:00');d.setUTCDate(d.getUTCDate()+i);s=recordAnswer(s,'en',id,'cards',true,d.toISOString().slice(0,10));}
 assert.equal(Object.keys(s.languages.en.stats[id].dailyResults).length,366);assert.deepEqual(validateState(s),s);
});
