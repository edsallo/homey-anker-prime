'use strict';
const Homey=require('homey');
module.exports=class PrimeDevice extends Homey.Device {
  async onInit(){
    this.lastWrite=0;this.lastMode=null;this.updates=Promise.resolve();
    await this.setUnavailable(this.homey.__('connecting'));
    if(!this.getData().port&&!this.hasCapability('anker_mode_current'))await this.addCapability('anker_mode_current');
    if(!this.getData().port)for(const port of ['c1','c2','c3','c4','a1','a2'])for(const metric of ['voltage','current']){
      const id=`measure_${metric}.${port}`;if(!this.hasCapability(id))await this.addCapability(id);
    }
    if(!this.getData().port){
      await this.setCapabilityOptions('measure_power.usb',{...this.getCapabilityOptions('measure_power.usb'),title:{ru:'Общая мощность',en:'Total power'}});
      for(const port of ['c1','c2','c3','c4','a1','a2']){
        const id=`anker_port_summary.${port}`;if(this.hasCapability(id))await this.removeCapability(id);
        for(const metric of ['power','voltage','current']){
          const numeric=`measure_${metric}.${port}`;await this.setCapabilityOptions(numeric,{...this.getCapabilityOptions(numeric),uiComponent:null});
        }
      }
      for(const id of ['anker_port_select','anker_selected_label','measure_power.selected','measure_voltage.selected','measure_current.selected'])if(!this.hasCapability(id))await this.addCapability(id);
      this.selectedPort=this.getCapabilityValue('anker_port_select')||'C1';
      await this.setCapabilityValue('anker_port_select',this.selectedPort);
      await this.showSelectedPort();
      this.registerCapabilityListener('anker_port_select',value=>{
        if(!['C1','C2','C3','C4','A1','A2'].includes(value))throw new Error('Invalid port');
        this.updates=this.updates.catch(()=>{}).then(async()=>{this.selectedPort=value;await this.showSelectedPort();});return this.updates;
      });
    }
    if(this.hasCapability('onoff'))this.registerCapabilityListener('onoff',on=>this.homey.app.control(this.getData().id,'power',{on}));
    if(this.hasCapability('anker_mode'))this.registerCapabilityListener('anker_mode',value=>this.homey.app.control(this.getData().id,'mode',{value:Number(value)}));
    this.homey.app.attach(this).catch(()=>this.setUnavailable(this.homey.__('repair')));
  }
  async showSelectedPort(settings=this.getSettings()){
    const port=this.selectedPort||'C1';const label=String(settings[`label_${port}`]||'').trim();
    const title=port+(label?' · '+label:'');
    if(this.getCapabilityValue('anker_selected_label')!==title)await this.setCapabilityValue('anker_selected_label',title);
    const v=this.latestState?.ports[port];const fresh=this.wasOnline!==false&&v&&Date.now()-v.updated<=45000;
    for(const metric of ['power','voltage','current']){
      const id=`measure_${metric}.selected`,value=fresh&&Number.isFinite(v[metric])?v[metric]:null;
      if(this.getCapabilityValue(id)!==value)await this.setCapabilityValue(id,value);
    }
  }
  async onSettings({newSettings,changedKeys=[]}){
    if(this.getData().port)return;
    if(changedKeys.includes('display_brightness')&&(!Number.isInteger(newSettings.display_brightness)||newSettings.display_brightness<20||newSettings.display_brightness>100||newSettings.display_brightness%5))throw new Error(this.homey.__('brightness_range'));
    let schedule;
    if(changedKeys.some(k=>k==='clock_start'||k==='clock_end'||k.startsWith('clock_day_'))){
      const parse=value=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error(this.homey.__('time_format'));return value.split(':').map(Number);};
      const [startHour,startMinute]=parse(newSettings.clock_start),[endHour,endMinute]=parse(newSettings.clock_end);
      schedule={startHour,startMinute,endHour,endMinute,weekdays:Array.from({length:7},(_,i)=>newSettings[`clock_day_${i}`]?1<<i:0).reduce((a,b)=>a+b,0)};
    }
    this.applyingSettings=true;
    try{
      if(changedKeys.includes('display_brightness'))await this.homey.app.control(this.getData().id,'brightness',{value:newSettings.display_brightness});
      if(changedKeys.includes('display_theme')&&newSettings.display_theme!=='other')await this.homey.app.displayTheme(this,newSettings.display_theme);
      for(const [key,action] of [['display_timeout','timeout'],['clock_format','clock'],['knob_direction','knob'],['port_priority','priority']])if(changedKeys.includes(key))await this.homey.app.control(this.getData().id,action,{value:Number(newSettings[key])});
      if(schedule)await this.homey.app.control(this.getData().id,'clock_schedule',schedule);
      if(changedKeys.includes('clock_holiday'))await this.homey.app.control(this.getData().id,'clock_holiday',{enabled:newSettings.clock_holiday});
      await this.showSelectedPort(newSettings);
    }finally{this.applyingSettings=false;}
  }
  async syncDisplaySettings(s){
    if(this.applyingSettings)return;
    const patch={},settings=this.getSettings();
    if(Number.isInteger(s.settings.brightness)&&s.settings.brightness!==settings.display_brightness)patch.display_brightness=s.settings.brightness;
    if(Number.isInteger(s.settings.themeId)){
      const id=String(s.settings.themeId),theme=(s.settings.clockSettings&6)===2&&Object.hasOwn(require('../../lib/themes.json'),id)?id:'other';
      if(theme!==settings.display_theme)patch.display_theme=theme;
    }
    for(const [key,field] of [['display_timeout','timeout'],['clock_format','clock'],['knob_direction','knob']])if(Number.isInteger(s.settings[field])&&settings[key]!==String(s.settings[field]))patch[key]=String(s.settings[field]);
    if(['C1','C2','C3','C4'].every(p=>[1,2].includes(s.groups[p]?.priority))){const priority=String(['C1','C2','C3','C4'].reduce((n,p,i)=>n+(s.groups[p].priority===2?1<<i:0),0));if(settings.port_priority!==priority)patch.port_priority=priority;}
    if(Number.isInteger(s.settings.clockSettings)&&settings.clock_holiday!==Boolean(s.settings.clockSettings&64))patch.clock_holiday=Boolean(s.settings.clockSettings&64);
    if(s.settings.clockSchedule){
      const c=s.settings.clockSchedule,fmt=(h,m)=>String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
      for(const [key,value] of [['clock_start',fmt(c.startHour,c.startMinute)],['clock_end',fmt(c.endHour,c.endMinute)],...Array.from({length:7},(_,i)=>[`clock_day_${i}`,Boolean(c.weekdays&(1<<i))])])if(settings[key]!==value)patch[key]=value;
    }
    if(Object.keys(patch).length)await this.setSettings(patch);
  }
  updateState(state){this.updates=this.updates.catch(()=>{}).then(()=>this.applyState(state));return this.updates;}
  async applyState(s){
    await this.setAvailable();const port=this.getData().port;this.latestState=s;
    if(!port){
      const flow=this.homey.flow;
      if(this.previous){
        for(const [p,g] of Object.entries(s.groups))if(this.previous.groups[p]&&g.on!==this.previous.groups[p].on)flow.getDeviceTriggerCard('anker_port_changed').trigger(this,{port:p,on:g.on}).catch(()=>{});
        if(s.settings.mode!==this.previous.settings.mode)flow.getDeviceTriggerCard('anker_mode_changed').trigger(this,{mode:String(s.settings.mode)}).catch(()=>{});
      }
      if(this.wasOnline===false)flow.getDeviceTriggerCard('anker_connection_changed').trigger(this,{online:true}).catch(()=>{});
      this.previous=structuredClone(s);this.wasOnline=true;
    }
    const put=async(k,v)=>{if(v!==undefined&&v!==null&&this.hasCapability(k)&&this.getCapabilityValue(k)!==v)await this.setCapabilityValue(k,v);};
    if(port)await put('onoff',s.groups[port]?.on);
    else if(s.settings.mode){
      const mode=s.settings.mode;
      await put('anker_mode_current',this.homey.__(`modes.${mode}`));
      const selected=mode>=1&&mode<=4?String(mode):null;
      if(this.getCapabilityValue('anker_mode')!==selected)await this.setCapabilityValue('anker_mode',selected);
    }
    if(!port){await this.showSelectedPort();await this.syncDisplaySettings(s);}
    if(Date.now()-this.lastWrite<10000)return;this.lastWrite=Date.now();
    if(port==='A'){
      await put('measure_power.usb',s.ports.A1&&s.ports.A2?s.ports.A1.power+s.ports.A2.power:null);
      for(const p of ['A1','A2'])for(const m of ['power','voltage','current'])await put(`measure_${m}.${p.toLowerCase()}`,s.ports[p]?.[m]);
    }else if(port){for(const m of ['power','voltage','current'])await put(`measure_${m}${m==='power'?'.usb':''}`,s.ports[port]?.[m]);}
    else{
      await put('measure_power.usb',s.total);
      for(const [p,v] of Object.entries(s.ports)){
        for(const metric of ['power','voltage','current'])await put(`measure_${metric}.${p.toLowerCase()}`,v[metric]);

      }
    }
  }
  async markOffline(){
    if(!this.getData().port&&this.wasOnline===true)this.homey.flow.getDeviceTriggerCard('anker_connection_changed').trigger(this,{online:false}).catch(()=>{});
    this.wasOnline=false;if(!this.getData().port)await this.showSelectedPort();await this.setUnavailable(this.homey.__('offline'));
  }
  async onDeleted(){await this.homey.app.detach(this);}
};
