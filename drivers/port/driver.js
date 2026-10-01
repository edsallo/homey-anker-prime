'use strict';
const Homey=require('homey');
module.exports=class PortDriver extends Homey.Driver {
  async onPairListDevices(){
    const parents=Object.values(this.homey.drivers.getDriver('prime').getDevices());
    return parents.flatMap(d=>['C1','C2','C3','C4','A'].map(port=>({
      name:`${d.getName()} · ${port==='A'?'A1 + A2':port}`,
      data:{id:`${d.getData().sn}:${port}`,sn:d.getData().sn,port},store:{account:d.getStoreValue('account')},
      capabilities:port==='A'?['onoff','measure_power.usb',...['a1','a2'].flatMap(p=>['power','voltage','current'].map(m=>`measure_${m}.${p}`))]:['onoff','measure_power.usb','measure_voltage','measure_current'],
      capabilitiesOptions:port==='A'?Object.fromEntries(['a1','a2'].flatMap(p=>['power','voltage','current'].map(m=>[`measure_${m}.${p}`,{title:{en:`${p.toUpperCase()} ${m}`,ru:`${p.toUpperCase()} · ${{power:'Мощность',voltage:'Напряжение',current:'Ток'}[m]}`}}]))):{},
      icon:port==='A'?'/usba.svg':'/usbc.svg'
    })));
  }
};
