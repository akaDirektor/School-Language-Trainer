import {messages} from './i18n-catalog.js';
// Validation keeps its historical German messages outside the browser UI.
let language='de';
const sourceIds=new Map(),allIds=new Map();
messages.forEach((row,id)=>{sourceIds.set(row[0].trim(),id);for(const value of row)allIds.set(value,id);});
const rendered=new Map();
export function t(key,args=[]){
  if(typeof key==='string'){
    const saved=rendered.get(key);if(saved)return t(saved.key,saved.args);
    const id=allIds.get(key);if(id==null)return key;key=id;
  }
  const row=messages[key];if(!row)return '';
  let text=row[language==='en'?1:language==='es'?2:0],index=0;
  text=text.replace(/\$\{[^}]+\}/g,()=>String(args[index++]??'')).replace(/\{(\d+)\}/g,(_,i)=>String(args[Number(i)]??''));
  if(args.length)rendered.set(text,{key,args:[...args]});
  return text;
}
export function readUiLanguage(){try{return localStorage.getItem('school-language-trainer:ui-language:v1')==='es'?'es':'en';}catch{return 'en';}}
export function setUiLanguage(value){language=['en','es'].includes(value)?value:'de';}
export const uiLocale=()=>language==='es'?'es-ES':language==='en'?'en-GB':'de-DE';
export function translateMessage(value){
  if(allIds.has(value)||rendered.has(value))return t(value);
  // Composite error messages may include an email, HTTP code or file name.
  // Only replace complete known UI fragments, never walk vocabulary content.
  const keys=[...allIds.keys()].filter(key=>key.trim().length>=8).sort((a,b)=>b.length-a.length);
  const pattern=new RegExp(keys.map(key=>key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  return value.replace(pattern,match=>t(allIds.get(match)));
}
export function formatReference(value){
  return value.replace(/aus dem sichtbaren Kontext ergänzt|selbst erstelltes Beispiel|Originalbeispiel|Buchform:|\bFoto\b/g,word=>t(allIds.get(word)));
}
let staticText=null,staticAttributes=null;
export function localizeStatic(value){
  setUiLanguage(value);if(typeof document==='undefined')return;
  document.documentElement.lang=language;
  try{localStorage.setItem('school-language-trainer:ui-language:v1',language);}catch{}
  if(!staticText){
    staticText=[];staticAttributes=[];
    const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      if(node.parentElement?.closest('script,style'))continue;
      const id=sourceIds.get(node.nodeValue.trim());if(id==null)continue;
      staticText.push({node,id,prefix:node.nodeValue.match(/^\s*/)[0],suffix:node.nodeValue.match(/\s*$/)[0]});
    }
    for(const element of document.querySelectorAll('[title],[placeholder],[aria-label],[alt]'))for(const name of ['title','placeholder','aria-label','alt']){
      const raw=element.getAttribute(name),id=raw!=null?sourceIds.get(raw.trim()):null;if(id!=null)staticAttributes.push({element,name,id});
    }
  }
  for(const {node,id,prefix,suffix}of staticText)if(node.isConnected)node.nodeValue=prefix+t(id).trim()+suffix;
  for(const {element,name,id}of staticAttributes)if(element.isConnected)element.setAttribute(name,t(id).trim());
  document.title=t(264);const manifest=document.querySelector('link[rel=manifest]');if(manifest)manifest.setAttribute('href','./manifest-'+language+'.webmanifest');
}

if(typeof document!=='undefined'){
  document.addEventListener('invalid',event=>{
    const input=event.target;if(!input.validity||input.validity.customError)return;
    input.setCustomValidity(t(input.validity.valueMissing?507:input.validity.typeMismatch?508:509));input.dataset.localizedValidity='true';
  },true);
  document.addEventListener('input',event=>{const input=event.target;if(input.dataset?.localizedValidity){input.setCustomValidity('');delete input.dataset.localizedValidity;}},true);
}
