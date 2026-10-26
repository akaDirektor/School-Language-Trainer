import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloud} from '../cloud.js';
import {emptyState} from '../core.js';
function setup({parent=false,conflict=false,offline=false,missingAccount=false,invalidCredentials=false}={}){
  const store=new Map();let remote={user_id:'student',revision:0,state:emptyState()},applied=null,locked=null,readonly=null,conflicted=false,writes=0,fail=offline;
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const adapter={status(){},apply:s=>{applied=s;},lock:(l,r)=>{locked=l;readonly=r;},conflict:c=>{conflicted=c;}};
  const env={storage,fetch:async(url,options)=>{
    if(invalidCredentials&&url.includes('/auth/'))return {ok:false,status:400,json:async()=>({error_code:'invalid_credentials'})};
    if(fail&&!url.includes('/auth/'))throw Error('offline');
    let body;
    if(url.includes('/auth/'))body={user:{id:parent?'parent':'student'},access_token:'test-only',refresh_token:'test-only',expires_in:3600};
    else if(url.includes('school_accounts'))body=missingAccount?[]:[{student_id:'student',role:parent?'parent':'student'}];
    else if(url.includes('/rpc/')){writes++;const data=JSON.parse(options.body);if(conflict||data.expected_revision!==remote.revision)body=[];else{remote={...remote,revision:remote.revision+1,state:data.next_state};body=[remote];}}
    else body=[remote];
    return {ok:true,status:200,json:async()=>structuredClone(body)};
  }};
  const cloud=createCloud({url:'https://new-project.supabase.co',publishableKey:'public-test-key'},adapter,env);
  return {cloud,store,get applied(){return applied;},get locked(){return locked;},get readonly(){return readonly;},get conflicted(){return conflicted;},get writes(){return writes;},get remote(){return remote;},set offline(v){fail=v;}};
}
test('student loads and saves through a revision-checked snapshot',async()=>{const s=setup();await s.cloud.login('student@example.test','test-only');assert.equal(s.locked,false);assert.equal(s.readonly,false);const next=emptyState();next.languages.en.lessons=[{id:'unit1',name:'Unit 1'}];s.cloud.save(next);await new Promise(resolve=>setImmediate(resolve));assert.equal(s.writes,1);assert.equal(s.remote.state.languages.en.lessons[0].id,'unit1');assert.ok([...s.store.keys()].every(k=>k.startsWith('school-language-trainer:')));});
test('parent profile is read-only in the client',async()=>{const s=setup({parent:true});await s.cloud.login('parent@example.test','test-only');assert.equal(s.readonly,true);assert.throws(()=>s.cloud.save(emptyState()),/darf/);assert.equal(s.writes,0);});
test('concurrent revision conflict blocks training and retains pending state',async()=>{const s=setup({conflict:true});await s.cloud.login('student@example.test','test-only');const next=emptyState();next.languages.en.lessons=[{id:'pending',name:'Pending'}];s.cloud.save(next);await new Promise(resolve=>setImmediate(resolve));assert.equal(s.conflicted,true);assert.equal(s.locked,true);assert.equal(s.cloud.snapshot().languages.en.lessons[0].id,'pending');assert.throws(()=>s.cloud.save(emptyState()));});
test('offline answers remain pending and cannot be discarded by logout',async()=>{const s=setup();await s.cloud.login('student@example.test','test-only');s.offline=true;const next=emptyState();next.languages.en.lessons=[{id:'offline',name:'Offline'}];s.cloud.save(next);await new Promise(resolve=>setImmediate(resolve));assert.throws(()=>s.cloud.logout(),/synchronisieren/);assert.equal(s.cloud.snapshot().languages.en.lessons[0].id,'offline');s.offline=false;await s.cloud.sync();assert.equal(s.remote.state.languages.en.lessons[0].id,'offline');});
test('parent is never granted writing after offline cache restoration',async()=>{const s=setup({parent:true});await s.cloud.login('parent@example.test','test-only');s.offline=true;await s.cloud.login('parent@example.test','test-only');assert.equal(s.readonly,true);assert.throws(()=>s.cloud.save(emptyState()));});
test('successful login explicitly reports a ready session',async()=>{const s=setup();const result=await s.cloud.login('student@example.test','test-only');assert.deepEqual(result,{ready:true,offline:false});assert.equal(s.cloud.connected,true);});
test('valid credentials with no student mapping reject instead of silently appearing successful',async()=>{const s=setup({missingAccount:true});await assert.rejects(s.cloud.login('student@example.test','test-only'),/noch nicht als Schüler/);assert.equal(s.cloud.connected,false);assert.equal(s.locked,true);});
test('incorrect credentials produce a specific visible-message result',async()=>{const s=setup({invalidCredentials:true});await assert.rejects(s.cloud.login('student@example.test','wrong'),/E-Mail oder Passwort ist falsch/);assert.equal(s.cloud.connected,false);});
