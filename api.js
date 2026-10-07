'use strict';
const {command,GROUPS}=require('./lib/protocol');
const limits=require('./lib/power-limit');
const themes=require('./lib/themes.json');
function parent(homey,id){const d=[...homey.app.devices].find(d=>d.getData().id===id&&!d.getData().port);if(!d)throw new Error('Unknown charger');return d;}
function child(homey,d,port){if(!GROUPS.includes(port))throw new Error('Unknown port');return [...homey.app.devices].find(x=>x.getData().port===port&&x.getData().sn===d.getData().sn&&x.getStoreValue('account')===d.getStoreValue('account'));}
module.exports={
 async webOverview({homey}){return {configured:true,devices:homey.app.overview().map(s=>{const d=parent(homey,s.id);return {...s,experimental:homey.app.accounts?.get(d.getStoreValue('account'))?.experimental?.view(d.getData().sn)||{ready:false,stale:true,profiles:[]},energy:Object.fromEntries(GROUPS.map(p=>[p,child(homey,d,p)?.energy?.snapshot()||null]))};}),themes,timezone:homey.clock.getTimezone()};},
 async webControl({homey,body}){
  if(!body||typeof body!=='object')throw new Error('Invalid request');
  const d=parent(homey,body.id),a=body.args||{},action=body.action;
  if(action==='energy_reset'){const c=child(homey,d,a.port);if(!c?.energy)throw new Error('Add this port in Homey to enable its energy counter');await c.resetEnergy();return {ok:true};}
  if(action==='labels'){
   const patch={};for(const [key,value] of Object.entries(a)){if(!/^label_(C[1-4]|A[12])$/.test(key)||typeof value!=='string'||value.length>40)throw new Error('Invalid port name');patch[key]=value.trim();}
   await d.setSettings(patch);await d.showSelectedPort();return {ok:true};
  }
  if(['experimental','experimental_refresh','profile_save','profile_update','profile_apply','profile_delete'].includes(action))return homey.app.webExperimentalControl(d,action,a);
  if(homey.app.snapshot(d).stale)throw new Error('Charger is offline');
  if(action==='theme'){await homey.app.displayTheme(d,String(a.id));return {ok:true};}
  if(action==='limit_preview'){return limits.prepare(homey.app.snapshot(d).settings,a,true);}
  if(action==='limit')limits.validate(a.port,a.value);
  else if(action==='mode'&&a.value===5){} // Connection validates the saved custom profile.
  else if(['power','timer','mode','brightness','timeout','clock','knob','priority','schedule','clock_holiday','clock_schedule'].includes(action))command(action,a);
  else throw new Error('Unsupported action');
  await homey.app.control(d.getData().id,action,a);return {ok:true};
 }
};
