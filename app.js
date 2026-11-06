import {t,setUiLanguage,readUiLanguage,localizeStatic,uiLocale,translateMessage,formatReference} from './i18n.js';
import {LANGUAGES,STORAGE_KEY,emptyState,clone,normalize,dayKey,validateState,validateWord,wordStats,recordAnswer,eligibleWords,nextWord,recallRound,nextRecallWord,summarize,activity,promptTerm,checkContext,mergeVocabulary,backup,parseBackup,applyCatalog,resetLanguage,resetProgress,recallPrompt,writingPage,gradeWritingPage,matchingRound,matchingText,germanArticles,germanArticlesRequired,shouldAskGermanArticle,beginArticleMatch,answerGermanArticle,isLearned} from './core.js';
import {demoState} from './demo.js';
import {cloudConfig} from './cloud-config.js';
import {createCloud} from './cloud.js';
const $=id=>document.getElementById(id), names={get en(){return t(0)},get es(){return t(1)}}, typeNames={get noun(){return t(2)},get verb(){return t(3)},get adjective(){return t(4)},get adverb(){return t(5)},get phrase(){return t(6)},get other(){return t(7)}};
let state=emptyState(),language=readUiLanguage(),mode='cards',selectedLessons=[],demo=false,realState=null,storageOK=true,lastRaw=null,current=null,editingId=null,shownWords=30,session={good:0,bad:0},vocabCandidate=null,backupCandidate=null,seedSources=[];
localizeStatic(language);
let articleQuestion=null,recallSession=null;
const lastRecallOrders=new Map();
const lessonMemory={en:[],es:[]};
let selectedActivityDay=null;
const dailySeries=()=>[['cards',t(8),'▤'],['recall',t(9),'↻'],['context',t(10),'▧'],['writing',t(11),'✎']];
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
function storageFailure(message){storageOK=false;stopTraining();$('saveState').textContent=t(12);notice(message+t(13),true);render();}
function commit(next){
  if(!canWrite()){notice(t(14),true);return false;}
  if(!storageOK&&!demo){notice(t(15),true);return false;}
  try{
    const checked=validateState(next);
    if(!demo&&cloud.enabled){cloud.save(checked);}
    else if(!demo){
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw!==lastRaw){storageFailure(t(16));return false;}
      const serialized=JSON.stringify(checked);localStorage.setItem(STORAGE_KEY,serialized);lastRaw=serialized;
    }
    state=checked;if(!cloud.enabled||demo)$('saveState').textContent=demo?t(17):t(18);return true;
  }catch(error){storageFailure(error.message);return false;}
}
async function mutate(action){
  if(demo)return action();
  if(!canWrite()){notice(parentView?t(19):t(458),true);return false;}
  if(navigator.locks){try{return await navigator.locks.request('school-language-trainer:write:v1',action);}catch(error){notice(error.message,true);return false;}}
  // All mutations below are synchronous; the raw-value check still protects stale tabs.
  return action();
}
function stopTraining(){document.body.classList.remove('writing-active');current=null;recallSession=null;articleQuestion=null;if($('germanArticleDialog').open)$('germanArticleDialog').close();$('training').hidden=true;}
function accuracy(good,bad){return good+bad?Math.round(good/(good+bad)*100)+'%':'—';}
function formatDate(day){return new Date(day+'T12:00:00').toLocaleDateString(uiLocale(),{day:'numeric',month:'short'});}
function render(){
  localizeStatic(language);for(const id of ['notice','cloudStatus','saveState','loginFeedback','backupPreview','vocabularyPreview'])if($(id).textContent)$(id).textContent=translateMessage($(id).textContent);
  const b=book(),s=summarize(b);$('requireGermanArticles').checked=germanArticlesRequired(state);$('requireGermanArticles').disabled=!canWrite();$('articleRequirementStatus').textContent=germanArticlesRequired(state)?t(20):t(21);$('matchingArticleNote').textContent=germanArticlesRequired(state)?t(22):t(23);
  document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  $('languageEyebrow').textContent=t(277);$('todayMetric').textContent=s.today;$('databaseMetric').textContent=s.databaseTotal;$('activeMetricNote').textContent=s.total+t(461)+b.hidden.length+t(502);
  const flag=language==='es'?'./flags/es.svg':'./flags/gb.svg';
  $('heroFlag').src=flag;$('languageFlag').src=flag;$('heroLanguageName').textContent=language==='es'?'Español':'English';$('languageArtwork').dataset.language=language;
  $('matchingHitsMetric').textContent=s.databaseCorrect;$('readyMetric').textContent=s.databaseReady;$('onceMetric').textContent=s.databaseOnce;$('twiceMetric').textContent=s.databaseTwice;$('learnedMetric').textContent=s.databaseLearned;$('learnedTotal').textContent=s.databaseTotal;$('recallPassedMetric').textContent=s.databaseRecallPassed+' / '+s.databaseTotal;$('contextPassedMetric').textContent=s.databaseContextPassed+' / '+s.databaseTotal;$('writingPassedMetric').textContent=s.databaseWritingPassed+' / '+s.databaseTotal;$('writingMasteredMetric').textContent=s.databaseWritingMastered+' / '+s.databaseTotal;
  const percent=s.databaseTotal?Math.round(s.databaseLearned/s.databaseTotal*100):0;$('masteryLabel').textContent=s.databaseLearned+t(24)+s.databaseTotal+t(25);$('masteryPercent').textContent=percent+'%';$('masteryBar').style.width=percent+'%';
  $('wordCount').textContent=s.total+t(26);$('demoBanner').hidden=!demo;$('demoToggle').textContent=demo?t(27):t(28);
  const directional=field=>b.words.filter(w=>!b.hidden.includes(w.id)).reduce((sum,w)=>sum+(wordStats(b,w.id)[field]||0),0);
  const fields=[[t(29),s.databaseTotal],[t(30),s.databaseLearned],[t(31),s.databaseRecallPassed+' / '+s.databaseTotal],[t(32),s.databaseContextPassed+' / '+s.databaseTotal],[t(33),s.databaseWritingPassed+' / '+s.databaseTotal],[t(34),s.databaseWritingMastered+' / '+s.databaseTotal],[t(462),accuracy(s.correct,s.wrong)],[t(35),directional('articleCorrect')+' / '+directional('articleWrong')],[t(36),accuracy(directional('articleCorrect'),directional('articleWrong'))],[t(37)+names[language]+' → DE',directional('recallForwardCorrect')+' / '+directional('recallForwardWrong')],[t(38)+names[language],directional('recallReverseCorrect')+' / '+directional('recallReverseWrong')],[t(39),s.total],[t(464),s.activeKnown],[t(40),s.correct+' / '+s.wrong],[t(41),s.recallCorrect+' / '+s.recallWrong],[t(42),accuracy(s.recallCorrect,s.recallWrong)],[t(43),directional('writingCorrect')+' / '+directional('writingWrong')],[t(44),s.contextCorrect+' / '+s.contextWrong],[t(45),accuracy(s.contextCorrect,s.contextWrong)],[t(46),s.contextReady],[t(47),b.hidden.length]];
  $('allMetrics').replaceChildren(...fields.map(([label,value])=>{const el=node('div',label);el.append(node('b',value));return el;}));
  renderActivity();renderLessons();renderDictionary();updateMode();
  document.querySelectorAll('#addWord,#addLesson,#restoreBackup,#importVocabulary,#resetLanguage,#resetProgress').forEach(button=>button.disabled=!canWrite()||(button.id==='restoreBackup'&&!backupCandidate)||(button.id==='importVocabulary'&&!vocabCandidate));
  $('startTraining').disabled=false;
  $('resetLanguage').textContent=names[language]+t(48);
  $('resetProgress').textContent=names[language]+t(49);
  if(cloud.enabled){$('storageNoteText').textContent=parentView?t(50):cloudLocked?t(51):t(52);$('localCallout').hidden=true;}
  if(cloud.enabled){
    const connected=cloud.connected;
    $('accountState').textContent=connected?t(503)+(cloud.identity?t(465)+cloud.identity:'')+(parentView?t(504):t(53)):t(54);
    $('accountAction').textContent=connected?t(466):t(55);
    $('cloudLogin').hidden=connected;$('signedInTools').hidden=!connected;
  }
}
function renderActivity(){
  const days=activity(book()),maximum=Math.max(1,...days.flatMap(d=>dailySeries().map(([mode])=>d.successes[mode])));
  $('weekTotal').textContent=days.reduce((sum,d)=>sum+d.count,0)+t(56);
  const selected=days.find(d=>d.day===selectedActivityDay)||days.at(-1);selectedActivityDay=selected.day;
  $('dailyChart').replaceChildren(...days.map((d,i)=>{
    const unknown=!d.trackedWords&&d.legacyWords>0;
    const description=`${formatDate(d.day)}: `+(unknown?t(467):dailySeries().map(([mode,label])=>label+': '+d.successes[mode]).join(', '));
    const col=node('button',null,'day-column'+(i===6?' today':'')+(unknown?' day-unknown':''));col.type='button';col.title=description;col.setAttribute('aria-label',description);col.setAttribute('aria-pressed',String(d.day===selected.day));
    col.append(node('span',unknown?'—':d.succeeded+' ✓','day-value'));
    const group=node('span',null,'day-bars');group.setAttribute('aria-hidden','true');
    for(const [mode]of dailySeries()){const track=node('span',null,'series-track'),fill=node('span',null,'series-fill series-'+mode);fill.style.height=(d.successes[mode]/maximum*100)+'%';track.append(fill);group.append(track);}
    col.append(group,node('span',new Date(d.day+'T12:00:00').toLocaleDateString(uiLocale(),{weekday:'short'}),'day-label'));
    col.onclick=()=>{selectedActivityDay=d.day;renderActivity();};return col;
  }));
  const unknown=!selected.trackedWords&&selected.legacyWords>0;
  $('activityDayDetails').replaceChildren(node('strong',formatDate(selected.day)) ,...dailySeries().map(([mode,label,symbol])=>node('span',symbol+' '+label+': '+(unknown?'—':selected.successes[mode]),'day-detail series-'+mode)));
  $('activityHistoryNote').textContent=unknown?t(57):t(58);
}
function renderLessons(){
  const all=node('button',t(59));all.type='button';all.setAttribute('aria-pressed',String(!selectedLessons.length));all.onclick=()=>{selectedLessons=[];lessonMemory[language]=[];stopTraining();render();};
  $('lessonChoices').replaceChildren(all,...book().lessons.map(lesson=>{
    const button=node('button',lesson.name);button.type='button';button.setAttribute('aria-pressed',String(selectedLessons.includes(lesson.id)));button.onclick=()=>{selectedLessons=selectedLessons.includes(lesson.id)?selectedLessons.filter(id=>id!==lesson.id):[...selectedLessons,lesson.id];lessonMemory[language]=[...selectedLessons];stopTraining();render();};return button;
  }));
  const base=eligibleWords(book(),{...options(),mode:'cards',focus:'all'}),unmastered=base.filter(w=>!isLearned(wordStats(book(),w.id)));
  $('lessonStatus').textContent=base.length+t(60)+unmastered.length+t(61)+(book().lessons.length?t(470):t(471));
}
function updateMode(){
  $('focus').disabled=mode!=='cards';$('recallDirectionTools').hidden=mode!=='recall';
  const direction=$('recallDirection'),reverse=direction.value==='reverse';
  direction.options[0].textContent=names[language]+t(62);direction.options[1].textContent=t(63)+names[language];
  $('modeHelp').textContent=mode==='cards'?t(64):mode==='recall'?($('recallMethod').value==='written'?t(65):t(66))+(reverse?t(63)+names[language]:names[language]+t(62))+'.':t(67);
  const count=eligibleWords(book(),options()).length;$('startTraining').textContent=count?t(472)+count+' →':t(473);
}
function progressLabel(w,b=book()) {const st=wordStats(b,w.id);return isLearned(st)?t(30):st.streak>=3?t(68):st.streak?st.streak+t(69):t(70);}
function renderDictionary(){
  const query=normalize($('search').value),b=book();
  const words=b.words.filter(w=>(!b.hidden.includes(w.id)||$('showHidden').checked)&&(!query||normalize(w.term+' '+w.de).includes(query)));
  $('searchStatus').textContent=words.length+' '+(query?t(71):t(72)+names[language]);
  if(!words.length){const empty=node('div',null,'empty-state');empty.append(node('span','▤','empty-icon'),node('strong',query?t(73):t(474)),node('p',query?t(74):t(75)));$('wordList').replaceChildren(empty);$('showMore').hidden=true;return;}
  $('wordList').replaceChildren(...words.slice(0,shownWords).map(w=>{
    const hidden=b.hidden.includes(w.id),row=node('div',null,'word-row'+(hidden?' hidden-word':'')),copy=node('div'),p=node('p');
    const term=node('strong',w.term);term.lang=language;p.append(term,node('span',' · '+w.de,'word-translation'));
    copy.append(p,node('small',[typeNames[w.type],progressLabel(w),hidden?t(497):'',...w.lessonIds.map(id=>b.lessons.find(l=>l.id===id)?.name)].filter(Boolean).join(' · ')));
    if(w.reference)copy.append(node('small',formatReference(w.reference)));
    const actions=node('div',null,'word-row-actions'),edit=node('button',t(76),'text-button'),toggle=node('button',hidden?t(498):t(77),'text-button');
    edit.type=toggle.type='button';edit.disabled=toggle.disabled=!canWrite();edit.onclick=()=>openWord(w);toggle.onclick=()=>toggleHidden(w.id);actions.append(edit,toggle);row.append(copy,actions);return row;
  }));$('showMore').hidden=words.length<=shownWords;
}
async function toggleHidden(id){await mutate(()=>{const next=clone(state),b=next.languages[language];b.hidden=b.hidden.includes(id)?b.hidden.filter(k=>k!==id):[...b.hidden,id];if(commit(next)){stopTraining();render();}});}
function startTraining(){
  if(!canWrite()){
    notice(!storageOK?t(78):parentView?t(79):t(80),true);
    if(!$('toolsDialog').open)$('toolsDialog').showModal();
    if(!cloud.connected)$('loginEmail').focus();return;
  }
  session={good:0,bad:0};recallSession=null;
  if(mode==='recall'&&$('recallMethod').value==='mental'){
    const key=language+'|'+JSON.stringify(options());let previous=lastRecallOrders.get(key)||[];
    try{if(!previous.length){const stored=JSON.parse(localStorage.getItem('school-language-trainer:recall-order:v1')||'null');if(stored?.key===key&&Array.isArray(stored.ids)&&stored.ids.every(id=>typeof id==='string'))previous=stored.ids;}}catch{}
    recallSession=recallRound(book(),options(),previous);lastRecallOrders.set(key,[...recallSession.ids]);
    try{localStorage.setItem('school-language-trainer:recall-order:v1',JSON.stringify({key,ids:recallSession.ids}));}catch{}
  }
  showNext(true);
}
function showMatchingRound(scroll=false){
  $('recallComplete').hidden=true;
  const pending=book().words.find(w=>!book().hidden.includes(w.id)&&book().stats[w.id]?.pendingArticle);
  if(pending&&germanArticlesRequired(state)){stopTraining();openGermanArticle(pending.id,null);return;}
  const round=matchingRound(book(),options(),language);
  if(!round.words.length){stopTraining();notice(t(81));return;}
  notice('');$('writingSheet').hidden=true;current={...round,mode:'cards',language,solved:new Set(),leftId:null,rightId:null,busy:false};
  $('training').hidden=false;$('matchingBoard').hidden=false;$('wordCard').hidden=true;$('hideTrainingWord').hidden=true;
  $('judgeButtons').hidden=true;$('contextNext').hidden=true;$('matchingNext').hidden=true;
  $('trainingMode').textContent=t(475);$('trainingTitle').textContent=t(82);
  $('trainingStatus').textContent=round.words.length+t(83)+eligibleWords(book(),options()).length+t(84);
  $('matchingLeftLabel').textContent=names[language];$('matchingFeedback').textContent=t(85);
  const activeRound=current;
  for(const side of ['left','right']){
    const column=$(side==='left'?'matchingLeft':'matchingRight');column.replaceChildren(...round[side].map(w=>{
      const button=node('button',matchingText(w,language,side,false,germanArticlesRequired(state)),'pair-card');button.type='button';button.lang=side==='left'?language:'de';button.dataset.wordId=w.id;button.setAttribute('aria-pressed','false');button.onclick=()=>selectMatching(side,w.id,activeRound);return button;
    }));
  }
  $('sessionStats').textContent=t(86,[session.good,session.bad]);
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
    $('matchingFeedback').textContent=ok?'✓ '+w.term+' — '+w.de:t(87);
    for(const columnSide of ['left','right']){
      for(const button of $(columnSide==='left'?'matchingLeft':'matchingRight').children){
        button.setAttribute('aria-pressed','false');
        if(ok&&button.dataset.wordId===leftId){button.textContent=matchingText(w,language,columnSide,true);button.classList.add('matched');button.disabled=true;}
      }
    }
    round.leftId=round.rightId=null;render();
    $('sessionStats').textContent=t(86,[session.good,session.bad]);
    if(round.solved.size===round.words.length){$('matchingNext').hidden=false;$('matchingFeedback').textContent+=t(88);}
  });
  if(current===round)round.busy=false;
}
$('matchingNext').onclick=()=>{if(current?.mode==='cards'&&current.solved.size===current.words.length)showMatchingRound();};
function openGermanArticle(wordId,round){
  const word=book().words.find(w=>w.id===wordId),pending=book().stats[wordId]?.pendingArticle;if(!word||!pending)return;
  const questions=germanArticles(word),question=questions[pending.index];
  articleQuestion={wordId,round,language,answered:false,question};
  $('germanArticleNoun').textContent=question.noun;$('germanArticleTarget').textContent=word.term;
  $('germanArticleStep').textContent=t(89)+(pending.index+1)+t(24)+questions.length;
  $('germanArticleFeedback').textContent=t(90);$('germanArticleFeedback').classList.remove('article-wrong');$('germanArticleContinue').hidden=true;
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
    $('germanArticleFeedback').textContent=result.ok?t(91):(t(92)+result.question.article+' '+result.question.noun+t(93));
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
  $('matchingFeedback').textContent=(q.credited?'✓ ':t(94))+word.term+' — '+word.de;
  $('sessionStats').textContent=t(86,[session.good,session.bad]);
  if(round.solved.size===round.words.length){$('matchingNext').hidden=false;$('matchingFeedback').textContent+=t(95);}
}
document.querySelectorAll('[data-german-article]').forEach(button=>button.onclick=()=>chooseGermanArticle(button.dataset.germanArticle));
$('germanArticleContinue').onclick=continueGermanArticle;
$('germanArticleDialog').addEventListener('cancel',event=>{event.preventDefault();if(articleQuestion?.answered)continueGermanArticle();});
function showNext(scroll=false){
  if(!canWrite())return;
  if(mode==='cards'){showMatchingRound(scroll);return;}
  if(mode==='recall'&&$('recallMethod').value==='written'){showWritingPage(scroll);return;}
  $('writingSheet').hidden=true;
  $('recallComplete').hidden=true;
  const choice=mode==='recall'&&recallSession?nextRecallWord(book(),recallSession):nextWord(book(),options());
  if(choice.complete){showRecallComplete(choice.total);return;}
  if(!choice.word){stopTraining();notice(mode==='cards'?t(96):mode==='recall'?t(97):t(98));return;}
  notice('');const w=choice.word,examples=[...w.examples].sort((a,b)=>(a.source==='textbook'?0:1)-(b.source==='textbook'?0:1));
  current={id:w.id,language,mode,direction:$('recallDirection').value,scope:choice.scope,seen:choice.seen,revealed:false,answered:false,example:examples.length?examples[(wordStats(book(),w.id).contextCorrect+wordStats(book(),w.id).contextWrong)%examples.filter(e=>e.source===examples[0].source).length]:null};
  $('matchingBoard').hidden=true;$('wordCard').hidden=false;$('hideTrainingWord').hidden=false;
  $('training').hidden=false;$('trainingMode').textContent={cards:t(351),recall:t(476),context:t(99)}[mode];$('trainingTitle').textContent=mode==='context'?t(100):mode==='recall'?t(101):t(102);
  $('trainingStatus').textContent=(mode==='recall'&&recallSession?t(103)+(choice.seen.length+1)+t(24)+choice.total+' · ':'')+progressLabel(w)+' · '+eligibleWords(book(),options()).length+t(84);$('wordLesson').textContent=w.lessonIds.map(id=>book().lessons.find(l=>l.id===id)?.name).filter(Boolean).join(' · ')||t(104);
  const prompt=recallPrompt(w,language,current.direction);
  $('promptLabel').textContent=mode==='recall'?(current.direction==='reverse'?t(63)+names[language]:names[language]+t(62)):names[language];$('wordPrompt').lang=mode==='recall'?prompt.language:language;$('wordPrompt').classList.toggle('context-prompt',mode==='context');$('wordPrompt').textContent=mode==='context'?current.example.sentence.replace('{{word}}','_______'):prompt.text;
  $('contextForm').hidden=mode!=='context';$('contextInput').value='';$('contextInput').disabled=false;$('contextInput').lang=language;$('checkContext').disabled=false;
  $('revealAnswer').hidden=mode==='context';$('answerArea').hidden=true;$('judgeButtons').hidden=true;$('contextNext').hidden=true;$('exampleArea').hidden=true;$('answerFeedback').textContent='';$('answerFeedback').className='answer-feedback';
  $('sessionStats').textContent=t(86,[session.good,session.bad]);
  if(scroll){$('training').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('trainingTitle').focus({preventScroll:true});}
  if(mode==='context')$('contextInput').focus({preventScroll:!scroll});
}
function showRecallComplete(total){
  current=null;$('training').hidden=false;$('wordCard').hidden=true;$('matchingBoard').hidden=true;$('writingSheet').hidden=true;$('judgeButtons').hidden=true;$('contextNext').hidden=true;$('hideTrainingWord').hidden=true;
  $('trainingTitle').textContent=t(477);$('trainingStatus').textContent=total+t(24)+total+t(105);$('recallComplete').hidden=false;
  $('recallCompleteText').textContent=t(106)+total+t(107)+session.good+t(108)+session.bad+t(109);
  $('sessionStats').textContent=t(86,[session.good,session.bad]);
}
function reveal(){
  if(!current||current.language!==language)return;
  const w=book().words.find(w=>w.id===current.id);current.revealed=true;$('answerArea').hidden=false;$('revealAnswer').hidden=true;
  $('fullTerm').textContent=w.term;$('fullTerm').lang=language;$('germanAnswer').textContent=w.de;
  $('fullTerm').hidden=mode==='recall'&&current.direction!=='reverse';
  $('germanAnswer').hidden=mode==='recall'&&current.direction==='reverse';
  $('exampleArea').open=mode==='context';
  const ex=current.example;if(ex){$('exampleArea').hidden=false;$('exampleText').textContent=ex.sentence.replace('{{word}}',ex.answer);$('exampleText').lang=language;$('exampleTranslation').textContent=ex.translation;$('exampleSource').textContent=(ex.source==='textbook'?t(110):t(412))+(ex.reference?' · '+formatReference(ex.reference):'');}
  if(mode!=='context')$('judgeButtons').hidden=false;
}
async function answer(ok){
  const question=current;if(!question||question.answered||!question.revealed)return;
  question.answered=true;$('answerCorrect').disabled=$('answerWrong').disabled=true;
  await mutate(()=>{
    if(current!==question)return;
    try{
      const next=recordAnswer(state,question.language,question.id,question.mode,ok,dayKey(),question.direction);next.languages[question.language].cycles[question.scope]=[...new Set([...question.seen,question.id])];
      if(commit(next)){session[ok?'good':'bad']++;if(question.mode==='recall'&&recallSession)recallSession.seen=[...new Set([...question.seen,question.id])];render();if(question.mode!=='context')showNext();else{$('sessionStats').textContent=t(86,[session.good,session.bad]);}}
    }catch(error){notice(error.message,true);}
  });$('answerCorrect').disabled=$('answerWrong').disabled=false;
}
async function submitContext(){
  if(!current||current.mode!=='context'||current.answered)return;
  const typed=$('contextInput').value.trim();if(!typed){$('contextInput').setCustomValidity(t(111));$('contextInput').reportValidity();return;}
  const ok=checkContext(typed,current.example);$('contextInput').disabled=true;$('checkContext').disabled=true;reveal();
  $('answerFeedback').textContent=ok?t(91):t(112)+current.example.answer;$('answerFeedback').classList.toggle('wrong',!ok);
  await answer(ok);if(current&&storageOK){$('contextNext').hidden=false;$('contextNext').focus();}
}
function showWritingPage(scroll=false){
  $('recallComplete').hidden=true;
  const direction=$('recallDirection').value,page=writingPage(book(),options(),Number($('writingPageSize').value));
  if(!page.total){stopTraining();notice(t(113));return;}
  notice('');current={...page,mode:'recall',written:true,language,direction,answered:false,busy:false,rows:[]};
  document.body.classList.add('writing-active');
  $('training').hidden=false;$('matchingBoard').hidden=true;$('wordCard').hidden=true;$('writingSheet').hidden=false;
  $('hideTrainingWord').hidden=true;$('judgeButtons').hidden=true;$('contextNext').hidden=true;
  $('trainingMode').textContent=t(478);$('trainingTitle').textContent=page.retry?t(114):t(115);
  const lessonNames=selectedLessons.length?book().lessons.filter(l=>selectedLessons.includes(l.id)).map(l=>l.name).join(', '):t(59);
  $('trainingStatus').textContent=lessonNames+' · '+page.done+' / '+page.total+t(116)+(page.words.length?t(479)+page.words.length+t(26):'');
  $('sheetSourceLabel').textContent=direction==='reverse'?t(117):names[language];
  $('sheetTargetLabel').textContent=direction==='reverse'?names[language]+t(118):(germanArticlesRequired(state)?t(119):t(120));
  $('writingRows').replaceChildren(...page.words.map((word,i)=>{
    const row=node('div',null,'writing-row'),label=node('label',(i+1)+'. '+recallPrompt(word,language,direction).text),cell=node('div',null,'writing-cell'),input=node('input');
    input.id='writing-'+i;input.type='text';input.autocomplete='off';input.autocapitalize='off';input.spellcheck=false;input.setAttribute('autocorrect','off');input.lang=direction==='reverse'?language:'de';input.setAttribute('enterkeyhint',i===page.words.length-1?'done':'next');input.setAttribute('aria-describedby','writing-feedback-'+i);
    const count=node('small',Math.min(3,wordStats(book(),word.id).writingCorrect||0)+t(121),'writing-count');label.append(count);
    label.htmlFor=input.id;label.lang=direction==='reverse'?'de':language;
    const feedback=node('p',null,'writing-feedback');feedback.id='writing-feedback-'+i;feedback.hidden=true;
    input.oninput=()=>input.setCustomValidity('');input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();if(i<current.rows.length-1)current.rows[i+1].input.focus();else $('checkWritingSheet').click();}};
    cell.append(input,feedback);row.append(label,cell);current.rows.push({row,input,feedback,word,count});return row;
  }));
  $('checkWritingSheet').hidden=!page.words.length;$('checkWritingSheet').disabled=false;
  $('nextWritingSheet').hidden=true;
  $('writingResult').textContent=page.words.length?t(122):t(480)+page.total+t(123);
  $('sessionStats').textContent=t(124,[session.good,session.bad]);
  if(scroll)window.scrollTo({top:0,behavior:'instant'});
}
async function submitWritingPage(event){
  event.preventDefault();const page=current;
  if(!page?.written||page.answered||page.busy||!canWrite())return;
  for(const {input} of page.rows)if(!input.value.trim()){input.setCustomValidity(t(125));input.reportValidity();return;}
  const answers=page.rows.map(r=>r.input.value);page.busy=true;$('checkWritingSheet').disabled=true;
  await mutate(()=>{
    if(current!==page)return;
    try{
      const graded=gradeWritingPage(state,page.language,page,answers,page.direction);
      if(!commit(graded.state))return;
      page.answered=true;const good=graded.results.filter(Boolean).length;session.good+=good;session.bad+=page.words.length-good;
      page.rows.forEach(({row,input,feedback,word,count},i)=>{
        const ok=graded.results[i];input.readOnly=true;input.setAttribute('aria-invalid',String(!ok));row.classList.add(ok?'writing-correct':'writing-wrong');feedback.hidden=false;feedback.textContent=ok?'✓ '+(page.direction==='reverse'?word.term:word.de):t(126)+(page.direction==='reverse'?word.term:word.de);count.textContent=Math.min(3,wordStats(book(),word.id).writingCorrect||0)+t(121);
      });
      render();$('writingResult').textContent=good+t(24)+page.words.length+t(108)+(page.words.length-good)+t(127);
      $('checkWritingSheet').hidden=true;$('nextWritingSheet').hidden=false;$('nextWritingSheet').textContent=good<page.words.length?t(128):t(481);
      $('sessionStats').textContent=t(124,[session.good,session.bad]);
    }catch(error){notice(error.message,true);}
  });page.busy=false;if(current===page&&!page.answered)$('checkWritingSheet').disabled=false;
}
function openWord(word=null){
  editingId=word?.id||null;$('wordForm').reset();$('wordFormError').textContent='';$('wordDialogTitle').textContent=word?t(129):t(130);$('termLabel').textContent=names[language]+t(131);$('term').lang=language;
  $('term').value=word?.term||'';$('de').value=word?.de||'';$('wordType').value=word?.type||'noun';$('wordReference').value=word?.reference||'';
  $('wordLessonChoices').replaceChildren(...book().lessons.map(lesson=>{const label=node('label'),input=document.createElement('input');input.type='checkbox';input.value=lesson.id;input.checked=(word?.lessonIds||selectedLessons).includes(lesson.id);label.append(input,node('span',lesson.name));return label;}));$('noWordLessons').hidden=book().lessons.length>0;
  $('exampleEditor').open=false;$('existingExamplesNote').textContent=word?.examples.length?t(132,[word.examples.length]):'';$('wordDialog').showModal();
}
async function saveWord(event){
  event.preventDefault();const selectedLanguage=language;
  try{
    const old=book().words.find(w=>w.id===editingId), examples=clone(old?.examples||[]);
    const sentence=$('sentence').value.trim(),answerText=$('sentenceAnswer').value.trim();
    if(sentence||answerText||$('sentenceTranslation').value.trim())examples.push({sentence,answer:answerText,translation:$('sentenceTranslation').value.trim(),source:$('sentenceSource').value,reference:$('wordReference').value.trim()});
    const w=validateWord({id:old?.id||uid('w'),term:$('term').value,de:$('de').value,type:$('wordType').value,addedAt:old?.addedAt||dayKey(),lessonIds:[...$('wordLessonChoices').querySelectorAll('input:checked')].map(i=>i.value),reference:$('wordReference').value,examples},selectedLanguage);
    if(book().words.some(other=>other.id!==w.id&&normalize(other.term)===normalize(w.term)))throw Error(t(133));
    await mutate(()=>{if(language!==selectedLanguage)return;const next=clone(state),b=next.languages[language],index=b.words.findIndex(other=>other.id===w.id);if(index<0)b.words.push(w);else b.words[index]=w;if(commit(next)){stopTraining();$('wordDialog').close();render();notice(t(134)+w.term);}});
  }catch(error){$('wordFormError').textContent=error.message;}
}
function download(value,filename,type='application/json'){
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));const anchor=node('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function readJSON(file){if(!file)throw Error(t(135));if(file.size>10*1024*1024)throw Error(t(136));return JSON.parse(await file.text());}
function buildReport(){
  return {title:t(137),generatedAt:new Date().toISOString(),demo,languages:Object.fromEntries(LANGUAGES.map(lang=>{
    const b=state.languages[lang];return [lang,{language:names[lang],summary:summarize(b),last7Days:activity(b),lessons:b.lessons.map(l=>{const subset={...b,words:b.words.filter(w=>w.lessonIds.includes(l.id))};return {name:l.name,...summarize(subset)};}),wordsWithMistakes:b.words.filter(w=>!b.hidden.includes(w.id)).filter(w=>{const s=wordStats(b,w.id);return s.wrong||s.recallWrong||s.contextWrong||s.articleWrong;}).map(w=>({term:w.term,de:w.de,stats:wordStats(b,w.id)}))}];}))};
}
function openReport(){
  const report=buildReport();$('reportContent').replaceChildren(...LANGUAGES.map(lang=>{
    const r=report.languages[lang],s=r.summary,section=node('section',null,'report-language');section.append(node('h3',r.language));
    const values=node('div',null,'report-values');for(const [label,value]of [[t(138),s.today+' / '+s.total],[t(139),s.ready],[t(30),s.databaseLearned+' / '+s.databaseTotal],[t(31),s.databaseRecallPassed+' / '+s.databaseTotal],[t(32),s.databaseContextPassed+' / '+s.databaseTotal],[t(33),s.databaseWritingPassed+' / '+s.databaseTotal],[t(34),s.databaseWritingMastered+' / '+s.databaseTotal],[t(40),s.correct+' / '+s.wrong],[t(41),s.recallCorrect+' / '+s.recallWrong],[t(44),s.contextCorrect+' / '+s.contextWrong]]){const v=node('div',label);v.append(node('b',value));values.append(v);}section.append(values);
    const table=node('table',null,'report-table'),head=node('thead'),hr=node('tr');for(const label of [t(140),t(141),t(499),t(346)]){const th=node('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const body=node('tbody');for(const l of r.lessons){const row=node('tr');for(const value of [l.name,l.databaseTotal,l.databaseLearned,l.today])row.append(node('td',value));body.append(row);}table.append(body);if(r.lessons.length)section.append(table);
    const mistakes=node('p',r.wordsWithMistakes.length?t(482)+r.wordsWithMistakes.slice(0,20).map(w=>w.term).join(', '):t(142),'fine-print');section.append(mistakes);return section;
  }));$('reportDialog').showModal();
}
function openProgress(view){
  const titles={once:t(143),twice:t(144),three:t(145),learned:t(146),recallPassed:t(147),contextPassed:t(32),writingPassed:t(148),writingMastered:t(149),mistakes:t(150)};const b=book();$('progressTitle').textContent=titles[view];
  const words=b.words.filter(w=>{const st=wordStats(b,w.id);return view==='once'?st.streak===1:view==='twice'?st.streak===2:view==='three'?st.streak>=3:view==='learned'?isLearned(st):view==='recallPassed'?st.recallCorrect>0:view==='contextPassed'?st.contextCorrect>0:view==='writingPassed'?st.writingCorrect>0:view==='writingMastered'?st.writingCorrect>=3:st.wrong||st.recallWrong||st.contextWrong||st.articleWrong;});
  $('progressWords').replaceChildren(...words.map(w=>{const s=wordStats(b,w.id);return node('p',w.term+' · '+w.de+t(505)+s.correct+' / '+s.wrong+t(151)+s.recallCorrect+' / '+s.recallWrong+t(152)+s.contextCorrect+' / '+s.contextWrong+t(153)+(s.writingCorrect||0)+' / '+(s.writingWrong||0)+t(154)+(s.articleCorrect||0)+' / '+(s.articleWrong||0));}));if(!words.length)$('progressWords').append(node('p',t(155)));$('progressDialog').showModal();
}
function toggleDemo(){
  if(cloud.enabled){notice(t(156));return;}
  stopTraining();notice('');
  if(!demo){realState=state;state=demoState();demo=true;}else{state=realState;realState=null;demo=false;}
  selectedLessons=[];lessonMemory.en=[];lessonMemory.es=[];mode='cards';$('focus').value='all';$('search').value='';backupCandidate=vocabCandidate=null;$('restoreBackup').disabled=$('importVocabulary').disabled=true;$('backupPreview').textContent=$('vocabularyPreview').textContent='';
  $('saveState').textContent=demo?t(17):t(18);render();
}
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
document.querySelectorAll('[data-language]').forEach(button=>button.onclick=()=>{if(language===button.dataset.language)return;stopTraining();language=button.dataset.language;selectedLessons=[...lessonMemory[language]];$('search').value='';shownWords=30;render();});
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;stopTraining();render();});
document.querySelectorAll('[data-progress]').forEach(button=>button.onclick=()=>openProgress(button.dataset.progress));
for(const id of ['focus','type','period','recallDirection','recallMethod','writingPageSize'])$(id).onchange=()=>{stopTraining();render();};
$('search').oninput=()=>{shownWords=30;renderDictionary();};$('showHidden').onchange=renderDictionary;$('showMore').onclick=()=>{shownWords+=30;renderDictionary();};
$('restartRecall').onclick=startTraining;$('startTraining').onclick=startTraining;$('stopTraining').onclick=stopTraining;$('revealAnswer').onclick=reveal;$('answerCorrect').onclick=()=>answer(true);$('answerWrong').onclick=()=>answer(false);$('checkContext').onclick=submitContext;$('contextNext').onclick=()=>showNext();
$('writingSheet').onsubmit=submitWritingPage;$('nextWritingSheet').onclick=()=>{if(current?.written&&current.answered&&!current.busy)showWritingPage(true);};
$('contextInput').oninput=()=>{$('contextInput').setCustomValidity('');};$('contextInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submitContext();}};
$('hideTrainingWord').onclick=()=>{if(current&&confirm(t(157)))toggleHidden(current.id);};
$('addWord').onclick=()=>openWord();$('wordForm').onsubmit=saveWord;$('addLesson').onclick=()=>{$('lessonForm').reset();$('lessonDialog').showModal();};
$('lessonForm').onsubmit=async e=>{e.preventDefault();const name=$('lessonName').value.trim();if(!name)return;if(book().lessons.some(l=>normalize(l.name)===normalize(name))){$('lessonName').setCustomValidity(t(158));$('lessonName').reportValidity();return;}await mutate(()=>{const next=clone(state);next.languages[language].lessons.push({id:uid('lesson'),name});if(commit(next)){$('lessonDialog').close();render();}});};$('lessonName').oninput=()=>{$('lessonName').setCustomValidity('');};
$('openTools').onclick=()=>{$('toolsDialog').showModal();};$('exportBackup').onclick=()=>download(backup(state),`school-trainer${demo?'-demo':''}-${dayKey()}.json`);
$('backupFile').onchange=async e=>{backupCandidate=null;$('restoreBackup').disabled=true;try{const candidate=parseBackup(await readJSON(e.target.files[0]));backupCandidate=candidate;$('backupPreview').textContent=LANGUAGES.map(lang=>names[lang]+': '+candidate.languages[lang].words.length+t(26)).join(' · ')+t(159);$('restoreBackup').disabled=false;}catch(error){$('backupPreview').textContent=error.message;}};
$('restoreBackup').onclick=async()=>{if(!backupCandidate)return;if(!confirm(t(160)))return;download(backup(state),`school-trainer-vor-wiederherstellung-${Date.now()}.json`);await mutate(()=>{if(commit(backupCandidate)){stopTraining();backupCandidate=null;$('restoreBackup').disabled=true;selectedLessons=[];lessonMemory.en=[];lessonMemory.es=[];render();$('toolsDialog').close();notice(t(161));}});};
$('vocabularyFile').onchange=async e=>{vocabCandidate=null;$('importVocabulary').disabled=true;try{const candidate=await readJSON(e.target.files[0]),result=mergeVocabulary(state,candidate);vocabCandidate=candidate;$('vocabularyPreview').textContent=names[candidate.language]+': '+result.added+t(162)+candidate.lessons.length+t(163);$('importVocabulary').disabled=false;}catch(error){$('vocabularyPreview').textContent=error.message;}};
$('importVocabulary').onclick=async()=>{if(!vocabCandidate)return;await mutate(()=>{try{const result=mergeVocabulary(state,vocabCandidate);if(commit(result.state)){stopTraining();const lang=vocabCandidate.language;vocabCandidate=null;$('importVocabulary').disabled=true;language=lang;selectedLessons=[...lessonMemory[lang]];render();$('toolsDialog').close();notice(result.added+t(164));}}catch(error){$('vocabularyPreview').textContent=error.message;}});};
$('exportVocabulary').onclick=()=>download({format:'school-vocabulary-v1',language,lessons:book().lessons,words:book().words},`school-vocabulary-${language}${demo?'-demo':''}-${dayKey()}.json`);
$('openReport').onclick=openReport;$('downloadReport').onclick=()=>download(buildReport(),`school-lernuebersicht${demo?'-demo':''}-${dayKey()}.json`);$('demoToggle').onclick=$('exitDemo').onclick=toggleDemo;
$('requireGermanArticles').onchange=async()=>{const requireArticles=$('requireGermanArticles').checked;await mutate(()=>{const next=clone(state);next.preferences={...next.preferences,requireGermanArticles:requireArticles};if(commit(next)){stopTraining();notice(requireArticles?t(165):t(166));}});render();};
$('textSize').onchange=()=>{document.documentElement.classList.remove('large','largest');if($('textSize').value!=='normal')document.documentElement.classList.add($('textSize').value);try{localStorage.setItem('school-language-trainer:text-size:v1',$('textSize').value);}catch{}};
addEventListener('storage',event=>{if(!demo&&((event.key===STORAGE_KEY&&!cloud.enabled)||(cloud.enabled&&event.key?.startsWith('school-language-trainer:cloud-'))))storageFailure(t(167));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(dayKey()!==lastRenderedDay){lastRenderedDay=dayKey();render();}if(!demo&&storageOK&&!cloud.enabled){try{if(localStorage.getItem(STORAGE_KEY)!==lastRaw)storageFailure(t(168));}catch{storageFailure(t(169));}}}});
let lastRenderedDay=dayKey();
async function loadSchoolVocabulary(){
  if(!seedSources.length)seedSources=await Promise.all(LANGUAGES.map(lang=>fetch(`./data/${lang}.json`).then(response=>{if(!response.ok)throw Error(t(170));return response.json();})));
  if(!canWrite())return;
  await mutate(()=>{let next=state;for(const source of seedSources)next=applyCatalog(next,source).state;if(JSON.stringify(next)!==JSON.stringify(state))commit(next);render();});
}
async function init(){
  try{lastRaw=localStorage.getItem(STORAGE_KEY);if(lastRaw)state=validateState(JSON.parse(lastRaw));const size=localStorage.getItem('school-language-trainer:text-size:v1');if(['large','largest'].includes(size)){document.documentElement.classList.add(size);$('textSize').value=size;}}
  catch(error){storageOK=false;notice(t(171)+error.message,true);}
  $('cloudLogin').hidden=!cloud.enabled;$('cloudNotConfigured').hidden=cloud.enabled;$('demoToggle').hidden=cloud.enabled;
  $('accountBanner').hidden=!cloud.enabled;render();
  await cloud.init();
  if(cloud.enabled){$('reportCloudNote').textContent=t(483);}
  if(storageOK){
    try{
      await loadSchoolVocabulary();
    }catch(error){notice(t(172)+error.message,true);}
  }
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch{/* The app remains usable online when offline caching is unavailable. */}}
}
$('accountAction').onclick=()=>{$('toolsDialog').showModal();if(!cloud.connected)$('loginEmail').focus();};
$('cloudLogin').onsubmit=async event=>{
  event.preventDefault();const button=$('cloudLoginButton');button.disabled=true;button.textContent=t(173);$('cloudStatus').textContent=t(174);$('loginFeedback').textContent=t(174);$('loginFeedback').classList.remove('form-error');
  try{
    const result=await cloud.login($('loginEmail').value,$('loginPassword').value);
    if(!result?.ready)throw Error(t(175));
    $('loginPassword').value='';render();$('toolsDialog').close();
    notice(result.offline?t(176):t(177));
    try{await loadSchoolVocabulary();}catch(error){notice(t(178)+error.message,true);}
  }catch(error){
    const message=error.name==='TimeoutError'||error.name==='AbortError'?t(179):error.message==='Failed to fetch'?t(180):error.message;
    $('cloudStatus').textContent=message;$('loginFeedback').textContent=message;$('loginFeedback').classList.add('form-error');$('loginFeedback').scrollIntoView({block:'nearest'});
  }finally{button.disabled=false;button.textContent=t(181);}
};
$('cloudSync').onclick=()=>cloud.sync();
$('cloudLogout').onclick=()=>{try{cloud.logout();}catch(error){$('cloudStatus').textContent=error.message;}};
$('loadCloudVersion').onclick=async()=>{download(backup(cloud.snapshot()||state),'school-konflikt-'+Date.now()+'.json');if(!confirm(t(182)))return;try{await cloud.loadCloud();storageOK=true;render();}catch(error){$('cloudStatus').textContent=error.message;}};
$('resetLanguage').onclick=async()=>{
  if(!canWrite())return;
  const selected=language;
  if(!confirm(names[selected]+t(183)))return;
  await mutate(()=>{
    download(backup(state),'school-vor-zuruecksetzen-'+Date.now()+'.json');
    if(commit(resetLanguage(state,selected))){stopTraining();selectedLessons=[];lessonMemory[selected]=[];seedSources=[];render();$('toolsDialog').close();notice(names[selected]+t(184));}
  });
};
$('resetProgress').onclick=async()=>{
  if(!canWrite())return;
  const selected=language;
  if(!confirm(names[selected]+t(185)))return;
  await mutate(()=>{
    download(backup(state),'school-vor-fortschritt-reset-'+Date.now()+'.json');
    if(commit(resetProgress(state,selected))){stopTraining();session={good:0,bad:0};$('focus').value='all';render();$('toolsDialog').close();notice(names[selected]+t(186));}
  });
};
document.documentElement.dataset.controlsReady='true';document.dispatchEvent(new Event('school-controls-ready'));
init().catch(error=>{notice(t(187)+error.message,true);$('appRecovery').hidden=false;$('toolsRecovery').hidden=false;});
