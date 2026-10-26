import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState,validateVocabulary,applyCatalog,recordAnswer,eligibleWords,matchingRound,writingPage,checkContext,resetLanguage,backup,parseBackup} from '../core.js';
const es=JSON.parse(await readFile(new URL('../data/es.json',import.meta.url),'utf8'));
const en=JSON.parse(await readFile(new URL('../data/en.json',import.meta.url),'utf8'));
test('Spanish B1 Block A contains exactly the 30 black headwords from the supplied photo',()=>{
 const v=validateVocabulary(es);assert.deepEqual(v.lessons,[{id:'es-b1-block-a',name:'B1 · Block A'}]);
 assert.deepEqual(v.words.map(w=>w.id.replace('es-b1-a-','')),['fideua','torre','catedral','refresco','hielo','por-primera-vez','paella','tradicional','merecer-la-pena','pollo','conejo','horchata','ronda','farton','ponerse-morado','delicioso','es-una-pasada','quemar','figura','carton','banda','despertarse','explosion','susto','fuegos-artificiales','ninot','cada','sino','llevar','me-gustaria']);
 for(const w of v.words){assert.deepEqual(w.lessonIds,['es-b1-block-a']);if(w.type==='noun'){assert.match(w.term,/^(el|la|los|las) /);assert.match(w.de,/^(der|die|das) /);}assert.match(w.reference,/IMG_8589.heic/);}
});
test('all 30 words have usable Spanish gaps, 8 exact textbook examples and 22 clearly marked new examples',()=>{
 const expected={refresco:'En verano tenemos muchos refrescos en casa.','merecer-la-pena':'Merece la pena comer en el restaurante nuevo.',delicioso:'La comida está deliciosa.',despertarse:'Me desperté por el ruido.',cada:'Cada día hicimos treinta kilómetros en bicicleta.',sino:'No vamos en coche sino en bicicleta.',llevar:'Mi madre me lleva al colegio.','me-gustaria':'Me gustaría ir a las montañas.'};
 let exact=0,generated=0;
 for(const w of es.words){assert.equal(w.examples.length,1);const e=w.examples[0];assert.equal(e.sentence.split('{{word}}').length,2);assert.ok(e.translation);assert.equal(checkContext(e.answer,e),true);assert.equal(checkContext('falsche Antwort',e),false);
  if(e.source==='textbook'){exact++;assert.equal(e.sentence.replace('{{word}}',e.answer),expected[w.id.replace('es-b1-a-','')]);}else{generated++;assert.equal(e.source,'generated');assert.match(e.reference,/selbst erstelltes Beispiel/);}
 }
 assert.equal(exact,8);assert.equal(generated,22);
});
test('Spanish import is repeat-safe, preserves English progress and supports every existing exercise',()=>{
 let s=applyCatalog(emptyState(),en).state;s=recordAnswer(s,'en','en-s2-account','recall',true);const english=structuredClone(s.languages.en);
 const loaded=applyCatalog(s,es);assert.equal(loaded.added,30);s=loaded.state;assert.deepEqual(s.languages.en,english);
 s=recordAnswer(s,'es','es-b1-a-torre','recall',true);assert.deepEqual(applyCatalog(s,es).state,s);assert.deepEqual(parseBackup(backup(s)),s);
 const options={focus:'all',type:'all',period:'all',lessonIds:['es-b1-block-a'],direction:'forward'};
 for(const mode of ['cards','recall','context'])assert.equal(eligibleWords(s.languages.es,{...options,mode}).length,30);
 assert.equal(matchingRound(s.languages.es,{...options,mode:'cards'},'es').words.length,5);assert.equal(writingPage(s.languages.es,{...options,mode:'recall'},15).words.length,15);
 const cleared=resetLanguage(s,'es');assert.deepEqual(cleared.languages.en,english);assert.equal(applyCatalog(cleared,es).state.languages.es.words.length,0);
});
