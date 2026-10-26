import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState,applyCatalog,recordAnswer,isLearned,summarize,eligibleWords,resetProgress,beginArticleMatch,answerGermanArticle,gradeWritingPage,wordStats} from '../core.js';
const data=JSON.parse(await readFile(new URL('../data/en.json',import.meta.url),'utf8'));
const make=()=>applyCatalog(emptyState(),data).state;
const id='en-s2-account';
function match(s){return answerGermanArticle(beginArticleMatch(s,'en',id,'matching'),'en',id,'das').state;}
function write(s,wordId=id){const w=s.languages.en.words.find(w=>w.id===wordId),st=wordStats(s.languages.en,wordId);return gradeWritingPage(s,'en',{words:[w],scope:'test|written',baseline:{[wordId]:{correct:st.writingCorrect||0,wrong:st.writingWrong||0}}},[w.term],'reverse').state;}
function written(s){for(let i=0;i<3;i++)s=write(s);return s;}
test('full mastery needs three successful matches AND recall AND context AND three written successes on the same word',()=>{let s=make();for(let i=0;i<3;i++)s=match(s);assert.equal(summarize(s.languages.en).databaseReady,1);assert.equal(summarize(s.languages.en).databaseLearned,0);s=recordAnswer(s,'en',id,'recall',true);assert.equal(summarize(s.languages.en).databaseLearned,0);s=recordAnswer(s,'en',id,'context',true);assert.equal(isLearned(s.languages.en.stats[id]),false);s=write(s);s=write(s);assert.equal(isLearned(s.languages.en.stats[id]),false);s=write(s);assert.equal(isLearned(s.languages.en.stats[id]),true);assert.equal(summarize(s.languages.en).databaseLearned,1);assert.equal(eligibleWords(s.languages.en,{mode:'cards',focus:'unmastered'}).some(w=>w.id===id),false);});
test('other exercises remain independent and success in either recall direction qualifies',()=>{let s=make();s=recordAnswer(s,'en',id,'context',true);s=recordAnswer(s,'en',id,'recall',true,undefined,'reverse');for(let i=0;i<3;i++)s=match(s);s=written(s);assert.equal(summarize(s.languages.en).databaseLearned,1);assert.equal(s.languages.en.stats[id].recallForwardCorrect||0,0);});
test('correct answers on different words never combine into false mastery',()=>{let s=make();for(let i=0;i<3;i++)s=match(s);s=recordAnswer(s,'en','en-s2-latest','recall',true);s=recordAnswer(s,'en','en-s2-latest','context',true);assert.equal(summarize(s.languages.en).databaseLearned,0);assert.equal(eligibleWords(s.languages.en,{mode:'cards',focus:'unmastered'}).some(w=>w.id===id),true);});
test('matching stages are disjoint and only advance after required article confirmation',()=>{let s=make();s=match(s);assert.equal(summarize(s.languages.en).databaseOnce,1);s=match(s);assert.equal(summarize(s.languages.en).databaseOnce,0);assert.equal(summarize(s.languages.en).databaseTwice,1);s=beginArticleMatch(s,'en',id,'matching');assert.equal(summarize(s.languages.en).databaseTwice,1);assert.equal(summarize(s.languages.en).databaseReady,0);s=answerGermanArticle(s,'en',id,'die').state;assert.equal(summarize(s.languages.en).databaseTwice,0);assert.equal(summarize(s.languages.en).databaseReady,0);});
test('database totals and progress include hidden records without changing active training counts',()=>{let s=make();for(let i=0;i<3;i++)s=match(s);s=recordAnswer(s,'en',id,'recall',true);s=recordAnswer(s,'en',id,'context',true);s=written(s);s.languages.en.hidden=[id];const before=structuredClone(s),summary=summarize(s.languages.en);assert.equal(summary.databaseTotal,35);assert.equal(summary.total,34);assert.equal(summary.databaseLearned,1);assert.equal(summary.learned,0);assert.equal(summary.databaseCorrect,3);assert.deepEqual(s,before);assert.equal(summarize(resetProgress(s,'en').languages.en).databaseLearned,0);});
test('test 2 and test 3 count unique words with at least one success across the database',()=>{
 let s=make();assert.equal(summarize(s.languages.en).databaseRecallPassed,0);assert.equal(summarize(s.languages.en).databaseContextPassed,0);
 s=recordAnswer(s,'en',id,'recall',false);s=recordAnswer(s,'en',id,'context',false);
 assert.equal(summarize(s.languages.en).databaseRecallPassed,0);assert.equal(summarize(s.languages.en).databaseContextPassed,0);
 for(let i=0;i<4;i++){s=recordAnswer(s,'en',id,'recall',true,undefined,'reverse');s=recordAnswer(s,'en',id,'context',true);}
 s=recordAnswer(s,'en','en-s2-latest','recall',true);s.languages.en.hidden=[id];
 const summary=summarize(s.languages.en);assert.equal(summary.databaseRecallPassed,2);assert.equal(summary.databaseContextPassed,1);assert.equal(summary.databaseLearned,0);assert.equal(summary.databaseTotal,35);
 const reset=summarize(resetProgress(s,'en').languages.en);assert.equal(reset.databaseRecallPassed,0);assert.equal(reset.databaseContextPassed,0);
 assert.equal(summarize(s.languages.es).databaseRecallPassed,0);
});
