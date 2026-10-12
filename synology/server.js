'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
function createServer(config,history){
 const identity=require('./lib/identity'),identityFile=path.join(config.historyDir||path.join(__dirname,'data'),'identity-models-user.json');let custom={};try{custom=JSON.parse(fs.readFileSync(identityFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const save=()=>{fs.mkdirSync(path.dirname(identityFile),{recursive:true});fs.writeFileSync(identityFile+'.tmp',JSON.stringify(custom),{mode:0o600});fs.renameSync(identityFile+'.tmp',identityFile);};
 const origins=new Set(config.origins),hostnames=new Set([...origins].map(x=>new URL(x).host));
 const files={'/history':['history.html','text/html; charset=utf-8'],'/history.js':['history.js','text/javascript; charset=utf-8'],'/history.css':['history.css','text/css; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
 return http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(!hostnames.has(req.headers.host))return send(403,{error:'Unknown host'});
  if(req.headers.origin&&!origins.has(req.headers.origin))return send(403,{error:'Origin denied'});
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&files[pathname]){const [file,type]=files[pathname];res.writeHead(200,{'Content-Type':type});return res.end(fs.readFileSync(path.join(__dirname,'public',file)));}
  if(req.method==='GET'&&req.url==='/api/history/devices'){try{return send(200,{devices:await history.devices()});}catch{return send(503,{error:'История пока недоступна'});}}
  if(req.method==='GET'&&req.url.startsWith('/api/history?')){try{const q=new URL(req.url,'http://localhost').searchParams;if(!history)return send(503,{error:'History unavailable'});return send(200,await history.query(q.get('device'),q.get('port'),Number(q.get('hours'))));}catch{return send(400,{error:'Не удалось получить историю'});}}
  if(!((req.method==='GET'&&req.url==='/api/overview')||(req.method==='POST'&&req.url==='/api/control')))return send(404,{error:'Not found'});
  if(req.method==='POST'&&(!origins.has(req.headers.origin)||req.headers['x-anker-request']!=='1'||!req.headers['content-type']?.startsWith('application/json')))return send(403,{error:'Request denied'});
  try{
   let body;if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return send(413,{error:'Request too large'});}try{body=JSON.stringify(JSON.parse(raw));}catch{return send(400,{error:'Invalid JSON'});}}
   const command=body?JSON.parse(body):null;const local=command?.action==='identity_model';
   const upstream=await fetch(config.homey+'/api/app/com.ed.anker-prime/web'+(body&&!local?'/control':''),{method:local?'GET':req.method,headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:local?undefined:body,signal:AbortSignal.timeout(45000)});
   const data=await upstream.json();
   if(!upstream.ok)return send(upstream.status>=500?502:400,{error:typeof data.error==='string'?data.error:typeof data.message==='string'?data.message:'Homey отклонил команду'});
   if(local){const d=data.devices?.find(d=>d.id===command.id);if(!d)throw Error('Unknown device');const entry=identity.validate(d,command.args||{});custom[d.id]=custom[d.id]||{};custom[d.id][entry.key]=entry.value;save();return send(200,{ok:true});}
   send(200,req.method==='GET'?identity.enrich(data,custom):data);
  }catch(error){if(error.message?.includes('устройство')||error.message?.includes('название')||error.message?.includes('модель'))return send(400,{error:error.message});send(502,{error:'Нет связи с Homey. Проверьте, что Homey и приложение Anker работают.'});}
 });
}
if(require.main===module){const config=JSON.parse(fs.readFileSync(process.env.ANKER_CONFIG||path.join(__dirname,'config.json'),'utf8'));if(config.mdnsAddress)require('./mdns')(config.mdnsAddress);const history=new (require('./history').History)(config.historyDir||path.join(__dirname,'data')).start(config);createServer(config,history).listen(config.port||8787,config.bind||'127.0.0.1',()=>console.log('Anker dashboard ready'));}
module.exports={createServer};
