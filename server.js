const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const auth = require('./auth');
const mail = require('./mail');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_FILE = process.env.BOOKING_DATA_FILE || path.join(ROOT, 'data.json');

const teams = [
  { id:'data', name:'Data Engineering / SEC Data', leads:['Qiwei (Emma) Shan'], members:['Ruoxi Li','Sally Xu','Zijian Wang','Tianyang Jiang','Xianzhe Ji','Ju-Ting Sun'], focus:'Prepare, structure, clean, and document the financial / SEC data used across the project.' },
  { id:'rag', name:'Retrieval & RAG', leads:['Yu Yan'], members:['Xiangxinrui Shan','Xintong Yu','Yulei Ding','Haipei Chu'], focus:'Develop and test document retrieval and RAG approaches for complex financial questions.' },
  { id:'graph', name:'Knowledge Graph / GraphRAG', leads:['Adeline Setiawan'], members:['Wenyu Zhou','I-Yuan Chen','Claudia (Ziyi) Wang','Yuhan Jiang','Qiye Di'], focus:'Develop knowledge-graph representations and GraphRAG retrieval approaches.' },
  { id:'agents', name:'Agents / Backend / Chat Infrastructure', leads:['Muzhen Yu'], members:['Yixuan Zhang','Jixuan Liu','Lidan Yu','Jiahui Yang','Yichen Liu','Lingfei Zhang'], focus:'Develop agent workflows, backend logic, and chat / infrastructure components.' },
  { id:'eval', name:'Evaluation & Testing', leads:['Chuan Yeu','Song'], members:['Binyu Wang','Ruofei Duan','Shuhan Bian','Feng Shenyi','Yupin Wang','Bo Yuan','Fei Huang'], focus:'Design benchmarks, compare methods, analyze errors, and evaluate accuracy, efficiency, and reliability.' },
  { id:'use-cases', name:'Business Use Cases / UI / Storytelling', leads:['Rija Zahid','Evelyn Huang'], members:['Rain Yu','Thao Nguyen (Mia)','Yuetong Huang','Zhiyi Zhu'], focus:'Translate technical results into financial-services use cases, user-facing experiences, and clear project narratives.' },
  { id:'pm', name:'Project Management', leads:['Qianxun(Violet) Li'], members:['Stacy chen','Siqi Liu','wenxi che','xinyu'], focus:'Coordinate timelines, dependencies, deliverables, meetings, and communication across the project.' },
  { id:'integration', name:'Integration / Cross-Team Support', leads:['Olivia He'], members:['Jiahao Hu','Yinglin Wang','Yuhan Wang','Zirui Kong'], focus:'Connect workstreams, support end-to-end integration and testing, and collaborate with Agents and other technical teams as needed.' }
];

const staffEmails = Object.freeze({
  'Olivia He': 'xh2763@columbia.edu'
});

const availability = [
  ['slot_olivia_01','Olivia He','2026-10-05','10:00','11:00'], ['slot_olivia_02','Olivia He','2026-10-07','14:00','15:00'],
  ['slot_jiahao_01','Jiahao Hu','2026-10-05','13:00','14:00'], ['slot_jiahao_02','Jiahao Hu','2026-10-08','10:00','11:00'],
  ['slot_yinglin_01','Yinglin Wang','2026-10-06','10:00','11:00'], ['slot_yinglin_02','Yinglin Wang','2026-10-09','15:00','16:00'],
  ['slot_yuhan_01','Yuhan Wang','2026-10-07','10:00','11:00'], ['slot_yuhan_02','Yuhan Wang','2026-10-09','10:00','11:00'],
  ['slot_zirui_01','Zirui Kong','2026-10-08','14:00','15:00'], ['slot_zirui_02','Zirui Kong','2026-10-09','14:00','15:00']
].map(([id, member, date, start, end]) => ({id, member, teamId:'integration', date, start, end, status:'available'}));

const seed = {
  teams,
  availability,
  helpRequests: [],
  bookings: [],
  notifications: [],
  activity: [{id:'act_seed', type:'system', message:'Integration support is online', team:'Integration', createdAt:'2026-10-04T21:00:00.000Z'}]
};

