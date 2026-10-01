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
      a.cloud=new Cloud(a.credentials,a.session); const devices=await a.cloud.devices(); const info=await a.cloud.mqttInfo();
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
    catch(e){throw new Error(this.homey.__('command_failed'));}
  }
  async onUninit(){this.homey.clearInterval(this.health);await Promise.all([...this.accounts.values()].map(a=>a.connection?.close()));}
};
