const pages={dashboard:'Dashboard',trading:'Live Trading',session:'Bot Session',screener:'Screener',strategies:'Strategy Editor',backtesting:'Backtesting',portfolio:'Portfolio',settings:'Settings',profile:'Profile'};
const paths={
dashboard:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',screener:'M3 4h18v4l-7 6v5l-4 2v-7L3 8z',
strategies:'M4 7h16M4 17h16M8 4v6m8 4v6',backtesting:'M3 12a9 9 0 1 0 3-6m-3-2v5h5m4-2v5l3 2',
portfolio:'M4 8h16v12H4zm4 0V5h8v3M4 13h16m-9 0v2h2v-2',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v2m0 14v2m9-9h-2M5 12H3m15-6-2 2m-8 8-2 2m12 0-2-2m-8-8-2-2',
profile:'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',bell:'M5 17h14l-2-3v-4a5 5 0 0 0-10 0v4zm5 3h4',
trading:'M3 12h4l3-7 4 14 3-7h4',
equity:'m3 17 5-5 4 3 8-9m-5 0h5v5',wallet:'M3 6h17v13H3zm17 4h-6v5h6',bot:'M5 8h14v11H5zM12 4v4M2 12v3m20-3v3M9 12h.01M15 12h.01M9 16h6',plus:'M12 5v14M5 12h14'};
const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[k]}"/></svg>`;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const usd=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v):'—';
const num=v=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
const qtyText=v=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:9}):'—';
const pct=v=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(2)+'%':'—';
const stamp=(v,opts)=>v?new Date(v).toLocaleString(undefined,opts??{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const date=v=>new Date(v).toISOString().slice(0,10);
const tone=v=>['live','polling','connected','simulated','filled','Running','running','buy'].includes(v)?'good':['offline','rejected','sell'].includes(v)?'bad':'';
const color=v=>v>0?'good':v<0?'bad':'';
const badge=(v,t=tone(v))=>`<span class="badge ${t}">${esc(v)}</span>`;
const btn=(label,action,value='',primary=false,attrs='')=>`<button type="button" class="button ${primary?'primary':''}" data-action="${action}" data-value="${esc(value)}" ${attrs}>${label}</button>`;
const link=(label,page,primary=false)=>`<a class="button ${primary?'primary':''}" href="#${page}">${label}</a>`;
const empty=s=>`<p class="empty">${esc(s)}</p>`;
const page=(label,title,desc,action='')=>`<div class="page-title"><div><div class="eyebrow">${label}</div><h1>${title}</h1><p class="sub">${desc}</p></div>${action}</div>`;
const panel=(title,desc,contents,action='',style='')=>`<section class="panel ${style}"><div class="panel-head"><div><h2>${title}</h2>${desc?'<small>'+desc+'</small>':''}</div>${action}</div>${contents}</section>`;
const table=(cols,rows,err)=>rows.length?`<div class="table-wrap"><table><thead><tr>${cols.map(c=>'<th scope="col">'+c+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`:empty(err);
const field=(label,k,v,attr='')=>`<label class="field">${label}<input name="${k}" value="${esc(v)}" ${attr}></label>`;
const numeric=(label,k,v,min,max,step=.01)=>field(label,k,v,`type="number" required min="${min}" max="${max}" step="${step}"`);
const select=(label,k,options,v,required=false)=>`<label class="field">${label}<select name="${k}" ${required?'required':''}>${options.map(([id,name])=>`<option value="${esc(id)}" ${String(v)===String(id)?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
const check=(label,k,v)=>`<label class="check"><input type="checkbox" name="${k}" ${v?'checked':''}>${label}</label>`;
const submit=(label,disabled=false)=>`<div><button class="button primary" ${disabled?'disabled':''}>${label}</button></div>`;
const form=(id,fields,tail)=>`<form class="form" id="${id}"><div class="fields">${fields}</div>${tail}</form>`;
function read(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
const localWorkspace=['127.0.0.1','localhost'].includes(location.hostname);
let authInfo=null,authMode='login',authRevision=0;
let state=null,online=false,active='',selected='',chartMode='Price',range='1H',assetClass='Stocks',editor=null,editorRoute='',runA='',runB=null,pending=false,syncing=false,toastTimer;
const ranges={'15M':15,'1H':60,'4H':240,'1D':1440};
const screen={search:'',volume:0,volatility:0};
const cryptoScreen={search:'',volume:0,volatility:0};
let botFilter='all', launchVersion=null, launchInstrument=null, launchBudget='', fundBudget=null;
let notifOpen=false, notifFilter='all', lastSeenNotif='';
const historyFilter={asset:'',strategy:'',start:'',end:''};
const key=s=>s.id+'@'+s.version;
const version=k=>state.strategies.find(s=>key(s)===k);
const latest=()=>Object.values(Object.fromEntries(state.strategies.map(s=>[s.id,s])));
const params=()=>new URLSearchParams(location.hash.split('?')[1]??'');
const botStatus=b=>b.desired==='running'?b.status:b.desired;
const syncLabel=()=>state.synced?'Last sync '+stamp(state.synced):'Awaiting first sync';
function toast(s){const n=$('#toast');n.textContent=s;n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,4500)}
function chrome(){
 const groups=[['WORKSPACE',['dashboard','trading','screener','strategies','backtesting','portfolio']],['PREFERENCES',['settings','profile']]];
 const nav=$('#nav');
 if(nav.dataset.page!==active){
   nav.innerHTML=groups.map(([label,items])=>`<span class="nav-label">${label}</span>`+items.map(k=>`<a href="#${k}" class="nav-link ${k===active||k==='trading'&&active==='session'?'active':''}" ${k===active?'aria-current="page"':''}>${icon(k)}${pages[k]}</a>`).join('')).join('');
   nav.dataset.page=active;
 }
 const mobileNav=$('#mobile-nav');
 if(mobileNav&&mobileNav.dataset.page!==active){
   const mobileTabs=[['dashboard','Home'],['trading','Bots'],['screener','Markets'],['strategies','Rules'],['portfolio','Assets']];
   mobileNav.innerHTML=mobileTabs.map(([k,label])=>`<a href="#${k}" class="mobile-tab ${k===active||k==='trading'&&active==='session'?'active':''}" ${k===active?'aria-current="page"':''}>${icon(k)}<span>${label}</span></a>`).join('');
   mobileNav.dataset.page=active;
 }
 $('#crumb').innerHTML='Workspace <span>/</span> <strong>'+pages[active]+'</strong>';
 const unread=state?.events?state.events.filter(e=>!lastSeenNotif||e.t>lastSeenNotif).length:0;
 const bell=$('#bell');
 if(bell){
   bell.innerHTML=icon('bell')+(unread?`<span class="bell-badge">${unread>9?'9+':unread}</span>`:'');
   bell.setAttribute('aria-expanded',String(notifOpen));
 }
 if(!state)return;
 const status=$('#connection');
 status.className='connection '+(online?tone(state.feed):'bad');
 status.innerHTML='<i class="dot"></i>'+esc(!online?'Browser offline · Cached':({simulated:'Demo feed',live:'Feed connected',polling:'Feed connected (REST)',delayed:'Delayed feed'})[state.feed]??'Feed '+state.feed);
 status.title=syncLabel();
 $('#workspace-mode').textContent=state.mode==='demo'?'Demo workspace':'Alpaca Paper';
 $('#workspace-source').textContent=online?'Broker '+state.broker:syncLabel();
 $('#profile-name').textContent=state.profile.name;
 const initials=state.profile.name.split(/ +/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'PT';
 $('#avatar').textContent=initials;
 const mobileAvatar=$('#mobile-avatar');
 if(mobileAvatar)mobileAvatar.textContent=initials;
 renderNotifDrawer();
}
function renderNotifDrawer(){
 const backdrop=$('#notif-backdrop'), drawer=$('#notif-drawer');
 if(!backdrop||!drawer)return;
 const signedOut=authInfo?.required&&!authInfo.authenticated;
 const open=notifOpen&&!signedOut&&Boolean(state);
 backdrop.hidden=!open;
 drawer.hidden=!open;
 if(!open)return;
 const kinds=[['all','All'],['signals','Signals'],['fills','Fills'],['risk','Risk'],['connections','Feed']];
 const events=(state.events??[]).filter(e=>notifFilter==='all'||e.kind===notifFilter);
 const kindTone=k=>k==='fills'||k==='signals'?'good':k==='connections'?'bad':'';
 drawer.innerHTML=`<div class="notif-handle"><span></span></div>
  <div class="notif-head"><div><b>Notifications</b><small>${syncLabel()}</small></div><div class="actions">${btn('Mark read','mark-notifs-read')}${btn('Close','close-notifs')}</div></div>
  <div class="notif-filters">${kinds.map(([k,label])=>btn(label,'notif-filter',k,false,`aria-pressed="${notifFilter===k}"`)).join('')}</div>
  <div class="notif-list">${events.length?events.map(e=>`<div class="notif-item"><div class="inline">${badge(e.kind??'alert',kindTone(e.kind))}<small>${stamp(e.t)}</small></div><p>${esc(e.message)}</p></div>`).join(''):empty('No notifications in this category yet.')}</div>
  <div class="notif-foot"><a class="button" href="#settings" data-action="close-notifs">Alert preferences &amp; Integrations →</a></div>`;
}
let chartId=0;
function plot(points,unit='price'){
 if(points.length<2)return empty('Chart history will appear as data arrives.');
 const max=Math.max(...points.map(p=>p.value)),min=Math.min(...points.map(p=>p.value));
 const pad=Math.max((max-min)*.15,Math.abs(max)*.0004,.01),low=min-pad,high=max+pad;
 const x=i=>10+690*i/(points.length-1),y=v=>230-218*(v-low)/(high-low);
 const line=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(p.value).toFixed(2)).join(' ');
 const grids=Array.from({length:5},(_,i)=>{const row=12+i*54.5,v=high-(high-low)*i/4;return `<path d="M10 ${row}H700" stroke="#28364a" stroke-dasharray="3 5"/><text x="711" y="${row+4}">${unit==='percent'?v.toFixed(1)+'%':num(v)}</text>`}).join('');
 const ticks=Array.from({length:6},(_,i)=>{const j=Math.round((points.length-1)*i/5),long=Date.parse(points.at(-1).t)-Date.parse(points[0].t)>86400000;return `<text x="${x(j)}" y="253" text-anchor="${i===0?'start':i===5?'end':'middle'}">${esc(stamp(points[j].t,long?{month:'short',day:'numeric'}:{hour:'2-digit',minute:'2-digit',hour12:false}))}</text>`}).join('');
 const id='shade'+(++chartId);
 return `<div class="plot" tabindex="0" aria-label="Interactive chart. Use arrow keys to inspect values." data-points="${esc(JSON.stringify(points))}" data-unit="${unit}" data-low="${low}" data-high="${high}"><svg viewBox="0 0 790 265" role="img" aria-label="Time series chart"><defs><linearGradient id="${id}" x1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#43e2ae" stop-opacity=".23"/><stop offset="100%" stop-color="#43e2ae" stop-opacity="0"/></linearGradient></defs>${grids}${ticks}<path d="${line} L700 230 H10 Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="#4be4b2" stroke-width="2" vector-effect="non-scaling-stroke"/><line class="crosshair" y1="12" y2="230" stroke="#7e98b5" stroke-dasharray="4 4" visibility="hidden"/><circle class="point" r="4" fill="#4be4b2" stroke="#0b1018" stroke-width="2" visibility="hidden"/></svg><div class="tooltip" role="status" hidden></div></div>`;
}
function inspect(node,i){
 const points=node.points??=JSON.parse(node.dataset.points);
 i=Math.max(0,Math.min(points.length-1,i));node.index=i;
 const point=points[i],x=10+690*i/(points.length-1),low=+node.dataset.low,high=+node.dataset.high,y=230-218*(point.value-low)/(high-low);
 const line=node.querySelector('.crosshair'),dot=node.querySelector('.point'),tip=node.querySelector('.tooltip');
 line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('visibility','visible');
 dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('visibility','visible');
 tip.style.left=Math.max(12,Math.min(87,x/790*100))+'%';tip.style.top=Math.max(18,y/265*100)+'%';
 tip.hidden=false;tip.textContent=stamp(point.t)+' · '+(node.dataset.unit==='percent'?pct(point.value):usd(point.value));
}
const metric=(label,v,note,k,mint=false)=>`<section class="panel metric"><div class="metric-head">${label}<span class="card-icon ${mint?'mint':''}">${icon(k)}</span></div><div class="metric-value">${v}</div><div class="metric-foot">${note}</div></section>`;
const mark=(s,i=0)=>`<span class="ticker-mark" data-color="${i%5}">${esc(s.slice(0,2))}</span>`;
const orders=(items,limit=100)=>table(['Asset','Side','Filled / quantity','Fill price','Status','Time'],items.slice(0,limit).map(o=>[esc(o.symbol),badge(o.side),qtyText(o.filled)+' / '+qtyText(o.qty),usd(o.price),badge(o.status),stamp(o.t)]),'Orders will appear after a bot submits a signal.');
const sessionRoute=b=>'session?id='+encodeURIComponent(b.id);
const botRows=()=>Object.values(state.bots).map(b=>`<a class="bot-row bot-session-link" href="#${sessionRoute(b)}"><span><b>${esc(b.name)}</b><small>${esc(b.symbol)} · v${b.version}</small></span>${badge(botStatus(b))}</a>`).join('')||empty('No bots started. Launch a saved strategy in Live Trading.');
function dashboard(){
 const a=state.account,m=state.market.find(i=>i.symbol===selected)??state.market[0],enabled=Object.values(state.bots).filter(b=>b.desired==='running'),running=enabled.filter(b=>b.status==='Running');
 const chartSymbol=m?.symbol??'';
 const change=a.dayStart?100*(a.equity/a.dayStart-1):null, hasAccount=state.mode==='demo'||state.equity.length>0;
 const all=chartMode==='Price'?(state.bars[chartSymbol]??[]).map(b=>({t:b.t,value:b.c})):state.equity;
 if(chartMode==='Price'&&Number.isFinite(m?.price)&&m.t>all.at(-1)?.t)all.push({t:m.t,value:m.price});
 const since=Date.parse(all.at(-1)?.t)-ranges[range]*60000;
 const segmented=(values,action,current)=>`<div class="segmented">${values.map(v=>`<button type="button" class="${v===current?'selected':''}" data-action="${action}" data-value="${v}" aria-pressed="${v===current}">${v}</button>`).join('')}</div>`;
 const title=chartMode==='Equity'?'Account equity':m?`<span class="trade-hero">${mark(chartSymbol)}<span>${esc(chartSymbol)} <span class="mono">${usd(m.price)}</span></span></span>`:'Market price';
 const desc=chartMode==='Price'?esc(m?.source??state.feedName)+' · '+esc(online?m?.freshness:'cached')+' · '+stamp(m?.t):'Paper account · '+esc(online?state.broker:'cached')+' · '+stamp(all.at(-1)?.t);
 const price=panel(title,desc,plot(all.filter(p=>Date.parse(p.t)>=since)),`<div class="actions">${segmented(['Price','Equity'],'chart',chartMode)}${segmented(Object.keys(ranges),'range',range)}</div>`,'chart-panel');
 const watch=panel('Watchlist','Recent stock and crypto movement',`<div class="watch-list">${state.market.map((m,i)=>`<button class="watch-row" data-action="watch" data-value="${m.symbol}">${mark(m.symbol,i)}<span><b>${m.symbol}</b><small>${esc(m.name)}</small></span><span class="watch-right"><b>${usd(m.price)}</b><small class="${color(m.change)}">${pct(m.change)}</small></span></button>`).join('')}</div><a class="watch-footer" href="#screener">Open screener →</a>`);
 const signals=state.signals.length?`<div class="activity">${state.signals.slice(0,4).map(s=>`<div class="activity-item"><div class="inline"><b>${esc(s.symbol)}</b>${badge(s.direction)}</div><p>${esc(s.rationale)}</p><small>${esc(s.strategy)} v${s.version} · ${esc(s.source)} · ${stamp(s.t)}</small></div>`).join('')}</div>`:empty('Signals will appear when a running strategy finds a setup.');
 const holdings=table(['Asset','Units','Mark','Unrealized P&L'],state.positions.map(p=>{
   const pnl=p.qty*(p.price-p.entry);
   return [esc(p.symbol),qtyText(p.qty),usd(p.price),`<span class="${color(pnl)}">${usd(pnl)}</span>`];
 }),'Filled entry orders will appear here.');
 return page('Trading overview','Dashboard','Monitor your paper account, market data, and automated strategies.',link(icon('plus')+' New strategy','strategies?new',true))+
 (!online?`<div class="notice">Showing cached workspace data · ${syncLabel()}</div>`:'')+
 `<div class="metrics">${metric('Account equity',usd(hasAccount?a.equity:null),`<span class="${color(change)}">${pct(hasAccount?change:null)}</span> today`,'equity',true)}${metric('Buying power',usd(hasAccount?a.buyingPower:null),'Available for orders','wallet')}${metric('Open positions',state.positions.length,usd(hasAccount?a.exposure:null)+' gross exposure','portfolio')}${metric('Active bots',running.length,enabled.length?enabled.length+' enabled':'No running strategies','bot',true)}</div>
 <div class="grid">${price}${watch}</div><div class="grid equal">${panel('Recent orders','Paper execution activity',orders(state.orders,5),link('Portfolio','portfolio'))}${panel('Trade signals','Latest strategy decisions',signals)}</div>
 <div class="grid equal">${panel('Open holdings','Current paper positions',holdings,link('Portfolio','portfolio'))}${panel('Bot status','Backend execution',botRows(),link('Manage bots','trading'))}</div>`;
}
function trading(){
 const bots=Object.values(state.bots);
 const groups=[['all','All bots'],['running','Active'],['paused','Paused'],['stopped','Stopped']];
 const counts=Object.fromEntries(groups.map(([k])=>[k,k==='all'?bots.length:bots.filter(b=>b.desired===k).length]));
 const filters=`<div class="tabs" role="group" aria-label="Filter bots">${groups.map(([k,label])=>btn(label+' '+counts[k],'bot-filter',k,false,`aria-pressed="${botFilter===k}"`)).join('')}</div>`;
 const options=state.strategies.slice().reverse().filter(s=>!s.ai||state.aiConfigured)
   .map(s=>[key(s),s.name+' · '+s.symbol+' · v'+s.version]);
 const instruments=state.market.filter(m=>m.eligible).map(m=>[m.symbol,m.symbol+' · '+m.name]);
 const requested=launchVersion??params().get('version');
 const chosen=options.some(([id])=>id===requested)?requested:'';
 const instrument=launchInstrument??(chosen?version(chosen)?.symbol:'');
 const target=instruments.some(([id])=>id===instrument)?instrument:'';
 const unavailable=requested&&!chosen?'<small>The requested strategy is unavailable for launch. Select another version or open its existing bot session.</small>':'';
 const disabled=!online?'disabled':'';
 const rows=bots.filter(b=>botFilter==='all'||b.desired===botFilter).map(b=>{
   const command=(label,action,primary=false)=>btn(label,'bot-command',action,primary,`data-bot="${esc(b.id)}" data-version="${b.version}" ${disabled}`);
   const controls=b.desired==='running'?command('Pause','paused'):b.budget?command(b.desired==='paused'?'Resume':'Restart','running',true):link('Set budget',sessionRoute(b));
   const latestOrder=state.orders.find(o=>o.strategyId===b.id);
   const detail=b.desired==='running'&&b.status.toLowerCase()!=='running'?'<small>'+esc(b.status)+'</small>':'';
   return [
     `<a class="bot-name" href="#${sessionRoute(b)}"><b>${esc(b.name)}</b></a>`,esc(b.symbol)+' · v'+b.version,
     badge({running:'Active',paused:'Paused',stopped:'Stopped'}[b.desired],b.desired==='running'&&b.status.toLowerCase()==='running'?'good':'')+detail,
     b.budget?usd(b.budget):badge('Budget required'),stamp(b.lastBar),latestOrder?badge(latestOrder.status)+' <small>'+stamp(latestOrder.t)+'</small>':'—',
     '<div class="actions">'+controls+(b.desired!=='stopped'?command('Stop','stopped'):'')+'</div>'
   ];
 });
 const mode=state.mode==='demo'?'Demo paper trading':'Alpaca Paper';
 return page('Automated execution','Live Trading','Launch and manage paper bots from saved strategy versions.',badge(mode,'good'))+
   (!online?'<div class="notice">Showing cached bot status · '+syncLabel()+'</div>':'')+
   '<div class="metrics">'+metric('Active bots',counts.running,counts.running?bots.filter(b=>b.status==='Running'&&b.desired==='running').length+' processing signals':'No active bots','bot',true)+
   metric('Paused bots',counts.paused,'Available to resume','strategies')+metric('Stopped bots',counts.stopped,'Available to restart','portfolio')+
   metric('Paper broker',esc(online?state.broker:'cached'),esc(state.feedName)+' · '+esc(online?state.feed:'cached'),'equity')+'</div>'+
   '<div class="stack">'+panel('Launch a bot','Choose the saved trading rules, the instrument to trade, and the maximum USD budget.',
     options.length&&instruments.length?form('launch-bot',select('Strategy version','version',[['','Choose a strategy version'],...options],chosen,true)+
       select('Ticker or crypto pair','instrument',[['','Choose an instrument'],...instruments],target,true)+numeric('Bot budget (USD)','budget',launchBudget,1,1e9),
       unavailable+submit('Launch bot',!online)):
     empty('Save a strategy for an eligible instrument to launch another bot.'),link('Strategy Editor','strategies'))+
   panel('Bots','Pause or stop to prevent new submissions. Existing orders stay at the broker.',
     '<div class="bot-filters">'+filters+'</div>'+table(['Bot','Instrument / version','Status','Budget','Last evaluated bar','Latest order','Controls'],rows,'No bots in this view.'))+'</div>';
}
function session(){
 const bot=state.bots[params().get('id')];
 const back=link('Back to Live Trading','trading');
 if(!bot)return page('Automated execution','Bot Session','This bot could not be found.',back);
 const book=state.botSessions?.[bot.id]??{};
 const strategy=version(key(bot));
 const source=strategy?.sourceStrategy;
 const botOrders=state.orders.filter(order=>order.owned&&order.strategyId===bot.id);
 const signals=state.signals.filter(signal=>signal.strategyId===bot.id);
 const open=botOrders.filter(order=>!['filled','canceled','expired','rejected','replaced','done_for_day'].includes(order.status));
 const holding=book.qty>0;
 const positionStatus=open.some(order=>order.side==='sell')?'Sell pending':holding?'Holding':open.some(order=>order.side==='buy')?'Buy pending':book.sellFills?'Sold':'Flat';
 const realized=book.complete?book.realized:null;
 const versions=state.strategies.filter(s=>s.id===bot.id).toReversed().map(s=>[s.version,s.symbol+' · v'+s.version]);
 const requestedVersion=params().get('version')??bot.version;
 const selectedVersion=versions.some(([v])=>String(v)===String(requestedVersion))?requestedVersion:'';
 const moneyChange=value=>`<span class="${color(value)}">${usd(value)}</span>`;
 const command=(label,action)=>btn(label,'bot-command',action,false,`data-bot="${esc(bot.id)}" data-version="${bot.version}" ${!online?'disabled':''}`);
 const controls=bot.desired==='running'?'<div class="form"><div class="actions">'+command('Pause','paused')+command('Stop','stopped')+'</div></div>':
   bot.desired==='paused'?'<div class="form">'+command('Stop','stopped')+'</div>':'';
 const risk=bot.desired==='running'&&bot.budget?'':form('fund-bot',select('Strategy version','version',[['','Choose a strategy version'],...versions],selectedVersion,true)+numeric('Bot budget (USD)','budget',fundBudget??bot.budget??'',1,1e9),
       submit(bot.desired==='running'?'Set budget':bot.desired==='paused'?'Resume bot':'Restart bot',!online));
 const positionRows=holding?[[esc(bot.symbol),qtyText(book.qty),book.complete?usd(book.cost/book.qty):'—',usd(book.mark),
   Number.isFinite(book.mark)?usd(book.qty*book.mark):'—',moneyChange(book.unrealized)]]:[];
 const filled=botOrders.filter(order=>order.filled>0);
 return page('Paper bot session',esc(bot.name),esc(bot.symbol)+' · Strategy v'+bot.version+' · '+esc(state.mode==='demo'?'Demo paper trading':'Alpaca Paper'),back)+
   (source?'<div class="notice">Rules copied from '+esc(version(source.id+'@'+source.version)?.name??'saved strategy')+' · '+esc(source.symbol)+' · v'+source.version+'</div>':'')+
   (!online?'<div class="notice">Showing cached bot activity · '+syncLabel()+'</div>':'')+
   '<div class="metrics">'+metric('Allocated budget',usd(bot.budget),usd(book.available)+' available for new buys','wallet')+
   metric('Amount invested',book.complete?usd(book.invested):'—','Cost basis of the open position','portfolio')+
   metric('Realized P&L',moneyChange(realized),num(book.sellFills)+' sell fills · before fees','equity',true)+
   metric('Unrealized P&L',moneyChange(book.unrealized),positionStatus,'equity',true)+'</div>'+
   '<div class="grid equal">'+panel('Position',positionStatus,table(['Asset','Units held','Average cost','Mark','Market value','Open P&L'],positionRows,'No open position held by this bot.'))+
   panel('Bot controls','Last evaluated '+stamp(bot.lastBar)+' · '+open.length+' open orders',
     '<div class="form"><div class="actions">'+badge(botStatus(bot))+'<small>Started '+stamp(bot.started)+'</small></div>'+
     '<small>'+usd(book.reserved)+' reserved for pending buys</small></div>'+controls+risk)+'</div>'+
   '<div class="stack">'+panel('Latest evaluation',bot.lastEvaluation?stamp(bot.lastEvaluation.t)+' · '+usd(bot.lastEvaluation.price):'Waiting for an evaluated bar',
     bot.lastEvaluation?'<div class="bot-row"><span>'+esc(bot.lastEvaluation.rationale)+'</span>'+badge(bot.lastEvaluation.direction)+'</div>':empty(botStatus(bot)))+
   panel('Orders and executions',`${filled.length} filled or partially filled orders · ${usd(book.bought)} bought · ${usd(book.sold)} sold`,
     table(['Submitted','Asset','Side','Filled / requested','Average fill','Filled value','Status'],botOrders.map(o=>[
       stamp(o.t),esc(o.symbol),badge(o.side),qtyText(o.filled)+' / '+qtyText(o.qty),usd(o.price),o.filled>0&&Number.isFinite(o.price)?usd(o.filled*o.price):'—',badge(o.status)
     ]),'No orders yet.'))+
   panel('Signal history','Trade decisions and AI holds for this bot.',
     table(['Time','Direction','Rationale','Source'],signals.map(signal=>[
       stamp(signal.t),badge(signal.direction),esc(signal.rationale),esc(signal.source)
     ]),'No signals recorded for this bot yet.'))+'</div>';
}
function screener(){
 const tabs=`<div class="tabs" role="tablist" aria-label="Asset class">${['Stocks','Crypto','Forex'].map(v=>btn(v,'asset',v,false,`role="tab" aria-selected="${v===assetClass}"`)).join('')}</div>`;
 const heading=page('Market research','Screener','Find instruments by liquidity, volatility, and price movement.')+tabs;
 if(assetClass==='Forex')return heading+panel('Forex universe','Spread, available leverage, and momentum',empty('This asset class requires a provider integration.'),link('View integrations','settings'));
 const crypto=assetClass==='Crypto', filter=crypto?cryptoScreen:screen, kind=crypto?'crypto':'stock';
 const matching=state.market.filter(m=>(m.assetClass??'stock')===kind&&(m.symbol+' '+m.name).toLowerCase().includes(filter.search.toLowerCase())&&(!filter.volume||m.volume>=filter.volume)&&(!filter.volatility||m.volatility>=filter.volatility));
 const rows=matching.map((m,i)=>[`<div class="inline">${mark(m.symbol,i)}<span><b>${esc(m.symbol)}</b><br><small>${esc(m.name)}</small></span></div>`,usd(m.price),`<span class="${color(m.change)}">${pct(m.change)}</span>`,pct(m.volatility),crypto?usd(m.volume):num(m.volume),esc(m.source??state.feedName)+' · '+badge(online?m.freshness:'cached')+' <small>Price '+stamp(m.t)+'<br>Bars '+stamp(m.metricsAt)+'</small>',m.eligible?link('Build strategy','strategies?symbol='+encodeURIComponent(m.symbol)):badge('Screen only')]);
 return heading+panel(crypto?'USD crypto pairs':'Stock universe',crypto?'Price, range volatility, and estimated USD turnover over the latest 60 bars.':'Price, range volatility, and share volume over the latest 60 bars.',
 form('screen',field('Search','search',filter.search,'type="search" placeholder="Search symbols or names"')+numeric(crypto?'Minimum turnover (USD)':'Minimum volume','volume',filter.volume,0,1e12,1)+numeric('Minimum volatility (%)','volatility',filter.volatility,0,100),submit('Apply filters'))+
 table(['Asset','Price','Change','Volatility',crypto?'USD turnover':'Volume','Source / freshness',''],rows,'No instruments match these filters.'));
}
const fields=[['Lookback (1-minute bars)','period',2,60,1],['Entry above average (%)','entry',0,25],['Exit below average (%)','exit',-25,0],['Position size (% equity)','size',.1,100],['Maximum exposure (% equity)','exposure',.1,100],['Maximum daily loss (%)','dailyLoss',.1,50],['Stop-loss (%)','stop',.1,50],['Take-profit (%)','take',.1,100],['Stop-loss cooldown (bars)','cooldown',0,60,1]];
const defaultParams={period:12,entry:0.1,exit:-0.1,size:10,exposure:20,dailyLoss:3,stop:2,take:4,cooldown:5,ai:false};
const fresh=(symbol='')=>({...defaultParams,id:'',version:0,name:'',symbol});
function strategies(){
 const route=location.hash, requested=params().get('symbol');
 if(editorRoute!==route){
   if(requested!==null&&(editor?.id||editor?.symbol!==requested))editor=fresh(requested);
   if(params().has('new')&&requested===null&&editor?.id)editor=fresh();
   editorRoute=route;
 }
 editor??=fresh(requested??'');
 const saved=editor.id&&version(key(editor)),bot=saved&&state.bots[editor.id];
 const options=state.strategies.slice().reverse().map(s=>[key(s),s.name+' · '+s.symbol+' · v'+s.version]);
 const asset=state.market.find(m=>m.symbol===editor.symbol);
 const inputs=field('Strategy name','name',editor.name,'required maxlength="60"')+select('Instrument or pair','symbol',[['','Choose an instrument'],...state.market.map(m=>[m.symbol,m.symbol+' · '+m.name])],asset?.symbol??'',true)+
 select('Saved version','version',[['','New draft'],...options],saved?key(saved):'')+fields.map(([label,k,min,max,step])=>numeric(label,k,editor[k]??defaultParams[k],min,max,step)).join('');
 const startTrade=s=>link('Start trade','trading?version='+encodeURIComponent(key(s)),true);
 const botActions=saved?`<div class="actions">${link('Backtest v'+saved.version,'backtesting?version='+key(saved))}${bot?link('Open bot session',sessionRoute(bot)+'&version='+saved.version):''}${startTrade(saved)}</div>`:'';
 return page('Automated trading','Strategy Editor','Configure a minute-bar strategy and control its paper bot.',btn(icon('plus')+' New strategy','new','',true))+
 `<div class="grid">${panel('Strategy configuration','Long-only moving-average momentum · 1-minute bars',form('strategy',inputs,check('Require AI confirmation for non-protective signals','ai',editor.ai)+
 '<small>'+(state.aiConfigured?esc(state.aiProvider ?? 'AI provider')+' configured. Historical replay uses deterministic strategy versions.':'Configure a Gemini or OpenAI key in the server environment to enable AI confirmation.')+'</small>'+
 submit(online?'Save version':'Queue draft sync')+`<small id="draft-status">${editor.queued?'Queued for sync':editor.dirty?'Local draft':''}</small>`))}
 <div class="stack">${panel('Paper bot',bot?'Pinned to version '+bot.version:'Select a saved strategy version',
 (bot?`<div class="bot-row"><span>${bot.symbol}</span>${badge(botStatus(bot))}</div>`:empty('Save a strategy to enable paper bot controls.'))+'<div class="form">'+botActions+'</div>')}
 ${panel('Saved strategies','Latest versions',latest().map(s=>`<div class="bot-row"><div><b>${esc(s.name)}</b><small>${s.symbol} · v${s.version}</small></div><div class="actions">${btn('Edit','edit',key(s))}${startTrade(s)}</div></div>`).join(''))}</div></div>`;
}
function backtesting(){
 const runs=state.runs,eligible=state.strategies.filter(s=>!s.ai).reverse(),requested=params().get('version');
 const chosen=eligible.some(s=>key(s)===requested)?requested:'';
 const option=run=>[run.id,run.name+' v'+run.version+' · '+run.symbol+' · '+stamp(run.t)];
 if(!runs.some(r=>r.id===runA))runA=runs[0]?.id??'';
 if(runB===null&&runs.length>1)runB=runs[1].id;
 const a=runs.find(r=>r.id===runA),b=runs.find(r=>r.id===runB);
 const inputs=select('Saved strategy','version',[['','Choose a saved strategy'],...eligible.map(s=>[key(s),s.name+' v'+s.version+' · '+s.symbol])],chosen,true)+
 field('Start date','start',date(Date.now()-86400000*2),'type="date" required')+field('End date','end',date(Date.now()),'type="date" required')+
 numeric('Starting capital ($)','capital',100000,100,1e9,1)+numeric('Fees (bps)','fees',1,0,500)+numeric('Slippage (bps)','slippage',2,0,500);
 const summary=r=>r?panel(esc(r.name)+' v'+r.version,esc(r.source)+' · '+esc(r.start)+' to '+esc(r.end),
 `<div class="form"><b class="mono">${usd(r.final)} &nbsp; <span class="${color(r.final-r.capital)}">${pct(100*(r.final/r.capital-1))}</span></b><small>Maximum drawdown ${pct(r.drawdown)} · ${r.tradeCount??r.trades.length} executions</small></div>`+plot(r.curve)):empty('Choose a second run to compare.');
 return page('Strategy research','Backtesting','Replay a saved strategy with next-bar-open fills and modeled trading costs.')+
 `<div class="stack">${panel('Run configuration','Signals use completed minute bars. The next available open determines simulated execution.',form('backtest',inputs,submit('Run backtest',!online||!eligible.length)))}
 ${a?panel('Run comparison','Compare equity and execution results.',`<div id="run-select" class="form"><div class="fields">${select('First run','runA',runs.map(option),runA)}${select('Second run','runB',[['','Select run'],...runs.map(option)],runB)}</div></div><div class="form comparison">${summary(a)}${summary(b)}</div>`):''}
 ${a?panel('Drawdown','First run · decline from the equity high-water mark',plot(a.curve.map(p=>({t:p.t,value:p.drawdown})),'percent')):''}
 ${a?panel('Trade log','First run · latest 250 modeled fills and fees',table(['Time','Side','Quantity','Fill price','Fees','Realized P&L'],a.trades.slice(-250).reverse().map(t=>[stamp(t.t),badge(t.side),qtyText(t.qty),usd(t.price),usd(t.fee),usd(t.pnl)]),'No executions in this run.')):''}</div>`;
}
function portfolio(){
 const {positions,equity,account}=state;
 let peak=0,drawdown=0;
 for(const p of equity){peak=Math.max(peak,p.value);if(peak>0)drawdown=Math.min(drawdown,100*(p.value/peak-1))}
 const start=equity[0]?.value,unrealized=positions.reduce((sum,p)=>sum+p.qty*(p.price-p.entry),0);
 const o=state.orders.filter(item=>(!historyFilter.asset||item.symbol===historyFilter.asset)&&(!historyFilter.strategy||item.strategy===historyFilter.strategy)&&(!historyFilter.start||item.t?.slice(0,10)>=historyFilter.start)&&(!historyFilter.end||item.t?.slice(0,10)<=historyFilter.end));
 const options=(k,label)=>[['',label],...Array.from(new Set(state.orders.map(o=>o[k]).filter(Boolean))).map(v=>[v,v])];
 const filter=select('Asset','asset',options('symbol','All assets'),historyFilter.asset)+select('Strategy','strategy',options('strategy','All strategies'),historyFilter.strategy)+field('From','start',historyFilter.start,'type="date"')+field('To','end',historyFilter.end,'type="date"');
 const holding=positions.map(p=>[esc(p.symbol),qtyText(p.qty),usd(p.entry),usd(p.price),usd(p.qty*p.price),pct(account.equity?100*p.qty*p.price/account.equity:null),`<span class="${color(p.qty*(p.price-p.entry))}">${usd(p.qty*(p.price-p.entry))}</span>`]);
 return page('Account analytics','Portfolio','Review holdings, exposure, historical orders, and paper account performance.')+
 `<div class="metrics">${metric('Unrealized P&L',usd(unrealized),'Open positions','equity',true)}${metric('Realized P&L',state.mode==='demo'?usd(o.reduce((sum,item)=>sum+(item.pnl??0),0)):'—',state.mode==='demo'?'Filtered demo executions':'Alpaca realized P&L pending','wallet')}
 ${metric('Tracked return',pct(start?100*(account.equity/start-1):null),'Since first account snapshot','equity')}${metric('Max drawdown',pct(start?drawdown:null),'From tracked equity peak','portfolio')}</div><div class="stack">
 ${panel('Holdings','Allocation uses current account equity.',table(['Asset','Units','Average entry','Mark','Market value','Allocation','Unrealized P&L'],holding,'No open positions.'))}
 ${panel('Order history','Filter executions by asset, strategy, and date.',form('history',filter,submit('Apply filters'))+orders(o))}</div>`;
}
function settings(){
 const row=(label,desc,status)=>`<div class="bot-row"><div><b>${label}</b><small>${desc}</small></div>${badge(status)}</div>`;
 const events=state.events.map(e=>`<div class="activity-item">${esc(e.message)}<small>${stamp(e.t)}</small></div>`).join('');
 return page('Workspace preferences','Settings','Review data providers, paper connectivity, and in-app notifications.')+
 `<div class="grid equal"><div class="stack">${panel('Integrations','Credentials are configured in the server environment.',row('Stock data',esc(state.feedName),state.feed)+row('Paper broker',state.mode==='demo'?'Local simulated fills':'Alpaca Paper API',state.broker)+row('AI signal confirmation',esc(state.aiProvider ?? 'Gemini or OpenAI'),state.aiConfigured?'configured':'unconfigured')+row('Crypto data',state.mode==='demo'?'Synthetic market':'Alpaca Crypto US',state.cryptoFeed??'connecting')+row('Forex provider','Provider pending','unconfigured'))}
 ${state.mode==='demo'?panel('Connection simulator','Exercise bot behavior during feed or broker outages.',`<div class="form"><div class="actions">${btn('Disconnect feed','outage','feed')}${btn('Disconnect broker','outage','broker')}${btn('Reconnect both','outage','clear',true)}</div></div>`):''}</div>
 <div class="stack">${panel('Notifications','Choose which events appear in the workspace.',`<form id="settings" class="form">${Object.entries({signals:'Trade signals',fills:'Order fills',risk:'Risk limits',connections:'Connection failures'}).map(([k,v])=>check(v,k,state.alerts[k])).join('')}${submit('Save preferences',!online)}</form>`)}
 ${panel('Recent notifications',syncLabel(),events?'<div class="activity">'+events+'</div>':empty('No notifications yet.'))}</div></div>`;
}
function profile(){
 return page('Workspace preferences','Profile','Manage local workspace details and offline data access.')+
 `<div class="grid">${panel('Account details','Local workspace profile',form('profile',field('Display name','name',state.profile.name,'required maxlength="80"')+
 field('Email','email',state.profile.email,'type="email"'),(authInfo?.required?'<small>Signed-in workspace data and drafts are kept in this tab during a disconnect.</small>':check('Cache workspace data in this browser','offlineSync',state.profile.offlineSync))+submit('Save profile',!online)))}
 ${panel('Subscription','Current workspace tier','<div class="bot-row"><b>Paper trading</b>'+badge('Local workspace','good')+'</div>'+empty(syncLabel()))}</div>`;
}
const renderers={dashboard,trading,session,screener,strategies,backtesting,portfolio,settings,profile};
function clearWorkspace(){
 state=null;editor=null;runA='';runB=null;online=false;
 write('ft-cache',null);write('ft-draft',null);
}
function authenticationView(){
 const signup=authMode==='signup'&&authInfo.canSignup;
 const title=signup?'Create your account':'Sign in to FastTrader';
 const fields=field('Email address','email','','type="email" required maxlength="254" autocomplete="email"')+
   field('Password','password','','type="password" required maxlength="256" '+(signup?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"'))+
   (signup?field('Workspace setup code','code','','type="password" required autocomplete="off"'):'');
 const switchMode=authInfo.canSignup?btn(signup?'Back to sign in':'Create an account','auth-mode',signup?'login':'signup'):'';
 return `<section class="panel auth-card"><div class="auth-heading"><img src="/mark.svg" alt=""><h1>${title}</h1><p class="sub">${signup?'Use the setup code from your trading worker to claim this workspace.':'Access your paper trading workspace.'}</p></div>
   <form class="form" id="authenticate" method="post" action="/api/auth">${fields}<div class="actions"><button class="button primary">${signup?'Create account':'Sign in'}</button>${switchMode}</div></form></section>`;
}
function render(force=false){
 const signedOut=authInfo?.required&&!authInfo.authenticated;
 document.body.classList.toggle('auth-screen',Boolean(signedOut));
 const signOut=$('#sign-out');
 if(signOut)signOut.hidden=!authInfo?.required||!authInfo.authenticated;
 const main=$('#view');
 if(signedOut){
   const markup=authenticationView();
   if(main.dataset.html!==markup){main.innerHTML=markup;main.dataset.html=markup}
   return;
 }
 const route=location.hash.slice(1).split('?')[0];
 const next=Object.hasOwn(pages,route)?route:'dashboard',changed=next!==active;
 active=next;chrome();
 if(!state){main.innerHTML=empty('Connect to FastTrader to load the workspace.');main.dataset.html='';return}
 if(!force&&!changed&&(pending||document.activeElement?.closest('form, .plot, #run-select')||main.querySelector('.plot:hover')))return;
 if(!force&&!changed&&['backtesting','profile'].includes(active))return;
 const markup=renderers[active]();
 if(markup!==main.dataset.html){main.innerHTML=markup;main.dataset.html=markup}
}
async function api(path,data){
 const res=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(path==='backtest'?70000:30000)});
 const result=await res.json();
 if(!res.ok){
   if(res.status===401&&path!=='auth') signInRequired();
   throw Error(result.error??'Request failed');
 }
 return result;
}
const values=form=>Object.fromEntries(new FormData(form));
function capture(form){
 const data=values(form);
 delete data.version;
 for(const [,k]of fields)data[k]=+data[k];
 const changed=Object.entries({...data,ai:form.elements.ai.checked}).some(([k,v])=>editor[k]!==v);
 editor={...editor,...data,ai:form.elements.ai.checked,dirty:true,mutation:changed||!editor.dirty?crypto.randomUUID():editor.mutation};
 if(!authInfo?.required)write('ft-draft',editor);
 $('#draft-status').textContent='Local draft';
}
async function save(){
 const draft=editor;
 const saved=await api('strategy',{...draft,baseVersion:draft.version});
 if(editor===draft)editor={...saved};
 if(read('ft-draft')?.mutation===draft.mutation)write('ft-draft',null);
 toast('Saved strategy version '+saved.version+'.');
}
let refreshing=false;
function signInRequired(){
 authRevision++;
 clearWorkspace();
 authMode='login';
 authInfo={required:true,authenticated:false,canSignup:false};
 render(true);
}
async function refresh(force=false){
 if(refreshing)return;
 refreshing=true;
 const prior=online;
 const revision=authRevision;
 try{
   if(!navigator.onLine)throw Error('Offline');
   if(!authInfo||authInfo.required&&!authInfo.authenticated){
     const session=await fetch('/api/auth',{cache:'no-store',signal:AbortSignal.timeout(5500)});
     if(!session.ok)throw Error('Unavailable');
     const status=await session.json();
     if(revision!==authRevision)return;
     authInfo=status;
     if(authInfo.required){
       write('ft-secured',true);
       if(!authInfo.authenticated){clearWorkspace();return}
       write('ft-cache',null);write('ft-draft',null);
     }else{
       write('ft-secured',false);
       editor??=read('ft-draft');
     }
   }
   const res=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(4500)});
   if(revision!==authRevision)return;
   if(res.status===401){signInRequired();return}
   if(!res.ok)throw Error('Unavailable');
   const snapshot=await res.json();
   if(revision!==authRevision)return;
   state=snapshot;
   online=true;
   if(!authInfo.required&&state.profile.offlineSync)write('ft-cache',state);
   else write('ft-cache',null);
 }catch{
   if(revision!==authRevision)return;
   online=false;
   if(!state&&localWorkspace&&!authInfo?.required&&!read('ft-secured')){
     state=read('ft-cache');editor??=read('ft-draft');
   }
 }finally{
   refreshing=false;
   render(force||prior!==online);
 }
 if(online&&!prior&&editor?.queued&&!syncing&&!pending){
   syncing=true;
   try{await save();force=true}
   catch(error){toast(error.message)}
   finally{syncing=false;refreshing=false}
   if(force){await refresh(true);return}
 }
}
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');
 if(!el){
   const row=event.target.closest('tr');
   const botLink=row?.querySelector('.bot-name');
   if(botLink&&!event.target.closest('a,button,input,select'))location.hash=botLink.hash;
   return;
 }
 const {action,value}=el.dataset;
 if(action==='auth-mode'&&!pending){authMode=value;render(true);return}
 if(action==='sign-out'&&!pending){
   pending=true;el.disabled=true;
   authRevision++;
   try{authInfo=await api('auth',{action:'logout'});clearWorkspace();authMode='login';render(true)}
   catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(!state)return;
 if(action==='toggle-notifs'){notifOpen=!notifOpen;if(notifOpen&&state.events?.[0])lastSeenNotif=state.events[0].t;chrome();return}
 if(action==='close-notifs'){notifOpen=false;chrome();return}
 if(action==='notif-filter'){notifFilter=value;renderNotifDrawer();return}
 if(action==='mark-notifs-read'){if(state.events?.[0])lastSeenNotif=state.events[0].t;chrome();toast('Notifications marked read.');return}
 if(action==='watch'){selected=value;chartMode='Price'}
 if(action==='range')range=value;
 if(action==='chart')chartMode=value;
 if(action==='asset')assetClass=value;
 if(action==='bot-filter')botFilter=value;
 if(action==='edit')editor={...version(value)};
 if(action==='new')editor=fresh();
 if(action==='bot-command'||action==='outage'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   pending=true;el.disabled=true;
   try{
     if(action==='bot-command')await api('bot',{id:el.dataset.bot,version:+el.dataset.version,action:value});
     if(action==='outage')await api('demo',{feed:value==='feed',broker:value==='broker'});
     toast(action==='outage'?'Connectivity updated.':'Bot command saved.');
     await refresh(true);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
 }
 render(true);
});
document.addEventListener('input',event=>{
 const form=event.target.closest('#strategy');
 if(form&&event.target.name!=='version')capture(form);
 if(event.target.matches('#launch-bot [name=budget]'))launchBudget=event.target.value;
 if(event.target.matches('#fund-bot [name=budget]'))fundBudget=event.target.value;
});
document.addEventListener('change',event=>{
 if(event.target.matches('#launch-bot [name=version]')){
   launchVersion=event.target.value;
   const form=event.target.form;
   const symbol=version(launchVersion)?.symbol;
   const instrument=form.elements.instrument;
   instrument.value=Array.from(instrument.options).some(option=>option.value===symbol)?symbol:'';
   launchInstrument=instrument.value;
 }
 if(event.target.matches('#launch-bot [name=instrument]'))launchInstrument=event.target.value;
 if(event.target.matches('#strategy [name=version]')){
   editor=event.target.value?{...version(event.target.value)}:fresh();
   render(true);
 }
 if(event.target.closest('#run-select')){
   if(event.target.name==='runA')runA=event.target.value;
   else runB=event.target.value;
   render(true);
 }
});
document.addEventListener('submit',async event=>{
 const form=event.target;
 if(!form.id)return;
 event.preventDefault();
 if(pending||syncing)return;
 const data=values(form),control=event.submitter;
 if(form.id==='screen'){
   Object.assign(assetClass==='Crypto'?cryptoScreen:screen,data,{volume:+data.volume,volatility:+data.volatility});
   render(true);return;
 }
 if(form.id==='history'){Object.assign(historyFilter,data);render(true);return}
 pending=true;if(control)control.disabled=true;
 try{
   if(form.id==='authenticate'){
     authRevision++;
     authInfo=await api('auth',{...data,action:authMode==='signup'&&authInfo.canSignup?'signup':'login'});
     form.reset();
     await refresh(true);
     return;
   }
   if(form.id==='launch-bot'){
     const selected=version(data.version);
     if(!selected)throw Error('Choose a saved strategy version.');
     const launched=await api('bot',{id:selected.id,version:selected.version,symbol:selected.symbol,instrument:data.instrument,action:'running',budget:+data.budget,create:true});
     launchVersion=null;launchInstrument=null;launchBudget='';botFilter='all';
     toast(selected.name+' launched.');
     location.hash=sessionRoute(launched);
   }
   if(form.id==='fund-bot'){
     const bot=state.bots[params().get('id')];
     const selected=bot&&version(bot.id+'@'+data.version);
     if(!selected)throw Error('Choose a saved strategy version.');
     await api('bot',{id:selected.id,version:selected.version,symbol:selected.symbol,action:'running',budget:+data.budget});
     fundBudget=null;
     toast('Bot budget saved.');
   }
   if(form.id==='strategy'){
     capture(form);
     if(online)await save();
     else{editor.queued=true;if(!authInfo?.required)write('ft-draft',editor);toast('Draft queued for reconnection.')}
   }
   if(form.id==='backtest'){
     if(control)control.textContent='Running…';
     const [id,version]=data.version.split('@');
     const result=await api('backtest',{...data,id,version:+version,capital:+data.capital,fees:+data.fees,slippage:+data.slippage});
     runA=result.id;toast('Backtest complete.');
   }
   if(form.id==='settings'){await api('settings',Object.fromEntries(Object.keys(data).map(k=>[k,true])));toast('Notifications saved.')}
   if(form.id==='profile'){await api('profile',{...data,offlineSync:Boolean(form.elements.offlineSync?.checked)});toast('Profile saved.')}
   await refresh(true);
 }catch(error){toast(error.message)}
 finally{pending=false;if(control){control.disabled=false;if(form.id==='backtest')control.textContent='Run backtest'}}
});
document.addEventListener('pointermove',event=>{
 const node=event.target.closest('.plot');
 if(!node)return;
 const rect=node.getBoundingClientRect(),points=node.points??=JSON.parse(node.dataset.points);
 inspect(node,Math.round(((event.clientX-rect.left)/rect.width*790-10)/690*(points.length-1)));
});
document.addEventListener('pointerout',event=>{
 const node=event.target.closest('.plot');
 if(!node||node.contains(event.relatedTarget))return;
 node.querySelector('.crosshair').setAttribute('visibility','hidden');
 node.querySelector('.point').setAttribute('visibility','hidden');
 node.querySelector('.tooltip').hidden=true;
});
document.addEventListener('keydown',event=>{
 const node=event.target.closest('.plot');
 if(!node||!['ArrowRight','ArrowLeft'].includes(event.key))return;
 event.preventDefault();inspect(node,(node.index??0)+(event.key==='ArrowRight'?1:-1));
});
window.addEventListener('hashchange',()=>{
 const route=location.hash.split('?')[0];
 notifOpen=false;
 if(route==='#trading'){launchVersion=null;launchInstrument=null;launchBudget=''}
 if(route==='#session')fundBudget=null;
 if(state&&route==='#strategies'&&params().has('new')&&!params().has('symbol'))editor=fresh();
 render(true);
});
window.addEventListener('online',()=>refresh(true));
window.addEventListener('offline',()=>{online=false;render(true)});
render(true);refresh(true);setInterval(refresh,3500);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