function readData() { if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2)); return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeData(data) { const temp=DATA_FILE+'.tmp'; fs.writeFileSync(temp, JSON.stringify(data, null, 2)); fs.renameSync(temp, DATA_FILE); }
function send(res, status, payload) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(payload)); }
function parseBody(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', chunk => raw += chunk); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('请求体必须是合法 JSON')); } }); }); }
function id(prefix) { return `${prefix}_${crypto.randomUUID().slice(0,8)}`; }
function addActivity(data, message, team='Integration', type='update') { data.activity.unshift({id:id('act'), type, message, team, createdAt:new Date().toISOString()}); }
function catalog() { return [
  {method:'GET', path:'/api/teams', description:'获取八个 workstream 的负责人、成员和职责', example:{}},
  {method:'GET', path:'/api/availability?team=integration', description:'获取 Integration 成员的可预约时段', example:{}},
  {method:'GET', path:'/api/bookings', description:'查看已经预约/占用的时段和事项', example:{}},
  {method:'POST', path:'/api/help-requests', description:'首页“需要帮助”提交支援请求', example:{requesterTeam:'rag', subject:'需要协助验证检索结果', description:'请协助安排一次端到端联调。', urgency:'normal'}},
  {method:'GET', path:'/api/help-requests', description:'查看所有支援请求及处理状态', example:{}},
  {method:'POST', path:'/api/bookings', description:'预约一个可用工作时段并锁定 slot', example:{slotId:'slot_olivia_01', requesterTeam:'rag', topic:'RAG 联调', description:'需要确认检索接口的输入输出。'}},
  {method:'PATCH', path:'/api/bookings/:id/cancel', description:'取消预约并释放工作时段', example:{}},
  {method:'GET', path:'/api/activity', description:'查看所有预约和支援记录', example:{}}
]; }

async function handle(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(403); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); const p = url.pathname;
  if (await auth.route(req,res,p,send,parseBody)) return;
  let data = readData(); data.notifications ||= [];
  if (p === '/mail-ui.js' && req.method === 'GET') { res.writeHead(200, {'Content-Type':'application/javascript', 'Cache-Control':'no-store'}); return res.end(fs.readFileSync(path.join(ROOT,'mail-ui.js'))); }
  if (p.startsWith('/api/mail/')) {
    if (p === '/api/mail/status' && req.method === 'GET') return send(res,200,{...mail.status(req.user),clientId:auth.clientId()});
    if (p === '/api/mail/connect' && req.method === 'POST') {
      const input=await parseBody(req);
      try { return send(res,200,await mail.connect(req.user,input.accessToken)); }
      catch { return send(res,400,{error:'Unable to verify Gmail authorization. Connect the same Gmail account you used to sign in.'}); }
    }
    if (p === '/api/mail/disconnect' && req.method === 'POST') { mail.disconnect(req.user); return send(res,200,mail.status(req.user)); }
    const retry=p.match(/^\/api\/mail\/bookings\/([^/]+)\/retry$/);
    if (retry && req.method === 'POST') {
      const booking=data.bookings.find(x=>x.id===retry[1]);
      if (!booking || booking.status!=='booked') return send(res,404,{error:'Active booking not found.'});
      if (booking.ownerId !== req.user.id) return send(res,403,{error:'Only the booking owner can send this email.'});
      const notification=data.notifications.find(x=>x.bookingId===booking.id && x.mode==='email');
      if (!notification || !['needs_authorization','failed'].includes(notification.status)) return send(res,409,{error:'This notification cannot be retried. It may already have been sent.'});
      return send(res,200,await sendBookingEmail(booking.id,req.user));
    }
    return send(res,404,{error:'Not found'});
  }
  if (p === '/login.js' && req.method === 'GET') { res.writeHead(200, {'Content-Type':'application/javascript', 'Cache-Control':'no-store'}); return res.end(fs.readFileSync(path.join(ROOT,'login.js'))); }
  if (p === '/api/health' && req.method === 'GET') return send(res, 200, {ok:true, service:'kmpg-integration-api', version:'2.0.0', time:new Date().toISOString()});
  if (p === '/api/api-catalog' && req.method === 'GET') return send(res, 200, catalog());
  if (p === '/api/teams' && req.method === 'GET') return send(res, 200, data.teams);
  if (p === '/api/availability' && req.method === 'GET') { const team = url.searchParams.get('team'); return send(res, 200, data.availability.filter(x => !team || x.teamId === team)); }
  if (p === '/api/bookings' && req.method === 'GET') return send(res, 200, data.bookings);
  if (p === '/api/help-requests' && req.method === 'GET') return send(res, 200, data.helpRequests);
  if (p === '/api/activity' && req.method === 'GET') return send(res, 200, data.activity.slice(0, Number(url.searchParams.get('limit') || 50)));
  if (p === '/api/help-requests' && req.method === 'POST') {
    const input = await parseBody(req); for (const key of ['requesterTeam','subject','description']) if (!input[key]) return send(res, 400, {error:`缺少字段: ${key}`});
    data=readData();
    const team = data.teams.find(x => x.id === input.requesterTeam); if (!team) return send(res, 400, {error:'requesterTeam 不存在'});
    const item = {id:id('help'), ownerId:req.user.id, ownerEmail:req.user.email, requesterTeam:input.requesterTeam, subject:input.subject, description:input.description, urgency:input.urgency || 'normal', status:'open', createdAt:new Date().toISOString()}; data.helpRequests.unshift(item); addActivity(data, `Help request created: ${item.subject}`, team.name, 'help-request'); writeData(data); return send(res, 201, item);
  }
  if (p === '/api/bookings' && req.method === 'POST') {
    const input = await parseBody(req); for (const key of ['slotId','requesterTeam','topic','description']) if (!input[key]) return send(res, 400, {error:`缺少字段: ${key}`});
    for (const key of ['slotId','requesterTeam','topic','description']) if (typeof input[key]!=='string' || input[key].length>4000) return send(res,400,{error:'Booking fields must be text of at most 4000 characters.'});
    data=readData(); data.notifications ||= [];
    const slot = data.availability.find(x => x.id === input.slotId); if (!slot) return send(res, 404, {error:'预约时段不存在'}); if (slot.status === 'booked') return send(res, 409, {error:'这个时段已经被预约，请选择其他时段'});
    const team = data.teams.find(x => x.id === input.requesterTeam); if (!team) return send(res, 400, {error:'requesterTeam 不存在'});
    const notificationMode = 'email'; const notificationTarget = staffEmails[slot.member] || req.user.email;
    const booking = {id:id('booking'), ownerId:req.user.id, ownerEmail:req.user.email, notificationSender:req.user.email, recipientEmail:req.user.email, slotId:slot.id, member:slot.member, date:slot.date, start:slot.start, end:slot.end, requesterTeam:team.id, requesterTeamName:team.name, topic:input.topic, description:input.description, notificationMode, notificationTarget, status:'booked', createdAt:new Date().toISOString()}; slot.status = 'booked'; slot.bookingId = booking.id; data.bookings.unshift(booking);
    booking.notificationStatus='pending';
    data.notifications.unshift({id:id('notification'), bookingId:booking.id, mode:'email', target:notificationTarget, status:'pending', createdAt:booking.createdAt});
    addActivity(data, `${slot.member} booked for ${booking.topic}`, team.name, 'booking'); writeData(data);
    return send(res, 201, await sendBookingEmail(booking.id,req.user));
  }
  const cancel = p.match(/^\/api\/bookings\/([^/]+)\/cancel$/); if (cancel && req.method === 'PATCH') { const booking = data.bookings.find(x => x.id === cancel[1]); if (!booking) return send(res, 404, {error:'预约记录不存在'}); if (booking.ownerId !== req.user.id) return send(res, 403, {error:'Only the booking owner can cancel this booking.'}); if (booking.status === 'cancelled') return send(res, 409, {error:'该预约已经取消'}); booking.status = 'cancelled'; const slot = data.availability.find(x => x.id === booking.slotId); if (slot) { slot.status = 'available'; delete slot.bookingId; } addActivity(data, `取消预约：${booking.topic}`, booking.requesterTeamName, 'booking-cancel'); writeData(data); return send(res, 200, booking); }
  if (p === '/api/requests' && req.method === 'GET') return send(res, 200, data.helpRequests);
  if (p === '/' || p === '/index.html') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}); return res.end(fs.readFileSync(path.join(ROOT, 'index.html'))); }
  return send(res, 404, {error:'Not found'});
}

