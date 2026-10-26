export const LANGUAGES = ['en', 'es'];
export const STORAGE_KEY = 'school-language-trainer:state:v1';
export const FORMAT = 'school-language-trainer-backup-v1';
const TYPES = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other'];
const counters = ['correct','wrong','streak','recallCorrect','recallWrong','recallForwardCorrect','recallForwardWrong','recallReverseCorrect','recallReverseWrong','writingCorrect','writingWrong','articleCorrect','articleWrong','contextCorrect','contextWrong','contextStreak'];
export const clone = value => structuredClone(value);
export const normalize = value => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function validDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value; }
function text(value, label, max = 500) {
  if(typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`${label}: Bitte einen gültigen Text eingeben (max. ${max} Zeichen).`);
  return value.normalize('NFC').trim();
}
function id(value) { if(typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)) throw Error('Ungültige ID.'); return value; }
function uniqueIds(items) { const seen = new Set(); for(const item of items) { if(seen.has(item.id)) throw Error('Doppelte ID: '+item.id); seen.add(item.id); } }
export function emptyState() {
  return {schema:1, languages:Object.fromEntries(LANGUAGES.map(lang => [lang,{lessons:[],words:[],stats:{},hidden:[],cycles:{},catalogBatches:[]}]))};
}
export function validateWord(raw, language) {
  if(!raw || typeof raw !== 'object' || !LANGUAGES.includes(language)) throw Error('Ungültiges Wort.');
  const word = {id:id(raw.id), term:text(raw.term,'Wort',200), de:text(raw.de,'Deutsche Übersetzung',500), type:raw.type,
    lessonIds:[...new Set(raw.lessonIds || [])].map(id), addedAt:raw.addedAt || dayKey(), reference:raw.reference ? text(raw.reference,'Quelle',500) : '', examples:[]};
  if(!TYPES.includes(word.type) || !validDay(word.addedAt)) throw Error('Wortart oder Datum ungültig.');
  if(word.type === 'noun' && !/^(der|die|das)\s+\S/i.test(word.de)) throw Error('Deutsche Nomen bitte mit der, die oder das speichern.');
  if(word.type === 'noun' && language === 'es' && !/^(el|la|los|las)\s+\S/i.test(word.term)) throw Error('Spanische Nomen bitte mit el, la, los oder las speichern.');
  if(!Array.isArray(raw.examples || []) || (raw.examples || []).length > 20) throw Error('Zu viele Beispielsätze.');
  word.examples = (raw.examples || []).map(example => {
    const result = {sentence:text(example.sentence,'Lückensatz',2000),answer:text(example.answer,'Lösung',200),translation:example.translation ? text(example.translation,'Satzübersetzung',2000) : '',source:example.source,reference:example.reference ? text(example.reference,'Satzquelle',500) : ''};
    if(result.sentence.split('{{word}}').length !== 2) throw Error('Der Satz muss genau eine Lücke {{word}} enthalten.');
    if(!['textbook','generated'].includes(result.source)) throw Error('Satzquelle muss textbook oder generated sein.');
    if(example.acceptedAnswers!=null){if(!Array.isArray(example.acceptedAnswers)||example.acceptedAnswers.length>8)throw Error('Ungültige alternative Lösungen.');result.acceptedAnswers=[...new Set(example.acceptedAnswers.map(value=>text(value,'Alternative Lösung',200)))];}
    return result;
  });
  return word;
}
function validateLessons(raw) {
  if(!Array.isArray(raw) || raw.length > 1000) throw Error('Ungültige Lektionen.');
  const lessons = raw.map(item => ({id:id(item.id),name:text(item.name,'Lektionsname',120)})); uniqueIds(lessons); return lessons;
}
function validateWords(raw, language, lessons) {
  if(!Array.isArray(raw) || raw.length > 20000) throw Error('Ungültige Wörterliste.');
  const words = raw.map(w => validateWord(w,language)); uniqueIds(words);
  const lessonIds = new Set(lessons.map(l => l.id)), terms = new Set();
  for(const word of words) {
    if(word.lessonIds.some(l => !lessonIds.has(l))) throw Error('Unbekannte Lektion bei '+word.term);
    if(terms.has(normalize(word.term))) throw Error('Doppeltes Wort: '+word.term); terms.add(normalize(word.term));
  }
  return words;
}
export function validateVocabulary(raw) {
  if(!raw || raw.format !== 'school-vocabulary-v1' || !LANGUAGES.includes(raw.language)) throw Error('Erwartet wird school-vocabulary-v1 mit language en oder es.');
  const lessons = validateLessons(raw.lessons);
  return {format:raw.format,language:raw.language,...(raw.batchId?{batchId:id(raw.batchId)}:{}),lessons,words:validateWords(raw.words,raw.language,lessons)};
}
export function validateState(raw) {
  if(!raw || raw.schema !== 1 || !raw.languages || LANGUAGES.some(lang => !raw.languages[lang])) throw Error('Diese Sicherung gehört nicht zu School Language Trainer.');
  const state = emptyState();
  if(raw.preferences!=null){
    if(typeof raw.preferences!=='object'||Array.isArray(raw.preferences)||typeof raw.preferences.requireGermanArticles!=='boolean')throw Error('Ungültige Artikel-Einstellung.');
    state.preferences={requireGermanArticles:raw.preferences.requireGermanArticles};
  }
  for(const lang of LANGUAGES) {
    const input = raw.languages[lang], target = state.languages[lang];
    if(input.catalogBatches!=null&&(!Array.isArray(input.catalogBatches)||input.catalogBatches.length>10000))throw Error('Ungültige Importhistorie.');
    target.catalogBatches=[...new Set(input.catalogBatches||[])].map(id);
    target.lessons = validateLessons(input.lessons);
    target.words = validateWords(input.words,lang,target.lessons);
    const ids = new Set(target.words.map(w => w.id));
    if(!input.stats || typeof input.stats !== 'object' || Array.isArray(input.stats)) throw Error('Ungültiger Lernstand.');
    for(const [key, value] of Object.entries(input.stats)) {
      id(key); if(!ids.has(key) || !value || typeof value !== 'object') throw Error('Lernstand ohne Wort.');
      const st = {};
      for(const name of counters) { if((/^recall(Forward|Reverse)/.test(name)||/^article/.test(name)||/^writing/.test(name))&&value[name]==null)continue;const n = value[name] ?? 0; if(!Number.isSafeInteger(n) || n < 0) throw Error('Ungültiger Zähler.'); st[name] = n; }
      if(value.writingNeedsRetry!=null){if(typeof value.writingNeedsRetry!=='boolean')throw Error('Ungültige Schreibwiederholung.');st.writingNeedsRetry=value.writingNeedsRetry;}
      if(value.pendingArticle!=null){const p=value.pendingArticle,w=target.words.find(w=>w.id===key);if(!p||typeof p.scope!=='string'||p.scope.length>1000||!Number.isSafeInteger(p.index)||p.index<0||p.index>=germanArticles(w).length||typeof p.hadError!=='boolean')throw Error('Ungültige offene Artikelfrage.');st.pendingArticle={scope:p.scope,index:p.index,hadError:p.hadError};}
      if(typeof value.mastered !== 'boolean') throw Error('Ungültiger Lernstatus.'); st.mastered = value.mastered;
      if(!Array.isArray(value.workedDays) || value.workedDays.length > 366 || value.workedDays.some(d => !validDay(d))) throw Error('Ungültiger Tagesverlauf.');
      st.workedDays = [...new Set(value.workedDays)].sort(); target.stats[key] = st;
    }
    if(!Array.isArray(input.hidden) || input.hidden.some(key => !ids.has(key))) throw Error('Ungültige ausgeblendete Wörter.');
    target.hidden = [...new Set(input.hidden)];
    if(!input.cycles || typeof input.cycles !== 'object' || Array.isArray(input.cycles)) throw Error('Ungültige Lernrunden.');
    for(const [scope, seen] of Object.entries(input.cycles)) {
      if(scope.length > 1000 || !Array.isArray(seen) || seen.some(key => !ids.has(key))) throw Error('Ungültige Lernrunde.');
      Object.defineProperty(target.cycles,scope,{value:[...new Set(seen)],enumerable:true,writable:true,configurable:true});
    }
  }
  return state;
}
export function wordStats(book, wordId) {
  return book.stats[wordId] || {correct:0,wrong:0,streak:0,mastered:false,recallCorrect:0,recallWrong:0,contextCorrect:0,contextWrong:0,contextStreak:0,workedDays:[]};
}
export function isLearned(stats){return stats.streak>=3&&stats.recallCorrect>0&&stats.contextCorrect>0&&(stats.writingCorrect||0)>=3;}
export function recordAnswer(state,lang,wordId,mode,ok,day = dayKey(),direction='forward') {
  const next = clone(state), book = next.languages[lang];
  if(!book || !book.words.some(w => w.id === wordId) || book.hidden.includes(wordId) || !validDay(day) || typeof ok !== 'boolean' || !['cards','recall','context'].includes(mode)) throw Error('Ungültige Antwort.');
  const st = wordStats(book,wordId);
  if(mode === 'cards') { if(ok)delete st.pendingArticle;st[ok?'correct':'wrong']++; st.streak = ok ? st.streak+1 : 0; st.mastered = st.streak >= 3; }
  if(mode === 'recall') {if(!['forward','reverse'].includes(direction))throw Error('Ungültige Richtung.');st[ok?'recallCorrect':'recallWrong']++;const field='recall'+(direction==='reverse'?'Reverse':'Forward')+(ok?'Correct':'Wrong');st[field]=(st[field]||0)+1;}
  if(mode === 'context') { st[ok?'contextCorrect':'contextWrong']++; st.contextStreak = ok ? st.contextStreak+1 : 0; }
  st.workedDays = [...new Set([...st.workedDays,day])].sort().slice(-366); book.stats[wordId] = st;
  return next;
}
export function eligibleWords(book,{mode='cards',lessonIds=[],focus='unmastered',type='all',period='all',day=dayKey()}={}) {
  return book.words.filter(w => {
    const st = wordStats(book,w.id);
    if(book.hidden.includes(w.id) || (lessonIds.length && !w.lessonIds.some(l => lessonIds.includes(l))) || (type !== 'all' && w.type !== type)) return false;
    const age = (Date.parse(day+'T12:00:00Z')-Date.parse(w.addedAt+'T12:00:00Z'))/86400000;
    if(period !== 'all' && !(age >= 0 && age < Number(period))) return false;
    if(mode !== 'cards') return mode !== 'context' || w.examples.length > 0;
    if(focus === 'unmastered' && isLearned(st)) return false;
    if(focus === 'weak' && !(st.wrong || st.recallWrong || st.contextWrong || st.articleWrong)) return false;
    return true;
  });
}
export function scopeKey(options) { const base=[options.mode,options.mode==='cards'?options.focus:'all',options.type,options.period,[...options.lessonIds].sort().join(',')].join('|');return options.mode==='recall'?base+'|direction:'+(options.direction||'forward'):base; }
export function nextWord(book,options,random=Math.random) {
  const pool = eligibleWords(book,options), scope = scopeKey(options);
  if(!pool.length) return {word:null,scope,seen:[]};
  let seen = book.cycles[scope] || [], available = pool.filter(w => !seen.includes(w.id));
  if(!available.length) { seen = []; available = pool; }
  if(options.mode === 'recall') {
    const prefix=options.direction==='reverse'?'recallReverse':'recallForward';
    const score=w=>(wordStats(book,w.id)[prefix+'Correct']||0)-(wordStats(book,w.id)[prefix+'Wrong']||0);
    const min = Math.min(...available.map(score));available=available.filter(w=>score(w)===min);
  }
  return {word:available[Math.min(available.length-1,Math.floor(random()*available.length))],scope,seen:[...seen]};
}
export function summarize(book,day=dayKey()) {
  const words=book.words.filter(w=>!book.hidden.includes(w.id)), result={databaseTotal:book.words.length,databaseCorrect:0,databaseOnce:0,databaseTwice:0,databaseReady:0,databaseLearned:0,databaseRecallPassed:0,databaseContextPassed:0,databaseWritingPassed:0,databaseWritingMastered:0,total:words.length,today:0,ready:0,once:0,twice:0,learned:0,activeKnown:0,correct:0,wrong:0,recallCorrect:0,recallWrong:0,contextCorrect:0,contextWrong:0,contextReady:0,mistakes:0};
  for(const w of book.words){const st=wordStats(book,w.id);result.databaseCorrect+=st.correct;if(st.streak===1)result.databaseOnce++;if(st.streak===2)result.databaseTwice++;if(st.streak>=3)result.databaseReady++;if(isLearned(st))result.databaseLearned++;if(st.recallCorrect>0)result.databaseRecallPassed++;if(st.contextCorrect>0)result.databaseContextPassed++;if(st.writingCorrect>0)result.databaseWritingPassed++;if(st.writingCorrect>=3)result.databaseWritingMastered++;}
  for(const w of words) {
    const st=wordStats(book,w.id); if(st.workedDays.includes(day))result.today++; if(st.streak>=3)result.ready++;if(isLearned(st))result.learned++;
    if(st.streak === 1)result.once++; if(st.streak === 2)result.twice++;
    if(st.recallCorrect >= 3)result.activeKnown++;
    if(w.examples.length)result.contextReady++;
    if(st.wrong || st.recallWrong || st.contextWrong || st.articleWrong)result.mistakes++;
    for(const field of ['correct','wrong','recallCorrect','recallWrong','contextCorrect','contextWrong']) result[field]+=st[field];
  }
  return result;
}
export function activity(book,day=dayKey()) {
  return Array.from({length:7},(_,i)=>{const date=new Date(day+'T12:00:00');date.setDate(date.getDate()-6+i);const key=dayKey(date);const s=summarize(book,key);return {day:key,count:s.today,total:s.total};});
}
export function promptTerm(word,lang) { return lang === 'es' && word.type === 'noun' ? word.term.replace(/^(el|la|los|las)\s+/i,'') : word.term; }
export function recallPrompt(word,language,direction='forward'){return direction==='reverse'?{text:word.de,language:'de'}:{text:word.term,language};}
// Accept stored alternatives, retaining German articles and meaningful accents.
export function recallAnswers(word,direction='forward'){
  const raw=direction==='reverse'?word.term:word.de;
  const parts=direction==='reverse'?raw.split(/[;,]/):raw.split(/;|\s+\/\s+/);
  const answers=[raw];
  for(const part of parts){
    const clean=part.replace(/\s*\((?!a\))[^)]*\)/g,'').trim();
    const forms=clean.includes('(a)')?[clean.replace('(a)',''),clean.replace('(a)','a')]:[clean];
    for(const form of forms){
      const suffixes=form.split('/-'),base=suffixes.shift();
      for(const value of [base,...suffixes.map(suffix=>base+suffix)]){
        answers.push(value);
        if(direction==='reverse'&&/^to\s+/i.test(value))answers.push(value.replace(/^to\s+/i,''));
      }
    }
  }
  return [...new Set(answers.map(normalize))].filter(Boolean);
}
export function writingPage(book,options,pageSize=15){
  if(![10,15,20].includes(pageSize))throw Error('Ungültige Seitengröße.');
  const pool=eligibleWords(book,{...options,mode:'recall'}),scope=scopeKey({...options,mode:'recall'})+'|written';
  const pending=pool.filter(w=>(wordStats(book,w.id).writingCorrect||0)<3);
  const retries=pending.filter(w=>wordStats(book,w.id).writingNeedsRetry);
  const minimum=pending.length?Math.min(...pending.map(w=>wordStats(book,w.id).writingCorrect||0)):0;
  const words=(retries.length?retries:pending.filter(w=>(wordStats(book,w.id).writingCorrect||0)===minimum)).slice(0,pageSize);
  const baseline=Object.fromEntries(words.map(w=>{const s=wordStats(book,w.id);return [w.id,{correct:s.writingCorrect||0,wrong:s.writingWrong||0}];}));
  return {words,scope,seen:[],baseline,total:pool.length,done:pool.length-pending.length,retry:retries.length>0};
}
export function gradeWritingPage(state,language,page,answers,direction='forward',day=dayKey()){
  if(!page.words.length||page.words.length!==answers.length||new Set(page.words.map(w=>w.id)).size!==page.words.length||answers.some(a=>typeof a!=='string'||!a.trim()))throw Error('Bitte alle Zeilen ausfüllen.');
  if(typeof page.scope!=='string'||!page.scope.endsWith('|written')||!page.baseline)throw Error('Ungültiges Schreibblatt.');
  let next=state;const results=[];
  for(let i=0;i<page.words.length;i++){
    const w=state.languages[language].words.find(w=>w.id===page.words[i].id),st=w&&wordStats(state.languages[language],w.id),before=page.baseline[page.words[i].id];
    if(!w||!before||(st.writingCorrect||0)>=3||before.correct!==(st.writingCorrect||0)||before.wrong!==(st.writingWrong||0))throw Error('Dieses Schreibblatt wurde bereits geprüft oder geändert. Bitte neu starten.');
    const ok=checkRecall(answers[i],w,direction,germanArticlesRequired(state));results.push(ok);next=recordAnswer(next,language,w.id,'recall',ok,day,direction);
    const stats=next.languages[language].stats[w.id],field=ok?'writingCorrect':'writingWrong';stats[field]=(stats[field]||0)+1;stats.writingNeedsRetry=!ok;
  }
  return {state:next,results};
}
export function germanArticlesRequired(state){return state.preferences?.requireGermanArticles===true;}
export function shouldAskGermanArticle(state,word){return germanArticlesRequired(state)&&germanArticles(word).length>0;}
export function checkRecall(input,word,direction='forward',requireArticles=true){
  const answers=recallAnswers(word,direction);
  if(direction==='forward'&&!requireArticles)answers.push(...answers.map(a=>a.replace(/^(der|die|das)\s+/i,'')));
  return answers.includes(normalize(input));
}
export function matchingText(word,language,side,solved=false,requireArticles=true){if(side==='left')return solved?word.term:promptTerm(word,language);return solved||!requireArticles?word.de:word.de.replace(/\b(der|die|das)\s+/gi,'');}
export function germanArticles(word){
  if(!word)return [];
  return word.de.split(/;|\s+\/\s+/).map(value=>/^(der|die|das)\s+(.+)$/i.exec(value.trim())).filter(Boolean).map(match=>({article:match[1].toLowerCase(),noun:match[2]}));
}
export function beginArticleMatch(state,language,wordId,scope,day=dayKey()){
  const book=state.languages[language],w=book?.words.find(w=>w.id===wordId);if(!w||book.hidden.includes(wordId)||!germanArticles(w).length||typeof scope!=='string'||scope.length>1000||!validDay(day))throw Error('Ungültige Artikelfrage.');
  const next=clone(state),b=next.languages[language],st=wordStats(b,wordId);
  if(!st.pendingArticle){st.correct++;st.workedDays=[...new Set([...st.workedDays,day])].sort().slice(-366);st.pendingArticle={scope,index:0,hadError:false};b.stats[wordId]=st;}
  return next;
}
export function answerGermanArticle(state,language,wordId,article,day=dayKey()){
  const next=clone(state),b=next.languages[language],w=b?.words.find(w=>w.id===wordId),st=b?.stats[wordId],pending=st?.pendingArticle;
  if(!w||b.hidden.includes(wordId)||!pending||!['der','die','das'].includes(article)||!validDay(day))throw Error('Keine offene Artikelfrage.');
  const q=germanArticles(w)[pending.index],ok=q.article===article;
  const field=ok?'articleCorrect':'articleWrong';st[field]=(st[field]||0)+1;st.workedDays=[...new Set([...st.workedDays,day])].sort().slice(-366);
  if(!ok){pending.hadError=true;st.streak=0;st.mastered=false;}
  pending.index++;const complete=pending.index===germanArticles(w).length,credited=complete&&!pending.hadError;
  if(complete){if(credited){st.streak++;st.mastered=st.streak>=3;}b.cycles[pending.scope]=[...new Set([...(b.cycles[pending.scope]||[]),wordId])];delete st.pendingArticle;}
  return {state:next,ok,complete,credited,question:q};
}
export function shuffled(items,random=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function matchingRound(book,options,language,random=Math.random){
  const pool=eligibleWords(book,{...options,mode:'cards'}),scope=scopeKey({...options,mode:'cards'});let seen=book.cycles[scope]||[],available=pool.filter(w=>!seen.includes(w.id));
  if(!available.length){seen=[];available=pool;}
  const leftLabels=new Set(),rightLabels=new Set(),words=[];
  for(const word of shuffled(available,random)){const l=normalize(matchingText(word,language,'left')),r=normalize(matchingText(word,language,'right'));if(leftLabels.has(l)||rightLabels.has(r))continue;words.push(word);leftLabels.add(l);rightLabels.add(r);if(words.length===5)break;}
  const left=shuffled(words,random),right=shuffled(words,random);if(right.length>1&&right.every((w,i)=>w.id===left[i].id))right.push(right.shift());
  return {words,left,right,seen:[...seen],scope};
}
export function checkContext(input,example) { return [example.answer,...(example.acceptedAnswers||[])].some(answer=>normalize(input)===normalize(answer)); }
export function mergeVocabulary(state,raw) {
  const incoming=validateVocabulary(raw), next=clone(state), book=next.languages[incoming.language];let added=0;
  for(const lesson of incoming.lessons) { const old=book.lessons.find(l=>l.id===lesson.id); if(old && old.name!==lesson.name) throw Error('Lektions-ID bereits mit anderem Namen belegt: '+lesson.id); if(!old)book.lessons.push(lesson); }
  for(const word of incoming.words) {
    const sameId=book.words.find(w=>w.id===word.id), sameTerm=book.words.find(w=>normalize(w.term)===normalize(word.term));
    if(sameId && normalize(sameId.term)!==normalize(word.term)) throw Error('Wort-ID bereits belegt: '+word.id);
    const old=sameId || sameTerm;
    if(old) {
      if(normalize(old.de)!==normalize(word.de) || old.type!==word.type) throw Error('Abweichender Eintrag für '+word.term+'. Bitte zuerst im Wörterbuch bearbeiten.');
      old.lessonIds=[...new Set([...old.lessonIds,...word.lessonIds])];
      for(const example of word.examples) if(!old.examples.some(e=>e.sentence===example.sentence && e.answer===example.answer))old.examples.push(example);
    } else { book.words.push(word); added++; }
  }
  return {state:validateState(next),added};
}
export function backup(state) { return {format:FORMAT,exportedAt:new Date().toISOString(),state:validateState(state)}; }
export function parseBackup(raw) { if(raw?.format !== FORMAT)throw Error('Keine School-Trainer-Sicherung. Deutsch-Trainer-Daten werden nicht importiert.');return validateState(raw.state); }
export function applyCatalog(state,raw){
  const source=validateVocabulary(raw),book=state.languages[source.language];
  if(source.batchId&&book.catalogBatches?.includes(source.batchId))return {state,added:0};
  const result=mergeVocabulary(state,source);
  if(source.batchId)result.state.languages[source.language].catalogBatches.push(source.batchId);
  return result;
}
export function resetLanguage(state,language){
  if(!LANGUAGES.includes(language))throw Error('Ungültige Sprache.');
  const next=clone(state),previous=next.languages[language];
  next.languages[language]={...emptyState().languages[language],catalogBatches:[...(previous.catalogBatches||[])]};
  return validateState(next);
}
export function resetProgress(state,language){
  if(!LANGUAGES.includes(language))throw Error('Ungültige Sprache.');
  const next=clone(state);next.languages[language].stats={};next.languages[language].cycles={};
  return validateState(next);
}
