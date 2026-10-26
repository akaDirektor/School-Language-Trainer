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
      if(!session)throw Error('Bitte anmelden.');
      if(session.expires_at*1000<Date.now()+60000){const token=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token},false);session={...token,expires_at:Math.floor(Date.now()/1000)+token.expires_in};env.storage.setItem(SESSION,JSON.stringify({project:config.url,session}));}
    }
    const response=await env.fetch(config.url+path,{method:body?'POST':'GET',headers:{apikey:config.publishableKey,...(auth?{Authorization:'Bearer '+session.access_token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if(!response.ok){
      const details=await response.json().catch(()=>({}));
      const code=details.error_code||details.code;
      if(code==='invalid_credentials'||details.error_description==='Invalid login credentials')throw Error('E-Mail oder Passwort ist falsch. Bitte erneut versuchen.');
      if(code==='email_not_confirmed')throw Error('Die E-Mail ist noch nicht bestätigt. In Supabase muss Auto Confirm User aktiviert sein.');
      if(code==='PGRST205'||code==='42P01')throw Error('Die Cloud-Tabellen fehlen noch. Bitte die Einrichtung im neuen Supabase-Projekt abschließen.');
      if(response.status===403)throw Error('Keine Zugriffsberechtigung. Bitte die Schüler-Zuordnung und Cloud-Einrichtung prüfen.');
      throw Error('Die Cloud-Anfrage wurde abgelehnt (HTTP '+response.status+'). Bitte Zugangsdaten und Einrichtung prüfen.');
    }
    return response.status===204?null:response.json();
  }
  async function pull(){const rows=await request('/rest/v1/school_progress?select=user_id,revision,state&user_id=eq.'+encodeURIComponent(account.student_id));return rows[0]||null;}
  function conflict(){blocked=true;lock();status('Versionskonflikt. Dein lokaler Lernstand bleibt erhalten. Erst sichern, dann die Cloud-Version laden.');adapter.conflict(true);}
  async function sync(){
    if(!enabled||!ready||blocked||busy)return;busy=true;
    try{
      if(cache.pending){
        const sent=clone(cache.state),revision=cache.revision;
        const rows=await request('/rest/v1/rpc/save_school_progress',{expected_revision:revision,next_state:sent});
        if(!rows.length){conflict();return;}
        cache.revision=rows[0].revision;cache.pending=JSON.stringify(cache.state)!==JSON.stringify(sent);persist();status(cache.pending?'Wird synchronisiert …':'In der Cloud gespeichert');
      }else{
        const revision=cache.revision,row=await pull();if(cache.pending||cache.revision!==revision)return;
        if(row&&row.revision!==cache.revision){cache={revision:row.revision,state:validateState(row.state),pending:false,role:account.role,student_id:account.student_id};persist();adapter.apply(cache.state);status('Lernstand aus der Cloud aktualisiert');}
      }
    }catch(error){status('Offline · Änderungen bleiben auf diesem Gerät. '+error.message);}
    finally{busy=false;}
  }
  async function connect(){
    ready=false;blocked=false;lock();adapter.conflict(false);
    const cached=env.storage.getItem(cacheKey());cache=cached?JSON.parse(cached):null;
    try{
      const accounts=await request('/rest/v1/school_accounts?select=role,student_id&user_id=eq.'+encodeURIComponent(session.user.id));
      account=accounts[0];if(!account)throw Error('Dieses Konto ist noch nicht als Schüler- oder Elternkonto eingerichtet.');
      const row=await pull();
      if(cache?.pending){
        validateState(cache.state);adapter.apply(cache.state);ready=true;
        if((row?.revision??-1)!==cache.revision){conflict();return {ready:false,conflict:true};}
      }else if(row){cache={revision:row.revision,state:validateState(row.state),pending:false,role:account.role,student_id:account.student_id};persist();adapter.apply(cache.state);ready=true;}
      else if(account.role==='student'){
        // Starting a cloud profile never silently uploads a device's private local profile.
        const rows=await request('/rest/v1/rpc/save_school_progress',{expected_revision:-1,next_state:emptyState()});
        if(!rows.length)throw Error('Das Profil wurde gerade auf einem anderen Gerät angelegt. Bitte erneut anmelden.');
        cache={revision:rows[0].revision,state:validateState(rows[0].state),pending:false,role:account.role,student_id:account.student_id};persist();adapter.apply(cache.state);ready=true;
      }else throw Error('Der Schüler muss sich zuerst einmal anmelden.');
      lock();status(account.role==='parent'?'Elternansicht · nur lesen':'Cloud verbunden');await sync();return {ready:!blocked,offline:false};
    }catch(error){
      if(cache?.state&&['student','parent'].includes(cache.role)){
        account={role:cache.role,student_id:cache.student_id};adapter.apply(validateState(cache.state));ready=true;lock();status('Offline · gespeicherter Lernstand dieses Kontos. '+error.message);return {ready:true,offline:true};
      }else{ready=false;lock();status(error.message);throw error;}
    }
  }
  return {
    enabled,
    get connected(){return ready&&!blocked;},
    get identity(){return session?.user?.email||'';},
    get readonly(){return account?.role==='parent';},
    async init(){
      if(!enabled){status('Nur auf diesem Gerät · Cloud noch nicht eingerichtet');return;}
      lock();
      try{const saved=JSON.parse(env.storage.getItem(SESSION)||'null');if(saved?.project===config.url){session=saved.session;await connect();}else status('Für die Synchronisation bitte anmelden.');}catch(error){status(error.message);}
      timer=setInterval(sync,15000);addEventListener('online',sync);addEventListener('focus',sync);
    },
    async login(email,password){
      if(!enabled)throw Error('Die neue Supabase-Verbindung ist noch nicht eingerichtet.');
      if(busy)throw Error('Bitte laufende Synchronisation abwarten.');
      if(cache?.pending)throw Error('Zuerst Änderungen synchronisieren oder sichern.');
      status('Anmeldung wird geprüft …');
      const token=await request('/auth/v1/token?grant_type=password',{email:email.trim(),password},false);session={...token,expires_at:Math.floor(Date.now()/1000)+token.expires_in};env.storage.setItem(SESSION,JSON.stringify({project:config.url,session}));return connect();
    },
    save(state){
      if(!ready||blocked||account?.role!=='student')throw Error('Dieses Konto darf den Lernstand gerade nicht ändern.');
      const before=cache;cache={...cache,state:validateState(state),pending:true};
      try{persist();}catch(error){cache=before;blocked=true;lock();throw error;}
      status('Lokal gesichert · Synchronisation …');queueMicrotask(sync);
    },
    snapshot(){return cache?clone(cache.state):null;},
    async loadCloud(){
      if(busy)throw Error('Bitte kurz warten.');const row=await pull();if(!row)throw Error('Kein Cloud-Lernstand gefunden.');
      cache={revision:row.revision,state:validateState(row.state),pending:false,role:account.role,student_id:account.student_id};persist();blocked=false;ready=true;adapter.apply(cache.state);adapter.conflict(false);lock();status('Cloud-Version geladen');
    },
    logout(){if(busy||cache?.pending)throw Error('Vor dem Abmelden bitte synchronisieren.');session=null;account=null;cache=null;ready=false;env.storage.removeItem(SESSION);adapter.apply(emptyState());lock();status('Abgemeldet.');},
    sync,
    dispose(){clearInterval(timer);}
  };
}
