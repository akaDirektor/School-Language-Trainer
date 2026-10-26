import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState,applyCatalog,germanArticlesRequired,shouldAskGermanArticle,checkRecall,gradeWritingPage,writingPage,backup,parseBackup,validateState,recordAnswer,beginArticleMatch,resetProgress} from '../core.js';
const source=JSON.parse(await readFile(new URL('../data/en.json',import.meta.url),'utf8'));
const make=()=>applyCatalog(emptyState(),source).state;
const id='en-s2-account';
test('German articles default to required; preference survives backups and reset without changing progress',()=>{
 let state=make();const word=state.languages.en.words.find(w=>w.id===id);assert.equal(germanArticlesRequired(state),true);assert.equal(shouldAskGermanArticle(state,word),true);
 state=recordAnswer(state,'en',id,'recall',true);const before=structuredClone(state.languages);state.preferences={requireGermanArticles:false};
 assert.equal(germanArticlesRequired(state),false);assert.equal(shouldAskGermanArticle(state,word),false);assert.deepEqual(state.languages,before);assert.deepEqual(parseBackup(backup(state)),state);assert.equal(germanArticlesRequired(resetProgress(state,'en')),false);
 state.preferences.requireGermanArticles=true;assert.equal(shouldAskGermanArticle(state,word),true);
 assert.throws(()=>validateState({...state,preferences:{requireGermanArticles:'false'}}));assert.deepEqual(validateState(make()),make());
});
test('optional articles accept missing German articles but still reject wrong articles, wrong words and spelling',()=>{
 const state=make(),word=state.languages.en.words.find(w=>w.id===id);
 assert.equal(checkRecall('Konto',word),false);assert.equal(checkRecall('Konto',word,'forward',false),true);assert.equal(checkRecall('das Konto',word,'forward',false),true);
 for(const text of ['der Konto','Konte','Bank',''])assert.equal(checkRecall(text,word,'forward',false),false);
 assert.equal(checkRecall('account',word,'reverse',false),true);assert.equal(checkRecall('Konto',word,'reverse',false),false);
});
test('worksheet grading follows the saved preference and still records writing statistics',()=>{
 let state=make();const options={mode:'recall',focus:'all',type:'all',period:'all',lessonIds:['station-2'],direction:'forward'};const page=writingPage(state.languages.en,options,10);
 const answers=page.words.map(w=>w.de.split(';')[0].replace(/\s*\([^)]*\)/g,'').replace(/^(der|die|das)\s+/i,''));
 const strict=gradeWritingPage(state,'en',page,answers);assert.equal(strict.results[0],false);
 state.preferences={requireGermanArticles:false};const lenient=gradeWritingPage(state,'en',page,answers);assert.equal(lenient.results[0],true);assert.equal(lenient.state.languages.en.stats[id].writingCorrect,1);assert.equal(state.languages.en.stats[id],undefined);
});
test('a new successful pairing without the article quiz clears an older pending question',()=>{
 let state=beginArticleMatch(make(),'en',id,'matching');state.preferences={requireGermanArticles:false};assert.ok(state.languages.en.stats[id].pendingArticle);
 state=recordAnswer(state,'en',id,'cards',true);assert.equal(state.languages.en.stats[id].pendingArticle,undefined);assert.equal(state.languages.en.stats[id].streak,1);assert.equal(state.languages.en.stats[id].articleCorrect||0,0);
});
