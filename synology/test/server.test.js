const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createServer}=require('../server');
test('proxy keeps token server-side and rejects cross-origin writes and unknown hosts',async()=>{
 let seen;const upstream=http.createServer((req,res)=>{seen=req.headers.authorization;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({devices:[]}));});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const server=createServer({homey:`http://127.0.0.1:${upstream.address().port}`,token:'private-test-token',origins:['http://anker.test']});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const fetch=(url,opts={})=>new Promise((resolve,reject)=>{const r=http.request(url,{method:opts.method||'GET',headers:opts.headers},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,text:async()=>text}));});r.on('error',reject);r.end(opts.body);});
 try{assert.equal((await fetch(url)).status,403);const r=await fetch(url+'/api/overview',{headers:{Host:'anker.test'}});assert.equal(r.status,200);assert.equal(seen,'Bearer private-test-token');assert.equal((await r.text()).includes('private-test-token'),false);
 for(const headers of [{},{Origin:'http://evil.test','X-Anker-Request':'1'},{Origin:'http://anker.test'}])assert.equal((await fetch(url+'/api/control',{method:'POST',headers:{Host:'anker.test','Content-Type':'application/json',...headers},body:'{}'})).status,403);
 for(const p of ['C1','C2','C3','C4','A1','A2'])assert.equal((await fetch(url+'/history?port='+p,{headers:{Host:'anker.test'}})).status,200);
 assert.equal((await fetch(url+'/config.json',{headers:{Host:'anker.test'}})).status,404);
 assert.equal((await fetch(url+'/api/control',{method:'POST',headers:{Host:'anker.test',Origin:'http://anker.test','X-Anker-Request':'1','Content-Type':'application/json'},body:'{}'})).status,200);
 }finally{server.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>upstream.close(r))]);}
});
