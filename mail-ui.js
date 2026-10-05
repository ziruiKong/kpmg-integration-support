function mailLabel(value, owner=true) {
  if (value === 'needs_authorization') return owner ? 'Connect Gmail' : 'Waiting';
  return ({sent:'Sent',failed:'Failed',unknown:'Check',sending:'Sending',pending:'Pending'})[value] || 'Not sent';
}
function gmailAuthError(error) {
  const type=String(error?.type||error?.error||'').toLowerCase();
  if (type.includes('popup_failed_to_open')) return 'Google blocked the authorization window. Open localhost in a regular browser and allow pop-ups, then try again.';
  if (type.includes('popup_closed')) return 'Google authorization was closed before access was granted. Try Connect your Gmail again.';
  return 'Google authorization could not start. Check that this signed-in account is an OAuth test user, then try again.';
}
function oauthState() { return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`); }
function clearOAuthHash() { history.replaceState(null, document.title, `${location.pathname}${location.search}`); }
function redirectToGoogle(config) {
  const state=oauthState();
  sessionStorage.setItem('kpmg-gmail-oauth-state',state);
  const params=new URLSearchParams({
    client_id:config.clientId,
    redirect_uri:`${location.origin}/`,
    response_type:'token',
    scope:'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    include_granted_scopes:'false',
    prompt:'consent',
    login_hint:signedInUser.email,
    state
  });
  const form=document.createElement('form'); form.method='GET'; form.action='https://accounts.google.com/o/oauth2/v2/auth';
  for (const [name,value] of params) { const input=document.createElement('input'); input.type='hidden'; input.name=name; input.value=value; form.append(input); }
  document.body.append(form); form.submit();
}
async function consumeRedirectToken(label, refresh) {
  const params=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'');
  if (!params.has('access_token') && !params.has('error')) return false;
  const expected=sessionStorage.getItem('kpmg-gmail-oauth-state'); sessionStorage.removeItem('kpmg-gmail-oauth-state');
  clearOAuthHash();
  if (params.get('state') !== expected) { label.textContent='Google authorization could not be verified. Start again.'; return true; }
  if (params.get('error')) { label.textContent=`Google authorization was not granted (${params.get('error')}).`; return true; }
  try { await api('/api/mail/connect',{method:'POST',body:JSON.stringify({accessToken:params.get('access_token')})}); await refresh(); showToast('Your Gmail is connected.'); }
  catch(error) { label.textContent=error.message; }
  return true;
}
async function setupMail() {
  if (!signedInUser || document.querySelector('#mailStatus')) return;
  const box=document.createElement('section'); box.className='panel'; box.style.marginBottom='18px';
  box.innerHTML='<div class="panel-body mail-compact"><div class="mail-title"><span class="list-icon">✉</span><strong>Gmail</strong><span id="mailStatus" class="subtitle" role="status"></span></div><div class="mail-actions"><button class="btn" id="connectMail" disabled>Connect</button><button class="btn ghost" id="redirectMail" hidden>Authorize</button><button class="btn ghost" id="disconnectMail" hidden>Disconnect</button></div></div>';
  document.querySelector('#bookingPage .page-head').after(box);
  const button=box.querySelector('#connectMail'), redirect=box.querySelector('#redirectMail'), disconnect=box.querySelector('#disconnectMail'), label=box.querySelector('#mailStatus');
  const refresh=async()=>{const s=await api('/api/mail/status');label.textContent=s.connected?`Connected · ${s.email}`:`Not connected · ${signedInUser.email}`;disconnect.hidden=!s.connected;redirect.hidden=s.connected;button.textContent=s.connected?'Reconnect':'Connect';return s;};
  try {
    const config=await refresh();
    if (await consumeRedirectToken(label,refresh)) { redirect.hidden=true; }
    if (!window.google?.accounts?.oauth2) await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=reject;document.head.append(script);});
    const client=google.accounts.oauth2.initTokenClient({
      client_id:config.clientId, scope:'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
      include_granted_scopes:false, hint:signedInUser.email,
      callback:async response=>{
        button.disabled=false;
        if(response.error){label.textContent=gmailAuthError(response);return;}
        try {await api('/api/mail/connect',{method:'POST',body:JSON.stringify({accessToken:response.access_token})});await refresh();showToast('Your Gmail is connected.');}
        catch(error){label.textContent=error.message;}
      }, error_callback:error=>{button.disabled=false;redirect.hidden=false;label.textContent=`${gmailAuthError(error)} Use the page authorization button if needed.`;}
    });
    button.disabled=false; button.onclick=()=>{button.disabled=true;try {client.requestAccessToken({prompt:'consent'});} catch(error) {button.disabled=false;label.textContent=gmailAuthError(error);}};
    redirect.onclick=()=>redirectToGoogle(config);
    disconnect.onclick=async()=>{await api('/api/mail/disconnect',{method:'POST',body:'{}'});await refresh();};
  } catch {label.textContent='Unable to prepare Gmail. Refresh to retry.';}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-mail-retry]'); if(!button)return;
  button.disabled=true;
  try {const booking=await api(`/api/mail/bookings/${encodeURIComponent(button.dataset.mailRetry)}/retry`,{method:'POST',body:'{}'});await load();showToast(mailLabel(booking.notificationStatus));}
  catch(error){showToast(error.message);button.disabled=false;}
});
window.addEventListener('workspace-ready',setupMail,{once:true});
if (signedInUser) setupMail();
