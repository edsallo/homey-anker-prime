'use strict';
const Homey=require('homey');
module.exports=class PrimeDriver extends Homey.Driver {
  async onPair(session){
    let account,devices,region='eu',country='DE';
    session.setHandler('region',data=>{if(!['eu','com'].includes(data.region)||!/^[A-Z]{2}$/.test(data.country))throw new Error('Invalid region');region=data.region;country=data.country;return true;});
    session.setHandler('login',async data=>{const result=await this.homey.app.authenticate({email:data.username,password:data.password,region,country});account=result.id;devices=result.devices;return true;});
    session.setHandler('list_devices',async()=>{if(!account)throw new Error('Log in first');return devices.map(d=>({name:d.alias_name||'Anker Prime',data:{id:d.device_sn,sn:d.device_sn},store:{account,firmware:d.device_sw_version}}));});
  }
  async onRepair(session,device){
    let region='eu',country='DE';
    session.setHandler('region',data=>{region=data.region;country=data.country;return true;});
    session.setHandler('login',async data=>{
      const result=await this.homey.app.authenticate({email:data.username,password:data.password,region,country});
      if(!result.devices.some(d=>d.device_sn===device.getData().sn)||result.id!==device.getStoreValue('account'))throw new Error(this.homey.__('wrong_account'));
      await this.homey.app.commit(result.id);await this.homey.app.connectAccount(result.id);return true;
    });
  }
};
