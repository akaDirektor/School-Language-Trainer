// Settings must remain usable even when the application module cannot start.
(() => {
  const get=id=>document.getElementById(id);
  function settings(){const dialog=get('toolsDialog');if(dialog&&!dialog.open)dialog.showModal();}
  function recovery(){let es=document.documentElement.lang==='es';try{es=es||localStorage.getItem('school-language-trainer:ui-language:v1')==='es';}catch{}
    const message=es?'La aplicación no se ha cargado por completo. Tus datos guardados se conservan.':'The app could not fully load. Your saved data is safe.';
    const text=get('appRecovery')?.querySelector('span');if(text)text.textContent=message;
    if(get('toolsRecovery')?.firstChild)get('toolsRecovery').firstChild.textContent=message+' ';
    for(const id of ['refreshApp','refreshAppInTools'])if(get(id))get(id).textContent=es?'Actualizar aplicación ↻':'Update app ↻';
    const panel=get('appRecovery');if(panel)panel.hidden=false;if(get('toolsRecovery'))get('toolsRecovery').hidden=false;}
  if(!get('openTools').onclick)get('openTools').onclick=settings;if(!get('accountAction').onclick)get('accountAction').onclick=settings;
  if(!get('startTraining').onclick){get('startTraining').disabled=false;get('startTraining').onclick=()=>{recovery();settings();};}
  document.querySelectorAll('[data-close]').forEach(button=>{if(!button.onclick)button.onclick=()=>get(button.dataset.close)?.close();});
  const refresh=()=>{const url=new URL(location.href);url.searchParams.set('update',String(Date.now()));location.replace(url.href);};get('refreshApp').onclick=refresh;get('refreshAppInTools').onclick=refresh;
  addEventListener('error',event=>{if(event.message||event.target?.tagName==='SCRIPT')recovery();},true);
  addEventListener('unhandledrejection',recovery);
  document.addEventListener('click',event=>{if(document.documentElement.dataset.controlsReady==='true')return;const button=event.target.closest?.('button');if(!button||button.matches('[data-close],#openTools,#accountAction,#refreshApp,#refreshAppInTools'))return;event.preventDefault();event.stopImmediatePropagation();recovery();settings();},true);
  const timer=setTimeout(()=>{if(document.documentElement.dataset.controlsReady!=='true')recovery();},15000);
  document.addEventListener('school-controls-ready',()=>{clearTimeout(timer);get('appRecovery').hidden=true;get('toolsRecovery').hidden=true;});
})();
