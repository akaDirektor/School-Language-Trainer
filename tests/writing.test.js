import test from 'node:test';
import assert from 'node:assert/strict';
import {checkRecall,recallAnswers,emptyState,applyCatalog,recordAnswer} from '../core.js';
import {readFile} from 'node:fs/promises';
const corpus=JSON.parse(await readFile(new URL('../data/en.json',import.meta.url),'utf8'));
const word=id=>corpus.words.find(w=>w.id===id);
test('written German answers require articles and allow each stored translation',()=>{
 const w=word('en-s2-account');assert.equal(checkRecall('das Konto',w),true);assert.equal(checkRecall(' Konto ',w),false);assert.equal(checkRecall('der Konto',w),false);
 const apartment=corpus.words.find(w=>w.term==='apartment');assert.equal(checkRecall('die Wohnung',apartment),true);assert.equal(checkRecall('das Apartment',apartment),true);assert.equal(checkRecall('Wohnung',apartment),false);
});
test('writing tolerates spacing and annotations but preserves spelling and accents',()=>{
 const foot=corpus.words.find(w=>w.term==='foot, feet');assert.equal(checkRecall('  der   Fuß ',foot),true);assert.equal(checkRecall('der Fus',foot),false);
 const host=corpus.words.find(w=>w.term==='to host');assert.equal(checkRecall('ausrichten',host),true);assert.equal(checkRecall('veranstalten',host),true);
 const latest=corpus.words.find(w=>w.term==='latest');for(const s of ['neueste','neuester','neuestes'])assert.equal(checkRecall(s,latest),true);
});
test('reverse writing accepts stored English forms and optional infinitive to',()=>{
 const foot=corpus.words.find(w=>w.term==='foot, feet');for(const s of ['foot','feet'])assert.equal(checkRecall(s,foot,'reverse'),true);
 const turn=corpus.words.find(w=>w.term==='to turn (a)round');for(const s of ['turn round','to turn around','turn around'])assert.equal(checkRecall(s,turn,'reverse'),true);
 assert.equal(checkRecall('das Konto',word('en-s2-account'),'reverse'),false);assert.equal(checkRecall('',foot,'reverse'),false);
});
test('each catalogue word has writable answers in both directions; checking is pure',()=>{
 for(const w of corpus.words)for(const direction of ['forward','reverse']){const before=JSON.stringify(w);for(const a of recallAnswers(w,direction))assert.equal(checkRecall(a,w,direction),true);assert.equal(JSON.stringify(w),before);}
 const state=applyCatalog(emptyState(),corpus).state;const w=word('en-s2-account');const next=recordAnswer(state,'en',w.id,'recall',checkRecall('account',w,'reverse'),'2026-10-26','reverse');const stats=next.languages.en.stats[w.id];assert.equal(stats.recallReverseCorrect,1);assert.equal(stats.correct,0);assert.equal(stats.contextCorrect,0);
});

test('writing pages follow the selected lessons without repeats and grade every row atomically',async()=>{
 const {writingPage,gradeWritingPage}=await import('../core.js');let state=applyCatalog(emptyState(),corpus).state;
 const options={mode:'recall',focus:'all',type:'all',period:'all',lessonIds:['station-2'],direction:'forward'};
 const original=JSON.stringify(state),first=writingPage(state.languages.en,options,15);assert.equal(first.words.length,15);assert.equal(first.total,29);
 assert.throws(()=>gradeWritingPage(state,'en',first,first.words.map(()=>'')));
 assert.equal(JSON.stringify(state),original);
 const answers=first.words.map(w=>recallAnswers(w)[0]);answers[0]='wrong';
 const graded=gradeWritingPage(state,'en',first,answers);assert.equal(graded.results.filter(Boolean).length,14);assert.equal(JSON.stringify(state),original);state=graded.state;
 assert.throws(()=>gradeWritingPage(state,'en',first,answers));
 const second=writingPage(state.languages.en,options,15);assert.equal(second.words.length,14);assert.equal(second.done,15);assert.ok(second.words.every(w=>!first.words.some(v=>v.id===w.id)));
 state=gradeWritingPage(state,'en',second,second.words.map(w=>recallAnswers(w)[0])).state;
 assert.equal(writingPage(state.languages.en,options,15).words.length,0);
 assert.equal(writingPage(state.languages.en,{...options,lessonIds:['station-3']},15).words.length,6);
 assert.equal(writingPage(state.languages.en,{...options,direction:'reverse'},15).done,0);
 assert.equal(state.languages.en.stats[first.words[0].id].recallForwardWrong,1);
 assert.equal(state.languages.en.stats[first.words[1].id].recallForwardCorrect,1);
 assert.equal(state.languages.en.stats[first.words[1].id].correct,0);
});

test('written successes are counted separately, survive validation and backups, and count each word once',async()=>{
 const {writingPage,gradeWritingPage,summarize,validateState,backup,parseBackup,resetProgress}=await import('../core.js');
 let state=applyCatalog(emptyState(),corpus).state;
 const options={mode:'recall',focus:'all',type:'all',period:'all',lessonIds:['station-3'],direction:'reverse'};
 let page=writingPage(state.languages.en,options,15),answers=page.words.map(w=>recallAnswers(w,'reverse')[0]);answers[0]='wrong';
 state=gradeWritingPage(state,'en',page,answers,'reverse').state;
 assert.equal(summarize(state.languages.en).databaseWritingPassed,5);
 assert.equal(state.languages.en.stats[page.words[0].id].writingWrong,1);
 assert.equal(state.languages.en.stats[page.words[1].id].writingCorrect,1);
 assert.deepEqual(parseBackup(backup(state)),state);assert.deepEqual(validateState(state),state);
 delete state.languages.en.cycles[page.scope];page=writingPage(state.languages.en,options,15);
 state=gradeWritingPage(state,'en',page,page.words.map(w=>recallAnswers(w,'reverse')[0]),'reverse').state;
 state.languages.en.hidden=[page.words[1].id];assert.equal(summarize(state.languages.en).databaseWritingPassed,6);assert.equal(state.languages.en.stats[page.words[1].id].writingCorrect,2);
 assert.equal(summarize(state.languages.es).databaseWritingPassed,0);assert.equal(summarize(resetProgress(state,'en').languages.en).databaseWritingPassed,0);
 const bad=structuredClone(state);bad.languages.en.stats[page.words[1].id].writingCorrect=-1;assert.throws(()=>validateState(bad));
});
test('historical recall answers do not fabricate written successes',async()=>{
 const {summarize,validateState}=await import('../core.js');let state=applyCatalog(emptyState(),corpus).state;
 state=recordAnswer(state,'en','en-s2-account','recall',true);assert.equal(summarize(state.languages.en).databaseWritingPassed,0);assert.equal(summarize(state.languages.en).databaseRecallPassed,1);assert.deepEqual(validateState(state),state);
});
