'use strict';
// Publish only this dashboard's A record; Synology's Avahi remains independent.
module.exports=function publish(address){
 const mdns=require('multicast-dns')({interface:address,bind:'0.0.0.0',reuseAddr:true});
 const name='anker.synology.local';
 const answer=ttl=>({answers:[{name,type:'A',class:'IN',ttl,flush:true,data:address}]});
 mdns.on('query',q=>{if(q.questions.some(x=>x.name.toLowerCase()===name&&['A','ANY'].includes(x.type)))mdns.respond(answer(120));});
 mdns.on('error',()=>console.error('mDNS unavailable'));
 mdns.respond(answer(120));const timer=setInterval(()=>mdns.respond(answer(120)),60000);
 return ()=>{clearInterval(timer);mdns.respond(answer(0),()=>mdns.destroy());};
};
