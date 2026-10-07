'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {draft,fields}=require('../lib/profile-editor');const {snapshot,wire,Experimental}=require('../lib/experimental');
const live={customProfile:[1,1,20,50,40,20,0],customProtocols:[59,0,0,59,0,0,11,0,0,2,0,0]};
const saved=snapshot(live,1,'Existing',1);saved.id='existing';
const settings={profile_slot:'1',profile_name:'Edited',profile_auto_exit:false,profile_C1:25,profile_C2:50,profile_C3:40,profile_C4:20,profile_A:'0'};
test('profile editor changes saved budget without mutating original or live settings',()=>{
 const value=draft(settings,saved,live);assert.equal(value.total_power,135);assert.deepEqual(wire(value),{profile:[1,0,25,50,40,20,0],protocols:live.customProtocols});assert.equal(saved.name,'Existing');assert.equal(saved.power_settings[0].power,20);assert.equal(live.customProfile[2],20);assert.equal(fields(value,live).profile_A,'0');
});
test('new slots preserve live protocol flags; invalid budgets and steps rejected',()=>{
 assert.equal(draft({...settings,profile_slot:'4'},null,live).number,4);
 for(const changes of [{profile_C1:26},{profile_C1:145},{profile_C1:140,profile_C2:100,profile_C3:100},{profile_A:'20'},{profile_name:''},{profile_slot:'5'}])assert.throws(()=>draft({...settings,...changes},saved,live));
 const legacy=structuredClone(saved);legacy.power_settings[0].power=28;assert.equal(draft({...settings,profile_C1:28},legacy,live).power_settings[0].power,28);
});
test('identification uses verified separate account endpoint and compatibility guard',async()=>{
 const writes=[];let enabled=0,compatibility=1;
 const cloud={async request(path,body){if(path.endsWith('get_device_setting'))return {device_setting:{compatibility_status:compatibility,charging_mode_status:1,charging_device_identity_status:0}};if(path.endsWith('get_charging_device_identity_status_default_true'))return {charging_device_identity_status_default_true:enabled};if(path.endsWith('get_charging_mode_list'))return {charging_mode_list:[saved]};writes.push({path,body});enabled=body.charging_device_identity_status_default_true;return {};}};
 const x=new Experimental(cloud);await assert.rejects(x.control('sn','experimental',{setting:'identification',enabled:true}),/совместимость/);assert.equal(writes.length,0);compatibility=0;await x.control('sn','experimental',{setting:'identification',enabled:true});assert.equal(writes[0].body.charging_device_identity_status_default_true,1);assert.equal(x.view('sn').identification,true);
});
test('applying a saved cloud profile sends its verified budget and protocol flags',async()=>{
 let enabled=1;const calls=[];
 const cloud={async request(path){if(path.endsWith('get_device_setting'))return {device_setting:{compatibility_status:0,charging_mode_status:enabled}};if(path.endsWith('get_charging_device_identity_status_default_true'))return {charging_device_identity_status_default_true:1};return {charging_mode_list:[saved]};}};
 const x=new Experimental(cloud),connection={async control(...args){calls.push(args);}};
 await x.control('sn','profile_apply',{id:'existing'},null,connection);assert.deepEqual(calls,[['sn','custom',wire(saved)]]);
 enabled=0;await assert.rejects(x.control('sn','profile_apply',{id:'existing'},null,connection));assert.equal(calls.length,1);
});
