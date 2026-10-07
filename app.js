'use strict';
const Homey = require('homey');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const Cloud = require('./lib/cloud');
const Connection = require('./lib/connection');
module.exports = class AnkerApp extends Homey.App {
  async onInit() {
    this.accounts = new Map(); this.starting = new Map(); this.devices = new Set(); this.pending = new Map(); this.saving = Promise.resolve();
    this.ready = this.loadVault(); await this.ready;
    this.health = this.homey.setInterval(() => {
      for (const device of this.devices) {
        const s = this.accounts.get(device.getStoreValue('account'))?.connection?.states.get(device.getData().sn);
        if (!s || Date.now()-s.updated > 45000) device.markOffline().catch(() => {});
      }
      for (const [id,a] of this.accounts) if (this.uses(id) && Date.now() >= (a.retryAt || 0) && (!a.connection || !a.connection.client?.connected && Date.now()-(a.connectedAt||0)>120000)) this.connectAccount(id).catch(() => {});
      for (const [id,p] of this.pending) if (Date.now()-p.created > 600000) this.pending.delete(id);
    },15000);
    for (const action of ['power','timer','mode','brightness','timeout','clock','knob','priority','schedule']) {
      this.homey.flow.getActionCard(`anker_${action}`).registerRunListener(async args => {
        const {device,...params}=args; if(action==='schedule')params.weekdays=Number(params.weekdays); if(['mode','timeout','clock','knob','priority'].includes(action))params.value=Number(params.value); await this.control(device.getData().id,action,params); return true;
      });
    }
    this.homey.flow.getActionCard('anker_limit').registerRunListener(async({device,value})=>{await this.control(device.getData().id,'limit',{value});return true;});
    this.homey.flow.getActionCard('anker_limit_a').registerRunListener(async({device,value})=>{await this.control(device.getData().id,'limit',{value:Number(value)});return true;});
    this.homey.flow.getActionCard('anker_energy_reset').registerRunListener(async({device})=>{await device.resetEnergy();return true;});
    this.homey.flow.getConditionCard('anker_energy_above').registerRunListener(async({device,value})=>device.getCapabilityValue('meter_usb_energy')>value);
    this.homey.flow.getConditionCard('anker_limits_active').registerRunListener(async({device})=>{const s=this.snapshot(device);if(s.stale)throw new Error(this.homey.__('offline'));return s.settings.mode===5;});
    this.homey.flow.getConditionCard('anker_port_on').registerRunListener(async ({device,port}) => {
      const snapshot=this.snapshot(device); if(snapshot.stale) throw new Error(this.homey.__('offline')); return snapshot.groups[port]?.on === true;
    });
  }
  async loadVault() {
    try { const data=JSON.parse(await fs.readFile('/userdata/anker-accounts.json','utf8')); for (const [id,value] of Object.entries(data)) this.accounts.set(id,{...value}); }
    catch(e) { if(e.code!=='ENOENT') throw new Error('Unable to read Anker account storage'); }
  }
  async saveVault() {
    this.saving=this.saving.catch(()=>{}).then(async()=>{
      const data={}; for(const [id,a] of this.accounts) data[id]={credentials:a.credentials,session:a.cloud?.session||a.session};
      await fs.writeFile('/userdata/anker-accounts.tmp',JSON.stringify(data),{mode:0o600});
      await fs.rename('/userdata/anker-accounts.tmp','/userdata/anker-accounts.json');
    }); return this.saving;
  }
  uses(id) { return [...this.devices].some(d=>d.getStoreValue('account')===id); }
  async authenticate(credentials) {
    await this.ready;
    const cloud=new Cloud(credentials); await cloud.login(); const devices=await cloud.devices();
    if(!devices.length) throw new Error(this.homey.__('no_devices'));
    const id=crypto.createHash('sha256').update(`${credentials.region}:${cloud.session.user_id}`).digest('hex');
    this.pending.set(id,{credentials,session:cloud.session,devices,created:Date.now()});
    return {id,devices};
  }
  async commit(id) {
    const p=this.pending.get(id);
    if(p){ const old=this.accounts.get(id); if(old?.connection) await old.connection.close(); this.accounts.set(id,{credentials:p.credentials,session:p.session}); await this.saveVault(); this.pending.delete(id); }
    if(!this.accounts.has(id)) throw new Error(this.homey.__('repair'));
  }
  async attach(device) {
    await this.ready; this.devices.add(device); const id=device.getStoreValue('account'); await this.commit(id); await this.connectAccount(id);
    const state=this.accounts.get(id).connection?.states.get(device.getData().sn); if(state) await device.updateState(state);
    if(!device.getData().port)await this.refreshProfiles(device,true).catch(()=>device.error('Unable to load Anker profiles'));
  }
  async detach(device) {
    this.devices.delete(device); const id=device.getStoreValue('account');
    if(!this.uses(id)){await this.accounts.get(id)?.connection?.close();this.accounts.delete(id);this.pending.delete(id);await this.saveVault();}
  }
  async connectAccount(id) {
    if(this.starting.has(id)) return this.starting.get(id);
    const a=this.accounts.get(id); if(!a) throw new Error(this.homey.__('repair'));
    if(a.connection?.client?.connected) return;
    a.retryAt=Date.now()+60000;
    const promise=(async()=>{
      if(a.connection) await a.connection.close();
      a.cloud=new Cloud(a.credentials,a.session); a.experimental=new (require('./lib/experimental').Experimental)(a.cloud); const devices=await a.cloud.devices(); const info=await a.cloud.mqttInfo();
      await this.saveVault();
      const connection=new Connection(info,devices); a.connection=connection; a.connectedAt=Date.now();
      connection.on('state',(sn,state)=>{ for(const d of this.devices) if(d.getStoreValue('account')===id && d.getData().sn===sn) d.updateState(state).catch(()=>{}); });
      connection.on('offline',()=>{for(const d of this.devices) if(d.getStoreValue('account')===id)d.markOffline().catch(()=>{});});
      try{await connection.connect();a.failures=0;}catch(e){await connection.close();a.connection=null;throw e;}
    })();
    this.starting.set(id,promise);try{await promise;}catch(e){a.failures=(a.failures||0)+1;a.retryAt=Date.now()+Math.min(600000,30000*2**a.failures);throw e;}finally{this.starting.delete(id);}
  }
  snapshot(device) {
    const connection=this.accounts.get(device.getStoreValue('account'))?.connection;
    const s=connection?.states.get(device.getData().sn);
    const value=s?structuredClone(s):{ports:{},groups:{},settings:{},updated:0,total:null};
    return {id:device.getData().id,name:device.getName(),...value,stale:!connection?.client?.connected||!s||Date.now()-s.updated>45000,labels:device.getSettings()};
  }
  overview() { return [...this.devices].filter(d=>!d.getData().port).map(d=>this.snapshot(d)); }
  async displayTheme(device,id){
    if(!Object.hasOwn(require('./lib/themes.json'),String(id)))throw new Error('Unknown theme');
    const account=this.accounts.get(device.getStoreValue('account'));if(!account?.cloud)throw new Error(this.homey.__('offline'));
    const args=await account.cloud.theme(id);return this.control(device.getData().id,'theme',args);
  }
  async control(deviceId,action,args) {
    const device=[...this.devices].find(d=>d.getData().id===deviceId);if(!device)throw new Error('Unknown device');
    const a=this.accounts.get(device.getStoreValue('account'));if(!a?.connection)throw new Error(this.homey.__('offline'));
    try{return await a.connection.control(device.getData().sn,action,{...args,...(device.getData().port?{port:device.getData().port}:{})});}
    catch(e){
      if(e.code==='LIMIT_BUDGET')throw new Error(this.homey.__('limit_budget').replace('{watts}',String(e.available)));
      if(e.code==='LIMIT_RANGE')throw new Error(this.homey.__('limit_range'));
      if(e.code==='PROFILE_MISSING')throw new Error(this.homey.__('profile_missing'));
      throw new Error(this.homey.__('command_failed'));
    }
  }
  async refreshProfiles(device,load=false){
    const a=this.accounts.get(device.getStoreValue('account'));if(!a?.experimental)throw new Error(this.homey.__('offline'));
    const data=await a.experimental.refresh(device.getData().sn);await this.saveVault();
    if(!device.getStoreValue('profilesBeforeUpgrade'))await device.setStoreValue('profilesBeforeUpgrade',data);
    const patch={experimental_info:this.homey.__('profile_shared'),profile_info:data.profiles.map(p=>`${p.number}: ${p.name} (${p.total_power} W)`).join(' · ')||this.homey.__('profile_empty'),...Object.fromEntries(['compatibility','customEnabled','identification'].map(k=>['exp_'+k,data[k]]))};
    if(load){const selected=data.profiles.find(p=>p.number===Number(device.getSetting('profile_slot')||1));Object.assign(patch,require('./lib/profile-editor').fields(selected,this.snapshot(device).settings));}
    await device.setSettings(patch);return data;
  }
  async webExperimentalControl(device,action,args){
    const a=this.accounts.get(device.getStoreValue('account'));if(!a?.experimental)throw new Error(this.homey.__('offline'));
    const previous=a.profileQueue||Promise.resolve();
    const job=previous.catch(()=>{}).then(async()=>{
      if(action!=='experimental_refresh')await a.experimental.control(device.getData().sn,action,args,this.snapshot(device).settings,a.connection);
      await this.refreshProfiles(device);return {ok:true};
    });a.profileQueue=job;return job;
  }
  async profileSettings(device,settings,changed){
    const a=this.accounts.get(device.getStoreValue('account'));if(!a?.experimental)throw new Error(this.homey.__('offline'));
    const sn=device.getData().sn;
    // Serialize native settings callbacks with other profile/cloud writes.
    const previous=a.profileQueue||Promise.resolve();
    const job=previous.catch(()=>{}).then(async()=>{
      for(const key of ['compatibility','customEnabled','identification'])if(changed.includes('exp_'+key))await a.experimental.control(sn,'experimental',{setting:key,enabled:settings['exp_'+key]},null,a.connection);
      const action=changed.includes('profile_action')?settings.profile_action:'none';
      let data=await a.experimental.refresh(sn);const original=data.profiles.find(p=>p.number===Number(settings.profile_slot));
      if(action==='save'){
        const value=require('./lib/profile-editor').draft(settings,original,this.snapshot(device).settings);
        if(original)value.id=original.id;else {delete value.id;value.device_sn=sn;}
        await a.cloud.request('mini_power/v1/app/charging/'+(original?'update_charging_mode':'add_charging_mode'),value);
        data=await a.experimental.refresh(sn);
        const saved=data.profiles.find(p=>p.number===value.number);
        if(!saved||saved.name!==value.name||JSON.stringify(require('./lib/experimental').wire(saved))!==JSON.stringify(require('./lib/experimental').wire(value)))throw Error('Anker не подтвердил сохранение профиля.');
      }else if(action==='apply'||action==='delete'){
        if(!original)throw Error('Выбранный слот пуст.');
        await a.experimental.control(sn,action==='apply'?'profile_apply':'profile_delete',{id:original.id},null,a.connection);
      }
      await this.saveVault();
      // Homey commits newSettings after onSettings resolves. Refresh afterwards,
      // without overwriting a user's unsaved editor draft during normal telemetry.
      if(device.profileRefreshTimer)this.homey.clearTimeout(device.profileRefreshTimer);
      device.profileRefreshTimer=this.homey.setTimeout(async()=>{try{
        await device.setSettings({profile_slot:settings.profile_slot,profile_action:'none'});
        await this.refreshProfiles(device,['load','delete'].includes(action));
      }catch{device.error('Unable to refresh Anker profile settings');}},1000);
    });a.profileQueue=job;return job;
  }
  async onUninit(){this.homey.clearInterval(this.health);await Promise.all([...this.accounts.values()].map(a=>a.connection?.close()));}
};
