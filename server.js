/* PID Facilities Management server: authentication, sessions, shared persistence. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
/* Load local deployment settings without adding a runtime dependency. */
const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
/* In Azure App Service set DATA_DIR=/home/pid-facilities-data. The deployment
   package may be mounted read-only, while /home remains durable storage. */
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.SESSION_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ROLES = new Set(['admin', 'hq', 'centre', 'technician', 'intern']);

function fail(message) { console.error(message); process.exit(1); }
if (!SECRET || SECRET.length < 32) fail('SESSION_SECRET must be at least 32 characters.');
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) fail('Set ADMIN_EMAIL and ADMIN_PASSWORD before first start.');
fs.mkdirSync(DATA_DIR, { recursive:true });

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash:crypto.scryptSync(password, salt, 64).toString('hex') };
}
function passwordMatches(password, user) {
  const candidate = crypto.scryptSync(password, user.salt, 64).toString('hex');
  const storedHash = user.passwordHash || user.hash; // accepts the initial v1 state too
  return !!storedHash && crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(storedHash, 'hex'));
}
function load() {
  if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const hash = passwordHash(ADMIN_PASSWORD);
  const appData = {
    orgName:'', msEmail:'', waNumber:'', requireMsAuthForAdmin:true, sharepointFolder:'PID Facilities Reports', sharepointSiteId:'', theme:'default',
    centres:[], users:[{ id:'USR-0001', name:'Administrator', role:'admin', centreId:'', email:ADMIN_EMAIL, phone:'' }],
    assets:[], workOrders:[], pmTasks:[], projects:[], incidents:[], inspections:[], assetReports:[], doodleLinks:[], documents:[], internChecklists:{},
    seq:{asset:0,wo:0,pm:0,proj:0,inc:0,insp:0,centre:0,user:1,ar:0,dl:0,doc:0}
  };
  const state = { users:[{ id:'admin-1', email:ADMIN_EMAIL, name:'Administrator', role:'admin', ...hash }], storage:{ 'pid-fms-data-v2':JSON.stringify(appData) } };
  save(state); return state;
}
function save(state) {
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode:0o600 });
  fs.renameSync(temp, DATA_FILE);
}
function tokenFor(user) {
  const payload = Buffer.from(JSON.stringify({ id:user.id, exp:Date.now() + 8*60*60*1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + signature;
}
function userFor(req, state) {
  const cookie = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('pid_session='));
  if (!cookie) return null;
  const [payload, signature] = cookie.slice(12).split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const session=JSON.parse(Buffer.from(payload, 'base64url')); return session.exp>Date.now() ? state.users.find(u=>u.id===session.id) || null : null; } catch { return null; }
}
function publicUser(user) { return { id:user.id, name:user.name, email:user.email, role:user.role }; }
function corsHeaders(req) {
  const origin = req.headers.origin;
  const allowed = !origin || origin === 'null' || origin === 'http://localhost:4310' || origin === 'https://pidmms.azurewebsites.net' || origin === 'https://pid-ftf6dmerh7fmfkga.southafricanorth-01.azurewebsites.net';
  return allowed && origin ? { 'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Credentials':'true', 'Access-Control-Allow-Headers':'Content-Type, Accept', 'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS' } : {};
}
function respond(res, status, data, headers={}) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers }); res.end(JSON.stringify(data)); }
function readJson(req) { return new Promise((resolve, reject) => { let body=''; req.on('data', c=>{ body+=c; if(body.length>2_000_000) req.destroy(); }); req.on('end', ()=>{ try{ resolve(body ? JSON.parse(body) : {}); }catch{ reject(new Error('Invalid JSON')); } }); }); }
function serveFile(req, res) {
  const requestPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(ROOT, '.' + requestPath);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return respond(res, 404, {error:'Not found'});
  const mime = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type':mime, 'X-Content-Type-Options':'nosniff' }); fs.createReadStream(file).pipe(res);
}
function requireUser(req, res, state) { const user=userFor(req,state); if(!user){ respond(res,401,{error:'Sign in required'}); return null; } return user; }
function workflowDraft(description, assetName='') {
  const text = `${description} ${assetName}`.toLowerCase();
  const critical = /fire|smoke|shock|flood|gas leak|security breach|unsafe|injur|life safety/.test(text);
  const high = /leak|burst|power|electric|outage|broken|failure|blocked|urgent|down/.test(text);
  const preventive = /inspect|service|maintain|replace|clean|test|scheduled/.test(text);
  const priority = critical ? 'critical' : high ? 'high' : preventive ? 'medium' : 'low';
  const type = preventive && !high ? 'preventive' : 'corrective';
  const slaHours = critical ? 2 : high ? 8 : priority === 'medium' ? 48 : 120;
  const due = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString().slice(0,10);
  const nextSteps = critical
    ? ['Make the area safe and isolate the hazard.', 'Notify the centre manager and safety lead.', 'Capture photos and log the incident before repair.']
    : high
      ? ['Inspect the affected equipment and isolate it if needed.', 'Confirm parts, access requirements and responsible technician.', 'Record the repair outcome and test before handover.']
      : ['Inspect the asset and confirm the root cause.', 'Gather parts and access requirements.', 'Complete the work and record the verification check.'];
  const title = `${critical ? 'Urgent safety response' : high ? 'Priority maintenance response' : 'Facilities task'}${assetName ? ` - ${assetName}` : ''}`;
  return { title, type, priority, dueDate:due, summary:`${priority[0].toUpperCase()+priority.slice(1)} ${type} workflow`, nextSteps, slaHours };
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost'); const state=load();
  if (req.method==='OPTIONS' && url.pathname.startsWith('/api/')) { res.writeHead(204, corsHeaders(req)); return res.end(); }
  const apiHeaders = corsHeaders(req);
  for (const [name, value] of Object.entries(apiHeaders)) res.setHeader(name, value);
  if (req.method==='GET' && url.pathname==='/api/health') return respond(res,200,{ok:true,authenticated:!!userFor(req,state)},apiHeaders);
  if (req.method==='GET' && url.pathname==='/api/auth/me') { const user=userFor(req,state); return user ? respond(res,200,{user:publicUser(user)},apiHeaders) : respond(res,401,{error:'Not signed in'},apiHeaders); }
  if (req.method==='POST' && url.pathname==='/api/auth/login') {
    const {email='',password=''}=await readJson(req); const user=state.users.find(u=>u.email===String(email).trim().toLowerCase());
    if(!user || !passwordMatches(String(password),user)) return respond(res,401,{error:'Invalid credentials'},apiHeaders);
    const secure=process.env.NODE_ENV==='production' ? '; Secure' : '';
    const sameSite=process.env.NODE_ENV==='production' ? 'None' : 'Lax';
    return respond(res,200,{user:publicUser(user)},{...apiHeaders,'Set-Cookie':`pid_session=${tokenFor(user)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=28800${secure}`});
  }
  if (req.method==='POST' && url.pathname==='/api/auth/logout') return respond(res,200,{ok:true},{...apiHeaders,'Set-Cookie':`pid_session=; HttpOnly; SameSite=${process.env.NODE_ENV==='production' ? 'None' : 'Lax'}; Path=/; Max-Age=0`});
  if (req.method==='POST' && url.pathname==='/api/ai/workflow') {
    const user=requireUser(req,res,state); if(!user) return;
    const body=await readJson(req); const description=String(body.description||'').trim(); const assetName=String(body.assetName||'').trim();
    if(description.length<10 || description.length>2000) return respond(res,400,{error:'Describe the issue in 10 to 2000 characters.'},apiHeaders);
    return respond(res,200,{workflow:workflowDraft(description,assetName),description,assetName},apiHeaders);
  }
  if (url.pathname.startsWith('/api/storage')) {
    const user=requireUser(req,res,state); if(!user) return;
    const suffix=url.pathname.slice('/api/storage'.length).replace(/^\//,'');
    if (!suffix && req.method==='GET') { const prefix=url.searchParams.get('prefix')||''; return respond(res,200,{keys:Object.keys(state.storage).filter(k=>k.startsWith(prefix))}); }
    const key=decodeURIComponent(suffix); if(!key || key.includes('..')) return respond(res,400,{error:'Invalid key'});
    if(req.method==='GET') return Object.hasOwn(state.storage,key) ? respond(res,200,{value:state.storage[key]}) : respond(res,404,{error:'Not found'});
    if(req.method==='PUT') { const {value}=await readJson(req); if(typeof value!=='string') return respond(res,400,{error:'value must be a string'}); state.storage[key]=value; save(state); return respond(res,200,{ok:true}); }
    if(req.method==='DELETE') { delete state.storage[key]; save(state); return respond(res,200,{ok:true}); }
  }
  if (url.pathname.startsWith('/api/')) return respond(res,404,{error:'Not found'});
  return serveFile(req,res);
}

if(process.argv[2]==='create-user') {
  const [, , , email, password, role='technician', ...nameParts]=process.argv;
  if(!email || !password || !ROLES.has(role)) fail('Usage: node server.js create-user email password role [name]');
  const state=load(); if(state.users.some(u=>u.email===email.toLowerCase())) fail('That email already exists.');
  const hash=passwordHash(password); state.users.push({id:crypto.randomUUID(),email:email.toLowerCase(),name:nameParts.join(' ')||email,role,...hash}); save(state); console.log('User created.'); process.exit(0);
}
const server = http.createServer((req,res)=>handle(req,res).catch(err=>{ console.error(err); respond(res,500,{error:'Server error'}); }));
server.on('error', err => { console.error(`Could not start server on port ${PORT}: ${err.message}`); process.exitCode = 1; });
server.listen(PORT, '0.0.0.0', ()=>console.log(`PID Facilities is running at http://0.0.0.0:${PORT}`));
