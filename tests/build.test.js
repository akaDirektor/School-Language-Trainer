import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildSite} from '../prepare-public.mjs';
test('published HTML and every module dependency use matching content fingerprints',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'school-release-test-'));
  try{
    const release=await buildSite(directory),html=await readFile(path.join(directory,'index.html'),'utf8');
    for(const original of ['app.js','bootstrap.js','app.css'])assert.ok(html.includes(release.names[original]));
    for(const [original,filename] of Object.entries(release.names)){
      const content=await readFile(path.join(directory,filename),'utf8');const digest=createHash('sha256').update(content).digest('hex').slice(0,16);assert.ok(filename.includes(digest));
      if(original.endsWith('.js'))for(const match of content.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)){assert.match(match[1],/\.[a-f0-9]{16}\.js$/);await access(path.join(directory,match[1]));}
    }
    const worker=await readFile(path.join(directory,'sw.js'),'utf8');for(const asset of release.assets)assert.ok(worker.includes(asset));assert.ok(worker.includes(release.version));assert.ok(!html.includes('app.js?v='));
    const second=await buildSite(directory);assert.equal(second.version,release.version);
  }finally{await rm(directory,{recursive:true,force:true});}
});
