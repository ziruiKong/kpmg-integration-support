const {OAuth2Client} = require('google-auth-library');
const {clientId} = require('./auth');
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const authorizations = new Map();
function emailOf(user) { return String(user?.email || '').trim().toLowerCase(); }
function userKey(user) { return String(user?.id || emailOf(user)); }
function status(user) {
  const key = userKey(user), authorization = authorizations.get(key);
  if (!authorization || authorization.expiresAt <= Date.now() + 30000) {
    authorizations.delete(key);
    return {connected:false, email:emailOf(user), expiresAt:null};
  }
  return {connected:true, email:authorization.email, expiresAt:authorization.expiresAt};
}
async function connect(user, token) {
  if (!user?.id || !emailOf(user) || typeof token !== 'string' || token.length > 8192) throw Error('Invalid authorization.');
  const info = await new OAuth2Client().getTokenInfo(token);
  const scopes = String(info.scope || info.scopes || '').split(/[\s,]+/).filter(Boolean);
  if (info.aud !== clientId() || emailOf({email:info.email}) !== emailOf(user) || !scopes.includes(SCOPE) || Number(info.expiry_date) <= Date.now()+30000) throw Error('Authorize the signed-in Gmail account with send permission.');
  authorizations.set(userKey(user), {token, email:emailOf(user), expiresAt:Number(info.expiry_date)});
  return status(user);
}
function disconnect(user) { authorizations.delete(userKey(user)); }
function recipientFor(booking) { return booking.recipientEmail || booking.ownerEmail; }
function message(booking, senderEmail) {
  const recipient = recipientFor(booking);
  const content = ['KPMG Practicum Integration booking', '', `Booking: ${booking.id}`, `Staff member: ${booking.member}`, `Team: ${booking.requesterTeamName}`, `Requested by: ${booking.ownerEmail}`, `Time: ${booking.date} ${booking.start}–${booking.end} (America/New_York)`, `Topic: ${booking.topic}`, '', booking.description, '', `Sender: ${senderEmail}`, `Recipient: ${recipient}`, 'Staff routing will be enabled after the Integration roster email is configured.', 'Open the local workspace: http://localhost:4173/'].join('\n');
  return [`From: ${senderEmail}`, `To: ${recipient}`, `Subject: =?UTF-8?B?${Buffer.from('KPMG support booking — '+booking.topic).toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(content).toString('base64').match(/.{1,76}/g).join('\r\n')].join('\r\n');
}
async function deliver(booking, user, fetchImpl=fetch) {
  const current = status(user);
  if (!current.connected) return {status:'needs_authorization', error:'Connect your Gmail account to send this notification.'};
  const authorization = authorizations.get(userKey(user));
  try {
    const response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {method:'POST', headers:{Authorization:`Bearer ${authorization.token}`, 'Content-Type':'application/json'}, body:JSON.stringify({raw:Buffer.from(message(booking, authorization.email)).toString('base64url')}), signal:AbortSignal.timeout(15000)});
    if (response.status === 401) { disconnect(user); return {status:'needs_authorization',error:'Your Gmail authorization expired. Reconnect Gmail.'}; }
    if (!response.ok) return {status:response.status>=500?'unknown':'failed',error:response.status===403?'Google rejected sending. Check Gmail API activation and send permission.':`Gmail returned HTTP ${response.status}.`};
    const result = await response.json();
    if (!result.id) return {status:'unknown',error:'Gmail did not return a message ID. Check Sent before retrying.'};
    return {status:'sent',messageId:result.id,sentAt:new Date().toISOString(),senderEmail:authorization.email,recipientEmail:recipientFor(booking)};
  } catch { return {status:'unknown',error:'Sending could not be confirmed. Check Gmail Sent before any manual resend.'}; }
}
module.exports = {SCOPE,status,connect,disconnect,message,deliver,recipientFor,_authorizations:authorizations};
