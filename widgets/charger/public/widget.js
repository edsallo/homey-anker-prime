'use strict';
let api,devices=[],selected='',page='overview',port='C1',busy=false,history=[],pollTimer;
const root=document.getElementById('app'),notice=document.getElementById('notice');
const ru=()=> api?.__ ? api.__('language')==='ru' : true;
const t=(r,e)=>ru()?r:e;
const modes=['', 'AI Power', 'Приоритет подключения', 'Два ноутбука', 'Малая мощность', 'Профиль Anker'];
function el(tag,text,attrs={}){const n=document.createElement(tag);if(text!==null)n.textContent=text;for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
function button(text,fn,cls=''){const b=el('button',text,{type:'button',class:cls});b.disabled=busy;b.onclick=fn;return b;}
function field(title,input){const label=el('label',null,{class:'field'});label.append(el('span',title),input);return label;}
function select(values,value){const n=el('select',null);for(const [v,title]of values)n.append(el('option',title,{value:v}));n.value=String(value);return n;}
const state=()=>devices.find(d=>d.id===selected)||devices[0];
const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString(ru()?'ru-RU':'en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
let lastHeight=0;
function resize(){const css=getComputedStyle(document.body);const height=Math.ceil(root.getBoundingClientRect().height+notice.getBoundingClientRect().height+parseFloat(css.paddingTop||0)+parseFloat(css.paddingBottom||0)+16);if(height!==lastHeight){lastHeight=height;api?.setHeight?.(height)?.catch?.(()=>{});}}
function icon(name){return el('span',null,{class:'icon homey-custom-icon-'+name,'aria-hidden':'true'});}
async function send(action,args){if(busy||state()?.stale)return;busy=true;notice.textContent=t('Выполняется…','Applying…');render();try{await api.api('POST','/control',{id:state().id,action,args});await refresh(false);notice.textContent=t('Подтверждено зарядкой','Confirmed by charger');}catch(e){notice.textContent=e.message||t('Нет подтверждения','Not confirmed');}finally{busy=false;render();}}
async function refresh(redraw=true){try{const result=await api.api('GET','/',{});devices=result;if(!selected&&devices.length)selected=devices[0].id;const s=state();if(s&&!s.stale&&Number.isFinite(s.total)){if(history.at(-1)?.time!==s.updated)history.push({time:s.updated,value:s.total});history=history.slice(-60);}if(redraw&&(!document.activeElement||!root.contains(document.activeElement)))render();}catch(e){notice.textContent=t('Не удалось обновить данные','Unable to refresh');}}
function render(){
 root.replaceChildren();root.className=page==='overview'?'':'detail';const s=state();if(!s){root.append(el('p',t('Добавьте Anker Prime через «Устройства».','Add Anker Prime in Devices first.')));resize();return;}
 if(devices.length>1){const chooser=select(devices.map(d=>[d.id,d.name]),s.id);chooser.onchange=()=>{selected=chooser.value;history=[];render();};root.append(chooser);}
 if(page!=='overview')root.append(button(t('‹ Обзор','‹ Overview'),()=>{page='overview';render();}));
 if(s.stale)root.append(el('p',t('Нет свежих данных','No fresh data')+(s.updated?` · ${new Date(s.updated).toLocaleTimeString()}`:''),{class:'error'}));
 if(page==='overview')overview(s);else if(page==='port')detail(s);else if(page==='settings')settings(s);else if(page==='schedule')schedule(s);
 if(s.stale||busy)for(const b of root.querySelectorAll('[data-control]'))b.disabled=true;
 resize();
}
function overview(s){
 const top=el('div',null,{class:'top'}),title=el('div',null);title.append(el('strong',s.name),el('div',ru()?modes[s.settings.mode]||'—':['','AI Power','Connection priority','Dual laptop','Low power','Custom'][s.settings.mode]||'—',{class:'muted'}));
 const total=el('div',fmt(s.total),{class:'total'});total.append(el('span',t(' Вт',' W'),{class:'unit'}));top.append(title,total);root.append(top);
 for(const p of ['C1','C2','C3','C4','A1','A2']){
  const g=s.groups[p[0]==='A'?'A':p],v=s.ports[p],row=el('div',null,{class:'port'});
  const open=button('',()=>{port=p;page='port';render();},'row');open.append(el('strong',p),el('span',s.labels?.[`label_${p}`]||t(p[0]==='A'?'Общее питание A1+A2':'USB-C',p[0]==='A'?'A1+A2 shared power':'USB-C'),{class:'label'}),el('span',`${fmt(v?.power)} ${t('Вт','W')}`,{class:'watts'}));
  open.append(el('span',`${fmt(v?.voltage,2)} ${t('В','V')} · ${fmt(v?.current,2)} ${t('А','A')}`,{class:'sub'}));
  if(g?.timerEnabled)open.append(el('span',t('Отключится через ','Off in ')+Math.ceil(g.remaining/60)+t(' мин',' min'),{class:'sub'}));
  row.append(open);
  if(p!=='A2'){const toggle=button(g?.on?t('Вкл','On'):t('Выкл','Off'),()=>send('power',{port:p==='A1'?'A':p,on:!g.on}),'switch');toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(!!g?.on));toggle.setAttribute('aria-label',t('Питание ','Power ')+(p==='A1'?'A1 + A2':p));toggle.setAttribute('data-control','');toggle.disabled=busy||s.stale||!g;row.append(toggle);}
  else row.append(el('span','↳ A1',{class:'muted'}));root.append(row);
 }
 const actions=el('div',null,{class:'actions'});const mode=button(t('Режим и экран','Mode & display'),()=>{page='settings';render();});mode.prepend(icon('mode'));actions.append(mode);root.append(actions);
 if(history.length>1){const chart=document.createElementNS('http://www.w3.org/2000/svg','svg');chart.setAttribute('viewBox','0 0 320 72');chart.setAttribute('class','graph');chart.setAttribute('role','img');chart.setAttribute('aria-label',t('Мощность USB за время просмотра','USB power during this session'));const max=Math.max(1,...history.map(v=>v.value)),first=history[0].time,span=Math.max(1,history.at(-1).time-first);let segment=[];const flush=()=>{if(segment.length>1){const line=document.createElementNS(chart.namespaceURI,'polyline');line.setAttribute('points',segment.join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','2');chart.append(line);}segment=[];};history.forEach((v,i)=>{if(i&&v.time-history[i-1].time>45000)flush();segment.push(`${2+316*(v.time-first)/span},${68-64*v.value/max}`);});flush();root.append(chart,el('div',t('Мощность USB · текущий просмотр','USB power · current session'),{class:'muted'}));}
}
function detail(s){
 const group=port[0]==='A'?'A':port,v=s.ports[port],g=s.groups[group];root.append(el('h2',port+' · '+(s.labels?.[`label_${port}`]||'USB')));
 const values=el('div',null,{class:'values'});for(const [value,label]of [[v?.power,t('Вт','W')],[v?.voltage,t('В','V')],[v?.current,t('А','A')]]){const n=el('div',fmt(value,value===v?.power?1:2));n.append(el('small',label));values.append(n);}root.append(values);
 root.append(el('p',g?.on?t('Питание включено','Power enabled'):t('Питание выключено','Power disabled'),{class:'muted'}));
 const actions=el('div',null,{class:'actions'});for(const minutes of [15,30,60,120]){const b=button(`${minutes} ${t('мин','min')}`,()=>send('timer',{port:group,minutes}));b.setAttribute('data-control','');actions.append(b);}const timerTitle=el('h2',t('Отключить через','Turn off after'));timerTitle.prepend(icon('timer'));root.append(timerTitle,actions);
 const custom=el('input',null,{type:'number',min:5,max:1435,step:5,value:60});const apply=button(t('Задать таймер','Set timer'),()=>send('timer',{port:group,minutes:Number(custom.value)}));apply.setAttribute('data-control','');root.append(field(t('Своё время, минуты (шаг 5)','Custom minutes (step 5)'),custom),apply);
 const cancel=button(t('Отменить таймер','Cancel timer'),()=>send('timer',{port:group,minutes:0}));cancel.setAttribute('data-control','');root.append(cancel,button(t('Расписание','Schedule'),()=>{page='schedule';render();}));
 if(group==='A')root.append(el('p',t('Таймер и расписание действуют одновременно на A1 и A2.','Timer and schedule affect both A1 and A2.'),{class:'muted'}));
}
function settings(s){
 root.append(el('h2',t('Режим и экран','Mode & display')));
 const options=[['mode',t('Режим зарядки','Charging mode'),[1,2,3,4].map(i=>[i,ru()?modes[i]:['','AI Power','Connection priority','Dual laptop','Low power'][i]])],['brightness',t('Яркость','Brightness'),Array.from({length:17},(_,i)=>[20+i*5,`${20+i*5}%`])],['timeout',t('Экран выключается через','Display timeout'),[[0,t('Никогда','Never')],[1,'30 s'],[2,'1 min'],[3,'5 min'],[4,'30 min']]],['clock',t('Формат часов','Clock format'),[[0,'12 h'],[1,'24 h']]],['knob',t('Регулятор','Dial'),[[0,t('Прямое направление','Forward')],[1,t('Обратное направление','Backward')]]]];
 for(const [action,title,choices]of options){const input=select(choices,s.settings[action]);if(action==='mode'&&s.settings.mode===5){const current=el('option',t('Сейчас: профиль Anker','Current: Anker profile'),{value:'5'});current.disabled=true;input.prepend(current);input.value='5';}input.setAttribute('data-control','');input.onchange=()=>send(action,{value:Number(input.value)});root.append(field(title,input));}
 const prio=select([[0,'—'],[1,'C1'],[2,'C2'],[3,'C1 + C2'],[4,'C3'],[5,'C1 + C3'],[6,'C2 + C3'],[8,'C4'],[9,'C1 + C4'],[10,'C2 + C4'],[12,'C3 + C4']],['C1','C2','C3','C4'].reduce((n,p,i)=>n+(s.groups[p]?.priority===2?1<<i:0),0));prio.setAttribute('data-control','');prio.onchange=()=>send('priority',{value:Number(prio.value)});root.append(field(t('Приоритет USB-C (до двух)','USB-C priority (up to two)'),prio));
 root.append(el('p',t('Изменения применяются сразу. Названия портов можно изменить в настройках устройства Homey.','Changes apply immediately. Rename ports in Homey device settings.'),{class:'muted'}));
}
function schedule(s){
 const group=port[0]==='A'?'A':port;root.append(el('h2',t('Расписание · ','Schedule · ')+group));
 root.append(el('p',t('Время по часам зарядки. Каждое событие сохраняется отдельно.','Charger local time. Each event is saved separately.'),{class:'muted'}));
 for(const kind of ['start','end']){
  const data=s.groups[group]?.[kind]||{},section=el('section',null,{class:'detail'});section.append(el('h2',kind==='start'?t('Включение','Turn on'):t('Выключение','Turn off')));
  const enabled=el('input',null,{type:'checkbox'});enabled.checked=!!data.enabled&&!!data.weekdays;section.append(field(t('Активно','Enabled'),enabled));
  const time=el('input',null,{type:'time',value:`${String(data.hour||0).padStart(2,'0')}:${String(data.minute||0).padStart(2,'0')}`});section.append(field(t('Время','Time'),time));
  const days=el('div',null,{class:'days'}),checks=[];for(let i=0;i<7;i++){const check=el('input',null,{type:'checkbox'});check.checked=!!(data.weekdays&(1<<i));checks.push(check);const label=el('label',(ru()?['Пн','Вт','Ср','Чт','Пт','Сб','Вс']:['Mo','Tu','We','Th','Fr','Sa','Su'])[i]);label.prepend(check);days.append(label);}section.append(days);
  const save=button(t('Сохранить событие','Save event'),()=>{const [hour,minute]=time.value.split(':').map(Number);const weekdays=checks.reduce((n,c,i)=>n+(c.checked?1<<i:0),0);if(enabled.checked&&!weekdays){notice.textContent=t('Выберите дни недели','Select weekdays');return;}send('schedule',{port:group,kind,enabled:enabled.checked,hour,minute,weekdays});});save.setAttribute('data-control','');section.append(save);root.append(section);
 }
}
function onHomeyReady(Homey){api=Homey;Homey.ready();refresh();pollTimer=setInterval(()=>{if(!document.hidden&&!busy)refresh();},3000);}
window.onHomeyReady=onHomeyReady;
