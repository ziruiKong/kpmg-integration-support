let signedInUser=null;
const app=document.querySelector('.app');
app.inert=true;
const gate=document.createElement('div');
gate.className='modal-backdrop open';
gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-label','Sign in');
gate.innerHTML='<div class="modal"><div class="eyebrow">KPMG Practicum</div><h2 style="margin-top:16px">Integration</h2><p class="subtitle">Sign in to continue.</p><div id="googleButton"></div><p id="loginStatus" role="status" class="subtitle">Checking…</p></div>';
document.body.append(gate);
const status=document.querySelector('#loginStatus');
async function authFetch(url,options={}) {
  const r=await fetch(url,{...options,headers:{'Content-Type':'application/json'}});
  const data=await r.json();if(!r.ok)throw Error(data.error);return data;
}
async function showGoogle() {
  const config=await authFetch('/auth/config');
  if(!config.clientId){status.textContent='Google sign-in is being set up. Please contact your workspace owner.';return;}
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';
  script.onerror=()=>status.textContent='Google could not load. Please refresh and try again.';
  script.onload=()=>{
    google.accounts.id.initialize({client_id:config.clientId,nonce:config.nonce,callback:async response=>{
      status.textContent='Signing in…';
      try {await authFetch('/auth/google',{method:'POST',body:JSON.stringify({credential:response.credential})});location.reload();}
      catch(e){status.textContent=e.message+' Refresh to retry.';}
    }});
    google.accounts.id.renderButton(document.querySelector('#googleButton'),{theme:'outline',size:'large',shape:'pill'});
    status.textContent='Use Google to continue.';
  };document.head.append(script);
}
window.startWorkspace=async()=>{
  try {
    if(location.protocol==='file:'){location.replace('http://localhost:4173');return;}
    const session=await authFetch('/auth/session');
    if(!session.user){await showGoogle();return;}
    signedInUser=session.user;gate.remove();app.inert=false;
    document.querySelector('.avatar').textContent=session.user.name.slice(0,2).toUpperCase();
    document.querySelector('.avatar').title=session.user.email;
    const logout=document.createElement('button');logout.className='btn small';logout.textContent='Sign out';
    logout.onclick=async()=>{await authFetch('/auth/logout',{method:'POST',body:'{}'});location.reload();};
    document.querySelector('.top-actions').append(logout);
    await load();
    window.dispatchEvent(new Event('workspace-ready'));
  }catch(e){status.textContent='Unable to connect. Please reload the workspace.';}
};
