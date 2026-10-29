import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState,applyCatalog,recordAnswer,scopeKey,nextWord,recallRound,nextRecallWord} from '../core.js';
const es=JSON.parse(await readFile(new URL('../data/es.json',import.meta.url),'utf8'));
const en=JSON.parse(await readFile(new URL('../data/en.json',import.meta.url),'utf8'));
const opts={mode:'recall',focus:'all',type:'all',period:'all',lessonIds:['es-b1-block-a'],direction:'forward'};
test('a fresh recall round includes all 30 Spanish words even when a saved cycle has already visited ten',()=>{
 let s=applyCatalog(emptyState(),es).state;const b=s.languages.es,scope=scopeKey(opts),prior=b.words.slice(8,18).map(w=>w.id);b.cycles[scope]=prior;
 assert.ok(prior.includes('es-b1-a-ponerse-morado'));const continued=nextWord(b,opts,()=>0);assert.equal(continued.seen.length,10);assert.ok(continued.seen.includes('es-b1-a-ponerse-morado'));
 const before=structuredClone(s),round=recallRound(b,opts,[],()=>.4);assert.deepEqual(s,before);assert.equal(round.ids.length,30);assert.equal(round.seen.length,0);
 const seen=[];for(let i=0;i<30;i++){const choice=nextRecallWord(b,round);assert.ok(choice.word);assert.equal(choice.total,30);assert.ok(!seen.includes(choice.word.id));seen.push(choice.word.id);round.seen=[...choice.seen,choice.word.id];}
 assert.ok(seen.includes('es-b1-a-ponerse-morado'));assert.deepEqual(new Set(seen),new Set(b.words.map(w=>w.id)));assert.equal(nextRecallWord(b,round).complete,true);assert.equal(nextRecallWord(b,round).word,null);
});
test('every restart changes the order even if the random shuffle produces the previous permutation',()=>{
 const b=applyCatalog(emptyState(),es).state.languages.es,first=recallRound(b,opts,[],()=>.3),second=recallRound(b,opts,first.ids,()=>.3),third=recallRound(b,opts,second.ids,()=>.3);
 assert.deepEqual(new Set(first.ids),new Set(second.ids));assert.notDeepEqual(first.ids,second.ids);assert.notDeepEqual(second.ids,third.ids);
 const single={...b,words:b.words.slice(0,1)};assert.equal(recallRound(single,opts,single.words.map(w=>w.id),()=>0).ids.length,1);
});
test('mixed historical scores and both directions never omit words or trigger automatic repeat',()=>{
 for(const corpus of [es,en])for(const direction of ['forward','reverse']){
  let s=applyCatalog(emptyState(),corpus).state;const language=corpus.language,beforeWords=s.languages[language].words;
  for(let i=0;i<beforeWords.length;i++)for(let j=0;j<i%4;j++)s=recordAnswer(s,language,beforeWords[i].id,'recall',i%2===0,'2026-10-29',direction);
  const b=s.languages[language],options={...opts,lessonIds:[],direction},before=structuredClone(b),round=recallRound(b,options,[],()=>.2);
  const ids=[];while(true){const next=nextRecallWord(b,round);if(!next.word){assert.equal(next.complete,true);break;}assert.ok(!ids.includes(next.word.id));ids.push(next.word.id);round.seen=[...next.seen,next.word.id];}
  assert.equal(ids.length,b.words.length);assert.deepEqual(b,before);
 }
});
test('recall rounds respect only the selected lessons and explicit filters or hidden words',()=>{
 const b=applyCatalog(emptyState(),es).state.languages.es;b.hidden=['es-b1-a-torre'];
 const round=recallRound(b,opts);assert.equal(round.ids.length,29);assert.ok(!round.ids.includes('es-b1-a-torre'));assert.ok(round.ids.includes('es-b1-a-ponerse-morado'));
 const nouns=recallRound(b,{...opts,type:'noun'});assert.ok(nouns.ids.every(id=>b.words.find(w=>w.id===id).type==='noun'));
 const empty=recallRound(b,{...opts,lessonIds:['different']});assert.equal(empty.ids.length,0);assert.equal(nextRecallWord(b,empty).complete,false);
});
