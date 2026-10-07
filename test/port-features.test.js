'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Energy=require('../lib/energy'),P=require('../lib/protocol'),Limit=require('../lib/power-limit'),Connection=require('../lib/connection');
test('energy integrates Wh, skips duplicates and gaps, starts fresh after restore and reset',()=>{
 const e=new Energy(null,0);e.sample(100,0,0);e.sample(100,10000,10000);assert.equal(e.value,100/360);
 e.sample(100,10000,10000);assert.equal(e.value,100/360);
 e.sample(100,100000,100000);assert.equal(e.value,100/360);
 e.sample(0,110000,110000);assert.equal(e.value,150/360);
 const restored=new Energy(e.snapshot(),120000);restored.sample(100,120000,120000);assert.equal(restored.value,e.value);
 restored.reset(125000);restored.sample(100,130000,130000);assert.equal(restored.value,0);assert.equal(restored.resetAt,125000);
 restored.sample(NaN,140000,140000);restored.sample(100,150000,150000);assert.equal(restored.value,0);
});
test('custom budget preserves protocol flags and redistributes overbudget',()=>{
 const s={customProfile:[1,0,70,65,45,45,24],customProtocols:[59,1,2,59,3,4,59,5,6,59,7,8]};
 const a=Limit.prepare(s,{port:'C1',value:5},true);assert.deepEqual(a.profile,[1,0,5,65,45,45,24]);assert.deepEqual(a.protocols,s.customProtocols);assert.equal(s.customProfile[2],70);
 assert.deepEqual(Limit.prepare(s,{port:'C1',value:140},true).profile,[1,0,140,25,30,30,24]);
 for(const [port,value] of [['C1',4],['C2',14],['A',16],['C1',5.5],['C1',6],['C2',31],['C9',20]])assert.throws(()=>Limit.validate(port,value));
 const frame=P.command('custom',a,1);assert.equal(frame.reduce((a,b)=>a^b,0),0);assert.equal(frame.subarray(7,9).toString('hex'),'0206');
 const state=P.decode(P.packet('0a00',[P.field(0xb8,Buffer.from(a.profile),4),P.field(0xba,Buffer.from(a.protocols),4)])).state;
 assert.deepEqual(state.settings.customProfile,a.profile);assert.deepEqual(state.settings.customProtocols,a.protocols);
 assert.throws(()=>P.command('custom',{...a,profile:[1,0,140,100,100,100,24]}));
});
test('two concurrent port limits use fresh whole profile and confirm all bytes',async()=>{
 const c=new Connection({},[{device_sn:'test'}]);let state={statusUpdated:Date.now(),settings:{mode:1,customProfile:[1,0,70,65,45,45,24],customProtocols:Array(12).fill(0)},groups:{}};
 c.states.set('test',state);const sent=[];
 c.send=async(sn,action,args)=>{if(action==='custom'){sent.push(args);state={...state,settings:{mode:5,customProfile:[...args.profile],customProtocols:[...args.protocols]}};}
 setImmediate(()=>{state={...state,statusUpdated:Date.now()};c.states.set(sn,state);c.emit('state',sn,structuredClone(state));});};
 await Promise.all([c.control('test','limit',{port:'C1',value:30}),c.control('test','limit',{port:'C2',value:35})]);
 assert.deepEqual(sent[1].profile,[1,0,30,35,45,45,24]);
 assert.equal(c.matches({...state,settings:{...state.settings,customProfile:[1,0,30,31,44,45,24]}},'custom',sent[1]),false);
 await c.close();
});
test('existing port devices gain controls; pair energy resets and survives reload',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
 const filename=path.resolve(__dirname,'../drivers/prime/device.js'),realRequire=createRequire(filename);
 class Device {
  constructor(){this.caps={};this.store={};this.opts={};this.homey={__:k=>({language:'en',limit_inactive:'Inactive',limit_active:'Active'}[k]||k),clock:{getTimezone:()=> 'Europe/Moscow'}};this.updates=Promise.resolve();}
  getData(){return {port:'A'};}hasCapability(k){return k in this.caps;}async addCapability(k){this.caps[k]=null;}async setCapabilityOptions(k,v){this.opts[k]=v;}getCapabilityValue(k){return this.caps[k];}async setCapabilityValue(k,v){this.caps[k]=v;}getStoreValue(k){return this.store[k];}async setStoreValue(k,v){this.store[k]=structuredClone(v);}registerMultipleCapabilityListener(){}registerCapabilityListener(){}
 }
 const context={module:{exports:{}},require:n=>n==='homey'?{Device}:realRequire(n),Date,Intl,Number,Math};vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});
 const d=new context.module.exports();await d.initPortFeatures();assert.ok(d.hasCapability('anker_reset_energy'));assert.ok(d.hasCapability('anker_limit_a'));
 const now=Date.now();const state=at=>({settings:{mode:5,customProfile:[1,0,70,65,45,45,24]},ports:{A1:{power:5,updated:at},A2:{power:10,updated:at}}});
 await d.updatePortFeatures(state(now-10000));await d.updatePortFeatures(state(now));assert.ok(Math.abs(d.caps.meter_usb_energy-15/360)<1e-12);
 const saved=d.store.usbEnergy;const e=new context.module.exports();e.store.usbEnergy=saved;await e.initPortFeatures();assert.equal(e.caps.meter_usb_energy,d.caps.meter_usb_energy);
 await e.resetEnergy();assert.equal(e.caps.meter_usb_energy,0);assert.equal(e.store.usbEnergy.wh,0);assert.ok(e.caps.anker_energy_reset_at);
});
test('automatic allocation preserves selected limit, floors, flags and total across all valid requests',()=>{
 const starting=[70,65,45,45,24];
 for(const port of ['C1','C2','C3','C4','A'])for(let value=0;value<=140;value++){
  try{Limit.validate(port,value);}catch{continue;}
  const selected=['C1','C2','C3','C4','A'].indexOf(port);
  const s={customProfile:[1,0,...starting],customProtocols:Array(12).fill(59)};
  const result=Limit.prepare(s,{port,value},true).profile.slice(2);
  assert.equal(result[selected],value);assert.ok(result.reduce((a,b)=>a+b,0)<=250);
  result.forEach((v,i)=>{if(i!==selected){assert.ok(v<=starting[i]);assert.ok(v>=15);}});
  if(port!=='A')assert.equal(result[4],24);
  assert.deepEqual(s.customProfile,[1,0,...starting]);
 }
 const s={customProfile:[1,0,5,0,100,100,24],customProtocols:Array(12).fill(0)};
 const result=Limit.prepare(s,{port:'C3',value:100},true);assert.deepEqual(result.profile,s.customProfile);
});
