import {emptyState,validateWord} from './core.js';
export function demoState() {
  const state=emptyState();
  const sets={en:[['apple','der Apfel','noun','I eat an {{word}}.','apple','Ich esse einen Apfel.'],['book','das Buch','noun','This {{word}} is interesting.','book','Dieses Buch ist interessant.'],['school','die Schule','noun','We go to {{word}}.','school','Wir gehen zur Schule.'],['read','lesen','verb','I {{word}} every day.','read','Ich lese jeden Tag.'],['small','klein','adjective','The room is {{word}}.','small','Das Zimmer ist klein.']],es:[['la manzana','der Apfel','noun','Como {{word}}.','una manzana','Ich esse einen Apfel.'],['el libro','das Buch','noun','Leo {{word}}.','un libro','Ich lese ein Buch.'],['la escuela','die Schule','noun','Voy a {{word}}.','la escuela','Ich gehe zur Schule.'],['leer','lesen','verb','Me gusta {{word}}.','leer','Ich lese gern.'],['pequeño','klein','adjective','El perro es {{word}}.','pequeño','Der Hund ist klein.']]};
  for(const [lang,rows] of Object.entries(sets)) {
    const book=state.languages[lang];book.lessons=[{id:'demo',name:'Demo · Erste Wörter'}];
    book.words=rows.map((r,i)=>validateWord({id:'demo-'+i,term:r[0],de:r[1],type:r[2],lessonIds:['demo'],reference:'Demonstration – kein Schulbuchimport',examples:[{sentence:r[3],answer:r[4],translation:r[5],source:'generated',reference:'Demo'}]},lang));
    // One ready word makes recall and context inspectable without polluting real learning data.
    book.stats['demo-0']={correct:3,wrong:0,streak:3,mastered:true,recallCorrect:0,recallWrong:0,contextCorrect:0,contextWrong:0,contextStreak:0,workedDays:[]};
  }
  return state;
}
