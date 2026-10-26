import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const sourceRoot=fileURLToPath(new URL('.',import.meta.url));
const fingerprint=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
export async function buildSite(destination=path.join(sourceRoot,'public')){
  await mkdir(destination,{recursive:true});const names={},assets=[];
  for(const filename of ['core.js','cloud-config.js','demo.js','cloud.js','bootstrap.js','app.js','app.css']){
    let content=await readFile(path.join(sourceRoot,filename),'utf8');
    for(const [original,hashed] of Object.entries(names))content=content.split('./'+original+"'").join('./'+hashed+"'").split('./'+original+'"').join('./'+hashed+'"');
    const extension=path.extname(filename),hashed=filename.slice(0,-extension.length)+'.'+fingerprint(content)+extension;
    names[filename]=hashed;assets.push('./'+hashed);await writeFile(path.join(destination,hashed),content);
  }
  for(const filename of ['manifest.webmanifest','icon.svg','icon-180.png','icon-192.png','icon-512.png','data/en.json','data/es.json','flags/gb.svg','flags/es.svg']){
    await mkdir(path.dirname(path.join(destination,filename)),{recursive:true});await cp(path.join(sourceRoot,filename),path.join(destination,filename));assets.push('./'+filename);
  }
  let html=await readFile(path.join(sourceRoot,'index.html'),'utf8');
  for(const original of ['app.js','bootstrap.js','app.css']){const pattern=new RegExp(original.replaceAll('.','\\.')+'(?:\\?[^"\\s]*)?','g');html=html.replace(pattern,names[original]);}
  await writeFile(path.join(destination,'index.html'),html);await writeFile(path.join(destination,'.nojekyll'),'');
  const version=fingerprint(html+assets.join('|')),worker=await readFile(path.join(sourceRoot,'sw.js'),'utf8');
  const generated=worker.replace(/const CACHE=.*?;/,"const CACHE='school-language-trainer-shell-"+version+"';").replace(/const FILES=.*?;/,'const FILES='+JSON.stringify(['./','./index.html',...assets])+';');
  await writeFile(path.join(destination,'sw.js'),generated);return {version,names,assets};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const result=await buildSite();console.log('Prepared site release '+result.version);}
