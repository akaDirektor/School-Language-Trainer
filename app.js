import {LANGUAGES,STORAGE_KEY,emptyState,clone,normalize,dayKey,validateState,validateWord,wordStats,recordAnswer,eligibleWords,nextWord,summarize,activity,promptTerm,checkContext,mergeVocabulary,backup,parseBackup,applyCatalog,resetLanguage,resetProgress,recallPrompt,writingPage,gradeWritingPage,matchingRound,matchingText,germanArticles,germanArticlesRequired,shouldAskGermanArticle,beginArticleMatch,answerGermanArticle,isLearned} from './core.js';
import {demoState} from './demo.js';
import {cloudConfig} from './cloud-config.js';
import {createCloud} from './cloud.js';
const $=id=>document.getElementById(id), names={en:'Englisch',es:'Spanisch'}, typeNames={noun:'Nomen',verb:'Verb',adjective:'Adjektiv',adverb:'Adverb',phrase:'Wendung',other:'Andere'};
let state=emptyState(),language='en',mode='cards',selectedLessons=[],demo=false,realState=null,storageOK=true,lastRaw=null,current=null,editingId=null,shownWords=30,session={good:0,bad:0},vocabCandidate=null,backupCandidate=null,seedSources=[];
let articleQuestion=null;
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
function options(){return {mode,lessonIds:selectedLessons,focus:$('focus').value,type:$('type').value,period:$('period').value,direction:$('recallDirection').value};}
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
function stopTraining(){document.body.classList.remove('writing-active');current=null;articleQuestion=null;if($('germanArticleDialog').open)$('germanArticleDialog').close();$('training').hidden=true;}
function accuracy(good,bad){return good+bad?Math.round(good/(good+bad)*100)+'%':'—';}
function formatDate(day){return new Date(day+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'short'});}
function render(){
  const b=book(),s=summarize(b);$('requireGermanArticles').checked=germanArticlesRequired(state);$('requireGermanArticles').disabled=!canWrite();$('articleRequirementStatus').textContent=germanArticlesRequired(state)?'Eingeschaltet · Artikel werden abgefragt.':'Ausgeschaltet · deutsche Artikel sind optional.';$('matchingArticleNote').textContent=germanArticlesRequired(state)?'Aktuelle Serie · mit richtigem Artikel':'Aktuelle Serie · ohne Artikelfrage';
  document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  $('languageEyebrow').textContent=names[language].toUpperCase()+' LERNEN';$('todayMetric').textContent=s.today;$('databaseMetric').textContent=s.databaseTotal;$('activeMetricNote').textContent=s.total+' aktiv · '+b.hidden.length+' ausgeblendet';
  const flag=language==='es'?'./flags/es.svg':'./flags/gb.svg';
  $('heroFlag').src=flag;$('languageFlag').src=flag;$('heroLanguageName').textContent=language==='es'?'Español':'English';$('languageArtwork').dataset.language=language;
  $('matchingHitsMetric').textContent=s.databaseCorrect;$('readyMetric').textContent=s.databaseReady;$('onceMetric').textContent=s.databaseOnce;$('twiceMetric').textContent=s.databaseTwice;$('learnedMetric').textContent=s.databaseLearned;$('learnedTotal').textContent=s.databaseTotal;$('recallPassedMetric').textContent=s.databaseRecallPassed+' / '+s.databaseTotal;$('contextPassedMetric').textContent=s.databaseContextPassed+' / '+s.databaseTotal;$('writingPassedMetric').textContent=s.databaseWritingPassed+' / '+s.databaseTotal;
  const percent=s.databaseTotal?Math.round(s.databaseLearned/s.databaseTotal*100):0;$('masteryLabel').textContent=s.databaseLearned+' von '+s.databaseTotal+' Wörtern vollständig gelernt';$('masteryPercent').textContent=percent+'%';$('masteryBar').style.width=percent+'%';
  $('wordCount').textContent=s.total+' Wörter';$('demoBanner').hidden=!demo;$('demoToggle').textContent=demo?'Demo beenden ↗':'Demo ausprobieren ↗';
  const directional=field=>b.words.filter(w=>!b.hidden.includes(w.id)).reduce((sum,w)=>sum+(wordStats(b,w.id)[field]||0),0);
  const fields=[['Wörter in der Datenbank',s.databaseTotal],['Vollständig gelernt',s.databaseLearned],['Test 2 · Wörter richtig erinnert',s.databaseRecallPassed+' / '+s.databaseTotal],['Test 3 · Wörter im Satz richtig',s.databaseContextPassed+' / '+s.databaseTotal],['Schreibblatt · Wörter richtig geschrieben',s.databaseWritingPassed+' / '+s.databaseTotal],['Zuordnen · Treffsicherheit',accuracy(s.correct,s.wrong)],['Artikel · richtig / falsch',directional('articleCorrect')+' / '+directional('articleWrong')],['Artikel · Treffsicherheit',accuracy(directional('articleCorrect'),directional('articleWrong'))],['Erinnern · '+names[language]+' → DE',directional('recallForwardCorrect')+' / '+directional('recallForwardWrong')],['Erinnern · DE → '+names[language],directional('recallReverseCorrect')+' / '+directional('recallReverseWrong')],['Wörter im Training',s.total],['Aktiv erinnert · mindestens 3-mal',s.activeKnown],['Karten · richtig / falsch',s.correct+' / '+s.wrong],['Erinnern · richtig / falsch',s.recallCorrect+' / '+s.recallWrong],['Erinnern · Treffsicherheit',accuracy(s.recallCorrect,s.recallWrong)],['Schreibblatt · richtig / falsch',directional('writingCorrect')+' / '+directional('writingWrong')],['Kontext · richtig / falsch',s.contextCorrect+' / '+s.contextWrong],['Kontext · Treffsicherheit',accuracy(s.contextCorrect,s.contextWrong)],['Wörter mit Satzübungen',s.contextReady],['Ausgeblendete Wörter',b.hidden.length]];
  $('allMetrics').replaceChildren(...fields.map(([label,value])=>{const el=node('div',label);el.append(node('b',value));return el;}));
  renderActivity();renderLessons();renderDictionary();updateMode();
  document.querySelectorAll('#addWord,#addLesson,#restoreBackup,#importVocabulary,#resetLanguage,#resetProgress').forEach(button=>button.disabled=!canWrite()||(button.id==='restoreBackup'&&!backupCandidate)||(button.id==='importVocabulary'&&!vocabCandidate));
  $('startTraining').disabled=false;
  $('resetLanguage').textContent=names[language]+' · Wörter & Lernstand zurücksetzen';
  $('resetProgress').textContent=names[language]+' · nur Lernfortschritt zurücksetzen';
  if(cloud.enabled){$('storageNoteText').textContent=parentView?'Elternansicht · Lernstand des Schülerkontos':cloudLocked?'Für geräteübergreifendes Lernen bitte anmelden':'Cloud-Synchronisation · derselbe Lernstand auf deinen Geräten';$('localCallout').hidden=true;}
  if(cloud.enabled){
    const connected=cloud.connected;
    $('accountState').textContent=connected?'✓ Angemeldet'+(cloud.identity?' als '+cloud.identity:'')+(parentView?' · Elternansicht':' · Schülerkonto'):'Bitte anmelden, um deinen Lernstand auf allen Geräten zu nutzen.';
    $('accountAction').textContent=connected?'Konto & Synchronisation':'Anmelden →';
    $('cloudLogin').hidden=connected;$('signedInTools').hidden=!connected;
  }
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
  const base=eligibleWords(book(),{...options(),mode:'cards',focus:'all'}),unmastered=base.filter(w=>!isLearned(wordStats(book(),w.id)));
  $('lessonStatus').textContent=base.length+' Wörter in deiner Auswahl · '+unmastered.length+' noch nicht gelernt'+(book().lessons.length?' · mehrere Lektionen kombinierbar':' · Lektionen kannst du frei benennen');
}
function updateMode(){
  $('focus').disabled=mode!=='cards';$('recallDirectionTools').hidden=mode!=='recall';
  const direction=$('recallDirection'),reverse=direction.value==='reverse';
  direction.options[0].textContent=names[language]+' → Deutsch';direction.options[1].textContent='Deutsch → '+names[language];
  $('modeHelp').textContent=mode==='cards'?'Wähle ein Wort und die passende deutsche Karte. Alle Übungen sind unabhängig verfügbar.':mode==='recall'?($('recallMethod').value==='written'?'Schreibblatt aus den gewählten Lektionen ausfüllen und gemeinsam prüfen. Mit Apple Pencil oder Tastatur. Richtung: ':'Erst im Kopf übersetzen, dann vergleichen. Richtung: ')+(reverse?'Deutsch → '+names[language]:names[language]+' → Deutsch')+'.':'Setze das Wort in der passenden Form ein. Du kannst diese Übung sofort starten.';
  const count=eligibleWords(book(),options()).length;$('startTraining').textContent=count?'Training starten · '+count+' →':'Training starten →';
}
function progressLabel(w,b=book()) {const st=wordStats(b,w.id);return isLearned(st)?'Vollständig gelernt':st.streak>=3?'3/3 zugeordnet · Erinnern oder Satz noch offen':st.streak?st.streak+' von 3 Karten':'Noch nicht gelernt';}
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
function startTraining(){
  if(!canWrite()){
    notice(!storageOK?'Der Lernstand ist zum Schutz deiner Daten gesperrt. Bitte eine Sicherung herunterladen und die Seite neu laden.':parentView?'Elternansicht: Trainieren ist nur mit dem Schülerkonto möglich.':'Bitte zuerst anmelden oder die Cloud-Verbindung prüfen.',true);
    if(!$('toolsDialog').open)$('toolsDialog').showModal();
    if(!cloud.connected)$('loginEmail').focus();return;
  }
  session={good:0,bad:0};showNext(true);
}
function showMatchingRound(scroll=false){
  const pending=book().words.find(w=>!book().hidden.includes(w.id)&&book().stats[w.id]?.pendingArticle);
  if(pending&&germanArticlesRequired(state)){stopTraining();openGermanArticle(pending.id,null);return;}
  const round=matchingRound(book(),options(),language);
  if(!round.words.length){stopTraining();notice('Keine Wörter für diese Auswahl. Wähle andere Filter oder „Alle, auch gelernte Wörter“.');return;}
  notice('');$('writingSheet').hidden=true;current={...round,mode:'cards',language,solved:new Set(),leftId:null,rightId:null,busy:false};
  $('training').hidden=false;$('matchingBoard').hidden=false;$('wordCard').hidden=true;$('hideTrainingWord').hidden=true;
  $('judgeButtons').hidden=true;$('contextNext').hidden=true;$('matchingNext').hidden=true;
  $('trainingMode').textContent='PAARE FINDEN';$('trainingTitle').textContent='Welche Karten gehören zusammen?';
  $('trainingStatus').textContent=round.words.length+' Paare · '+eligibleWords(book(),options()).length+' Wörter in dieser Auswahl';
  $('matchingLeftLabel').textContent=names[language];$('matchingFeedback').textContent='Wähle ein Wort und die passende deutsche Übersetzung.';
  const activeRound=current;
  for(const side of ['left','right']){
    const column=$(side==='left'?'matchingLeft':'matchingRight');column.replaceChildren(...round[side].map(w=>{
      const button=node('button',matchingText(w,language,side),'pair-card');button.type='button';button.lang=side==='left'?language:'de';button.dataset.wordId=w.id;button.setAttribute('aria-pressed','false');button.onclick=()=>selectMatching(side,w.id,activeRound);return button;
    }));
  }
  $('sessionStats').textContent=`Diese Runde: ${session.good} richtig · ${session.bad} noch üben`;
  if(scroll){$('training').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('trainingTitle').focus({preventScroll:true});}
}
async function selectMatching(side,id,round){
  if(!round||current!==round||round.mode!=='cards'||round.busy||round.solved.has(id)||!canWrite())return;
  round[side==='left'?'leftId':'rightId']=id;
  for(const columnSide of ['left','right'])for(const button of $(columnSide==='left'?'matchingLeft':'matchingRight').children)button.setAttribute('aria-pressed',String(button.dataset.wordId===round[columnSide==='left'?'leftId':'rightId']));
  if(!round.leftId||!round.rightId)return;
  round.busy=true;const leftId=round.leftId,rightId=round.rightId,ok=leftId===rightId;
  if(ok&&shouldAskGermanArticle(state,book().words.find(w=>w.id===leftId))){
    await mutate(()=>{if(current!==round)return;const next=beginArticleMatch(state,round.language,leftId,round.scope);if(commit(next)){render();openGermanArticle(leftId,round);}});
    if(current===round&&!articleQuestion)round.busy=false;return;
  }
  await mutate(()=>{
    if(current!==round)return;
    const next=recordAnswer(state,round.language,leftId,'cards',ok);
    if(ok)next.languages[round.language].cycles[round.scope]=[...new Set([...round.seen,...round.solved,leftId])];
    if(!commit(next))return;
    session[ok?'good':'bad']++;const w=book().words.find(w=>w.id===leftId);
    if(ok)round.solved.add(leftId);
    $('matchingFeedback').textContent=ok?'✓ '+w.term+' — '+w.de:'✕ Diese Karten passen nicht zusammen. Versuche es noch einmal.';
    for(const columnSide of ['left','right']){
      for(const button of $(columnSide==='left'?'matchingLeft':'matchingRight').children){
        button.setAttribute('aria-pressed','false');
        if(ok&&button.dataset.wordId===leftId){button.textContent=matchingText(w,language,columnSide,true);button.classList.add('matched');button.disabled=true;}
      }
    }
    round.leftId=round.rightId=null;render();
    $('sessionStats').textContent=`Diese Runde: ${session.good} richtig · ${session.bad} noch üben`;
    if(round.solved.size===round.words.length){$('matchingNext').hidden=false;$('matchingFeedback').textContent+=' · Alle Paare gefunden!';}
  });
  if(current===round)round.busy=false;
}
$('matchingNext').onclick=()=>{if(current?.mode==='cards'&&current.solved.size===current.words.length)showMatchingRound();};
function openGermanArticle(wordId,round){
  const word=book().words.find(w=>w.id===wordId),pending=book().stats[wordId]?.pendingArticle;if(!word||!pending)return;
  const questions=germanArticles(word),question=questions[pending.index];
  articleQuestion={wordId,round,language,answered:false,question};
  $('germanArticleNoun').textContent=question.noun;$('germanArticleTarget').textContent=word.term;
  $('germanArticleStep').textContent='Deutsche Übersetzung · '+(pending.index+1)+' von '+questions.length;
  $('germanArticleFeedback').textContent='Wähle der, die oder das.';$('germanArticleFeedback').classList.remove('article-wrong');$('germanArticleContinue').hidden=true;
  document.querySelectorAll('[data-german-article]').forEach(button=>{button.disabled=false;button.classList.remove('article-right');});
  if(!$('germanArticleDialog').open)$('germanArticleDialog').showModal();
}
async function chooseGermanArticle(article){
  const q=articleQuestion;if(!q||q.answered||!canWrite()||q.language!==language)return;
  q.answered=true;document.querySelectorAll('[data-german-article]').forEach(button=>button.disabled=true);
  await mutate(()=>{
    if(articleQuestion!==q)return;
    const result=answerGermanArticle(state,q.language,q.wordId,article);
    if(!commit(result.state))return;
    q.complete=result.complete;q.credited=result.credited;
    $('germanArticleNoun').textContent=result.question.article+' '+result.question.noun;
    $('germanArticleFeedback').textContent=result.ok?'✓ Richtig!':('✕ Richtig ist: '+result.question.article+' '+result.question.noun+'. Die Paarung bleibt richtig, die Wiederholung zählt nicht als Erfolg.');
    $('germanArticleFeedback').classList.toggle('article-wrong',!result.ok);
    document.querySelectorAll('[data-german-article]').forEach(button=>button.classList.toggle('article-right',button.dataset.germanArticle===result.question.article));
    $('germanArticleContinue').hidden=false;render();$('germanArticleContinue').focus();
  });
}
function continueGermanArticle(){
  const q=articleQuestion;if(!q?.answered||q.complete==null)return;
  if(!q.complete){openGermanArticle(q.wordId,q.round);return;}
  articleQuestion=null;$('germanArticleDialog').close();
  if(!q.round){showMatchingRound(true);return;}
  const round=q.round;if(current!==round)return;
  const word=book().words.find(w=>w.id===q.wordId);round.solved.add(q.wordId);round.leftId=round.rightId=null;round.busy=false;session[q.credited?'good':'bad']++;
  for(const side of ['left','right'])for(const button of $(side==='left'?'matchingLeft':'matchingRight').children){button.setAttribute('aria-pressed','false');if(button.dataset.wordId===q.wordId){button.textContent=matchingText(word,language,side,true);button.disabled=true;button.classList.add('matched');button.classList.toggle('article-mistake',!q.credited);}}
  $('matchingFeedback').textContent=(q.credited?'✓ ':'Artikel noch üben · ')+word.term+' — '+word.de;
  $('sessionStats').textContent=`Diese Runde: ${session.good} richtig · ${session.bad} noch üben`;
  if(round.solved.size===round.words.length){$('matchingNext').hidden=false;$('matchingFeedback').textContent+=' · Alle Paare zugeordnet.';}
}
document.querySelectorAll('[data-german-article]').forEach(button=>button.onclick=()=>chooseGermanArticle(button.dataset.germanArticle));
$('germanArticleContinue').onclick=continueGermanArticle;
$('germanArticleDialog').addEventListener('cancel',event=>{event.preventDefault();if(articleQuestion?.answered)continueGermanArticle();});
function showNext(scroll=false){
  if(!canWrite())return;
  if(mode==='cards'){showMatchingRound(scroll);return;}
  if(mode==='recall'&&$('recallMethod').value==='written'){showWritingPage(scroll);return;}
  $('writingSheet').hidden=true;
  const choice=nextWord(book(),options());
  if(!choice.word){stopTraining();notice(mode==='cards'?'Für diese Auswahl gibt es keine offenen Wörter. Füge Wörter hinzu oder wähle einen anderen Lernstand.':mode==='recall'?'Für diese Auswahl gibt es keine Wörter. Bitte andere Lektionen oder Filter wählen.':'Für diese Auswahl gibt es keine Beispielsätze. Bitte andere Lektionen wählen oder einen Satz ergänzen.');return;}
  notice('');const w=choice.word,examples=[...w.examples].sort((a,b)=>(a.source==='textbook'?0:1)-(b.source==='textbook'?0:1));
  current={id:w.id,language,mode,direction:$('recallDirection').value,scope:choice.scope,seen:choice.seen,revealed:false,answered:false,example:examples.length?examples[(wordStats(book(),w.id).contextCorrect+wordStats(book(),w.id).contextWrong)%examples.filter(e=>e.source===examples[0].source).length]:null};
  $('matchingBoard').hidden=true;$('wordCard').hidden=false;$('hideTrainingWord').hidden=false;
  $('training').hidden=false;$('trainingMode').textContent={cards:'WORTKARTEN',recall:'AKTIV ERINNERN',context:'WÖRTER IM SATZ'}[mode];$('trainingTitle').textContent=mode==='context'?'Welches Wort fehlt?':mode==='recall'?'Weißt du die Übersetzung?':'Deine nächste Karte';
  $('trainingStatus').textContent=progressLabel(w)+' · '+eligibleWords(book(),options()).length+' Wörter in dieser Auswahl';$('wordLesson').textContent=w.lessonIds.map(id=>book().lessons.find(l=>l.id===id)?.name).filter(Boolean).join(' · ')||'Ohne Lektion';
  const prompt=recallPrompt(w,language,current.direction);
  $('promptLabel').textContent=mode==='recall'?(current.direction==='reverse'?'Deutsch → '+names[language]:names[language]+' → Deutsch'):names[language];$('wordPrompt').lang=mode==='recall'?prompt.language:language;$('wordPrompt').classList.toggle('context-prompt',mode==='context');$('wordPrompt').textContent=mode==='context'?current.example.sentence.replace('{{word}}','_______'):prompt.text;
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
  $('fullTerm').hidden=mode==='recall'&&current.direction!=='reverse';
  $('germanAnswer').hidden=mode==='recall'&&current.direction==='reverse';
  $('exampleArea').open=mode==='context';
  const ex=current.example;if(ex){$('exampleArea').hidden=false;$('exampleText').textContent=ex.sentence.replace('{{word}}',ex.answer);$('exampleText').lang=language;$('exampleTranslation').textContent=ex.translation;$('exampleSource').textContent=(ex.source==='textbook'?'Schulbuch':'KI-Beispiel')+(ex.reference?' · '+ex.reference:'');}
  if(mode!=='context')$('judgeButtons').hidden=false;
}
async function answer(ok){
  const question=current;if(!question||question.answered||!question.revealed)return;
  question.answered=true;$('answerCorrect').disabled=$('answerWrong').disabled=true;
  await mutate(()=>{
    if(current!==question)return;
    try{
      const next=recordAnswer(state,question.language,question.id,question.mode,ok,dayKey(),question.direction);next.languages[question.language].cycles[question.scope]=[...new Set([...question.seen,question.id])];
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
function showWritingPage(scroll=false){
  const direction=$('recallDirection').value,page=writingPage(book(),options(),Number($('writingPageSize').value));
  if(!page.total){stopTraining();notice('Keine Wörter ausgewählt. Bitte eine Lektion wählen.');return;}
  notice('');current={...page,mode:'recall',written:true,language,direction,answered:false,busy:false,rows:[]};
  document.body.classList.add('writing-active');
  $('training').hidden=false;$('matchingBoard').hidden=true;$('wordCard').hidden=true;$('writingSheet').hidden=false;
  $('hideTrainingWord').hidden=true;$('judgeButtons').hidden=true;$('contextNext').hidden=true;
  $('trainingMode').textContent='SCHREIBBLATT';$('trainingTitle').textContent='Schreib die Übersetzungen.';
  const lessonNames=selectedLessons.length?book().lessons.filter(l=>selectedLessons.includes(l.id)).map(l=>l.name).join(', '):'Alle Lektionen';
  $('trainingStatus').textContent=lessonNames+' · '+page.done+' / '+page.total+' geprüft'+(page.words.length?' · jetzt '+page.words.length+' Wörter':'');
  $('sheetSourceLabel').textContent=direction==='reverse'?'Deutsch':names[language];
  $('sheetTargetLabel').textContent=direction==='reverse'?names[language]+' · deine Übersetzung':(germanArticlesRequired(state)?'Deutsch · deine Übersetzung mit Artikel':'Deutsch · Artikel optional');
  $('writingRows').replaceChildren(...page.words.map((word,i)=>{
    const row=node('div',null,'writing-row'),label=node('label',(page.done+i+1)+'. '+recallPrompt(word,language,direction).text),cell=node('div',null,'writing-cell'),input=node('input');
    input.id='writing-'+i;input.type='text';input.autocomplete='off';input.autocapitalize='off';input.spellcheck=false;input.setAttribute('autocorrect','off');input.lang=direction==='reverse'?language:'de';input.setAttribute('enterkeyhint',i===page.words.length-1?'done':'next');input.setAttribute('aria-describedby','writing-feedback-'+i);
    label.htmlFor=input.id;label.lang=direction==='reverse'?'de':language;
    const feedback=node('p',null,'writing-feedback');feedback.id='writing-feedback-'+i;feedback.hidden=true;
    input.oninput=()=>input.setCustomValidity('');input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();if(i<current.rows.length-1)current.rows[i+1].input.focus();else $('checkWritingSheet').click();}};
    cell.append(input,feedback);row.append(label,cell);current.rows.push({row,input,feedback,word});return row;
  }));
  $('checkWritingSheet').hidden=!page.words.length;$('checkWritingSheet').disabled=false;
  $('nextWritingSheet').hidden=!!page.words.length;$('nextWritingSheet').textContent='Neuer Durchgang ↻';
  $('writingResult').textContent=page.words.length?'Alle Zeilen ausfüllen, dann die Seite prüfen.':'✓ Durchgang abgeschlossen: alle '+page.total+' Wörter geprüft.';
  $('sessionStats').textContent=`Dieser Durchgang: ${session.good} richtig · ${session.bad} noch üben`;
  if(scroll)window.scrollTo({top:0,behavior:'instant'});
}
async function submitWritingPage(event){
  event.preventDefault();const page=current;
  if(!page?.written||page.answered||page.busy||!canWrite())return;
  for(const {input} of page.rows)if(!input.value.trim()){input.setCustomValidity('Bitte diese Übersetzung schreiben.');input.reportValidity();return;}
  const answers=page.rows.map(r=>r.input.value);page.busy=true;$('checkWritingSheet').disabled=true;
  await mutate(()=>{
    if(current!==page)return;
    try{
      const graded=gradeWritingPage(state,page.language,page,answers,page.direction);
      if(!commit(graded.state))return;
      page.answered=true;const good=graded.results.filter(Boolean).length;session.good+=good;session.bad+=page.words.length-good;
      page.rows.forEach(({row,input,feedback,word},i)=>{
        const ok=graded.results[i];input.readOnly=true;input.setAttribute('aria-invalid',String(!ok));row.classList.add(ok?'writing-correct':'writing-wrong');feedback.hidden=false;feedback.textContent=ok?'✓ Richtig':'✗ Lösung: '+(page.direction==='reverse'?word.term:word.de);
      });
      render();$('writingResult').textContent=good+' von '+page.words.length+' richtig · '+(page.words.length-good)+' noch üben';
      $('checkWritingSheet').hidden=true;$('nextWritingSheet').hidden=false;$('nextWritingSheet').textContent=page.done+page.words.length>=page.total?'Durchgang abschließen ✓':'Nächste Seite →';
      $('sessionStats').textContent=`Dieser Durchgang: ${session.good} richtig · ${session.bad} noch üben`;
    }catch(error){notice(error.message,true);}
  });page.busy=false;if(current===page&&!page.answered)$('checkWritingSheet').disabled=false;
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
    const b=state.languages[lang];return [lang,{language:names[lang],summary:summarize(b),last7Days:activity(b),lessons:b.lessons.map(l=>{const subset={...b,words:b.words.filter(w=>w.lessonIds.includes(l.id))};return {name:l.name,...summarize(subset)};}),wordsWithMistakes:b.words.filter(w=>!b.hidden.includes(w.id)).filter(w=>{const s=wordStats(b,w.id);return s.wrong||s.recallWrong||s.contextWrong||s.articleWrong;}).map(w=>({term:w.term,de:w.de,stats:wordStats(b,w.id)}))}];}))};
}
function openReport(){
  const report=buildReport();$('reportContent').replaceChildren(...LANGUAGES.map(lang=>{
    const r=report.languages[lang],s=r.summary,section=node('section',null,'report-language');section.append(node('h3',r.language));
    const values=node('div',null,'report-values');for(const [label,value]of [['Heute geübt',s.today+' / '+s.total],['3-mal richtig zugeordnet',s.ready],['Vollständig gelernt',s.databaseLearned+' / '+s.databaseTotal],['Test 2 · Wörter richtig erinnert',s.databaseRecallPassed+' / '+s.databaseTotal],['Test 3 · Wörter im Satz richtig',s.databaseContextPassed+' / '+s.databaseTotal],['Schreibblatt · Wörter richtig geschrieben',s.databaseWritingPassed+' / '+s.databaseTotal],['Karten · richtig / falsch',s.correct+' / '+s.wrong],['Erinnern · richtig / falsch',s.recallCorrect+' / '+s.recallWrong],['Kontext · richtig / falsch',s.contextCorrect+' / '+s.contextWrong]]){const v=node('div',label);v.append(node('b',value));values.append(v);}section.append(values);
    const table=node('table',null,'report-table'),head=node('thead'),hr=node('tr');for(const label of ['Lektion','Wörter','Gelernt','Heute']){const th=node('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const body=node('tbody');for(const l of r.lessons){const row=node('tr');for(const value of [l.name,l.databaseTotal,l.databaseLearned,l.today])row.append(node('td',value));body.append(row);}table.append(body);if(r.lessons.length)section.append(table);
    const mistakes=node('p',r.wordsWithMistakes.length?'Zum Wiederholen: '+r.wordsWithMistakes.slice(0,20).map(w=>w.term).join(', '):'Noch keine Wörter mit Fehlern.','fine-print');section.append(mistakes);return section;
  }));$('reportDialog').showModal();
}
function openProgress(view){
  const titles={once:'1 von 3 Zuordnungen richtig',twice:'2 von 3 Zuordnungen richtig',three:'3 von 3 Zuordnungen richtig',learned:'Vollständig gelernte Wörter',recallPassed:'Test 2 · Richtig erinnerte Wörter',contextPassed:'Test 3 · Wörter im Satz richtig',writingPassed:'Schreibblatt · Richtig geschriebene Wörter',mistakes:'Wörter mit Fehlern'};const b=book();$('progressTitle').textContent=titles[view];
  const words=b.words.filter(w=>{const st=wordStats(b,w.id);return view==='once'?st.streak===1:view==='twice'?st.streak===2:view==='three'?st.streak>=3:view==='learned'?isLearned(st):view==='recallPassed'?st.recallCorrect>0:view==='contextPassed'?st.contextCorrect>0:view==='writingPassed'?st.writingCorrect>0:st.wrong||st.recallWrong||st.contextWrong||st.articleWrong;});
  $('progressWords').replaceChildren(...words.map(w=>{const s=wordStats(b,w.id);return node('p',w.term+' · '+w.de+'\nKarten: '+s.correct+' / '+s.wrong+' · Erinnern: '+s.recallCorrect+' / '+s.recallWrong+' · Kontext: '+s.contextCorrect+' / '+s.contextWrong+' · Schreiben: '+(s.writingCorrect||0)+' / '+(s.writingWrong||0)+' · Artikel: '+(s.articleCorrect||0)+' / '+(s.articleWrong||0));}));if(!words.length)$('progressWords').append(node('p','Hier gibt es noch keine Wörter.'));$('progressDialog').showModal();
}
function toggleDemo(){
  if(cloud.enabled){notice('Die getrennte Demo ist in der Cloud-Version deaktiviert.');return;}
  stopTraining();notice('');
  if(!demo){realState=state;state=demoState();demo=true;}else{state=realState;realState=null;demo=false;}
  selectedLessons=[];lessonMemory.en=[];lessonMemory.es=[];mode='cards';$('focus').value='all';$('search').value='';backupCandidate=vocabCandidate=null;$('restoreBackup').disabled=$('importVocabulary').disabled=true;$('backupPreview').textContent=$('vocabularyPreview').textContent='';
  $('saveState').textContent=demo?'Demo · nicht gespeichert':'Lokal gespeichert';render();
}
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
document.querySelectorAll('[data-language]').forEach(button=>button.onclick=()=>{if(language===button.dataset.language)return;stopTraining();language=button.dataset.language;selectedLessons=[...lessonMemory[language]];$('search').value='';shownWords=30;render();});
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;stopTraining();render();});
document.querySelectorAll('[data-progress]').forEach(button=>button.onclick=()=>openProgress(button.dataset.progress));
for(const id of ['focus','type','period','recallDirection','recallMethod','writingPageSize'])$(id).onchange=()=>{stopTraining();render();};
$('search').oninput=()=>{shownWords=30;renderDictionary();};$('showHidden').onchange=renderDictionary;$('showMore').onclick=()=>{shownWords+=30;renderDictionary();};
$('startTraining').onclick=startTraining;$('stopTraining').onclick=stopTraining;$('revealAnswer').onclick=reveal;$('answerCorrect').onclick=()=>answer(true);$('answerWrong').onclick=()=>answer(false);$('checkContext').onclick=submitContext;$('contextNext').onclick=()=>showNext();
$('writingSheet').onsubmit=submitWritingPage;$('nextWritingSheet').onclick=async()=>{const page=current;if(!page?.written||page.busy)return;if(!page.words.length){await mutate(()=>{if(current!==page)return;const next=clone(state);delete next.languages[language].cycles[page.scope];if(commit(next)){session={good:0,bad:0};showWritingPage(true);}});}else showWritingPage(true);};
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
$('requireGermanArticles').onchange=async()=>{const requireArticles=$('requireGermanArticles').checked;await mutate(()=>{const next=clone(state);next.preferences={...next.preferences,requireGermanArticles:requireArticles};if(commit(next)){stopTraining();notice(requireArticles?'Deutsche Artikel werden wieder abgefragt.':'Artikelfragen ausgeschaltet. Deutsche Artikel sind auf dem Schreibblatt optional.');}});render();};
$('textSize').onchange=()=>{document.documentElement.classList.remove('large','largest');if($('textSize').value!=='normal')document.documentElement.classList.add($('textSize').value);try{localStorage.setItem('school-language-trainer:text-size:v1',$('textSize').value);}catch{}};
addEventListener('storage',event=>{if(!demo&&((event.key===STORAGE_KEY&&!cloud.enabled)||(cloud.enabled&&event.key?.startsWith('school-language-trainer:cloud-'))))storageFailure('Ein anderes Fenster hat den Lernstand geändert. Bitte diese Seite neu laden.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(dayKey()!==lastRenderedDay){lastRenderedDay=dayKey();render();}if(!demo&&storageOK&&!cloud.enabled){try{if(localStorage.getItem(STORAGE_KEY)!==lastRaw)storageFailure('Der Lernstand wurde in einem anderen Fenster geändert. Bitte neu laden.');}catch{storageFailure('Der Browser-Speicher ist nicht verfügbar.');}}}});
let lastRenderedDay=dayKey();
async function loadSchoolVocabulary(){
  if(!seedSources.length)seedSources=await Promise.all(LANGUAGES.map(lang=>fetch(`./data/${lang}.json`).then(response=>{if(!response.ok)throw Error('Wörterdatei nicht erreichbar.');return response.json();})));
  if(!canWrite())return;
  await mutate(()=>{let next=state;for(const source of seedSources)next=applyCatalog(next,source).state;if(JSON.stringify(next)!==JSON.stringify(state))commit(next);render();});
}
async function init(){
  try{lastRaw=localStorage.getItem(STORAGE_KEY);if(lastRaw)state=validateState(JSON.parse(lastRaw));const size=localStorage.getItem('school-language-trainer:text-size:v1');if(['large','largest'].includes(size)){document.documentElement.classList.add(size);$('textSize').value=size;}}
  catch(error){storageOK=false;notice('Gespeicherte Daten konnten nicht gelesen werden. Das Original wurde nicht überschrieben. '+error.message,true);}
  $('cloudLogin').hidden=!cloud.enabled;$('cloudNotConfigured').hidden=cloud.enabled;$('demoToggle').hidden=cloud.enabled;
  $('accountBanner').hidden=!cloud.enabled;render();
  await cloud.init();
  if(cloud.enabled){$('reportCloudNote').textContent='Mit dem Elternkonto kannst du den synchronisierten Lernstand ansehen.';}
  if(storageOK){
    try{
      await loadSchoolVocabulary();
    }catch(error){notice('Der gespeicherte Wortschatz ist verfügbar. Schulbuch-Dateien konnten gerade nicht geladen werden: '+error.message,true);}
  }
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch{/* The app remains usable online when offline caching is unavailable. */}}
}
$('accountAction').onclick=()=>{$('toolsDialog').showModal();if(!cloud.connected)$('loginEmail').focus();};
$('cloudLogin').onsubmit=async event=>{
  event.preventDefault();const button=$('cloudLoginButton');button.disabled=true;button.textContent='Anmeldung wird geprüft …';$('cloudStatus').textContent='Verbindung zur Cloud wird hergestellt …';$('loginFeedback').textContent='Verbindung zur Cloud wird hergestellt …';$('loginFeedback').classList.remove('form-error');
  try{
    const result=await cloud.login($('loginEmail').value,$('loginPassword').value);
    if(!result?.ready)throw Error('Der Lernstand ist noch gesperrt. Bitte den angezeigten Cloud-Hinweis beachten.');
    $('loginPassword').value='';render();$('toolsDialog').close();
    notice(result.offline?'Angemeldet · gespeicherter Lernstand verfügbar. Die Cloud ist gerade nicht erreichbar.':'✓ Erfolgreich angemeldet. Du kannst jetzt Lektionen und Wörter hinzufügen.');
    try{await loadSchoolVocabulary();}catch(error){notice('Du bist angemeldet. Neue Wörter konnten gerade nicht geladen werden: '+error.message,true);}
  }catch(error){
    const message=error.name==='TimeoutError'||error.name==='AbortError'?'Die Verbindung dauert zu lange. Bitte Internetverbindung prüfen und erneut versuchen.':error.message==='Failed to fetch'?'Die Cloud ist nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.':error.message;
    $('cloudStatus').textContent=message;$('loginFeedback').textContent=message;$('loginFeedback').classList.add('form-error');$('loginFeedback').scrollIntoView({block:'nearest'});
  }finally{button.disabled=false;button.textContent='Anmelden';}
};
$('cloudSync').onclick=()=>cloud.sync();
$('cloudLogout').onclick=()=>{try{cloud.logout();}catch(error){$('cloudStatus').textContent=error.message;}};
$('loadCloudVersion').onclick=async()=>{download(backup(cloud.snapshot()||state),'school-konflikt-'+Date.now()+'.json');if(!confirm('Die lokale Version wurde gesichert. Jetzt die Cloud-Version laden?'))return;try{await cloud.loadCloud();storageOK=true;render();}catch(error){$('cloudStatus').textContent=error.message;}};
$('resetLanguage').onclick=async()=>{
  if(!canWrite())return;
  const selected=language;
  if(!confirm(names[selected]+': Alle Wörter, Lektionen und den Lernstand dieser Sprache zurücksetzen? Die andere Sprache bleibt erhalten. Vorher wird eine Sicherung heruntergeladen.'))return;
  await mutate(()=>{
    download(backup(state),'school-vor-zuruecksetzen-'+Date.now()+'.json');
    if(commit(resetLanguage(state,selected))){stopTraining();selectedLessons=[];lessonMemory[selected]=[];seedSources=[];render();$('toolsDialog').close();notice(names[selected]+' wurde zurückgesetzt. Du kannst jetzt einen neuen Wortschatz importieren.');}
  });
};
$('resetProgress').onclick=async()=>{
  if(!canWrite())return;
  const selected=language;
  if(!confirm(names[selected]+': Alle Antworten, Treffer, Fehler, Artikel-Ergebnisse, Serien und die Tageshistorie dieser Sprache auf null setzen? Wörter, Lektionen und Beispiele bleiben erhalten. Zuvor wird eine Sicherung heruntergeladen.'))return;
  await mutate(()=>{
    download(backup(state),'school-vor-fortschritt-reset-'+Date.now()+'.json');
    if(commit(resetProgress(state,selected))){stopTraining();session={good:0,bad:0};$('focus').value='all';render();$('toolsDialog').close();notice(names[selected]+': Lernfortschritt zurückgesetzt. Dein Wortschatz ist vollständig erhalten.');}
  });
};
document.documentElement.dataset.controlsReady='true';document.dispatchEvent(new Event('school-controls-ready'));
init().catch(error=>{notice('Beim Start ist ein Fehler aufgetreten: '+error.message,true);$('appRecovery').hidden=false;$('toolsRecovery').hidden=false;});
