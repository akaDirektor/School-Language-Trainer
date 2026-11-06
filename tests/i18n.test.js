import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {messages} from '../i18n-catalog.js';
import {t,setUiLanguage,uiLocale,translateMessage,formatReference} from '../i18n.js';
import {emptyState,applyCatalog,recordAnswer,validateState,matchingText} from '../core.js';
test('both interface languages have complete translations for all UI entries',()=>{
 for(const row of messages){assert.equal(row.length,3);for(const text of row)assert.equal(typeof text,'string');assert.ok(row[1].trim());assert.ok(row[2].trim());}
 setUiLanguage('en');assert.equal(t(321),'Active recall');assert.equal(t(181),'Sign in');assert.equal(uiLocale(),'en-GB');
 setUiLanguage('es');assert.equal(t(321),'Recordar activamente');assert.equal(t(181),'Iniciar sesión');assert.equal(uiLocale(),'es-ES');setUiLanguage('de');
});
test('dynamic counts and supplied values are preserved and can switch languages',()=>{
 setUiLanguage('en');const english=t(86,[12,3]);assert.equal(english,'This round: 12 correct · 3 to practise');
 setUiLanguage('es');assert.equal(translateMessage(english),'Esta ronda: 12 aciertos · 3 para repasar');
 assert.ok(t(188,['email',120]).includes('120'));assert.equal(formatReference('Foto A · Buchform: la torre'),'Foto A · Forma del libro: la torre');assert.ok(t(201).includes('{{word}}'));assert.equal(translateMessage('learner@example.test'),'learner@example.test');setUiLanguage('de');
});
test('interface localization never changes vocabulary, German articles or saved progress',async()=>{
 let state=emptyState();for(const language of ['en','es'])state=applyCatalog(state,JSON.parse(await readFile(new URL('../data/'+language+'.json',import.meta.url),'utf8'))).state;
 state=recordAnswer(state,'es','es-b1-a-torre','recall',true);const before=structuredClone(state);
 for(const language of ['en','es','en']){setUiLanguage(language);assert.deepEqual(validateState(state),before);assert.equal(matchingText(state.languages.es.words.find(w=>w.id==='es-b1-a-torre'),'es','right',true),'der Turm');}
 setUiLanguage('de');
});
test('validation errors follow the current interface language with German CLI compatibility',()=>{
 setUiLanguage('en');assert.throws(()=>validateState({}),/backup/);setUiLanguage('es');assert.throws(()=>validateState({}),/copia/);setUiLanguage('de');assert.throws(()=>validateState({}),/Sicherung/);
});
