const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kpmg-mail-test-'));
process.env.BOOKING_DATA_FILE=path.join(temp,'data.json');
const auth=require('./auth'),mail=require('./mail');
const USER={id:'test-owner',email:'ray20040626@gmail.com'};
const originalDeliver=mail.deliver;
auth.route=async(req,res)=>{req.user=USER;return false;};
const {handle}=require('./server');
test('booking persistence, per-user routing and retry protection',async()=>{
  const server=http.createServer((req,res)=>handle(req,res));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const post=async(url,body)=>{const response=await fetch(origin+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  try {
    const payload={slotId:'slot_zirui_01',requesterTeam:'rag',topic:'Test booking',description:'Unit test only',notificationTarget:'other@example.com'};
    const results=await Promise.all([post('/api/bookings',payload),post('/api/bookings',payload)]);
    assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);
    const booked=results.find(x=>x.status===201).data;
    assert.equal(booked.notificationStatus,'needs_authorization');
    assert.equal(booked.notificationTarget,USER.email);
    assert.equal(booked.notificationSender,USER.email);
    let stored=JSON.parse(fs.readFileSync(process.env.BOOKING_DATA_FILE));
    assert.equal(stored.bookings.length,1);
    assert.equal(stored.availability.find(x=>x.id===payload.slotId).status,'booked');
    let sends=0;
    mail.deliver=async()=>{sends++;await new Promise(r=>setTimeout(r,20));return {status:'sent',messageId:'test-message'};};
    const retries=await Promise.all([post(`/api/mail/bookings/${booked.id}/retry`,{}),post(`/api/mail/bookings/${booked.id}/retry`,{})]);
    assert.deepEqual(retries.map(x=>x.status).sort(),[200,409]);assert.equal(sends,1);
    assert.equal((await post(`/api/mail/bookings/${booked.id}/retry`,{})).status,409);
    stored=JSON.parse(fs.readFileSync(process.env.BOOKING_DATA_FILE));
    assert.equal(stored.notifications[0].messageId,'test-message');
    assert.equal(stored.bookings[0].notificationStatus,'sent');
    const mime=mail.message({...booked,topic:'Hello\r\nBcc: stranger@example.com'},USER.email);
    assert.match(mime,/From: ray20040626@gmail.com/); assert.match(mime,/To: ray20040626@gmail.com/); assert.equal(mime.includes('\r\nBcc:'),false);
  } finally {mail.deliver=originalDeliver;await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true});}
});

test('each user sends with their own Gmail authorization',async()=>{
  const other={id:'other-user',email:'other@example.com'};
  mail._authorizations.set('test-owner',{token:'token-a',email:USER.email,expiresAt:Date.now()+600000});
  mail._authorizations.set('other-user',{token:'token-b',email:other.email,expiresAt:Date.now()+600000});
  const calls=[];
  const fakeFetch=async(url,options)=>{calls.push(options);return {status:200,ok:true,json:async()=>({id:'message-other'})};};
  const booking={id:'booking-other',member:'Olivia He',requesterTeamName:'Retrieval & RAG',ownerEmail:other.email,recipientEmail:other.email,date:'2026-10-05',start:'10:00',end:'11:00',topic:'Own sender test',description:'test'};
  const result=await mail.deliver(booking,other,fakeFetch);
  assert.equal(result.status,'sent');
  assert.equal(calls[0].headers.Authorization,'Bearer token-b');
  const raw=JSON.parse(calls[0].body).raw;
  const mime=Buffer.from(raw,'base64url').toString();
  assert.match(mime,/From: other@example.com/);
  assert.doesNotMatch(mime,/From: ray20040626@gmail.com/);
  mail._authorizations.clear();
});
