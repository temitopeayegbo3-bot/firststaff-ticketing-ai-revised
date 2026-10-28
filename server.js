const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch {}
let mailTransport = null;
function getMailTransport(){ if(!nodemailer || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null; if(!mailTransport) mailTransport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'false')==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}); return mailTransport; }
function sendEmail(to,subject,text){ const transport=getMailTransport(); if(!transport || !to) return; transport.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to,subject,text}).catch(err=>console.error('Email notification failed:',err.message)); }

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const demoUsers = [
  { id:'u1', name:'Temitope Ayegbo', email:'staff@firststaff.local', password:'Staff@123', role:'staff', department:'Operations' },
  { id:'u2', name:'Line Executive', email:'executive@firststaff.local', password:'Exec@123', role:'executive', department:'Management' },
  { id:'u3', name:'Skyline Travels', email:'vendor@firststaff.local', password:'Vendor@123', role:'vendor', department:'Travel Vendor', vendorId:'v1' },
  { id:'u9', name:'AeroConnect', email:'vendor2@firststaff.local', password:'Vendor2@123', role:'vendor', department:'Travel Vendor', vendorId:'v2' },
  { id:'u10', name:'FirstWing Travel Services', email:'vendor3@firststaff.local', password:'Vendor3@123', role:'vendor', department:'Travel Vendor', vendorId:'v3' },
  { id:'u4', name:'Ticket Issuance', email:'ticketing@firststaff.local', password:'Ticket@123', role:'ticketing', department:'Ticket Issuance' },
  { id:'u5', name:'Protocol Unit', email:'protocol@firststaff.local', password:'Protocol@123', role:'protocol', department:'Protocol' },
  { id:'u6', name:'Store Officer', email:'store@firststaff.local', password:'Store@123', role:'store', department:'Store' },
  { id:'u7', name:'System Administrator', email:'admin@firststaff.local', password:'Admin@123', role:'admin', department:'IT' },
  { id:'u8', name:'Procurement Team', email:'procurement@firststaff.local', password:'Procure@123', role:'procurement', department:'Procurement' }
];
function initialDB() {
  return {
    users: demoUsers,
    sessions: {},
    requests: [],
    notifications: [],
    ledger: [],
    vendors: [
      { id:'v1', name:'Skyline Travels', email:'skyline@example.com', active:true },
      { id:'v2', name:'AeroConnect', email:'aeroconnect@example.com', active:true },
      { id:'v3', name:'FirstWing Travel Services', email:'firstwing@example.com', active:true }
    ]
  };
}
let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = initialDB(); save(); }
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
if(!db.users.some(u=>u.role==='procurement')) { db.users.push({id:'u8',name:'Procurement Team',email:'procurement@firststaff.local',password:'Procure@123',role:'procurement',department:'Procurement'}); save(); }
if(!db.users.some(u=>u.vendorId==='v1')) { const u=db.users.find(u=>u.role==='vendor'); if(u) u.vendorId='v1'; }
if(!db.users.some(u=>u.vendorId==='v2')) db.users.push({id:'u9',name:'AeroConnect',email:'vendor2@firststaff.local',password:'Vendor2@123',role:'vendor',department:'Travel Vendor',vendorId:'v2'});
if(!db.users.some(u=>u.vendorId==='v3')) db.users.push({id:'u10',name:'FirstWing Travel Services',email:'vendor3@firststaff.local',password:'Vendor3@123',role:'vendor',department:'Travel Vendor',vendorId:'v3'});
if(db.vendors) db.vendors.forEach(v=>{if(v.active===undefined)v.active=true}); save();
function id(prefix='id'){ return prefix+'_'+crypto.randomBytes(5).toString('hex'); }
function now(){ return new Date().toISOString(); }
function notify(userId, title, message, requestId) {
  db.notifications.unshift({ id:id('n'), userId, title, message, requestId, createdAt:now(), read:false });
  const recipient=db.users.find(u=>u.id===userId); if(recipient&&recipient.email&&!recipient.email.endsWith('.local')) sendEmail(recipient.email,`FirstStaff: ${title}`,`${message}\n\nRequest ID: ${requestId||'N/A'}`);
}
function notifyRole(role, title, message, requestId) {
  db.users.filter(u=>u.role===role || (role==='executive' && u.role==='admin')).forEach(u=>notify(u.id,title,message,requestId));
  const queueEmail=role==='protocol'?(process.env.PROTOCOL_QUEUE_EMAIL||process.env.QUEUE_NOTIFICATION_EMAIL):role==='executive'?process.env.EXECUTIVE_QUEUE_EMAIL:null;
  if(queueEmail) sendEmail(queueEmail,`FirstStaff queue: ${title}`,`${message}\n\nOpen FirstStaff Travel Desk to review the request.`);
}
function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(data));
}
function parseBody(req){ return new Promise((resolve,reject)=>{ let s=''; req.on('data',c=>{s+=c; if(s.length>10e6) reject(new Error('Request too large (maximum 6 MB attachment).'));}); req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch{reject(new Error('Invalid JSON'));}}); }); }
function publicUser(u){ const {password,...rest}=u; return rest; }
function auth(req) {
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const userId=db.sessions[token];
  return db.users.find(u=>u.id===userId);
}
function requireAuth(user,res){ if(!user){json(res,401,{error:'Please sign in again.'}); return false;} return true; }
function allowed(user, roles){ return roles.includes(user.role) || user.role==='admin'; }
function serveStatic(req,res,urlPath){
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if(p==='/' || p==='') p='/index.html';
  const full=path.normalize(path.join(ROOT,p));
  if(!full.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(full,(err,content)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}
    const ext=path.extname(full);
    const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(content);
  });
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'});return res.end();}
  if(!url.pathname.startsWith('/api/')) return serveStatic(req,res,url.pathname);
  try {
    const body= ['POST','PATCH','PUT'].includes(req.method)?await parseBody(req):{};
    if(req.method==='POST' && url.pathname==='/api/login'){
      const email=String(body.email||'').toLowerCase(), password=String(body.password||'');
      const user=db.users.find(u=>u.email.toLowerCase()===email && u.password===password);
      if(!user) return json(res,401,{error:'Invalid email or password.'});
      const token=crypto.randomBytes(32).toString('hex'); db.sessions[token]=user.id; save();
      return json(res,200,{token,user:publicUser(user)});
    }
    const user=auth(req);
    if(!requireAuth(user,res)) return;
    if(req.method==='POST' && url.pathname==='/api/logout'){
      const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); delete db.sessions[token]; save(); return json(res,200,{ok:true});
    }
    if(req.method==='GET' && url.pathname==='/api/me') return json(res,200,{user:publicUser(user)});
    if(req.method==='GET' && url.pathname==='/api/system/email-status'){ if(!allowed(user,['admin'])) return json(res,403,{error:'Admin access only.'}); return json(res,200,{configured:!!getMailTransport(),provider:'SMTP',hint:'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in the deployment environment.'}); }
    if(req.method==='GET' && url.pathname==='/api/dashboard'){
      const own=db.requests.filter(r=>user.role==='staff'?r.createdBy===user.id:user.role==='vendor'?(Array.isArray(r.assignedVendorIds)&&r.assignedVendorIds.includes(user.vendorId)):true);
      const counts={total:own.length,pending:own.filter(r=>['awaiting_line_approval','awaiting_quotes','awaiting_passenger_selection','awaiting_cost_approval','awaiting_ticket','awaiting_protocol','awaiting_store_debit'].includes(r.status)).length,completed:own.filter(r=>r.status==='completed').length,spend:db.ledger.reduce((n,l)=>n+l.amount,0)};
      const requests=(user.role==='staff'||user.role==='vendor')?own:db.requests;
      return json(res,200,{counts,requests:requests.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),notifications:db.notifications.filter(n=>n.userId===user.id).slice(0,20),ledger:user.role==='store'||user.role==='admin'?db.ledger:[]});
    }
    if(req.method==='GET' && url.pathname==='/api/vendors'){
      return json(res,200,{vendors:db.vendors.filter(v=>v.active)});
    }
    if(req.method==='POST' && url.pathname==='/api/requests'){
      if(!allowed(user,['staff'])) return json(res,403,{error:'Only staff can submit flight requests.'});
      const required=['origin','destination','departureDate','passengerName','passengerEmail','purpose'];
      for(const k of required) if(!String(body[k]||'').trim()) return json(res,400,{error:`${k} is required.`});
      if(!body.approvalDocument || !body.approvalDocument.data || !body.approvalDocument.name) return json(res,400,{error:'Upload the required approval document before submitting.'});
      const r={id:id('TR'), reference:'FS-'+Date.now().toString().slice(-7), createdBy:user.id, createdByName:user.name,
        passengerName:String(body.passengerName).trim(), passengerEmail:String(body.passengerEmail).trim(),
        passengerPhone:String(body.passengerPhone||'').trim(), origin:String(body.origin).trim(), destination:String(body.destination).trim(),
        tripType:body.tripType==='return'?'return':'oneway', returnDate:body.returnDate||'', departureDate:body.departureDate,
        travelClass:body.travelClass||'Economy', travelType:body.travelType||'domestic', purpose:String(body.purpose).trim(),
        costCentre:String(body.costCentre||'').trim(), storeName:String(body.storeName||'').trim(), notes:String(body.notes||'').trim(), approvalDocument:{name:String(body.approvalDocument.name),mimeType:String(body.approvalDocument.mimeType||'application/octet-stream'),data:String(body.approvalDocument.data),uploadedBy:user.name,uploadedAt:now()}, status:'awaiting_protocol',
        createdAt:now(), updatedAt:now(), quotes:[], selectedQuoteId:null, approvals:[], ticket:null, protocol:null, storeCommitment:null, storeDebit:null};
      db.requests.unshift(r); notifyRole('protocol','New flight request needs protocol review',`${r.reference}: approval document uploaded; review and send to vendors.`,r.id); save();
      return json(res,201,{request:r});
    }
    const match=url.pathname.match(/^\/api\/requests\/([^/]+)(?:\/(send-vendors|share-options|quote|select-quote|approve-cost|issue-ticket|protocol|finalize-procurement|reject|cancel))?$/);
    if(match){
      const r=db.requests.find(x=>x.id===match[1]); if(!r) return json(res,404,{error:'Request not found.'});
      const action=match[2];
      if(req.method==='GET' && !action){ if(user.role==='vendor'&&(!Array.isArray(r.assignedVendorIds)||!r.assignedVendorIds.includes(user.vendorId))) return json(res,403,{error:'This request was not routed to your vendor.'}); return json(res,200,{request:r}); }
      if(req.method==='PATCH' && !action && allowed(user,['staff'])){
        if(r.createdBy!==user.id || r.status!=='awaiting_protocol' || (r.protocol&&r.protocol.reviewedAt)) return json(res,409,{error:'This request can no longer be edited.'});
        Object.assign(r,{notes:String(body.notes||r.notes),updatedAt:now()}); save(); return json(res,200,{request:r});
      }
      if(req.method!=='POST' || !action) return json(res,405,{error:'Method not allowed.'});
      if(action==='send-vendors'){
        if(!allowed(user,['protocol']) || r.status!=='awaiting_protocol' || r.ticket) return json(res,403,{error:'Only Protocol can send a new request to vendors at this stage.'});
        const selectedIds=Array.isArray(body.vendorIds)?body.vendorIds.map(String):[];
        const selectedVendors=db.vendors.filter(v=>v.active&&selectedIds.includes(v.id));
        if(!selectedVendors.length) return json(res,400,{error:'Select at least one active vendor before sending.'});
        const dueAt=new Date(Date.now()+30*60*1000).toISOString();
        r.assignedVendorIds=selectedVendors.map(v=>v.id);
        r.protocol={...(r.protocol||{}),reviewedBy:user.name,reviewedAt:now(),notes:String(body.notes||''),vendorResponseDueAt:dueAt,selectedVendorNames:selectedVendors.map(v=>v.name)};
        r.status='awaiting_quotes'; r.approvals.push({stage:'protocol_review',decision:'approved',by:user.name,at:now(),comment:body.notes||''});
        selectedVendors.forEach(v=>sendEmail(v.email,`FirstStaff request ${r.reference} — vendor response requested`,`${r.reference}: Protocol requests available flight options and itemised fares. Please submit all relevant itinerary details within 30 minutes.\nRoute: ${r.origin} to ${r.destination}\nDeparture: ${r.departureDate}\nPassenger: ${r.passengerName}\nPlease sign in to the FirstStaff platform to submit your quotation.`));
        db.users.filter(u=>u.role==='vendor'&&selectedVendors.some(v=>v.id===u.vendorId)).forEach(vu=>notify(vu.id,'New flight request from Protocol',`${r.reference}: submit flight options and fares within 30 minutes.`,r.id));
        notify(r.createdBy,'Request sent to selected vendors',`${r.reference}: Protocol sent the request to ${selectedVendors.map(v=>v.name).join(', ')}. Vendor response target: 30 minutes.`,r.id);
      } else if(action==='share-options'){
        if(!allowed(user,['protocol']) || r.status!=='awaiting_passenger_selection' || !r.quotes.length) return json(res,403,{error:'Protocol can share options only after vendor fares are received.'});
        r.protocol={...(r.protocol||{}),optionsSharedAt:now(),optionsSharedBy:user.name};
        notify(r.createdBy,'Flight options ready for selection',`${r.reference}: Protocol has shared ${r.quotes.length} flight option(s). Please select your preferred flight. ${body.notes||''}`,r.id);
      } else if(action==='reject'){
        if(!(allowed(user,['protocol'])&&r.status==='awaiting_protocol') && !(allowed(user,['executive'])&&r.status==='awaiting_cost_approval')) return json(res,403,{error:'Not permitted to reject this request.'});
        const rejectedStage=r.status==='awaiting_cost_approval'?'cost':'protocol_review';
        r.status='rejected'; r.approvals.push({stage:rejectedStage,decision:'rejected',by:user.name,at:now(),comment:body.comment||'No reason supplied'});
        notify(r.createdBy,'Flight request rejected',`${r.reference}: ${body.comment||'Please contact Protocol or your line executive.'}`,r.id);
      } else if(action==='quote'){
        if(!allowed(user,['vendor']) || !['awaiting_quotes','awaiting_passenger_selection'].includes(r.status) || !Array.isArray(r.assignedVendorIds) || !r.assignedVendorIds.includes(user.vendorId)) return json(res,403,{error:'This request is not routed to your vendor or is no longer accepting quotes.'});
        const fare=Number(body.fare);
        if(!Number.isFinite(fare)||fare<=0||!body.airline||!body.departureTime) return json(res,400,{error:'Airline, valid fare and departure time are required.'});
        const q={id:id('Q'),vendorId:user.vendorId||user.id,vendorName:user.name,airline:String(body.airline),fare,currency:body.currency||'NGN',departureTime:body.departureTime,arrivalTime:body.arrivalTime||'',flightNumber:body.flightNumber||'',baggage:body.baggage||'',conditions:body.conditions||'',layoverCount:body.layoverCount===''||body.layoverCount===undefined?null:Number(body.layoverCount),layoverDetails:String(body.layoverDetails||''),transitVisaRequired:String(body.transitVisaRequired||'unknown'),transitVisaDetails:String(body.transitVisaDetails||''),destinationVisa:String(body.destinationVisa||''),healthCertificateRequired:String(body.healthCertificateRequired||'unknown'),healthCertificateDetails:String(body.healthCertificateDetails||''),journeyDuration:String(body.journeyDuration||''),travelAdvisory:String(body.travelAdvisory||''),submittedAt:now()};
        r.quotes.push(q); r.status='awaiting_passenger_selection'; r.updatedAt=now(); notifyRole('protocol','Vendor flight option received',`${r.reference}: ${q.airline} — ${q.currency} ${q.fare.toLocaleString()}. Options are ready for Protocol review.`,r.id);
      } else if(action==='select-quote'){
        if(!allowed(user,['staff']) || r.createdBy!==user.id || r.status!=='awaiting_passenger_selection' || !r.protocol || !r.protocol.optionsSharedAt) return json(res,403,{error:'Protocol must share the vendor options before the passenger can select a flight.'});
        const q=r.quotes.find(x=>x.id===body.quoteId); if(!q) return json(res,400,{error:'Quote not found.'});
        r.selectedQuoteId=q.id; r.status='awaiting_cost_approval'; r.updatedAt=now();
        notifyRole('executive','Selected fare needs cost approval',`${r.reference}: ${q.airline}, ${q.currency} ${q.fare.toLocaleString()}.`,r.id);
      } else if(action==='approve-cost'){
        if(!allowed(user,['executive']) || r.status!=='awaiting_cost_approval') return json(res,403,{error:'Not permitted or cost is not awaiting approval.'});
        r.approvals.push({stage:'cost',decision:'approved',by:user.name,at:now(),comment:body.comment||''}); r.status='awaiting_ticket'; r.updatedAt=now();
        const q=r.quotes.find(x=>x.id===r.selectedQuoteId);
        db.users.filter(u=>u.role==='vendor'&&Array.isArray(r.assignedVendorIds)&&r.assignedVendorIds.includes(u.vendorId)).forEach(u=>notify(u.id,'Ticket issuance approved',`${r.reference}: issue the approved ${q.airline} ticket for ${r.passengerName}.`,r.id));
        (db.vendors||[]).filter(v=>Array.isArray(r.assignedVendorIds)&&r.assignedVendorIds.includes(v.id)).forEach(v=>sendEmail(v.email,`FirstStaff ${r.reference}: ticket issuance approved`,`${r.reference}: the selected fare is approved. Please issue the approved ${q.airline} ticket for ${r.passengerName} and upload the ticket through your assigned vendor account.`));
        notifyRole('protocol','Cost approved — ticket issuance started',`${r.reference}: Line Executive approved ${q.currency} ${q.fare.toLocaleString()}; vendor has been instructed to issue the ticket.`,r.id);
        notify(r.createdBy,'Fare approved',`${r.reference}: selected fare approved; ticket issuance is next.`,r.id);
      } else if(action==='issue-ticket'){
        if(!allowed(user,['vendor','ticketing']) || r.status!=='awaiting_ticket' || (user.role==='vendor'&&(!Array.isArray(r.assignedVendorIds)||!r.assignedVendorIds.includes(user.vendorId)))) return json(res,403,{error:'Not permitted or ticket is not awaiting issuance for your vendor.'});
        if(!body.ticketNumber) return json(res,400,{error:'Ticket number is required.'});
        r.ticket={ticketNumber:String(body.ticketNumber),issuedBy:user.name,issuedAt:now(),attachmentName:String(body.attachmentName||''),ticketDocument:body.ticketDocument?{name:String(body.ticketDocument.name),mimeType:String(body.ticketDocument.mimeType||'application/octet-stream'),data:String(body.ticketDocument.data)}:null,notes:String(body.notes||''),vendorId:user.id};
        r.status='awaiting_protocol'; r.updatedAt=now();
        notifyRole('protocol','Ticket ready for protocol',`${r.reference}: ticket ${r.ticket.ticketNumber} is ready.`,r.id);
        notify(r.createdBy,'Ticket issued',`${r.reference}: ticket ${r.ticket.ticketNumber} has been issued.`,r.id);
      } else if(action==='protocol'){
        if(!allowed(user,['protocol']) || r.status!=='awaiting_protocol' || !r.ticket) return json(res,403,{error:'Protocol can confirm receipt only after the vendor issues a ticket.'});
        const q=r.quotes.find(x=>x.id===r.selectedQuoteId);
        r.protocol={...(r.protocol||{}),receivedBy:user.name,receivedAt:now(),cost:q.fare,currency:q.currency,notes:String(body.notes||''),sharedWithPassengerAt:now()};
        r.storeCommitment={amount:q.fare,currency:q.currency,status:'pending_procurement',reservedAt:now(),reservedBy:user.name};
        r.status='awaiting_procurement'; r.updatedAt=now();
        notify(r.createdBy,'Ticket shared with passenger',`${r.reference}: Protocol has received the ticket and marked it as shared with ${r.passengerName}.`,r.id);
        notifyRole('procurement','Travel cost awaiting procurement finalization',`${r.reference}: ${q.currency} ${q.fare.toLocaleString()} is held as a pending store commitment; finalize procurement before the debit is posted.`,r.id);
        notifyRole('store','Pending travel cost commitment',`${r.reference}: ${q.currency} ${q.fare.toLocaleString()} is held pending Procurement. No debit has been posted.`,r.id);
      } else if(action==='finalize-procurement'){
        if(!allowed(user,['procurement']) || r.status!=='awaiting_procurement' || !r.storeCommitment || r.storeDebit) return json(res,403,{error:'Only Procurement can finalize a pending commitment, and duplicate debits are blocked.'});
        const q=r.quotes.find(x=>x.id===r.selectedQuoteId);
        r.procurement={finalizedBy:user.name,finalizedAt:now(),reference:String(body.reference||id('PR')),notes:String(body.notes||'')};
        r.storeDebit={amount:q.fare,currency:q.currency,debitedBy:user.name,debitedAt:now(),reference:String(body.storeReference||id('SD')),procurementReference:r.procurement.reference};
        r.storeCommitment.status='posted'; r.storeCommitment.finalizedAt=now();
        db.ledger.unshift({id:id('L'),requestId:r.id,requestReference:r.reference,amount:q.fare,currency:q.currency,reference:r.storeDebit.reference,debitedBy:user.name,createdAt:now(),passengerName:r.passengerName,procurementReference:r.procurement.reference});
        r.status='completed'; r.updatedAt=now();
        notifyRole('store','Procurement finalized travel cost',`${r.reference}: procurement finalized and ${q.currency} ${q.fare.toLocaleString()} debit posted.`,r.id);
        notify(r.createdBy,'Travel process completed',`${r.reference}: ticket shared and procurement finalized.`,r.id);
        notifyRole('protocol','Travel request completed',`${r.reference}: Procurement finalized the store cost.`,r.id);
      } else if(action==='cancel'){
        if(!allowed(user,['staff']) || r.createdBy!==user.id || !['awaiting_protocol','awaiting_quotes','awaiting_passenger_selection'].includes(r.status)) return json(res,403,{error:'This request can no longer be cancelled.'});
        r.status='cancelled'; r.updatedAt=now(); notifyRole('protocol','Flight request cancelled',`${r.reference} was cancelled by the requester.`,r.id);
      }
      r.updatedAt=now(); save(); return json(res,200,{request:r});
    }
    if(req.method==='POST' && url.pathname==='/api/notifications/read'){
      db.notifications.filter(n=>n.userId===user.id).forEach(n=>n.read=true); save(); return json(res,200,{ok:true});
    }
    if(req.method==='GET' && url.pathname==='/api/ledger'){
      if(!allowed(user,['store'])) return json(res,403,{error:'Store access only.'});
      return json(res,200,{ledger:db.ledger});
    }
    return json(res,404,{error:'API endpoint not found.'});
  } catch(e){ console.error(e); return json(res,500,{error:'Server error. Check server logs.'}); }
});
server.listen(PORT,()=>console.log(`FirstStaff Ticketing AI running at http://localhost:${PORT}`));
