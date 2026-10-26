import {LANGUAGES,STORAGE_KEY,emptyState,clone,normalize,dayKey,validateState,validateWord,wordStats,recordAnswer,eligibleWords,nextWord,summarize,activity,promptTerm,checkContext,mergeVocabulary,backup,parseBackup} from './core.js';
import {demoState} from './demo.js';
import {cloudConfig} from './cloud-config.js';
import {createCloud} from './cloud.js';
const $=id=>document.getElementById(id), names={en:'Englisch',es:'Spanisch'}, typeNames={noun:'Nomen',verb:'Verb',adjective:'Adjektiv',adverb:'Adverb',phrase:'Wendung',other:'Andere'};
let state=emptyState(),language='en',mode='cards',selectedLessons=[],demo=false,realState=null,storageOK=true,lastRaw=null,current=null,editingId=null,shownWords=30,session={good:0,bad:0},vocabCandidate=null,backupCandidate=null,seedSources=[];
const lessonMemory={en:[],es:[]};
let cloudLocked=Boolean(cloudConfig.url&&cloudConfig.publishableKey),parentView=false;
const cloud=createCloud(cloudConfig,{
  status(message){$('cloudStatus').textContent=message;$('saveState').textContent=message;},
  lock(locked,readonly){cloudLocked=locked;parentView=readonly;stopTraining();render();},
  apply(next){state=validateState(next);stopTraining();render();},
  conflict(value){$('loadCloudVersion').hidden=!value;}
});
const canWrite=()=>demo||storageOK&&(!cloud.enabled||!cloudLocked&&!parentView);
const book=()=>state.languages[language];
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!=null)element.textContent=text;if(className)element.className=className;return element;};
const uid=prefix=>prefix+'-'+crypto.randomUUID();
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=!message;}
function options(){return {mode,lessonIds:selectedLessons,focus:$('focus').value,type:$('type').value,period:$('period').value};}
function storageFailure(message){storageOK=false;stopTraining();$('saveState').textContent='Speichern nicht möglich';notice(message+' Lade eine Sicherung herunter, bevor du diese Seite schließt.',true);render();}
function commit(next){
  if(!canWrite()){notice('Bitte mit dem Schülerkonto anmelden, um Daten zu ändern.',true);return false;}
  if(!storageOK&&!demo){notice('Speicher gesperrt. Bitte erst deine Daten sichern und die Seite neu laden.',true);return false;}
  try{
    const checked=validateState(next);
    if(!demo&&cloud.enabled){cloud.save(checked);}
    else if(!demo){
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw!==lastRaw){storageFailure('Die Daten wurden in einem anderen Fenster geändert. Bitte diese Seite neu laden.');return false;}
      const serialized=JSON.stringify(checked);localStorage.setItem(STORAGE_KEY,serialized);lastRaw=serialized;
    }
    state=checked;if(!cloud.enabled||demo)$('saveState').textContent=demo?'Demo · nicht gespeichert':'Lokal gespeichert';return true;
  }catch(error){storageFailure(error.message);return false;}
}
async function mutate(action){
  if(demo)return action();
  if(!canWrite()){notice(parentView?'Elternansicht: Du kannst den Lernstand ansehen, aber nicht verändern.':'Zum Synchronisieren bitte zuerst anmelden.',true);return false;}
  if(navigator.locks){try{return await navigator.locks.request('school-language-trainer:write:v1',action);}catch(error){notice(error.message,true);return false;}}
  // All mutations below are synchronous; the raw-value check still protects stale tabs.
  return action();
}
function stopTraining(){current=null;$('training').hidden=true;}
function accuracy(good,bad){return good+bad?Math.round(good/(good+bad)*100)+'%':'—';}
function formatDate(day){return new Date(day+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'short'});}
function render(){
  const b=book(),s=summarize(b);
  document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  $('languageEyebrow').textContent=names[language].toUpperCase()+' LERNEN';$('todayMetric').textContent=s.today;$('todayTotal').textContent='/ '+s.total+' Wörter';
  $('readyMetric').textContent=s.ready;$('onceMetric').textContent=s.once;$('twiceMetric').textContent=s.twice;$('accuracyMetric').textContent=accuracy(s.correct,s.wrong);
  const percent=s.total?Math.round(s.ready/s.total*100):0;$('masteryLabel').textContent=s.ready+' von '+s.total+' Wörtern bereit';$('masteryPercent').textContent=percent+'%';$('masteryBar').style.width=percent+'%';
  $('wordCount').textContent=s.total+' Wörter';$('demoBanner').hidden=!demo;$('demoToggle').textContent=demo?'Demo beenden ↗':'Demo ausprobieren ↗';
  const fields=[['Wörter im Training',s.total],['Aktiv erinnert · mindestens 3-mal',s.activeKnown],['Karten · richtig / falsch',s.correct+' / '+s.wrong],['Erinnern · richtig / falsch',s.recallCorrect+' / '+s.recallWrong],['Erinnern · Treffsicherheit',accuracy(s.recallCorrect,s.recallWrong)],['Kontext · richtig / falsch',s.contextCorrect+' / '+s.contextWrong],['Kontext · Treffsicherheit',accuracy(s.contextCorrect,s.contextWrong)],['Bereit für Satzübungen',s.contextReady],['Ausgeblendete Wörter',b.hidden.length]];
  $('allMetrics').replaceChildren(...fields.map(([label,value])=>{const el=node('div',label);el.append(node('b',value));return el;}));
  renderActivity();renderLessons();renderDictionary();updateMode();
  document.querySelectorAll('#addWord,#addLesson,#startTraining,#restoreBackup,#importVocabulary').forEach(button=>button.disabled=!canWrite()||(button.id==='restoreBackup'&&!backupCandidate)||(button.id==='importVocabulary'&&!vocabCandidate));
  if(cloud.enabled){$('storageNoteText').textContent=parentView?'Elternansicht · Lernstand des Schülerkontos':cloudLocked?'Für geräteübergreifendes Lernen bitte anmelden':'Cloud-Synchronisation · derselbe Lernstand auf deinen Geräten';$('localCallout').hidden=true;}
}
function renderActivity(){
  const days=activity(book());$('weekTotal').textContent=days.reduce((sum,d)=>sum+d.count,0)+' Wort-Tage';
  $('dailyChart').replaceChildren(...days.map((d,i)=>{
    const col=node('div',null,'day-column'+(i===6?' today':''));col.setAttribute('aria-label',`${formatDate(d.day)}: ${d.count} von ${d.total} Wörtern geübt`);
    col.append(node('span',d.count,'day-value'));const track=node('div',null,'day-track'),fill=node('div',null,'day-fill');fill.style.height=(d.total?Math.max(d.count?4:0,d.count/d.total*100):0)+'%';track.append(fill);col.append(track,node('span',new Date(d.day+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short'}),'day-label'));return col;
  }));
}
function renderLessons(){
  const all=node('button','Alle Lektionen');all.type='button';all.setAttribute('aria-pressed',String(!selectedLessons.length));all.onclick=()=>{selectedLessons=[];lessonMemory[language]=[];stopTraining();render();};
  $('lessonChoices').replaceChildren(all,...book().lessons.map(lesson=>{
    const button=node('button',lesson.name);button.type='button';button.setAttribute('aria-pressed',String(selectedLessons.includes(lesson.id)));button.onclick=()=>{selectedLessons=selectedLessons.includes(lesson.id)?selectedLessons.filter(id=>id!==lesson.id):[...selectedLessons,lesson.id];lessonMemory[language]=[...selectedLessons];stopTraining();render();};return button;
  }));
  const base=eligibleWords(book(),{...options(),mode:'cards',focus:'all'}),unmastered=base.filter(w=>!wordStats(book(),w.id).mastered);
  $('lessonStatus').textContent=base.length+' Wörter in deiner Auswahl · '+unmastered.length+' noch nicht gelernt'+(book().lessons.length?' · mehrere Lektionen kombinierbar':' · Lektionen kannst du frei benennen');
}
function updateMode(){
  const s=summarize(book());$('focus').disabled=mode!=='cards';
  $('modeHelp').textContent=mode==='cards'?'Dreimal hintereinander richtig? Dann bist du bereit zum Erinnern.':mode==='recall'?'Erst im Kopf übersetzen, dann die vollständige Lösung vergleichen.':'Setze das gelernte Wort in der passenden Form ein. Artikel und Akzente zählen mit.';
  const count=eligibleWords(book(),options()).length;$('startTraining').textContent=count?'Training starten · '+count+' →':'Training starten →';
  if(mode!=='cards')$('modeHelp').textContent+=' '+(mode==='context'?s.contextReady:s.ready)+' Wörter sind insgesamt bereit.';
}
function progressLabel(w,b=book()) {const st=wordStats(b,w.id);return st.mastered?'Bereit zum Erinnern':st.streak?Math.min(st.streak,3)+' von 3 Karten':'Noch nicht gelernt';}
function renderDictionary(){
  const query=normalize($('search').value),b=book();
  const words=b.words.filter(w=>(!b.hidden.includes(w.id)||$('showHidden').checked)&&(!query||normalize(w.term+' '+w.de).includes(query)));
  $('searchStatus').textContent=words.length+' '+(query?'Treffer in der ganzen Sprachdatenbank':'Wörter in '+names[language]);
  if(!words.length){const empty=node('div',null,'empty-state');empty.append(node('span','▤','empty-icon'),node('strong',query?'Noch kein Treffer.':'Hier beginnt dein Wortschatz.'),node('p',query?'Suche ein anderes Wort oder füge es aus deinem Schulbuch hinzu.':'Füge Wörter aus deinem Schulbuch hinzu oder importiere eine geprüfte Wörterdatei. Du kannst die Übungen auch zuerst mit der getrennten Demo ausprobieren.'));$('wordList').replaceChildren(empty);$('showMore').hidden=true;return;}
  $('wordList').replaceChildren(...words.slice(0,shownWords).map(w=>{
    const hidden=b.hidden.includes(w.id),row=node('div',null,'word-row'+(hidden?' hidden-word':'')),copy=node('div'),p=node('p');
    const term=node('strong',w.term);term.lang=language;p.append(term,node('span',' · '+w.de,'word-translation'));
    copy.append(p,node('small',[typeNames[w.type],progressLabel(w),hidden?'Ausgeblendet':'',...w.lessonIds.map(id=>b.lessons.find(l=>l.id===id)?.name)].filter(Boolean).join(' · ')));
    if(w.reference)copy.append(node('small',w.reference));
    const actions=node('div',null,'word-row-actions'),edit=node('button','Bearbeiten','text-button'),toggle=node('button',hidden?'Einblenden':'Ausblenden','text-button');
    edit.type=toggle.type='button';edit.disabled=toggle.disabled=!canWrite();edit.onclick=()=>openWord(w);toggle.onclick=()=>toggleHidden(w.id);actions.append(edit,toggle);row.append(copy,actions);return row;
  }));$('showMore').hidden=words.length<=shownWords;
}
async function toggleHidden(id){await mutate(()=>{const next=clone(state),b=next.languages[language];b.hidden=b.hidden.includes(id)?b.hidden.filter(k=>k!==id):[...b.hidden,id];if(commit(next)){stopTraining();render();}});}
function startTraining(){session={good:0,bad:0};showNext(true);}
function showNext(scroll=false){
  if(!canWrite())return;
  const choice=nextWord(book(),options());
  if(!choice.word){stopTraining();notice(mode==='cards'?'Für diese Auswahl gibt es keine offenen Wörter. Füge Wörter hinzu oder wähle einen anderen Lernstand.':mode==='recall'?'Hier ist noch kein Wort bereit. Übe es zuerst dreimal hintereinander mit den Wortkarten.':'Hier ist noch kein Satz bereit. Du brauchst gelernte Wörter mit einem Beispielsatz.');return;}
  notice('');const w=choice.word,examples=[...w.examples].sort((a,b)=>(a.source==='textbook'?0:1)-(b.source==='textbook'?0:1));
  current={id:w.id,language,mode,scope:choice.scope,seen:choice.seen,revealed:false,answered:false,example:examples.length?examples[(wordStats(book(),w.id).contextCorrect+wordStats(book(),w.id).contextWrong)%examples.filter(e=>e.source===examples[0].source).length]:null};
  $('training').hidden=false;$('trainingMode').textContent={cards:'WORTKARTEN',recall:'AKTIV ERINNERN',context:'WÖRTER IM SATZ'}[mode];$('trainingTitle').textContent=mode==='context'?'Welches Wort fehlt?':mode==='recall'?'Weißt du die Übersetzung?':'Deine nächste Karte';
  $('trainingStatus').textContent=progressLabel(w)+' · '+eligibleWords(book(),options()).length+' Wörter in dieser Auswahl';$('wordLesson').textContent=w.lessonIds.map(id=>book().lessons.find(l=>l.id===id)?.name).filter(Boolean).join(' · ')||'Ohne Lektion';
  $('promptLabel').textContent=names[language];$('wordPrompt').lang=language;$('wordPrompt').classList.toggle('context-prompt',mode==='context');$('wordPrompt').textContent=mode==='context'?current.example.sentence.replace('{{word}}','_______'):promptTerm(w,language);
  $('contextForm').hidden=mode!=='context';$('contextInput').value='';$('contextInput').disabled=false;$('contextInput').lang=language;$('checkContext').disabled=false;
  $('revealAnswer').hidden=mode==='context';$('answerArea').hidden=true;$('judgeButtons').hidden=true;$('contextNext').hidden=true;$('exampleArea').hidden=true;$('answerFeedback').textContent='';$('answerFeedback').className='answer-feedback';
  $('sessionStats').textContent=`Diese Runde: ${session.good} richtig · ${session.bad} noch üben`;
  if(scroll){$('training').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('trainingTitle').focus({preventScroll:true});}
  if(mode==='context')$('contextInput').focus({preventScroll:!scroll});
}
function reveal(){
  if(!current||current.language!==language)return;
  const w=book().words.find(w=>w.id===current.id);current.revealed=true;$('answerArea').hidden=false;$('revealAnswer').hidden=true;
  $('fullTerm').textContent=w.term;$('fullTerm').lang=language;$('germanAnswer').textContent=w.de;
  const ex=current.example;if(ex){$('exampleArea').hidden=false;$('exampleText').textContent=ex.sentence.replace('{{word}}',ex.answer);$('exampleText').lang=language;$('exampleTranslation').textContent=ex.translation;$('exampleSource').textContent=(ex.source==='textbook'?'Schulbuch':'KI-Beispiel')+(ex.reference?' · '+ex.reference:'');}
  if(mode!=='context')$('judgeButtons').hidden=false;
}
async function answer(ok){
  const question=current;if(!question||question.answered||!question.revealed)return;
  question.answered=true;$('answerCorrect').disabled=$('answerWrong').disabled=true;
  await mutate(()=>{
    if(current!==question)return;
    try{
      const next=recordAnswer(state,question.language,question.id,question.mode,ok);next.languages[question.language].cycles[question.scope]=[...new Set([...question.seen,question.id])];
      if(commit(next)){session[ok?'good':'bad']++;render();if(question.mode!=='context')showNext();else{$('sessionStats').textContent=`Diese Runde: ${session.good} richtig · ${session.bad} noch üben`;}}
    }catch(error){notice(error.message,true);}
  });$('answerCorrect').disabled=$('answerWrong').disabled=false;
}
async function submitContext(){
  if(!current||current.mode!=='context'||current.answered)return;
  const typed=$('contextInput').value.trim();if(!typed){$('contextInput').setCustomValidity('Bitte das fehlende Wort eingeben.');$('contextInput').reportValidity();return;}
  const ok=checkContext(typed,current.example);$('contextInput').disabled=true;$('checkContext').disabled=true;reveal();
  $('answerFeedback').textContent=ok?'✓ Richtig!':'Noch üben. Die passende Lösung ist: '+current.example.answer;$('answerFeedback').classList.toggle('wrong',!ok);
  await answer(ok);if(current&&storageOK){$('contextNext').hidden=false;$('contextNext').focus();}
}
function openWord(word=null){
  editingId=word?.id||null;$('wordForm').reset();$('wordFormError').textContent='';$('wordDialogTitle').textContent=word?'Wort bearbeiten':'Wort hinzufügen';$('termLabel').textContent=names[language]+' · Wort oder Wendung';$('term').lang=language;
  $('term').value=word?.term||'';$('de').value=word?.de||'';$('wordType').value=word?.type||'noun';$('wordReference').value=word?.reference||'';
  $('wordLessonChoices').replaceChildren(...book().lessons.map(lesson=>{const label=node('label'),input=document.createElement('input');input.type='checkbox';input.value=lesson.id;input.checked=(word?.lessonIds||selectedLessons).includes(lesson.id);label.append(input,node('span',lesson.name));return label;}));$('noWordLessons').hidden=book().lessons.length>0;
  $('exampleEditor').open=false;$('existingExamplesNote').textContent=word?.examples.length?`${word.examples.length} gespeicherte Sätze bleiben erhalten. Hier kannst du einen weiteren ergänzen.`:'';$('wordDialog').showModal();
}
async function saveWord(event){
  event.preventDefault();const selectedLanguage=language;
  try{
    const old=book().words.find(w=>w.id===editingId), examples=clone(old?.examples||[]);
    const sentence=$('sentence').value.trim(),answerText=$('sentenceAnswer').value.trim();
    if(sentence||answerText||$('sentenceTranslation').value.trim())examples.push({sentence,answer:answerText,translation:$('sentenceTranslation').value.trim(),source:$('sentenceSource').value,reference:$('wordReference').value.trim()});
    const w=validateWord({id:old?.id||uid('w'),term:$('term').value,de:$('de').value,type:$('wordType').value,addedAt:old?.addedAt||dayKey(),lessonIds:[...$('wordLessonChoices').querySelectorAll('input:checked')].map(i=>i.value),reference:$('wordReference').value,examples},selectedLanguage);
    if(book().words.some(other=>other.id!==w.id&&normalize(other.term)===normalize(w.term)))throw Error('Dieses Wort ist schon im Wörterbuch. Bitte dort bearbeiten.');
    await mutate(()=>{if(language!==selectedLanguage)return;const next=clone(state),b=next.languages[language],index=b.words.findIndex(other=>other.id===w.id);if(index<0)b.words.push(w);else b.words[index]=w;if(commit(next)){stopTraining();$('wordDialog').close();render();notice('Wort gespeichert: '+w.term);}});
  }catch(error){$('wordFormError').textContent=error.message;}
}
function download(value,filename,type='application/json'){
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));const anchor=node('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function readJSON(file){if(!file)throw Error('Bitte eine Datei auswählen.');if(file.size>10*1024*1024)throw Error('Die Datei ist größer als 10 MB.');return JSON.parse(await file.text());}
function buildReport(){
  return {title:'Wort für Wort · Lernübersicht',generatedAt:new Date().toISOString(),demo,languages:Object.fromEntries(LANGUAGES.map(lang=>{
    const b=state.languages[lang];return [lang,{language:names[lang],summary:summarize(b),last7Days:activity(b),lessons:b.lessons.map(l=>{const subset={...b,words:b.words.filter(w=>w.lessonIds.includes(l.id))};return {name:l.name,...summarize(subset)};}),wordsWithMistakes:b.words.filter(w=>!b.hidden.includes(w.id)).filter(w=>{const s=wordStats(b,w.id);return s.wrong||s.recallWrong||s.contextWrong;}).map(w=>({term:w.term,de:w.de,stats:wordStats(b,w.id)}))}];}))};
}
function openReport(){
  const report=buildReport();$('reportContent').replaceChildren(...LANGUAGES.map(lang=>{
    const r=report.languages[lang],s=r.summary,section=node('section',null,'report-language');section.append(node('h3',r.language));
    const values=node('div',null,'report-values');for(const [label,value]of [['Heute geübt',s.today+' / '+s.total],['Bereit zum Erinnern',s.ready],['Aktiv erinnert · 3-mal',s.activeKnown],['Karten · richtig / falsch',s.correct+' / '+s.wrong],['Erinnern · richtig / falsch',s.recallCorrect+' / '+s.recallWrong],['Kontext · richtig / falsch',s.contextCorrect+' / '+s.contextWrong]]){const v=node('div',label);v.append(node('b',value));values.append(v);}section.append(values);
    const table=node('table',null,'report-table'),head=node('thead'),hr=node('tr');for(const label of ['Lektion','Wörter','Bereit','Heute']){const th=node('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const body=node('tbody');for(const l of r.lessons){const row=node('tr');for(const value of [l.name,l.total,l.ready,l.today])row.append(node('td',value));body.append(row);}table.append(body);if(r.lessons.length)section.append(table);
    const mistakes=node('p',r.wordsWithMistakes.length?'Zum Wiederholen: '+r.wordsWithMistakes.slice(0,20).map(w=>w.term).join(', '):'Noch keine Wörter mit Fehlern.','fine-print');section.append(mistakes);return section;
  }));$('reportDialog').showModal();
}
function openProgress(view){
  const titles={once:'1 von 3 Karten richtig',twice:'2 von 3 Karten richtig',mistakes:'Wörter mit Fehlern'};const b=book();$('progressTitle').textContent=titles[view];
  const words=b.words.filter(w=>{if(b.hidden.includes(w.id))return false;const s=wordStats(b,w.id);return view==='once'?!s.mastered&&s.streak===1:view==='twice'?!s.mastered&&s.streak===2:s.wrong||s.recallWrong||s.contextWrong;});
  $('progressWords').replaceChildren(...words.map(w=>{const s=wordStats(b,w.id);return node('p',w.term+' · '+w.de+'\nKarten: '+s.correct+' / '+s.wrong+' · Erinnern: '+s.recallCorrect+' / '+s.recallWrong+' · Kontext: '+s.contextCorrect+' / '+s.contextWrong);}));if(!words.length)$('progressWords').append(node('p','Hier gibt es noch keine Wörter.'));$('progressDialog').showModal();
}
function toggleDemo(){
  if(cloud.enabled){notice('Die getrennte Demo ist in der Cloud-Version deaktiviert.');return;}
  stopTraining();notice('');
  if(!demo){realState=state;state=demoState();demo=true;}else{state=realState;realState=null;demo=false;}
  selectedLessons=[];lessonMemory.en=[];lessonMemory.es=[];mode='cards';$('focus').value='unmastered';$('search').value='';backupCandidate=vocabCandidate=null;$('restoreBackup').disabled=$('importVocabulary').disabled=true;$('backupPreview').textContent=$('vocabularyPreview').textContent='';
  $('saveState').textContent=demo?'Demo · nicht gespeichert':'Lokal gespeichert';render();
}
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
document.querySelectorAll('[data-language]').forEach(button=>button.onclick=()=>{if(language===button.dataset.language)return;stopTraining();language=button.dataset.language;selectedLessons=[...lessonMemory[language]];$('search').value='';shownWords=30;render();});
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;stopTraining();render();});
document.querySelectorAll('[data-progress]').forEach(button=>button.onclick=()=>openProgress(button.dataset.progress));
for(const id of ['focus','type','period'])$(id).onchange=()=>{stopTraining();render();};
$('search').oninput=()=>{shownWords=30;renderDictionary();};$('showHidden').onchange=renderDictionary;$('showMore').onclick=()=>{shownWords+=30;renderDictionary();};
$('startTraining').onclick=startTraining;$('stopTraining').onclick=stopTraining;$('revealAnswer').onclick=reveal;$('answerCorrect').onclick=()=>answer(true);$('answerWrong').onclick=()=>answer(false);$('checkContext').onclick=submitContext;$('contextNext').onclick=()=>showNext();
$('contextInput').oninput=()=>{$('contextInput').setCustomValidity('');};$('contextInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submitContext();}};
$('hideTrainingWord').onclick=()=>{if(current&&confirm('Dieses Wort ausblenden? Du kannst es im Wörterbuch wieder einblenden.'))toggleHidden(current.id);};
$('addWord').onclick=()=>openWord();$('wordForm').onsubmit=saveWord;$('addLesson').onclick=()=>{$('lessonForm').reset();$('lessonDialog').showModal();};
$('lessonForm').onsubmit=async e=>{e.preventDefault();const name=$('lessonName').value.trim();if(!name)return;if(book().lessons.some(l=>normalize(l.name)===normalize(name))){$('lessonName').setCustomValidity('Diese Lektion gibt es bereits.');$('lessonName').reportValidity();return;}await mutate(()=>{const next=clone(state);next.languages[language].lessons.push({id:uid('lesson'),name});if(commit(next)){$('lessonDialog').close();render();}});};$('lessonName').oninput=()=>{$('lessonName').setCustomValidity('');};
$('openTools').onclick=()=>{$('toolsDialog').showModal();};$('exportBackup').onclick=()=>download(backup(state),`school-trainer${demo?'-demo':''}-${dayKey()}.json`);
$('backupFile').onchange=async e=>{backupCandidate=null;$('restoreBackup').disabled=true;try{const candidate=parseBackup(await readJSON(e.target.files[0]));backupCandidate=candidate;$('backupPreview').textContent=LANGUAGES.map(lang=>names[lang]+': '+candidate.languages[lang].words.length+' Wörter').join(' · ')+'. Beim Wiederherstellen werden beide Sprachdatenbanken dieses Geräts ersetzt.';$('restoreBackup').disabled=false;}catch(error){$('backupPreview').textContent=error.message;}};
$('restoreBackup').onclick=async()=>{if(!backupCandidate)return;if(!confirm('Beide Sprachdatenbanken auf diesem Gerät ersetzen? Die aktuelle Version wird vorher als Sicherung heruntergeladen.'))return;download(backup(state),`school-trainer-vor-wiederherstellung-${Date.now()}.json`);await mutate(()=>{if(commit(backupCandidate)){stopTraining();backupCandidate=null;$('restoreBackup').disabled=true;selectedLessons=[];lessonMemory.en=[];lessonMemory.es=[];render();$('toolsDialog').close();notice('Sicherung wiederhergestellt.');}});};
$('vocabularyFile').onchange=async e=>{vocabCandidate=null;$('importVocabulary').disabled=true;try{const candidate=await readJSON(e.target.files[0]),result=mergeVocabulary(state,candidate);vocabCandidate=candidate;$('vocabularyPreview').textContent=names[candidate.language]+': '+result.added+' neue Wörter, '+candidate.lessons.length+' Lektionen in der Datei. Bestehender Lernstand bleibt erhalten.';$('importVocabulary').disabled=false;}catch(error){$('vocabularyPreview').textContent=error.message;}};
$('importVocabulary').onclick=async()=>{if(!vocabCandidate)return;await mutate(()=>{try{const result=mergeVocabulary(state,vocabCandidate);if(commit(result.state)){stopTraining();const lang=vocabCandidate.language;vocabCandidate=null;$('importVocabulary').disabled=true;language=lang;selectedLessons=[...lessonMemory[lang]];render();$('toolsDialog').close();notice(result.added+' neue Wörter übernommen.');}}catch(error){$('vocabularyPreview').textContent=error.message;}});};
$('exportVocabulary').onclick=()=>download({format:'school-vocabulary-v1',language,lessons:book().lessons,words:book().words},`school-vocabulary-${language}${demo?'-demo':''}-${dayKey()}.json`);
$('openReport').onclick=openReport;$('downloadReport').onclick=()=>download(buildReport(),`school-lernuebersicht${demo?'-demo':''}-${dayKey()}.json`);$('demoToggle').onclick=$('exitDemo').onclick=toggleDemo;
$('textSize').onchange=()=>{document.documentElement.classList.remove('large','largest');if($('textSize').value!=='normal')document.documentElement.classList.add($('textSize').value);try{localStorage.setItem('school-language-trainer:text-size:v1',$('textSize').value);}catch{}};
addEventListener('storage',event=>{if(!demo&&((event.key===STORAGE_KEY&&!cloud.enabled)||(cloud.enabled&&event.key?.startsWith('school-language-trainer:cloud-'))))storageFailure('Ein anderes Fenster hat den Lernstand geändert. Bitte diese Seite neu laden.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(dayKey()!==lastRenderedDay){lastRenderedDay=dayKey();render();}if(!demo&&storageOK&&!cloud.enabled){try{if(localStorage.getItem(STORAGE_KEY)!==lastRaw)storageFailure('Der Lernstand wurde in einem anderen Fenster geändert. Bitte neu laden.');}catch{storageFailure('Der Browser-Speicher ist nicht verfügbar.');}}}});
let lastRenderedDay=dayKey();
async function init(){
  try{lastRaw=localStorage.getItem(STORAGE_KEY);if(lastRaw)state=validateState(JSON.parse(lastRaw));const size=localStorage.getItem('school-language-trainer:text-size:v1');if(['large','largest'].includes(size)){document.documentElement.classList.add(size);$('textSize').value=size;}}
  catch(error){storageOK=false;notice('Gespeicherte Daten konnten nicht gelesen werden. Das Original wurde nicht überschrieben. '+error.message,true);}
  render();
  await cloud.init();
  $('cloudLogin').hidden=!cloud.enabled;$('cloudNotConfigured').hidden=cloud.enabled;$('demoToggle').hidden=cloud.enabled;
  if(cloud.enabled){$('reportCloudNote').textContent='Mit dem Elternkonto kannst du den synchronisierten Lernstand ansehen.';}
  if(storageOK&&!cloud.enabled){
    try{
      seedSources=await Promise.all(LANGUAGES.map(lang=>fetch(`./data/${lang}.json`).then(response=>{if(!response.ok)throw Error('Wörterdatei nicht erreichbar.');return response.json();})));
      await mutate(()=>{let next=state;for(const source of seedSources)next=mergeVocabulary(next,source).state;if(JSON.stringify(next)!==JSON.stringify(state))commit(next);render();});
    }catch(error){notice('Der gespeicherte Wortschatz ist verfügbar. Schulbuch-Dateien konnten gerade nicht geladen werden: '+error.message,true);}
  }
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch{/* The app remains usable online when offline caching is unavailable. */}}
}
init();

$('cloudLogin').onsubmit=async event=>{event.preventDefault();const button=$('cloudLoginButton');button.disabled=true;try{if(Object.values(state.languages).some(b=>b.words.length)&&!cloud.enabled)return;await cloud.login($('loginEmail').value,$('loginPassword').value);$('loginPassword').value='';render();}catch(error){$('cloudStatus').textContent=error.message;}finally{button.disabled=false;}};
$('cloudSync').onclick=()=>cloud.sync();
$('cloudLogout').onclick=()=>{try{cloud.logout();}catch(error){$('cloudStatus').textContent=error.message;}};
$('loadCloudVersion').onclick=async()=>{download(backup(cloud.snapshot()||state),'school-konflikt-'+Date.now()+'.json');if(!confirm('Die lokale Version wurde gesichert. Jetzt die Cloud-Version laden?'))return;try{await cloud.loadCloud();storageOK=true;render();}catch(error){$('cloudStatus').textContent=error.message;}};
