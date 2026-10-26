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

test('writing sheets retry only mistakes and continue until every selected word has three successes',async()=>{
 const {writingPage,gradeWritingPage,summarize,validateState,backup,parseBackup,resetProgress}=await import('../core.js');
 let state=applyCatalog(emptyState(),corpus).state;
 const options={mode:'recall',focus:'all',type:'all',period:'all',lessonIds:['station-3'],direction:'reverse'};
 const initial=writingPage(state.languages.en,options,15);assert.equal(initial.words.length,6);assert.equal(initial.total,6);assert.equal(initial.done,0);
 const original=structuredClone(state),answers=initial.words.map(w=>recallAnswers(w,'reverse')[0]);answers[0]='wrong';
 assert.throws(()=>gradeWritingPage(state,'en',initial,initial.words.map(()=>'')));
 const graded=gradeWritingPage(state,'en',initial,answers,'reverse');assert.deepEqual(state,original);state=graded.state;
 assert.equal(graded.results.filter(Boolean).length,5);assert.equal(summarize(state.languages.en).databaseWritingPassed,5);assert.equal(summarize(state.languages.en).databaseWritingMastered,0);assert.throws(()=>gradeWritingPage(state,'en',initial,answers,'reverse'));
 assert.deepEqual(parseBackup(backup(state)),state);
 let retry=writingPage(parseBackup(backup(state)).languages.en,options,15);assert.equal(retry.retry,true);assert.deepEqual(retry.words.map(w=>w.id),[initial.words[0].id]);
 state=gradeWritingPage(state,'en',retry,[recallAnswers(retry.words[0],'reverse')[0]],'reverse').state;
 assert.equal(summarize(state.languages.en).databaseWritingPassed,6);
 let round2=writingPage(state.languages.en,options,15);assert.equal(round2.retry,false);assert.equal(round2.words.length,6);
 const secondAnswers=round2.words.map(w=>recallAnswers(w,'reverse')[0]);secondAnswers[1]='wrong';state=gradeWritingPage(state,'en',round2,secondAnswers,'reverse').state;
 assert.equal(state.languages.en.stats[round2.words[1].id].writingCorrect,1);assert.equal(state.languages.en.stats[round2.words[1].id].writingWrong,1);
 retry=writingPage(state.languages.en,options,15);assert.equal(retry.words.length,1);assert.equal(retry.words[0].id,round2.words[1].id);
 state=gradeWritingPage(state,'en',retry,[recallAnswers(retry.words[0],'reverse')[0]],'reverse').state;
 const round3=writingPage(state.languages.en,options,15);assert.equal(round3.words.length,6);state=gradeWritingPage(state,'en',round3,round3.words.map(w=>recallAnswers(w,'reverse')[0]),'reverse').state;
 assert.equal(summarize(state.languages.en).databaseWritingMastered,6);assert.equal(writingPage(state.languages.en,options,15).words.length,0);assert.equal(writingPage(state.languages.en,options,15).done,6);
 assert.equal(writingPage(state.languages.en,{...options,direction:'forward'},15).words.length,0);
 state.languages.en.hidden=[round3.words[1].id];assert.equal(summarize(state.languages.en).databaseWritingMastered,6);assert.equal(summarize(state.languages.es).databaseWritingMastered,0);
 assert.deepEqual(validateState(state),state);assert.equal(summarize(resetProgress(state,'en').languages.en).databaseWritingMastered,0);
 const bad=structuredClone(state);bad.languages.en.stats[round3.words[1].id].writingCorrect=-1;assert.throws(()=>validateState(bad));
 bad.languages.en.stats[round3.words[1].id].writingCorrect=3;bad.languages.en.stats[round3.words[1].id].writingNeedsRetry='yes';assert.throws(()=>validateState(bad));
});
test('writing pages preserve lesson filters and paginate new words before another success round',async()=>{
 const {writingPage,gradeWritingPage}=await import('../core.js');let state=applyCatalog(emptyState(),corpus).state;
 const options={mode:'recall',focus:'all',type:'all',period:'all',lessonIds:['station-2'],direction:'forward'};
 const first=writingPage(state.languages.en,options,15);assert.equal(first.words.length,15);assert.equal(first.total,29);
 state=gradeWritingPage(state,'en',first,first.words.map(w=>recallAnswers(w)[0])).state;
 const second=writingPage(state.languages.en,options,15);assert.equal(second.words.length,14);assert.ok(second.words.every(w=>!first.words.some(v=>v.id===w.id)));
 state=gradeWritingPage(state,'en',second,second.words.map(w=>recallAnswers(w)[0])).state;
 assert.equal(writingPage(state.languages.en,options,15).words.length,15);assert.equal(writingPage(state.languages.en,options,15).done,0);
 assert.equal(writingPage(state.languages.en,{...options,lessonIds:['station-3']},15).words.length,6);
});
test('historical recall answers do not fabricate written successes',async()=>{
 const {summarize,validateState}=await import('../core.js');let state=applyCatalog(emptyState(),corpus).state;
 state=recordAnswer(state,'en','en-s2-account','recall',true);assert.equal(summarize(state.languages.en).databaseWritingPassed,0);assert.equal(summarize(state.languages.en).databaseRecallPassed,1);assert.deepEqual(validateState(state),state);
});
