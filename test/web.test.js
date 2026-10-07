const {test}=require('node:test'),assert=require('node:assert/strict'),api=require('../api');
test('web API validates commands, binds energy to charger and hides account data',async()=>{
 let controls=0,resets=0;const d={getData:()=>({id:'charger',sn:'sn'}),getStoreValue:()=> 'account'};
 const c={getData:()=>({id:'port',sn:'sn',port:'C1'}),getStoreValue:()=> 'account',energy:{snapshot:()=>({wh:1,resetAt:10})},resetEnergy:async()=>resets++};
 const homey={clock:{getTimezone:()=> 'UTC'},app:{devices:new Set([d,c]),overview:()=>[{id:'charger'}],snapshot:()=>({stale:false}),control:async()=>controls++}};
 const out=await api.webOverview({homey});assert.equal(out.devices[0].energy.C1.wh,1);assert.equal(out.devices[0].energy.C2,null);
 for(const [action,args] of [['custom',{}],['status',{}],['limit',{port:'C1',value:142}],['power',{port:'C9',on:true}],['timer',{port:'C1',minutes:7}]])await assert.rejects(api.webControl({homey,body:{id:'charger',action,args}}));assert.equal(controls,0);
 await api.webControl({homey,body:{id:'charger',action:'energy_reset',args:{port:'C1'}}});assert.equal(resets,1);
 await assert.rejects(api.webControl({homey,body:{id:'other',action:'energy_reset',args:{port:'C1'}}}));
 await api.webControl({homey,body:{id:'charger',action:'brightness',args:{value:80}}});assert.equal(controls,1);
});
test('web bridge exposes only experimental metadata and dispatches profile commands to the paired charger',async()=>{
 const calls=[];const d={getData:()=>({id:'charger',sn:'sn'}),getStoreValue:()=> 'account'};
 const homey={clock:{getTimezone:()=> 'UTC'},app:{devices:new Set([d]),accounts:new Map([['account',{credentials:{password:'secret'},experimental:{view:()=>({ready:true,profiles:[]})}}]]),overview:()=>[{id:'charger'}],webExperimentalControl:async(...args)=>{calls.push(args);return {ok:true};}}};
 const out=await api.webOverview({homey});assert.equal(out.configured,true);assert.equal(out.devices[0].experimental.ready,true);assert(!JSON.stringify(out).includes('secret'));
 for(const action of ['experimental','experimental_refresh','profile_save','profile_update','profile_apply','profile_delete'])await api.webControl({homey,body:{id:'charger',action,args:{id:'p'}}});assert.equal(calls.length,6);assert(calls.every(([device])=>device===d));
 await assert.rejects(api.webControl({homey,body:{id:'unknown',action:'profile_delete',args:{id:'p'}}}));
});
