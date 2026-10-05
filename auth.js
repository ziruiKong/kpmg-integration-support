const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client();
const sessions = new Map();
const challenges = new Map();
const origin = process.env.APP_ORIGIN || 'http://localhost:4173';
const cookie = (name, value, seconds) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${origin.startsWith('https:') ? '; Secure' : ''}`;
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(s=>s.trim().split('='))); }
function clientId() {
  const file = path.join(__dirname, 'auth.config.json');
  return process.env.GOOGLE_CLIENT_ID || (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')).googleClientId : '') || '';
}
function session(req) {
  const key = cookies(req).session;
  const s = sessions.get(key);
  if (!s || s.expires <= Date.now()) { sessions.delete(key); return null; }
  return s.user;
}
async function route(req,res,p,send,body) {
  const user = session(req);
  if (!['GET','HEAD'].includes(req.method) && req.headers.origin !== origin) {
    send(res,403,{error:'Request origin is not allowed.'}); return true;
  }
  if(p==='/auth/session' && req.method==='GET') {
    send(res,200,{user,configured:!!clientId()}); return true;
  }
  if(p==='/auth/config' && req.method==='GET') {
    for (const [k,v] of challenges) if(v.expires<Date.now()) challenges.delete(k);
    const key=crypto.randomBytes(32).toString('hex'), nonce=crypto.randomBytes(32).toString('hex');
    challenges.set(key,{nonce,expires:Date.now()+300000});
    res.setHeader('Set-Cookie',cookie('login_challenge',key,300));
    send(res,200,{clientId:clientId(),nonce}); return true;
  }
  if(p==='/auth/google' && req.method==='POST') {
    if(!clientId()) { send(res,503,{error:'Google sign-in is not configured yet.'}); return true; }
    const key=cookies(req).login_challenge, challenge=challenges.get(key);
    challenges.delete(key);
    if(!challenge || challenge.expires<Date.now()) { send(res,401,{error:'Sign-in expired. Please try again.'}); return true; }
    try {
      const input=await body(req);
      if(typeof input.credential!=='string') throw Error();
      const ticket=await client.verifyIdToken({idToken:input.credential,audience:clientId()});
      const p=ticket.getPayload();
      if(!p.email_verified || !p.sub || p.nonce!==challenge.nonce) throw Error();
      const user={id:p.sub,email:p.email,name:p.name || p.email};
      sessions.delete(cookies(req).session);
      const token=crypto.randomBytes(32).toString('hex');
      sessions.set(token,{user,expires:Date.now()+8*3600000});
      res.setHeader('Set-Cookie',[cookie('session',token,28800),cookie('login_challenge','',0)]);
      send(res,200,{user});
    } catch { send(res,401,{error:'Google sign-in could not be verified. Please try again.'}); }
    return true;
  }
  if(p==='/auth/logout' && req.method==='POST') {
    sessions.delete(cookies(req).session);res.setHeader('Set-Cookie',cookie('session','',0));send(res,200,{ok:true});return true;
  }
  if(p.startsWith('/api/') && p!=='/api/health' && !user) { send(res,401,{error:'Sign in with Google to continue.'}); return true; }
  req.user=user;
  return false;
}
module.exports={route,clientId};
