'use strict';
const {wire,snapshot}=require('./experimental');
const ports=['C1','C2','C3','C4','A'];
function draft(settings,original,live){
 const number=Number(settings.profile_slot),name=String(settings.profile_name||'').trim();
 if(!Number.isInteger(number)||number<1||number>4||!name||name.length>40)throw Error('Укажите слот 1–4 и название до 40 символов.');
 const value=original?structuredClone(original):snapshot(live,number,name,Number(settings.profile_auto_exit));
 value.number=number;value.name=name;value.auto_exit=Number(settings.profile_auto_exit);
 for(const p of ports){const power=Number(settings['profile_'+p]);const old=original?.power_settings.find(x=>x.name===p)?.power;
  if(!Number.isInteger(power)||power<0||power>[140,100,100,100,24][ports.indexOf(p)]|| (p==='A'?![0,15,24].includes(power):power%5!==0&&power!==old))throw Error('USB-C: шаг 5 Вт. USB-A: 0, 15 или 24 Вт.');
  const entry=value.power_settings.find(x=>x.name===p);if(!entry)throw Error('Неполный профиль.');entry.power=power;
 }
 value.total_power=value.power_settings.reduce((n,p)=>n+p.power,0);value.max_total_power=250;wire(value);return value;
}
function fields(profile,live){
 const p=profile||snapshot(live,1,'',1);
 return {profile_name:profile?.name||'',profile_auto_exit:!!p.auto_exit,...Object.fromEntries(ports.map(port=>['profile_'+port,port==='A'?String(p.power_settings.find(x=>x.name===port)?.power??0):(p.power_settings.find(x=>x.name===port)?.power??0)]))};
}
module.exports={draft,fields};