async function sendBookingEmail(bookingId,user) {
  const current=readData(), booking=current.bookings.find(x=>x.id===bookingId);
  const notification=current.notifications.find(x=>x.bookingId===bookingId && x.mode==='email');
  if (['sending','sent','unknown'].includes(notification.status)) return booking;
  notification.status='sending'; booking.notificationStatus='sending'; writeData(current);
  const result=await mail.deliver(booking,user);
  const latest=readData(), saved=latest.bookings.find(x=>x.id===bookingId);
  Object.assign(latest.notifications.find(x=>x.id===notification.id),result);
  saved.notificationStatus=result.status; saved.notificationError=result.error || null;
  addActivity(latest,`Test email ${result.status.replaceAll('_',' ')}: ${saved.topic}`,saved.requesterTeamName,'notification');
  writeData(latest); return saved;
}
function recoverNotifications() {
  const data=readData(); let changed=false;
  for (const n of data.notifications || []) if (['sending','pending'].includes(n.status) && n.mode==='email') {
    n.status=n.status==='sending'?'unknown':'needs_authorization';
    const b=data.bookings.find(x=>x.id===n.bookingId); if(b)b.notificationStatus=n.status;
    changed=true;
  }
  if(changed)writeData(data);
}
if (require.main === module) {
  recoverNotifications();
  http.createServer((req, res) => handle(req, res).catch(() => send(res, 500, {error:'The request could not be completed. Refresh to check your booking before retrying.'}))).listen(PORT, () => console.log(`KMPG Integration API v2 running at http://localhost:${PORT}`));
}
module.exports={handle};
