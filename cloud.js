import {t} from './i18n.js';
import {emptyState,validateState,clone} from './core.js';
const SESSION='school-language-trainer:cloud-session:v1';
const PREFIX='school-language-trainer:cloud-cache:v1:';
export function createCloud(config,adapter,env={storage:localStorage,fetch:globalThis.fetch.bind(globalThis)}) {
  const enabled=Boolean(config.url&&config.publishableKey);
  let session=null,account=null,cache=null,ready=false,blocked=false,busy=false,timer=null;
  const status=(message)=>adapter.status(message);
  const lock=()=>adapter.lock(!ready||blocked,account?.role==='parent');
  const cacheKey=()=>PREFIX+config.url+':'+session.user.id;
  function persist(){env.storage.setItem(cacheKey(),JSON.stringify(cache));}
  async function request(path,body,auth=true) {
    if(auth){
      if(!session)throw Error(t(239));
      if(session.expires_at*1000<Date.now()+60000){const token=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token},false);session={...token,expires_at:Math.floor(Date.now()/1000)+token.expires_in};env.storage.setItem(SESSION,JSON.stringify({project:config.url,session}));}
    }
    const response=await env.fetch(config.url+path,{method:body?'POST':'GET',headers:{apikey:config.publishableKey,...(auth?{Authorization:'Bearer '+session.access_token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if(!response.ok){
      const details=await response.json().catch(()=>({}));
      const code=details.error_code||details.code;
      if(code==='invalid_credentials'||details.error_description==='Invalid login credentials')throw Error(t(240));
      if(code==='email_not_confirmed')throw Error(t(241));
      if(code==='PGRST205'||code==='42P01')throw Error(t(242));
      if(response.status===403)throw Error(t(243));
      throw Error(t(244)+response.status+t(245));
    }
    return response.status===204?null:response.json();
  }
  async function pull(){const rows=await request('/rest/v1/school_progress?select=user_id,revision,state&user_id=eq.'+encodeURIComponent(account.student_id));return rows[0]||null;}
  function conflict(){blocked=true;lock();status(t(246));adapter.conflict(true);}
  async function sync(){
    if(!enabled||!ready||blocked||busy)return;busy=true;
    try{
      if(cache.pending){
        const sent=clone(cache.state),revision=cache.revision;
        const rows=await request('/rest/v1/rpc/save_school_progress',{expected_revision:revision,next_state:sent});
        if(!rows.length){conflict();return;}
        cache.revision=rows[0].revision;cache.pending=JSON.stringify(cache.state)!==JSON.stringify(sent);persist();status(cache.pending?t(493):t(247));
      }else{
        const revision=cache.revision,row=await pull();if(cache.pending||cache.revision!==revision)return;
        if(row&&row.revision!==cache.revision){cache={revision:row.revision,state:validateState(row.state),pending:false,role:account.role,student_id:account.student_id};persist();adapter.apply(cache.state);status(t(248));}
      }
    }catch(error){status(t(249)+error.message);}
    finally{busy=false;}
  }
  async function connect(){
    ready=false;blocked=false;lock();adapter.conflict(false);
    const cached=env.storage.getItem(cacheKey());cache=cached?JSON.parse(cached):null;
    try{
      const accounts=await request('/rest/v1/school_accounts?select=role,student_id&user_id=eq.'+encodeURIComponent(session.user.id));
      account=accounts[0];if(!account)throw Error(t(250));
      const row=await pull();
      if(cache?.pending){
        validateState(cache.state);adapter.apply(cache.state);ready=true;
        if((row?.revision??-1)!==cache.revision){conflict();return {ready:false,conflict:true};}
      }else if(row){cache={revision:row.revision,state:validateState(row.state),pending:false,role:account.role,student_id:account.student_id};persist();adapter.apply(cache.state);ready=true;}
      else if(account.role==='student'){
        // Starting a cloud profile never silently uploads a device's private local profile.
        const rows=await request('/rest/v1/rpc/save_school_progress',{expected_revision:-1,next_state:emptyState()});
        if(!rows.length)throw Error(t(251));
        cache={revision:rows[0].revision,state:validateState(rows[0].state),pending:false,role:account.role,student_id:account.student_id};persist();adapter.apply(cache.state);ready=true;
      }else throw Error(t(252));
      lock();status(account.role==='parent'?t(494):t(253));await sync();return {ready:!blocked,offline:false};
    }catch(error){
      if(cache?.state&&['student','parent'].includes(cache.role)){
        account={role:cache.role,student_id:cache.student_id};adapter.apply(validateState(cache.state));ready=true;lock();status(t(495)+error.message);return {ready:true,offline:true};
      }else{ready=false;lock();status(error.message);throw error;}
    }
  }
  return {
    enabled,
    get connected(){return ready&&!blocked;},
    get identity(){return session?.user?.email||'';},
    get readonly(){return account?.role==='parent';},
    async init(){
      if(!enabled){status(t(254));return;}
      lock();
      try{const saved=JSON.parse(env.storage.getItem(SESSION)||'null');if(saved?.project===config.url){session=saved.session;await connect();}else status(t(255));}catch(error){status(error.message);}
      timer=setInterval(sync,15000);addEventListener('online',sync);addEventListener('focus',sync);
    },
    async login(email,password){
      if(!enabled)throw Error(t(256));
      if(busy)throw Error(t(257));
      if(cache?.pending)throw Error(t(258));
      status(t(173));
      const token=await request('/auth/v1/token?grant_type=password',{email:email.trim(),password},false);session={...token,expires_at:Math.floor(Date.now()/1000)+token.expires_in};env.storage.setItem(SESSION,JSON.stringify({project:config.url,session}));return connect();
    },
    save(state){
      if(!ready||blocked||account?.role!=='student')throw Error(t(259));
      const before=cache;cache={...cache,state:validateState(state),pending:true};
      try{persist();}catch(error){cache=before;blocked=true;lock();throw error;}
      status(t(260));queueMicrotask(sync);
    },
    snapshot(){return cache?clone(cache.state):null;},
    async loadCloud(){
      if(busy)throw Error(t(261));const row=await pull();if(!row)throw Error(t(262));
      cache={revision:row.revision,state:validateState(row.state),pending:false,role:account.role,student_id:account.student_id};persist();blocked=false;ready=true;adapter.apply(cache.state);adapter.conflict(false);lock();status(t(263));
    },
    logout(){if(busy||cache?.pending)throw Error(t(496));session=null;account=null;cache=null;ready=false;env.storage.removeItem(SESSION);adapter.apply(emptyState());lock();status(t(506));},
    sync,
    dispose(){clearInterval(timer);}
  };
}
