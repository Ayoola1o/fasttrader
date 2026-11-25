import { strategyPlaybooks } from './strategy-playbooks.mjs';

const pages={dashboard:'Dashboard',trading:'Live Trading',session:'Bot Session',screener:'Screener',strategies:'Strategy Editor',backtesting:'Backtesting',portfolio:'Portfolio',history:'History',logs:'Logs',settings:'Settings',profile:'Profile'};
const paths={
dashboard:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',screener:'M3 4h18v4l-7 6v5l-4 2v-7L3 8z',
strategies:'M4 7h16M4 17h16M8 4v6m8 4v6',backtesting:'M3 12a9 9 0 1 0 3-6m-3-2v5h5m4-2v5l3 2',
portfolio:'M4 8h16v12H4zm4 0V5h8v3M4 13h16m-9 0v2h2v-2',history:'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',logs:'M4 5h16v14H4zM8 9h8M8 13h6M8 17h4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v2m0 14v2m9-9h-2M5 12H3m15-6-2 2m-8 8-2 2m12 0-2-2m-8-8-2-2',
profile:'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',bell:'M5 17h14l-2-3v-4a5 5 0 0 0-10 0v4zm5 3h4',
trading:'M3 12h4l3-7 4 14 3-7h4',
equity:'m3 17 5-5 4 3 8-9m-5 0h5v5',wallet:'M3 6h17v13H3zm17 4h-6v5h6',bot:'M5 8h14v11H5zM12 4v4M2 12v3m20-3v3M9 12h.01M15 12h.01M9 16h6',plus:'M12 5v14M5 12h14'};
const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[k]}"/></svg>`;
const $=s=>document.querySelector(s);
function timeoutSignal(ms){if(typeof AbortSignal!=='undefined'&&AbortSignal.timeout)return AbortSignal.timeout(ms);if(typeof AbortController==='undefined')return undefined;const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal}
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
let authInfo=null,authMode='login',authRevision=0,authError='';
let state=null,online=false,active='',selected='',chartMode='Equity',range='1H',assetClass='Stocks',editor=null,editorRoute='',runA='',runB=null,pending=false,syncing=false,toastTimer;
let playbookLibraryOpen=false;
let backtestDraft=null, backtestVersionRoute=null;
let portfolioRange='1W', accountRange='1M', showAllPositions=false;
const accountPeriods={'1M':'Last 30 days','3M':'Last 90 days','1Y':'Last year','ALL':'All time'};
const portfolioRanges={'1D':1,'1W':7,'1M':30,'3M':90,'1Y':365,'ALL':Infinity};
const ranges={'15M':15,'1H':60,'4H':240,'1D':1440};
const screen={search:'',volume:0,volatility:0};
const cryptoScreen={search:'',volume:0,volatility:0};
let botFilter='all', launchVersion=null, launchInstrument=null, launchBudget='', fundBudget=null, deleteBotId=null, killSwitchModal=false, stateEtag='';
let notifOpen=false, notifFilter='all', lastSeenNotif='', avatarDraft=null;
let tvStyle='Candles', tvRange='1H', tvBotId='';
let historyTab='orders';
const historyFilter={asset:'',strategy:'',side:'',status:'',start:'',end:''};
let logsLive=true;
const logFilter={category:'all',bot:'',symbol:'',level:'',search:''};
const key=s=>s.id+'@'+s.version;
const version=k=>state.strategies.find(s=>key(s)===k);
const latest=()=>Object.values(Object.fromEntries(state.strategies.map(s=>[s.id,s])));
const params=()=>new URLSearchParams(location.hash.split('?')[1]??'');
const botStatus=b=>b.desired==='running'?b.status:b.desired;
const syncLabel=()=>state.synced?'Last sync '+stamp(state.synced):'Awaiting first sync';
function toast(s){const n=$('#toast');n.textContent=s;n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,4500)}
function chrome(){
 const groups=[['WORKSPACE',['dashboard','trading','screener','strategies','backtesting','portfolio','history','logs']],['PREFERENCES',['settings','profile']]];
 const nav=$('#nav');
 if(nav.dataset.page!==active){
   nav.innerHTML=groups.map(([label,items])=>`<span class="nav-label">${label}</span>`+items.map(k=>`<a href="#${k}" class="nav-link ${k===active||k==='trading'&&active==='session'?'active':''}" ${k===active?'aria-current="page"':''}>${icon(k)}${pages[k]}</a>`).join('')).join('');
   nav.dataset.page=active;
 }
 const mobileNav=$('#mobile-nav');
 if(mobileNav&&mobileNav.dataset.page!==active){
   const mobileTabs=[['dashboard','Home'],['trading','Bots'],['screener','Markets'],['strategies','Rules'],['history','History']];
   mobileNav.innerHTML=mobileTabs.map(([k,label])=>`<a href="#${k}" class="mobile-tab ${k===active||k==='trading'&&active==='session'?'active':''}" ${k===active?'aria-current="page"':''}>${icon(k)}<span>${label}</span></a>`).join('');
   mobileNav.dataset.page=active;
 }
 $('.topbar').classList.toggle('dashboard-topbar',active==='dashboard');
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
 const avatarHtml=state.profile.avatar?`<img src="${esc(state.profile.avatar)}" alt="" class="avatar-img">`:esc(initials);
 $('#avatar').innerHTML=avatarHtml;
 const mobileAvatar=$('#mobile-avatar');
 if(mobileAvatar)mobileAvatar.innerHTML=avatarHtml;
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
function plot(points,unit='price',accent='#4be4b2',markers=[]){
 if(points.length<2)return empty('Chart history will appear as data arrives.');
 const max=Math.max(...points.map(p=>p.value)),min=Math.min(...points.map(p=>p.value));
 const pad=Math.max((max-min)*.15,Math.abs(max)*.0004,.01),low=min-pad,high=max+pad;
 const x=i=>10+690*i/(points.length-1),y=v=>230-218*(v-low)/(high-low);
 const line=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(p.value).toFixed(2)).join(' ');
 const grids=Array.from({length:5},(_,i)=>{const row=12+i*54.5,v=high-(high-low)*i/4;return `<path d="M10 ${row}H700" stroke="#28364a" stroke-dasharray="3 5"/><text x="711" y="${row+4}">${unit==='percent'?v.toFixed(1)+'%':num(v)}</text>`}).join('');
 const ticks=Array.from({length:6},(_,i)=>{const j=Math.round((points.length-1)*i/5),long=Date.parse(points.at(-1).t)-Date.parse(points[0].t)>86400000;return `<text x="${x(j)}" y="253" text-anchor="${i===0?'start':i===5?'end':'middle'}">${esc(stamp(points[j].t,long?{month:'short',day:'numeric'}:{hour:'2-digit',minute:'2-digit',hour12:false}))}</text>`}).join('');
 let dots='';
 if(Array.isArray(markers)&&markers.length){
   const times=points.map(p=>Date.parse(p.t));
   dots=markers.slice(-120).map(tr=>{
     const ts=Date.parse(tr.t);if(!Number.isFinite(ts))return '';
     let best=0,diff=Infinity;
     for(let i=0;i<times.length;i++){const d=Math.abs(times[i]-ts);if(d<diff){diff=d;best=i}}
     const cx=x(best).toFixed(1),cy=y(points[best].value).toFixed(1),buy=tr.side==='buy';
     return `<circle cx="${cx}" cy="${cy}" r="3.4" fill="${buy?'#38e4a8':'#fb7185'}" stroke="#0b1018" stroke-width="1.2"><title>${buy?'BUY':'SELL'} ${qtyText(tr.qty)} @ ${usd(tr.price)}</title></circle>`;
   }).join('');
 }
 const id='shade'+(++chartId);
 return `<div class="plot" tabindex="0" aria-label="Interactive chart. Use arrow keys to inspect values." data-points="${esc(JSON.stringify(points))}" data-unit="${unit}" data-low="${low}" data-high="${high}"><svg viewBox="0 0 790 265" role="img" aria-label="Time series chart"><defs><linearGradient id="${id}" x1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${accent}" stop-opacity=".23"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>${grids}${ticks}<path d="${line} L700 230 H10 Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${accent}" stroke-width="2" vector-effect="non-scaling-stroke"/>${dots}<line class="crosshair" y1="12" y2="230" stroke="#7e98b5" stroke-dasharray="4 4" visibility="hidden"/><circle class="point" r="4" fill="${accent}" stroke="#0b1018" stroke-width="2" visibility="hidden"/></svg><div class="tooltip" role="status" hidden></div></div>`;
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
const botRows=()=>Object.values(state.bots)
 .filter(bot=>bot.desired==='running')
 .toSorted((a,b)=>(b.started??0)-(a.started??0))
 .slice(0,5)
 .map(b=>`<a class="bot-row bot-session-link" href="#${sessionRoute(b)}"><span><b>${esc(b.name)}</b><small>${esc(b.symbol)} · v${b.version}</small></span>${badge(botStatus(b))}</a>`).join('')||empty('No running bots. Open Live Trading to launch or resume a bot.');
function dashboard(){
 const a=state.account, equity=state.equity, hasAccount=state.mode==='demo'||equity.length>0;
 const current=hasAccount?a.equity:null;
 const pnl=current!==null&&a.dayStart>0?current-a.dayStart:null;
 const dayChange=pnl===null?null:100*pnl/a.dayStart;
 const base=equity[0]?.value;
 const totalReturn=current!==null&&base>0?100*(current/base-1):null;
 const exits=state.orders.filter(o=>o.owned&&o.side==='sell'&&o.filled>0&&Number.isFinite(o.pnl)&&o.pnl!==0);
 const winRate=exits.length?100*exits.filter(o=>o.pnl>0).length/exits.length:null;
 const name=state.profile?.name?.trim().split(/\s+/)[0];
 const sessionLabel=!online?'Offline · Cached':state.mode==='demo'?'Demo market':state.broker!=='connected'?'Broker reconnecting':state.sessionOpen?'U.S. market open':'U.S. market closed';
 const sessionClass=online&&(state.mode==='demo'||state.broker==='connected'&&state.sessionOpen)?'good':'';
 const metricChange=value=>`<span class="${color(value)}">${pct(value)}</span>`;
 const metrics=[
   metric('Portfolio value',usd(current),metricChange(dayChange)+' today','equity'),
   metric('Today’s P&amp;L',pnl>0?'+'+usd(pnl):usd(pnl),metricChange(dayChange)+' today','trading'),
   metric('Total return',pct(totalReturn),base>0?'Since '+esc(stamp(equity[0].t,{month:'short',day:'numeric',year:'numeric'})):'Awaiting equity history','portfolio'),
   metric('Win rate',winRate===null?'—':winRate.toFixed(1)+'%',exits.length?exits.length+' realized sell fills':'Awaiting closed trades','history')
 ].join('');
 const m=state.market.find(asset=>asset.symbol===selected);
 const marketChart=chartMode==='Price'&&m;
 const all=marketChart?(state.bars[m.symbol]??[]).map(b=>({t:b.t,value:b.c})):equity;
 const duration=marketChart?ranges[range]*60000:portfolioRanges[portfolioRange]*86400000;
 const since=Date.parse(all.at(-1)?.t)-duration;
 const controls=Object.keys(marketChart?ranges:portfolioRanges).map(value=>btn(value,marketChart?'range':'portfolio-range',value,false,
   `aria-pressed="${value===(marketChart?range:portfolioRange)}"`)).join('');
 const chart=panel(marketChart?esc(m.symbol)+' performance':'Portfolio performance',marketChart?esc(m.name):'',
   plot(all.filter(p=>Date.parse(p.t)>=since&&Number.isFinite(p.value)),'price','#20aaff'),
   `<div class="dashboard-chart-actions">${marketChart?btn('Portfolio','chart','Equity'):''}<div class="segmented" aria-label="Chart range">${controls}</div></div>`,'dashboard-chart');
 const marketNames={'SPY':'S&P 500 ETF','QQQ':'Nasdaq-100 ETF','BTC/USD':'Bitcoin','ETH/USD':'Ethereum'};
 const overview=Object.keys(marketNames).map(symbol=>state.market.find(asset=>asset.symbol===symbol)).filter(Boolean);
 const rows=(assets,marketOverview=false)=>assets.map((asset,i)=>{
   const bars=(state.bars[asset.symbol]??[]).slice(-20);
   const closes=bars.map(bar=>bar.c).filter(Number.isFinite);
   const spread=Math.max(...closes)-Math.min(...closes)||1, low=Math.min(...closes);
   const spark=closes.length>1?`<svg class="dashboard-spark ${color(asset.change)}" viewBox="0 0 64 22" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.7" points="${closes.map((value,idx)=>`${2+60*idx/(closes.length-1)},${20-18*(value-low)/spread}`).join(' ')}"/></svg>`:'';
   return `<button type="button" class="watch-row dashboard-market-row" data-action="watch" data-value="${esc(asset.symbol)}">${mark(asset.symbol,i)}
     <span><b>${esc(marketOverview?marketNames[asset.symbol]:asset.symbol)}</b><small>${esc(marketOverview?asset.symbol:asset.name)}</small></span>
     ${marketOverview?'':spark}<span class="watch-right"><b>${usd(asset.price)}</b><small class="${color(asset.change)}">${pct(asset.change)}</small></span></button>`;
 }).join('');
 const opportunities=state.market.filter(asset=>asset.eligible&&Number.isFinite(asset.change)&&Number.isFinite(asset.price))
   .toSorted((first,second)=>second.change-first.change).slice(0,3);
 const marketsLink='<a class="dashboard-panel-link" href="#screener">View markets →</a>';
 const quickActions=[
   ['trading','Start live session','trading'],
   ['backtesting','Run backtest','backtesting'],
   ['strategies?new','Create strategy','plus']
 ].map(([route,label,glyph])=>`<a class="button" href="#${route}"><span>${icon(glyph)}</span>${label}</a>`).join('');
 const signals=state.signals.length?`<div class="activity">${state.signals.slice(0,3).map(s=>`<div class="activity-item"><div class="inline"><b>${esc(s.symbol)}</b>${badge(s.direction)}</div><p>${esc(s.rationale)}</p><small>${esc(s.strategy)} v${s.version} · ${esc(s.source)} · ${stamp(s.t)}</small></div>`).join('')}</div>`:empty('Signals will appear when a running strategy finds a setup.');
 const holdings=table(['Asset','Units','Mark','Unrealized P&L'],state.positions.map(p=>{
   const pnl=p.qty*(p.price-p.entry);
   return [esc(p.symbol),qtyText(p.qty),usd(p.price),`<span class="${color(pnl)}">${usd(pnl)}</span>`];
 }),'Filled entry orders will appear here.');
 return `<div class="dashboard">
 <header class="dashboard-greeting"><div><h1>${name?'Welcome back, '+esc(name)+'!':'Trading dashboard'}</h1><p class="sub">Here’s your trading overview for today.</p></div>
 <span class="connection dashboard-session ${sessionClass}"><i class="dot"></i>${sessionLabel}</span></header>
 <div class="metrics dashboard-metrics">${metrics}</div>
 <div class="dashboard-primary">${chart}${panel('Market overview','',`<div class="watch-list">${rows(overview,true)}</div>`,marketsLink,'dashboard-market')}</div>
 <div class="dashboard-secondary">
   ${panel('Top opportunities','Ranked by recent price change',opportunities.length?`<div class="watch-list">${rows(opportunities)}</div>`:empty('Opportunities appear as eligible market data arrives.'),marketsLink,'dashboard-market')}
   <section class="panel dashboard-ai"><div><h2>Build with AI trading tools</h2><p class="sub">Draft strategy rules or configure an autonomous paper trading bot.</p>${link('Explore AI tools →','strategies?new&mode=ai_notepad')}</div></section>
   ${panel('Quick actions','',`<div class="dashboard-quick">${quickActions}</div>`)}
 </div>
 <div class="grid equal">${panel('Recent orders','Paper execution activity',orders(state.orders,5),link('Portfolio','portfolio'))}${panel('Trade signals','Latest strategy decisions',signals)}</div>
 <div class="grid equal">${panel('Open holdings','Current paper positions',holdings,link('Portfolio','portfolio'))}${panel('Bot status','Running bots',botRows(),link('Manage bots','trading'))}</div>
 </div>`;
}
function tradingView(symbol, botOrders, position, label='Trading View'){
 const allBars=state.bars[symbol]??[];
 const latestTs=allBars.length?Date.parse(allBars.at(-1).t):Date.now();
 const since=latestTs-ranges[tvRange]*60000;
 const visible=allBars.filter(b=>Date.parse(b.t)>=since);
 const slice=visible.length>=2?visible:allBars.slice(-60);
 const seg=(values,action,current)=>`<div class="segmented">${values.map(v=>`<button type="button" class="${v===current?'selected':''}" data-action="${action}" data-value="${v}" aria-pressed="${v===current}">${v}</button>`).join('')}</div>`;
 const controls=`<div class="actions">${seg(['Candles','Line'],'tv-style',tvStyle)}${seg(Object.keys(ranges),'tv-range',tvRange)}</div>`;
 if(slice.length<2)return panel(label,esc(symbol)+' · Waiting for candle history',empty('Candles and Buy/Sell markers will appear as bars arrive.'),controls,'chart-panel');
 const fills=botOrders.filter(o=>o.filled>0&&Number.isFinite(o.price)&&o.symbol===symbol);
 const firstTs=Date.parse(slice[0].t), lastTs=Date.parse(slice.at(-1).t);
 const inView=fills.filter(o=>{const ts=Date.parse(o.filledAt??o.t);return ts>=firstTs-60000&&ts<=lastTs+120000});
 const highs=slice.map(b=>Number.isFinite(b.h)?b.h:Math.max(b.o,b.c));
 const lows=slice.map(b=>Number.isFinite(b.l)?b.l:Math.min(b.o,b.c));
 const extras=[...inView.map(o=>o.price),...(position?.qty>0&&Number.isFinite(position.entry)?[position.entry]:[])];
 const max=Math.max(...highs,...extras), min=Math.min(...lows,...extras);
 const pad=Math.max((max-min)*.15,Math.abs(max)*.0006,.01), low=min-pad, high=max+pad;
 const x=i=>10+690*i/(slice.length-1), y=v=>230-218*(v-low)/(high-low);
 const grids=Array.from({length:5},(_,i)=>{const row=12+i*54.5,v=high-(high-low)*i/4;return `<path d="M10 ${row}H700" stroke="#28364a" stroke-dasharray="3 5"/><text x="711" y="${row+4}">${num(v)}</text>`}).join('');
 const ticks=Array.from({length:6},(_,i)=>{const j=Math.round((slice.length-1)*i/5),long=lastTs-firstTs>86400000;return `<text x="${x(j)}" y="253" text-anchor="${i===0?'start':i===5?'end':'middle'}">${esc(stamp(slice[j].t,long?{month:'short',day:'numeric'}:{hour:'2-digit',minute:'2-digit',hour12:false}))}</text>`}).join('');
 const id='tvshade'+(++chartId);
 let seriesSvg='';
 if(tvStyle==='Candles'){
   const cw=Math.max(2,Math.min(9,560/slice.length));
   seriesSvg=slice.map((b,i)=>{
     const cx=x(i), h=Number.isFinite(b.h)?b.h:Math.max(b.o,b.c), l=Number.isFinite(b.l)?b.l:Math.min(b.o,b.c);
     const up=b.c>=b.o, col=up?'#48e1ad':'#ff8191';
     const top=y(Math.max(b.o,b.c)), bot=y(Math.min(b.o,b.c)), bh=Math.max(1.5,bot-top);
     return `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(h).toFixed(1)}" y2="${y(l).toFixed(1)}" stroke="${col}" stroke-width="1.2"/><rect x="${(cx-cw/2).toFixed(1)}" y="${top.toFixed(1)}" width="${cw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${col}"/>`;
   }).join('');
 } else {
   const line=slice.map((b,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(b.c).toFixed(2)).join(' ');
   seriesSvg=`<path d="${line} L700 230 H10 Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="#4be4b2" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
 }
 const entryLine=position?.qty>0&&Number.isFinite(position.entry)?`<line x1="10" x2="700" y1="${y(position.entry).toFixed(1)}" y2="${y(position.entry).toFixed(1)}" stroke="#8cb4ff" stroke-dasharray="5 4" stroke-width="1.3"/><text x="14" y="${Math.max(22,y(position.entry)-5).toFixed(1)}" fill="#8cb4ff" font-size="10">AVG ENTRY ${usd(position.entry)}</text>`:'';
 const markers=inView.map(o=>{
   const ts=Date.parse(o.filledAt??o.t);
   let best=0, diff=Infinity;
   for(let i=0;i<slice.length;i++){const d=Math.abs(Date.parse(slice[i].t)-ts);if(d<diff){diff=d;best=i}}
   const cx=x(best), cy=y(o.price), buy=o.side==='buy', col=buy?'#48e1ad':'#ff8191';
   return `<g class="tv-marker"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${col}" fill-opacity=".22"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="${col}" stroke="#0b1018" stroke-width="1.5"/><text x="${cx.toFixed(1)}" y="${(cy+3.2).toFixed(1)}" text-anchor="middle" fill="#08141c" font-size="8.5" font-weight="700">${buy?'B':'S'}</text></g>`;
 }).join('');
 const points=slice.map(b=>({t:b.t,value:b.c}));
 const buys=inView.filter(o=>o.side==='buy').length, sells=inView.filter(o=>o.side==='sell').length;
 const m=state.market.find(item=>item.symbol===symbol);
 const desc=`${esc(symbol)} · ${usd(m?.price??slice.at(-1).c)} · ${buys} buy / ${sells} sell markers in view`;
 const legend=`<div class="tv-legend"><span><i class="tv-dot buy"></i>Buy (${buys})</span><span><i class="tv-dot sell"></i>Sell (${sells})</span>${position?.qty>0?`<span><i class="tv-dot entry"></i>Avg entry ${usd(position.entry)}</span>`:''}</div>`;
 return panel(label,desc,legend+`<div class="plot" tabindex="0" aria-label="Bot trading view chart" data-points="${esc(JSON.stringify(points))}" data-unit="price" data-low="${low}" data-high="${high}"><svg viewBox="0 0 790 265" role="img" aria-label="Trading view chart"><defs><linearGradient id="${id}" x1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#4be4b2" stop-opacity=".23"/><stop offset="100%" stop-color="#4be4b2" stop-opacity="0"/></linearGradient></defs>${grids}${ticks}${seriesSvg}${entryLine}${markers}<line class="crosshair" y1="12" y2="230" stroke="#7e98b5" stroke-dasharray="4 4" visibility="hidden"/><circle class="point" r="4" fill="#4be4b2" stroke="#0b1018" stroke-width="2" visibility="hidden"/></svg><div class="tooltip" role="status" hidden></div></div>`,controls,'chart-panel');
}
function unmanagedPositions(){
 return state.positions.filter(p=>p.qty>0&&!Object.values(state.bots).some(b=>b.symbol===p.symbol&&((state.botSessions?.[b.id]?.qty??0)>1e-8||b.desired==='running')));
}
function tradingOverview(bots,mode){
 const enabled=bots.filter(b=>b.desired==='running');
 const running=enabled.filter(b=>b.status==='Running');
 const fills=state.orders.filter(o=>o.owned&&o.filled>0);
 const exits=fills.filter(o=>o.side==='sell'&&Number.isFinite(o.pnl));
 const wins=exits.filter(o=>o.pnl>0).length;
 const a=state.account;
 const ready=(state.mode==='demo'||state.equity.length>0)&&a.dayStart>0;
 const pnl=ready?a.equity-a.dayStart:null;
 const ratio=ready&&a.equity>0?100*a.exposure/a.equity:null;
 const day=state.equity.at(-1)?.t.slice(0,10);
 const curve=state.equity.filter(p=>ready&&p.t.slice(0,10)===day).map(p=>({t:p.t,value:p.value-a.dayStart}));
 const cards=enabled.map(b=>{
   const book=state.botSessions?.[b.id];
   const net=book?.complete&&Number.isFinite(book.unrealized)?book.realized+book.unrealized:null;
   return `<a class="live-bot" href="#${sessionRoute(b)}"><span class="live-bot-icon">${icon('bot')}</span><span><b>${esc(b.name)}</b><small>${esc(b.symbol)} · ${esc(botStatus(b))}</small></span><strong class="${color(net)}">${usd(net)}</strong></a>`;
 }).join('');
 const bulk=(label,action,available)=>btn(label,'fleet-command',action,false,online&&available?'':'disabled');
 const stop=bots.some(b=>b.desired!=='stopped');
 const status=!online?'Cached':running.length?'Live active':enabled.length?'Waiting':'Idle';
 return `<div class="live-overview">${page(mode,'Live Trading Session','Monitor and manage your paper trading activity.',`<div class="actions">${badge(status,online&&running.length?'good':'')}${bulk('End session','stopped',stop)}</div>`)}
 ${online?'':'<div class="notice">Cached workspace · '+syncLabel()+'</div>'}
 <div class="metrics">${metric('Session P&L','<span class="'+color(pnl)+'">'+usd(pnl)+'</span>',ready?pct(100*pnl/a.dayStart)+' since day start':'Awaiting account snapshot','equity',true)}
 ${metric('Win rate',exits.length?(100*wins/exits.length).toFixed(1)+'%':'—',exits.length?num(exits.length)+' exits with recorded P&L':'Awaiting realized exits','backtesting')}
 ${metric('Total trades',fills.length,'Recorded bot orders with fills','portfolio')}
 ${metric('Active bots',running.length,enabled.length-running.length+' waiting · '+bots.filter(b=>b.desired==='paused').length+' paused','bot',true)}</div>
 <div class="live-middle">${panel('Live performance','Account P&L from day-start equity',plot(curve),'<span class="series-key">Session P&L</span>','live-chart')}
 ${panel('Active bots','Bot P&L before fees','<div class="live-cards">'+(cards||empty('Launch a funded bot to follow its session here.'))+'</div>',btn('View all ↓','fleet-jump','bot-list'))}</div>
 <div class="live-controls">${panel('Trading controls','',`<div class="actions">${bulk('Pause all','paused',enabled.length)}${bulk('Stop all','stopped',stop)}${btn('Configure bots','fleet-jump','bot-launch')}</div>`)}
 ${panel('Market status','',`<b>${!online?'Cached snapshot':state.mode==='demo'?'Simulated market':state.broker!=='connected'?'Broker unavailable':state.sessionOpen?'Stock market open':'Stock market closed'}</b><small>Stocks · ${esc(online?state.feed:'cached')} &nbsp; Crypto · ${esc(online?state.cryptoFeed??state.feed:'cached')}</small>`)}
 ${panel('Risk monitor','',`<b>${Number.isFinite(ratio)?num(ratio)+'% gross exposure':'Awaiting exposure'}</b><small>Position value / account equity</small><meter min="0" max="100" value="${Number.isFinite(ratio)?ratio:0}" aria-label="Gross exposure percent"></meter>`)}</div></div>`;
}
let portfolioResult=null,portfolioDraft={};
function multiStrategy(){
 const eligible=state.strategies.filter(s=>!s.ai&&!['ai_autonomous','ai_notepad'].includes(s.mode)).toReversed();
 const options=[['','Choose a saved strategy'],...eligible.map(s=>[key(s),s.name+' · '+s.symbol+' · '+(s.timeframe??'1Min')+' · v'+s.version])];
 const draft=portfolioDraft;
 const fields=select('Strategy A','first',options,draft.first??'',true)+select('Strategy B','second',options,draft.second??'',true)+
   numeric('Starting capital ($)','capital',draft.capital??10000,100,1e9,1)+numeric('Allocation to strategy A (%)','split',draft.split??50,1,99,1)+
   numeric('Fees (bps)','fees',draft.fees??25,0,500)+numeric('Slippage (bps)','slippage',draft.slippage??5,0,500);
 const live=state.paperPortfolio;
 const resultPanel=(r,title,extra='')=>r?panel(title,esc(r.symbol)+' · '+esc(r.timeframe),
   '<div class="metrics">'+metric('Ending equity',usd(r.final),pct(100*(r.final/r.capital-1)),'equity')+
   metric('Net orders',num(r.orderCount),'Simulated external orders','trading')+metric('Internally offset',num(r.internalQty),'Units transferred between strategy allocations','portfolio')+'</div>'+
   table(['Strategy','Cash','Open quantity','Equity'],r.strategies.map(s=>[esc(s.name)+' · v'+s.version,usd(s.cash),num(s.qty),usd(s.equity)]),'No strategy allocations.')+
   table(['Time','Side','Quantity','Price','Fee'],r.orders.toReversed().map(o=>[stamp(o.t),badge(o.side),num(o.qty),usd(o.price),usd(o.fee)]),'No simulated net orders yet.')+extra):'';
 const session=resultPanel(live,'Continuous paper session',live?'<div class="form"><div class="actions">'+
   badge(live.running?'Running':'Paused',live.running?'good':'')+
   (live.lossLocked?badge('Daily portfolio loss limit','bad'):'')+
   btn(live.running?'Pause':'Resume','portfolio-session',live.running?'pause':'resume',false,online?'':'disabled')+
   '</div><small>'+(live.lastBar?'Last candle '+stamp(live.lastBar):'Waiting for a fresh candle')+'</small></div>':'');
 const results=resultPanel(portfolioResult,'Portfolio replay',portfolioResult?
   table(['Run','Ending equity','Return'],[
     ['Combined',usd(portfolioResult.final),pct(100*(portfolioResult.final/portfolioResult.capital-1))],
     ...portfolioResult.benchmarks.map(run=>[esc(run.name)+' alone',usd(run.final),pct(100*(run.final/run.capital-1))])
   ],'No comparisons yet.'):'');
 return page('Paper trading','Multi-strategy','Run two strategies on one asset with separate allocations and simulated net orders.',link('Live Trading','trading'))+
   '<div class="stack">'+panel('Portfolio setup','Select two rules-only strategies with the same asset and timeframe. The replay uses the last 14 days, evaluates closed candles, and fills at the next open.',
     form('portfolio-replay',fields,submit('Run portfolio replay',!online||eligible.length<2)+
       (live?'':`<button class="button primary" type="submit" name="action" value="start" ${!online||eligible.length<2?'disabled':''}>Start paper session</button>`)))+session+results+'</div>';
}

function trading(){
 if(params().get('view')==='multi-strategy')return multiStrategy();
 const bots=Object.values(state.bots);
 if(!bots.some(b=>b.id===tvBotId))tvBotId=bots.find(b=>b.desired==='running')?.id??bots[0]?.id??'';
 const activeTvBot=bots.find(b=>b.id===tvBotId);
 const tvBotOrders=activeTvBot?state.orders.filter(o=>o.owned&&o.strategyId===activeTvBot.id):[];
 const tvPos=activeTvBot?state.positions.find(p=>p.symbol===activeTvBot.symbol):null;
 const tvSwitch=bots.length>1?`<div class="tv-bot-tabs">${bots.map(b=>btn(esc(b.name)+' · '+esc(b.symbol),'tv-bot',b.id,false,`aria-pressed="${b.id===tvBotId}"`)).join('')}</div>`:'';
 const tvPanel=activeTvBot?tvSwitch+tradingView(activeTvBot.symbol,tvBotOrders,tvPos,'Bot Trading View · '+esc(activeTvBot.name)):'';
 const unmanaged=unmanagedPositions();
 const groups=[['all','All bots'],['running','Active'],['paused','Paused'],['stopped','Stopped']];
 const counts=Object.fromEntries(groups.map(([k])=>[k,k==='all'?bots.length:bots.filter(b=>b.desired===k).length]));
 const filters=`<div class="tabs" role="group" aria-label="Filter bots">${groups.map(([k,label])=>btn(label+' '+counts[k],'bot-filter',k,false,`aria-pressed="${botFilter===k}"`)).join('')}</div>`;
 const options=state.strategies.slice().reverse().filter(s=>!s.ai||state.aiConfigured||(s.mode==='ai_autonomous'&&state.botAiConfigured)||Boolean(state.botAiKeys?.[s.id]))
   .map(s=>[key(s),s.name+' · '+s.symbol+' · v'+s.version]);
 const requested=launchVersion??params().get('version');
 const chosen=options.some(([id])=>id===requested)?requested:'';
 const instrument=launchInstrument??(chosen?version(chosen)?.symbol:'');
 const unavailable=requested&&!chosen?'<small>The requested strategy is unavailable for launch. Select another version or open its existing bot session.</small>':'';
 const disabled=!online?'disabled':'';
 const rows=bots.filter(b=>botFilter==='all'||b.desired===botFilter).map(b=>{
   const command=(label,action,primary=false)=>btn(label,'bot-command',action,primary,`data-bot="${esc(b.id)}" data-version="${b.version}" ${disabled}`);
   const controls=b.desired==='running'?command('Pause','paused'):b.budget?command(b.desired==='paused'?'Resume':'Restart','running',true):link('Set budget',sessionRoute(b),true);
   const latestOrder=state.orders.find(o=>o.strategyId===b.id);
   const strat=version(key(b)), book=state.botSessions?.[b.id]??{};
   const modeTag=strat?.mode==='ai_autonomous'?' '+badge('Autonomous AI'):strat?.mode==='ai_notepad'?' '+badge('AI Notepad'):'';
   let liveDetail='';
   if(!b.budget) liveDetail='Set budget to start trading';
   else if(b.desired==='running'){
     if(book.qty>0) liveDetail=`Holding ${qtyText(book.qty)} ${b.symbol}`+(b.status.toLowerCase()!=='running'?' · '+b.status:'');
     else if(b.status.toLowerCase()!=='running') liveDetail=b.status;
     else liveDetail='Waiting to enter market'+(b.lastEvaluation?.rationale?' · '+b.lastEvaluation.rationale.slice(0,55):'');
   } else if(b.desired==='paused') liveDetail='Paused · ready to resume';
   const detail=liveDetail?'<small style="display:block;margin-top:3px">'+esc(liveDetail)+'</small>':'';
   return [
     `<a class="bot-name" href="#${sessionRoute(b)}"><b>${esc(b.name)}</b></a>${modeTag}`,esc(b.symbol)+' · v'+b.version,
     badge({running:'Active',paused:'Paused',stopped:'Stopped'}[b.desired],b.desired==='running'&&b.status.toLowerCase()==='running'?'good':'')+detail,
     b.budget?usd(b.budget):badge('Budget required'),stamp(b.lastBar),latestOrder?badge(latestOrder.status)+' <small>'+stamp(latestOrder.t)+'</small>':'—',
     '<div class="actions">'+controls+(b.desired!=='stopped'?command('Stop','stopped'):'')+btn('Delete','open-delete-bot',b.id,false,`style="color:#ff8191;border-color:#592e42" ${disabled}`)+'</div>'
   ];
 });
 const mode=state.mode==='demo'?'Demo paper trading':'Alpaca Paper';
 const adoptPanel=unmanaged.length&&options.length?panel('Assign unmanaged open position','Allot an existing broker position that no bot is trading and optionally add extra USD funds to keep trading it.',
   form('adopt-position',
     select('Open broker position','symbol',unmanaged.map(p=>[p.symbol,`${p.symbol} · ${qtyText(p.qty)} units (${usd(p.qty*p.price)})`]),unmanaged[0].symbol,true)+
     select('Strategy to manage position','version',[['','Choose a strategy version'],...options],chosen,true)+
     numeric('Additional funds to add (USD)','addFunds',0,0,1e9),
     submit('Assign position & start bot',!online))):'';
 return tradingOverview(bots,mode)+'<div class="stack live-workflow"><div class="actions">'+link('Multi-strategy','trading?view=multi-strategy')+btn('Emergency Kill Switch','open-kill-switch','',false,`style="background:#39212e;color:#ff8191;border-color:#592e42" ${disabled}`)+'</div>'+tvPanel+'<div id="bot-launch">'+panel('Launch a bot','Choose the saved trading rules, the instrument to trade, and the maximum USD budget.',
     options.length?form('launch-bot',select('Strategy version','version',[['','Choose a strategy version'],...options],chosen,true)+
       assetPicker('Ticker or crypto pair','instrument',instrument??'')+numeric('Bot budget (USD)','budget',launchBudget,1,1e9),
       unavailable+submit('Launch bot',!online)):
     empty('Save a strategy for an eligible instrument to launch another bot.'),link('Strategy Editor','strategies'))+
   '</div><div id="bot-list">'+panel('Bots','Pause or stop to prevent new submissions. Existing orders stay at the broker.',
     '<div class="bot-filters">'+filters+'</div>'+table(['Bot','Instrument / version','Status','Budget','Last evaluated bar','Latest order','Controls'],rows,'No bots in this view.'))+'</div>'+adoptPanel+'</div>';
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
 const versions=state.strategies.filter(s=>s.id===bot.id).slice().reverse().map(s=>[s.version,s.symbol+' · v'+s.version]);
 const requestedVersion=params().get('version')??bot.version;
 const selectedVersion=versions.some(([v])=>String(v)===String(requestedVersion))?requestedVersion:'';
 const moneyChange=value=>`<span class="${color(value)}">${usd(value)}</span>`;
 const command=(label,action)=>btn(label,'bot-command',action,false,`data-bot="${esc(bot.id)}" data-version="${bot.version}" ${!online?'disabled':''}`);
 const controls=bot.desired==='running'?'<div class="form"><div class="actions">'+command('Pause','paused')+command('Stop','stopped')+'</div></div>':
   bot.desired==='paused'?'<div class="form">'+command('Stop','stopped')+'</div>':'';
 const hasOpenPos=holding||state.positions.some(p=>p.symbol===bot.symbol&&p.qty>0);
 const needsResync=bot.status==='Position differs from strategy fills'||!book.complete;
 const resyncControl=needsResync?`<div class="notice" style="margin-bottom:8px;border-color:#6e5726;background:#2a2418;color:#ffd68a"><div style="margin-bottom:6px"><b>Ledger out of sync:</b> This bot’s fill ledger differs from your live broker position (e.g. from fee rounding or partial/external fills).</div>${btn('Re-sync ledger to broker','resync-bot',bot.id,true,!online?'disabled':'')}</div>`:'';
 const liquidateControls=hasOpenPos&&!open.some(o=>o.side==='sell')
   ?`<div class="form"><div class="actions">${btn('Close position','liquidate-bot',bot.id,false,`data-symbol="${esc(bot.symbol)}" data-pause="false" style="background:#39212e;color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`)}${bot.desired==='running'?btn('Close &amp; Pause','liquidate-bot',bot.id,false,`data-symbol="${esc(bot.symbol)}" data-pause="true" style="background:#39212e;color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`):''}</div></div>`:'';
 const topUpForm=form('topup-bot',numeric('Add additional funds (USD)','addFunds','',1,1e9),submit('Add funds to bot',!online));
 const risk=bot.desired==='running'&&bot.budget?topUpForm:form('fund-bot',select('Strategy version','version',[['','Choose a strategy version'],...versions],selectedVersion,true)+numeric('Bot budget (USD)','budget',fundBudget??bot.budget??'',1,1e9),
       submit(bot.desired==='running'?'Set budget':bot.desired==='paused'?'Resume bot':'Restart bot',!online))+topUpForm;
 const aiCallsBadge=strategy?.mode==='ai_autonomous'?badge(`AI calls today: ${bot.aiCallsToday??0}${strategy.aiDailyCap?' / '+strategy.aiDailyCap:''}`):'';
 const personalKey=state.botAiKeys?.[bot.id];
 const advKeyBox=`<details class="form" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)"><summary style="cursor:pointer;font-weight:600;font-size:.88rem;color:var(--text);display:flex;align-items:center;justify-content:space-between;gap:8px"><span>Advanced: Personal Bot API Key</span>${badge(personalKey?personalKey.provider+' · '+personalKey.masked:'Fallback to main key',personalKey?'good':'')}</summary><div style="margin-top:10px"><small style="display:block;margin-bottom:8px;color:var(--muted)">Assign this bot its own dedicated Gemini or OpenAI key so it never shares rate limits with other bots. Leave empty to fall back to your main key.</small><form id="per-bot-ai-key" data-bot="${esc(bot.id)}" class="form"><div class="fields">${select('Provider','provider',[['Gemini','Google Gemini'],['OpenAI','OpenAI']],personalKey?.provider??'Gemini',true)}${field('Model (optional)','model',personalKey?.model??'','maxlength="80" placeholder="e.g. gemini-3.5-flash"')}${field('Personal API Key','key','','type="password" autocomplete="off" maxlength="300" placeholder="'+(personalKey?'Enter new key to replace':'Paste dedicated API key')+'"')}</div><div class="actions">${submit('Save bot key',!online)}${btn('Test key','test-per-bot-ai-key',bot.id,false,!online?'disabled':'')}${personalKey?btn('Use main key','remove-per-bot-ai-key',bot.id,false,`style="color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`):''}</div></form></div></details>`;
 const deleteControl=`<div class="form" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)"><div class="actions">${btn('Delete bot','open-delete-bot',bot.id,false,`style="background:#39212e;color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`)}</div><small style="color:var(--muted)">Choose whether to liquidate any open position or leave it open when deleting.</small></div>`;
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
   '<div class="stack">'+tradingView(bot.symbol,botOrders,holding?{qty:book.qty,entry:book.complete?book.cost/book.qty:null}:null,'Bot Trading View · Buy & Sell Markers')+'</div>'+
   '<div class="grid equal">'+panel('Position',positionStatus,table(['Asset','Units held','Average cost','Mark','Market value','Open P&L'],positionRows,'No open position held by this bot.'))+
   panel('Bot controls','Last evaluated '+stamp(bot.lastBar)+' · '+open.length+' open orders',
     '<div class="form"><div class="actions">'+badge(botStatus(bot))+aiCallsBadge+'<small>Started '+stamp(bot.started)+'</small></div>'+
     '<small>'+usd(book.reserved)+' reserved for pending buys</small></div>'+resyncControl+controls+liquidateControls+risk+advKeyBox+deleteControl)+'</div>'+
   '<div class="stack">'+panel('Latest evaluation',bot.lastEvaluation?stamp(bot.lastEvaluation.t)+' · '+usd(bot.lastEvaluation.price):'Waiting for an evaluated bar',
     bot.lastEvaluation?'<div class="bot-row"><span>'+esc(bot.lastEvaluation.rationale)+'</span>'+badge(bot.lastEvaluation.direction)+'</div>':empty(botStatus(bot)))+
   panel('Orders and executions',`${filled.length} filled or partially filled orders · ${usd(book.bought)} bought · ${usd(book.sold)} sold`,
     table(['Submitted','Asset','Side','Filled / requested','Average fill','Filled value','Status'],botOrders.map(o=>[
       stamp(o.t),esc(o.symbol),badge(o.side),qtyText(o.filled)+' / '+qtyText(o.qty),usd(o.price),o.filled>0&&Number.isFinite(o.price)?usd(o.filled*o.price):'—',badge(o.status)
     ]),'No orders yet.'))+
   panel('Signal history','Trade decisions and AI holds for this bot.',
     table(['Time','Direction','Rationale','Source'],signals.map(signal=>[
       stamp(signal.t),badge(signal.direction),esc(signal.rationale)+(signal.knowledgeSources?.length?
         '<small>References supplied to AI: '+esc(signal.knowledgeSources.join(', '))+'</small>':''),esc(signal.source)
     ]),'No signals recorded for this bot yet.'))+'</div>';
}
const catalogTypes={us_equity:'US equities & ETFs',crypto:'Spot crypto',us_option:'US options',crypto_perp:'Crypto perpetuals',treasury:'Treasuries',corporate:'Corporate bonds',global_equity:'Global equities',us_index:'US indices',us_equity_chain:'US equity chains',ipo:'IPOs'};
let catalogSearch={query:'',assetClass:'',offset:0},catalogResults=null,catalogLoading=false,catalogError='';
let assetSearchTimer;
function assetPicker(label,name,value){
 const list='asset-suggestions-'+name;
 const options=state.market.filter(m=>m.eligible).slice(0,10);
 return '<div class="asset-picker">'+field(label,name,value,`required maxlength="40" autocomplete="off" data-asset-picker list="${list}" placeholder="Search by ticker or name" aria-describedby="${list}-status"`)+
   `<datalist id="${list}">${options.map(m=>`<option value="${esc(m.symbol)}" label="${esc(m.name)}"></option>`).join('')}</datalist><small id="${list}-status" class="sub" aria-live="polite">Enter a ticker or choose a search result.</small></div>`;
}
async function loadCatalog(){
 catalogLoading=true;catalogError='';render(true);
 try{catalogResults=await api('assets',catalogSearch)}
 catch(error){catalogResults=null;catalogError=error.message}
 finally{catalogLoading=false;render(true)}
}
function catalogPanel(){
 const results=catalogResults;
 const rows=(results?.items??[]).map(asset=>[
   `<b>${esc(asset.symbol)}</b><br><small>${esc(asset.name)}</small>`,
   esc(catalogTypes[asset.assetClass]??asset.assetClass),
   asset.eligible?link('Build strategy','strategies?symbol='+encodeURIComponent(asset.symbol)):
     badge(!asset.tradable?'Not tradable on Alpaca':asset.supported?'Trading currently unavailable':'Catalog only')
 ]);
 const summary=catalogLoading?'Searching asset catalog…':catalogError||(results?
   `${results.total?results.offset+1:0}–${Math.min(results.offset+30,results.total)} of ${num(results.total)}${results.demo?' demo assets':results.partial?' results · Some Alpaca asset classes are unavailable or still loading':' results'}`:'Search by symbol or name, or select an asset class.');
 const pagination=results&&!catalogLoading?`<div class="actions">
   <button class="button" type="submit" name="page" value="previous" ${results.offset===0?'disabled':''}>Previous</button>
   <button class="button" type="submit" name="page" value="next" ${results.offset+30>=results.total?'disabled':''}>Next</button>
 </div>`:'';
 return panel('Asset catalog','Browse Alpaca instruments and see which ones can be used in FastTrader bots.',
   form('catalog-search',field('Symbol or name','query',catalogSearch.query,'type="search" maxlength="80"')+
     select('Asset class','assetClass',[['','All asset classes'],...Object.entries(catalogTypes)],catalogSearch.assetClass),
     submit('Search')+pagination)+`<p class="sub catalog-status" role="status">${esc(summary)}</p>`+
   (results&&!catalogLoading?table(['Instrument','Asset class','FastTrader'],rows,'No matching instruments.'):''));
}
function screener(){
 const tabs=`<div class="tabs market-tabs" role="tablist" aria-label="Asset class">${['Stocks','Crypto','Catalog','Forex'].map(v=>btn(v,'asset',v,false,`role="tab" aria-selected="${v===assetClass}"`)).join('')}</div>`;
 const heading=page('Market research','Screener','Find instruments by liquidity, volatility, and price movement.')+tabs;
 if(assetClass==='Catalog')return heading+catalogPanel();
 if(assetClass==='Forex')return heading+panel('Forex universe','Spread, available leverage, and momentum',empty('This asset class requires a provider integration.'),link('View integrations','settings'));
 const crypto=assetClass==='Crypto', filter=crypto?cryptoScreen:screen, kind=crypto?'crypto':'stock';
 const matching=state.market.filter(m=>(m.assetClass??'stock')===kind&&(m.symbol+' '+m.name).toLowerCase().includes(filter.search.toLowerCase())&&(!filter.volume||m.volume>=filter.volume)&&(!filter.volatility||m.volatility>=filter.volatility));
 const rows=matching.map((m,i)=>[`<div class="inline">${mark(m.symbol,i)}<span><b>${esc(m.symbol)}</b><br><small>${esc(m.name)}</small></span></div>`,usd(m.price),`<span class="${color(m.change)}">${pct(m.change)}</span>`,pct(m.volatility),crypto?usd(m.volume):num(m.volume),esc(m.source??state.feedName)+' · '+badge(online?m.freshness:'cached')+' <small>Price '+stamp(m.t)+'<br>Bars '+stamp(m.metricsAt)+'</small>',m.eligible?link('Build strategy','strategies?symbol='+encodeURIComponent(m.symbol)):badge('Screen only')]);
 return heading+panel(crypto?'USD crypto pairs':'Stock universe',crypto?'Price, range volatility, and estimated USD turnover over the latest 60 bars.':'Price, range volatility, and share volume over the latest 60 bars.',
 form('screen',field('Search','search',filter.search,'type="search" placeholder="Search symbols or names"')+numeric(crypto?'Minimum turnover (USD)':'Minimum volume','volume',filter.volume,0,1e12,1)+numeric('Minimum volatility (%)','volatility',filter.volatility,0,100),submit('Apply filters'))+
 table(['Asset','Price','Change','Volatility',crypto?'USD turnover':'Volume','Source / freshness',''],rows,'No instruments match these filters.'));
}
const fields=[['Lookback (bars)','period',2,60,1],['Entry threshold (%)','entry',0,25],['Exit threshold (%)','exit',-25,0],['Position size (% equity)','size',.1,100],['Fixed size (USD)','sizeUsd',1,1e9,1],['Maximum exposure (% equity)','exposure',.1,100],['Maximum daily loss (%)','dailyLoss',.1,50],['Stop-loss (%)','stop',.1,50],['Trailing stop (%, 0=off)','trailingStop',0,50,.1],['Take-profit (%)','take',.1,100],['ATR stop multiplier (0=off)','atrStop',0,10,.1],['Stop-loss cooldown (bars)','cooldown',0,60,1],['Max hold (bars, 0=off)','maxHoldBars',0,1440,1]];
const defaultParams={mode:'momentum',timeframe:'1Min',period:12,entry:0.1,exit:-0.1,sizeMode:'percent',size:10,sizeUsd:500,exposure:20,dailyLoss:3,stop:2,trailingStop:0,take:4,atrStop:0,cooldown:5,maxHoldBars:0,ai:false,aiPrompt:'',aiNotes:'',aiWakeMode:'smart',aiRiskProfile:'balanced',aiSizing:'dynamic',aiDailyCap:100,rules:null};
const fresh=(symbol='',mode='momentum')=>({...defaultParams,mode,ai:mode==='ai_notepad'||mode==='ai_autonomous',id:'',version:0,name:'',symbol,rules:null});
const modeLabels={momentum:'Momentum (SMA)',mean_reversion:'Mean Reversion (Bollinger + RSI)',breakout:'Breakout (Donchian Channel)',custom:'Custom Rule Builder',ai_notepad:'AI Notepad Strategy',ai_autonomous:'Autonomous AI Agent'};
const autoRiskPresets={
 conservative:{label:'Conservative',stop:3,trailingStop:2,take:8,dailyLoss:4,cooldown:3},
 balanced:{label:'Balanced',stop:5,trailingStop:3,take:12,dailyLoss:6,cooldown:2},
 aggressive:{label:'Aggressive',stop:8,trailingStop:4,take:20,dailyLoss:10,cooldown:1}
};
const notepadTemplates={
 smart_dip:{label:'Smart Dip Buyer',name:'AI Smart Dip Buyer',timeframe:'15Min',sizeMode:'usd',sizeUsd:500,stop:2.5,trailingStop:1.5,take:5,aiNotes:'Strategy: Smart Dip Buyer (Long-Only)\n\nENTRY (BUY when flat):\n- Buy only if price is pulling back in an overall uptrend (near or above EMA 50) OR RSI(14) is oversold (< 38) with a stabilizing green candle.\n- Avoid buying vertical green spikes (>1.5% in a single candle) or negative breaking news.\n\nEXIT (SELL when holding):\n- Sell if RSI(14) becomes overbought (> 72) and momentum stalls.\n- Sell if bearish news breaks or price closes decisively below EMA 20.\n\nOtherwise return HOLD.'},
 breakout_rider:{label:'Breakout & Trend Rider',name:'AI Breakout Rider',timeframe:'15Min',sizeMode:'usd',sizeUsd:500,stop:2,trailingStop:1.8,take:6,aiNotes:'Strategy: Momentum Breakout Rider\n\nENTRY (BUY when flat):\n- Enter when price breaks cleanly above recent 10-bar highs with expanding candle bodies and EMA 20 sloping up.\n- Confirm RSI(14) is between 52 and 72 (strong trend, not exhausted).\n\nEXIT (SELL when holding):\n- Take profit if trend loses steam with 2 consecutive red candles below EMA 20.\n- Hold through normal minor pullbacks while above EMA 20.\n\nOtherwise return HOLD.'},
 news_swing:{label:'News + Price Action',name:'AI News Catalyst Swing',timeframe:'5Min',sizeMode:'usd',sizeUsd:500,stop:2,trailingStop:1.5,take:4.5,aiNotes:'Strategy: News & Price Action Swing\n\nENTRY (BUY when flat):\n- Buy when recent headlines are bullish or neutral AND price is making higher lows above SMA 12.\n- Never buy into clearly bearish headlines or sharp sell-offs.\n\nEXIT (SELL when holding):\n- Exit immediately if bearish news appears or price drops sharply below recent support.\n- Otherwise let take-profit or trailing stop manage the winner.\n\nReturn HOLD when no clear edge exists.'}
};
const tfOptions=[['1Min','1 Minute'],['5Min','5 Minutes'],['15Min','15 Minutes'],['1Hour','1 Hour']];
const tfMsMap={'1Min':60000,'5Min':300000,'15Min':900000,'1Hour':3600000};
const ruleIndLabels={close:'Close',sma:'SMA',ema:'EMA',rsi:'RSI',adx:'ADX',vwap:'Session VWAP',bb_upper:'BB Upper',bb_lower:'BB Lower',bb_width:'BB Width %',keltner_upper:'Keltner Upper',keltner_lower:'Keltner Lower',macd:'MACD',macd_signal:'MACD Signal',donchian_high:'Donchian High',donchian_low:'Donchian Low',atr:'ATR',volume:'Volume',avg_volume:'Avg Volume',rvol:'Rel Volume (RVOL)',pct_change:'% Change',number:'Number'};
const leftIndicators=['close','sma','ema','rsi','adx','vwap','bb_upper','bb_lower','bb_width','keltner_upper','keltner_lower','macd','macd_signal','donchian_high','donchian_low','atr','volume','avg_volume','rvol','pct_change'];
const rightIndicators=['number','close','sma','ema','vwap','rsi','adx','bb_upper','bb_lower','bb_width','keltner_upper','keltner_lower','macd','macd_signal','donchian_high','donchian_low','avg_volume'];
const opLabels={gt:'>',lt:'<',gte:'≥',lte:'≤',crosses_above:'Crosses Above',crosses_below:'Crosses Below'};
const noPeriodInd=new Set(['close','volume','vwap','macd','macd_signal','number']);
const strategyTemplates={
 squeeze_crypto:{label:'Crypto Squeeze 1H',name:'Crypto Volatility Squeeze',mode:'custom',timeframe:'1Hour',htfEma:50,minAdx:20,trailingStop:2.5,stop:3,take:10,cooldown:3,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'gt',right:{indicator:'bb_upper',period:20}},{left:{indicator:'close'},op:'gt',right:{indicator:'keltner_upper',period:20}},{left:{indicator:'rvol',period:20},op:'gt',right:{indicator:'number',value:1.5}}],exit:[{left:{indicator:'close'},op:'lt',right:{indicator:'sma',period:20}}]}},
 vwap_reclaim:{label:'Equity VWAP Reclaim',name:'Session VWAP Reclaim',mode:'custom',timeframe:'15Min',htfEma:50,minAdx:18,trailingStop:1.2,stop:1.5,take:4,cooldown:2,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'crosses_above',right:{indicator:'vwap'}},{left:{indicator:'close'},op:'gt',right:{indicator:'ema',period:20}},{left:{indicator:'rsi',period:14},op:'gt',right:{indicator:'number',value:50}}],exit:[{left:{indicator:'close'},op:'crosses_below',right:{indicator:'vwap'}},{left:{indicator:'rsi',period:14},op:'gt',right:{indicator:'number',value:76}}]}},
 rsi2_dip:{label:'Connors RSI(2) Dip',name:'Connors RSI(2) Pullback',mode:'custom',timeframe:'15Min',htfEma:50,minAdx:0,trailingStop:0,stop:2.5,take:4,cooldown:2,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'gt',right:{indicator:'ema',period:200}},{left:{indicator:'rsi',period:2},op:'lt',right:{indicator:'number',value:12}}],exit:[{left:{indicator:'close'},op:'gt',right:{indicator:'sma',period:5}}]}},
 donchian:{label:'Filtered Donchian',name:'Regime Donchian 20',mode:'custom',timeframe:'1Hour',htfEma:50,minAdx:22,trailingStop:2,stop:2.5,take:9,cooldown:2,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'gt',right:{indicator:'donchian_high',period:20}},{left:{indicator:'rvol',period:20},op:'gt',right:{indicator:'number',value:1.3}}],exit:[{left:{indicator:'close'},op:'lt',right:{indicator:'donchian_low',period:10}}]}},
 trend_pullback:{label:'Trend Pullback',name:'Trend Pullback RSI',mode:'custom',timeframe:'15Min',htfEma:50,minAdx:20,trailingStop:1.5,stop:2,take:4.5,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'gt',right:{indicator:'ema',period:50}},{left:{indicator:'rsi',period:14},op:'lt',right:{indicator:'number',value:38}}],exit:[{left:{indicator:'rsi',period:14},op:'gt',right:{indicator:'number',value:70}}]}}
};
const specLabel=sp=>!sp?'—':sp.indicator==='number'?String(sp.value??0):noPeriodInd.has(sp.indicator)?(ruleIndLabels[sp.indicator]??sp.indicator):`${ruleIndLabels[sp.indicator]??sp.indicator}(${sp.period??14})`;
function ensureRules(){editor.rules??={entryLogic:'all',exitLogic:'any',entry:[],exit:[]};return editor.rules}
function renderRuleGroup(side,title){
 const r=editor.rules??{entryLogic:'all',exitLogic:'any',entry:[],exit:[]};
 const list=r[side]??[], logic=side==='entry'?(r.entryLogic??'all'):(r.exitLogic??'any');
 const logicBtns=`<div class="segmented">${[['all','ALL (AND)'],['any','ANY (OR)']].map(([k,l])=>`<button type="button" class="${logic===k?'selected':''}" data-action="rule-logic" data-side="${side}" data-value="${k}">${l}</button>`).join('')}</div>`;
 const rows=list.map((row,idx)=>{
   const lOpts=leftIndicators.map(k=>`<option value="${k}" ${row.left?.indicator===k?'selected':''}>${ruleIndLabels[k]}</option>`).join('');
   const opOpts=Object.entries(opLabels).map(([k,l])=>`<option value="${k}" ${row.op===k?'selected':''}>${l}</option>`).join('');
   const rOpts=rightIndicators.map(k=>`<option value="${k}" ${row.right?.indicator===k?'selected':''}>${ruleIndLabels[k]}</option>`).join('');
   const lPer=noPeriodInd.has(row.left?.indicator)?'':`<input type="number" class="rule-num" min="1" max="200" step="1" value="${row.left?.period??14}" data-rule-side="${side}" data-rule-idx="${idx}" data-rule-part="left.period" aria-label="Left period">`;
   const rPer=row.right?.indicator==='number'
     ?`<input type="number" class="rule-num" step="any" value="${row.right?.value??0}" data-rule-side="${side}" data-rule-idx="${idx}" data-rule-part="right.value" aria-label="Right value">`
     :noPeriodInd.has(row.right?.indicator)?'':`<input type="number" class="rule-num" min="1" max="200" step="1" value="${row.right?.period??14}" data-rule-side="${side}" data-rule-idx="${idx}" data-rule-part="right.period" aria-label="Right period">`;
   return `<div class="rule-row"><select data-rule-side="${side}" data-rule-idx="${idx}" data-rule-part="left.indicator">${lOpts}</select>${lPer}<select data-rule-side="${side}" data-rule-idx="${idx}" data-rule-part="op">${opOpts}</select><select data-rule-side="${side}" data-rule-idx="${idx}" data-rule-part="right.indicator">${rOpts}</select>${rPer}<button type="button" class="button rule-del" data-action="rule-remove" data-side="${side}" data-value="${idx}" aria-label="Remove rule">✕</button></div>`;
 }).join('');
 return `<div class="rule-box"><div class="rule-head"><b>${title}</b><div class="actions">${logicBtns}${btn('+ Add rule','rule-add',side)}</div></div>${rows||'<small class="muted">No custom '+side+' conditions. Click + Add rule or choose a template above.</small>'}</div>`;
}
let strategyPreview = { key: '', result: null, next: 0 };
let previewTimer;

function previewMarkup(result) {
 if(!result)return empty('Checking closed candles...');
 if(result.error)return empty(result.error);
 const {ready,needed,count,latest,groups,entry,zeroVolume}=result;
 if(!ready)return empty('Warming up closed candles ('+count+'/'+needed+').');
 const candle=latest?'<div class="bot-row"><span><b>Latest closed candle</b><small>'+stamp(latest.t)+' · '+usd(latest.c)+'</small></span></div>':'';
 const rows=Object.entries(groups).map(([side, group])=>{
   const title=side==='entry'?'Entry conditions':'Exit conditions';
   const checks=group.results.map(({rule,ready,pass,leftVal,rightVal})=>
     '<div class="bot-row"><span><b>'+esc(specLabel(rule.left))+' '+esc(opLabels[rule.op])+' '+esc(specLabel(rule.right))+'</b><small class="mono">'+
     (ready?num(leftVal)+' '+esc(opLabels[rule.op])+' '+num(rightVal):'Warming up')+'</small></span>'+badge(ready?(pass?'PASS':'WAIT'):'WARMUP',pass?'good':'')+'</div>'
   ).join('');
   const pass=group.pass&&(side!=='entry'||!zeroVolume);
   return '<div class="bot-row"><b>'+title+' ('+esc(group.logic.toUpperCase())+')</b>'+badge(group.ready?(pass?'PASS':'WAIT'):'WARMUP',pass?'good':'')+'</div>'+checks;
 }).join('');
 const status=entry??(zeroVolume?'The latest candle has zero volume.':'The selected entry conditions did not match.');
 return candle+'<div class="bot-row"><span><b>Entry signal</b><small>'+esc(status)+'</small></span>'+badge(entry?'PASS':'WAIT',entry?'good':'')+'</div>'+rows;
}

function requestStrategyPreview(){
 const draft = Object.fromEntries(['name','symbol','mode','timeframe','sizeMode','htfEma','minAdx','rules',...fields.map(([,key])=>key)].map(key=>[key,editor[key]]));
 const key=JSON.stringify(draft);
 const unavailable=!online?'Connect to the worker to check closed candles.':!draft.symbol?'Select an instrument to preview closed candles.':'';
 if(unavailable){
   clearTimeout(previewTimer);
   strategyPreview={key:'',result:null,next:0};
   return empty(unavailable);
 }
 if(strategyPreview.key===key&&Date.now()<strategyPreview.next)return previewMarkup(strategyPreview.result);
 clearTimeout(previewTimer);
 const request={key,result:strategyPreview.key===key?strategyPreview.result:null,next:Infinity};
 strategyPreview=request;
 previewTimer=setTimeout(async()=>{
   let result;
   try{result=await api('strategy-preview',draft)}
   catch(error){result={error:error.message}}
   if(strategyPreview!==request)return;
   strategyPreview={key,result,next:Date.now()+10000};
   const target=$('#strategy-preview');
   if(target)target.innerHTML=previewMarkup(result);
 },300);
 return previewMarkup(request.result);
}

function renderLiveDebugger(){
 return panel('Live rule debugger','Closed-candle signals before account limits, positions, or AI confirmation.', '<div id="strategy-preview">'+requestStrategyPreview()+'</div>');
}
function renderPlaybooks(){
 return '<div class="playbook-grid">'+Object.entries(strategyPlaybooks).map(([id,playbook])=>{
   const run=state.runs.find(result=>result.playbookId===id);
   const results=run
     ? '<div class="playbook-result"><small>Latest linked replay · '+esc(run.symbol)+' · '+esc(run.timeframe)+' · v'+run.version+'</small>'+btn('View '+pct(100*(run.final/run.capital-1))+' return','open-playbook-run',run.id)+'</div>'
     : '<small class="playbook-result">No FastTrader replays yet</small>';
   return panel(esc(playbook.name),esc(playbook.author),
     '<div class="playbook-body"><div class="actions">'+badge(esc(playbook.category))+'<small>'+esc(playbook.evidence)+'</small></div>'+
     '<p class="sub">'+esc(playbook.setup)+'</p><dl class="playbook-rules"><dt>Entry</dt><dd>'+esc(playbook.entry)+'</dd>'+
     '<dt>Exit</dt><dd>'+esc(playbook.exit)+'</dd><dt>When to be cautious</dt><dd>'+esc(playbook.caution)+'</dd></dl>'+
     '<div class="playbook-adaptation"><b>FastTrader adaptation</b><p>'+esc(playbook.adaptation)+' The draft starts with standard app sizing and risk settings.</p></div>'+
     '<a class="playbook-source" href="'+esc(playbook.url)+'" target="_blank" rel="noopener noreferrer">'+esc(playbook.source)+'</a>'+
     results+btn('Create strategy draft','create-playbook-draft',id,true)+'</div>','','playbook-card');
 }).join('')+'</div>';
}

function renderKnowledgeLibrary(){
 const documents=state.knowledge??[];
 const files=documents.map(file=>'<div class="library-item"><div><b>'+esc(file.name)+'</b><small>'+num(file.bytes/1024)+' KB · '+stamp(file.uploadedAt)+'</small></div></div>').join('');
 const upload='<form id="knowledge-upload" class="form"><label class="field"><span>Strategy document</span>'+
   '<input type="file" name="document" accept=".txt,.md,.markdown" required'+(online?'':' disabled')+'></label>'+
   '<small>UTF-8 text or Markdown, up to 32 KB per file. To use a document, select it in an AI strategy and save a version.</small>'+
   '<div class="actions">'+submit('Upload document',!online)+'</div></form>';
 return panel('Trading knowledge base','Upload your own strategy notes, rules, or playbooks.',upload+(files||empty('No documents uploaded yet.')));
}

function knowledgePicker(){
 const selected=editor.knowledgeIds??[];
 const files=state.knowledge??[];
 const rows=files.map(file=>'<label class="check"><input type="checkbox" name="knowledgeId" value="'+esc(file.id)+'"'+
   (selected.includes(file.id)?' checked':'')+'><span>'+esc(file.name)+'</span></label>').join('');
 return '<small>Choose up to three documents. Relevant excerpts from these files are sent to the configured AI provider during evaluation.</small>'+
   (rows||'<small>No uploaded documents.</small>')+'<div class="actions">'+btn('Manage documents','open-playbook-library')+'</div>';
}

function strategies(){
 const route=location.hash, requested=params().get('symbol');
 if(editorRoute!==route){
    if(requested!==null||params().has('new'))playbookLibraryOpen=false;
   if(requested!==null&&(editor?.id||editor?.symbol!==requested))editor=fresh(requested);
   if(params().has('new')&&requested===null){
     const mode=params().get('mode');
     if(mode==='ai_notepad')editor=fresh('',mode);
     else if(editor?.id)editor=fresh();
   }
   editorRoute=route;
 }
 editor??=fresh(requested??'');
 const saved=editor.id&&version(key(editor)),bot=saved&&state.bots[editor.id];
 const options=state.strategies.slice().reverse().map(s=>[key(s),s.name+' · '+s.symbol+' · v'+s.version]);
 const isNotepad=editor.mode==='ai_notepad';
 const isAutonomous=editor.mode==='ai_autonomous';
 const editorSwitcher=`<div class="tabs" role="tablist" aria-label="Strategy workspace">${btn('Visual Rule Builder','editor-type','visual',false,`role="tab" aria-selected="${!playbookLibraryOpen&&!isNotepad&&!isAutonomous}"`)}${btn('AI Strategy Notepad','editor-type','ai_notepad',false,`role="tab" aria-selected="${!playbookLibraryOpen&&isNotepad}"`)}${btn('Autonomous AI','editor-type','ai_autonomous',false,`role="tab" aria-selected="${!playbookLibraryOpen&&isAutonomous}"`)}${btn('Strategy Library','open-playbook-library','',false,`role="tab" aria-selected="${playbookLibraryOpen}"`)}</div>`;
 if(playbookLibraryOpen){
   return '<div class="strategy-page">'+page('Paper trading','Strategy Library','Upload trading knowledge or create a draft from a published playbook.')+editorSwitcher+
     '<div class="editor-flow">'+renderKnowledgeLibrary()+renderPlaybooks()+'</div></div>';
 }
 const playbook=Object.hasOwn(strategyPlaybooks,editor.playbookId)?strategyPlaybooks[editor.playbookId]:null;
 const startTrade=s=>link('Start trade','trading?version='+encodeURIComponent(key(s)),true);
 const botActions=saved?`<div class="actions">${!['ai_notepad','ai_autonomous'].includes(saved.mode)?link('Backtest v'+saved.version,'backtesting?version='+key(saved)):''}${bot?link('Open bot session',sessionRoute(bot)+'&version='+saved.version):''}${startTrade(saved)}</div>`:'';
 const savedList=latest().map(s=>`<article class="library-item"><div><b>${esc(s.name)}</b><small>${esc(s.symbol)} · ${esc(modeLabels[s.mode]??'Visual rules')} · v${s.version}</small></div><div class="actions">${btn('Edit','edit',key(s))}${startTrade(s)}</div></article>`).join('');
 const group=(title,content,layout='fields')=>`<section class="editor-group"><h3>${title}</h3><div class="${layout}">${content}</div></section>`;
 const workspace=(sections,diagnostics,hidden='')=>{
    const library=panel('Saved strategies','Latest saved versions',savedList||empty('Your saved strategies will appear here.'),'','editor-library');
   const execution=panel('Paper trading',saved?'Selected version · v'+saved.version:'Save a version to enable trading',
     (bot?`<div class="bot-row"><b>${esc(bot.symbol)}</b>${badge(botStatus(bot))}</div>`:'')+
     (saved?`<div class="editor-actions">${botActions}</div>`:empty('Choose an instrument and a USD budget when you start a trade.')),'','editor-execution');
   const heading=isAutonomous?'Autonomous AI':isNotepad?'AI strategy notepad':'Visual rule builder';
   return `<div class="strategy-page">${page('Paper trading','Strategy Editor','Build, test, and launch versioned strategies.',btn(icon('plus')+' New strategy','new','',true))}
     ${editorSwitcher}<div class="editor-layout"><div class="editor-main">${panel(heading,saved?esc(saved.name)+' · v'+saved.version:'New draft',
      `<form class="editor-form" id="strategy">${hidden}${playbook?'<div class="playbook-origin"><small>Based on '+esc(playbook.name)+'</small>'+btn('View playbooks','open-playbook-library')+'</div>':''}${sections}<div class="editor-save">${submit(online?'Save version':'Queue draft sync')}<small id="draft-status">${editor.queued?'Queued for sync':editor.dirty?'Local draft':''}</small></div></form>`)}
     </div><aside class="editor-rail">${library}${execution}${diagnostics}</aside></div></div>`;
 };
 const sizingMode=select('Position sizing mode','sizeMode',[['percent','% of Equity'],['usd','Fixed USD per trade']],editor.sizeMode??(isNotepad?'usd':'percent'),true);
 if(isAutonomous){
   const riskButtons=`<div class="template-bar"><span class="section-label">Risk Guardrail Presets</span><div class="actions">${Object.entries(autoRiskPresets).map(([k,p])=>btn(p.label,'apply-risk-preset',k,(editor.aiRiskProfile??'balanced')===k)).join('')}</div></div>`;
   const autoTf=[['5Min','5 Minutes'],['15Min','15 Minutes (Recommended)'],['1Hour','1 Hour']];
   const autoBase=field('Bot strategy name','name',editor.name,'required maxlength="60" placeholder="e.g. BTC Autonomous Agent"')+
     assetPicker('Asset / Token to trade','symbol',editor.symbol)+
     select('Saved version','version',[['','New draft'],...options],saved?key(saved):'')+
     select('Candle timeframe','timeframe',autoTf,['5Min','15Min','1Hour'].includes(editor.timeframe)?editor.timeframe:'15Min',true)+
     select('AI wake-up mode','aiWakeMode',[['smart','Smart Wake-Up (saves ~80% AI calls)'],['fixed','Fixed Candle (every closed bar)']],editor.aiWakeMode??'smart',true)+
     select('Position sizing','aiSizing',[['dynamic','Dynamic (AI picks 25% / 50% / 100%)'],['simple','Simple (100% in / 100% out)']],editor.aiSizing??'dynamic',true)+
     numeric('Max AI calls / day (0=unlimited)','aiDailyCap',editor.aiDailyCap??100,0,500,1);
   const autoRisk=[['Hard stop-loss (%)','stop',.1,50],['Trailing stop (%, 0=off)','trailingStop',0,50,.1],['Hard take-profit (%)','take',.1,100],['Daily loss circuit breaker (%)','dailyLoss',.1,50],['Post-stop cooldown (bars)','cooldown',0,60,1]].map(([label,k,min,max,step])=>numeric(label,k,editor[k]??defaultParams[k],min,max,step)).join('');
   const hiddenAuto=`<input type="hidden" name="mode" value="ai_autonomous"><input type="hidden" name="aiRiskProfile" value="${esc(editor.aiRiskProfile??'balanced')}"><input type="hidden" name="sizeMode" value="percent"><input type="hidden" name="size" value="100"><input type="hidden" name="sizeUsd" value="${editor.sizeUsd??500}"><input type="hidden" name="exposure" value="100"><input type="hidden" name="period" value="12"><input type="hidden" name="entry" value="0.1"><input type="hidden" name="exit" value="-0.1"><input type="hidden" name="atrStop" value="0"><input type="hidden" name="maxHoldBars" value="0"><input type="checkbox" name="ai" checked hidden>`;
   const guidanceBox=`<label class="field notepad-field"><span>Optional guidance for the AI (leave blank for full autonomy)</span><textarea name="aiNotes" class="ai-notepad" rows="4" maxlength="1000" placeholder="Optional: e.g. Prefer swing dips, avoid chasing green spikes, hold winners patiently.">${esc(editor.aiNotes??'')}</textarea><small>Set the USD budget when launching on Live Trading. The AI sees live candles, EMA/RSI/MACD/Bollinger/ATR, Alpaca News, round-trip fee costs, and its own last 5 decisions.</small></label>`;
   const keySource=state.botAiConfigured?`Dedicated Bot Key (${state.botAiInfo.provider} · ${state.botAiInfo.masked})`:state.aiConfigured?`Fallback server key (${state.aiProvider})`:'No AI key configured';
   const feeInfo=editor.symbol?.includes('/')?'50 bps round-trip (Crypto)':'~2 bps round-trip (Stock)';
   const autoCard=panel('Autonomous AI guardrails','Hard safety limits stay enforced even if AI is offline',
     `<div class="bot-row"><span><b>AI API Key</b><small>${esc(keySource)}</small></span>${badge(state.botAiConfigured||state.aiConfigured?'Ready':'Key needed',state.botAiConfigured||state.aiConfigured?'good':'bad')}</div>`+
     `<div class="bot-row"><span><b>Hard safety net</b><small>SL -${editor.stop??5}% · Trail ${editor.trailingStop??3}% · Daily cap -${editor.dailyLoss??6}%</small></span>${badge('Hard-coded','good')}</div>`+
     `<div class="bot-row"><span><b>Fee-aware prompting</b><small>${feeInfo} · Cooldown ${editor.cooldown??2} bars</small></span>${badge(editor.aiWakeMode==='fixed'?'Fixed':'Smart Wake')}</div>`+
     `<div class="form" style="padding-top:4px">${link('Manage Dedicated AI Bot Key in Settings','settings')}</div>`);
   return workspace(group('Strategy setup',autoBase)+group('AI guidance',guidanceBox,'editor-flow')+group('Knowledge sources',knowledgePicker(),'editor-flow')+
     group('Risk limits',riskButtons+'<div class="fields">'+autoRisk+'</div>','editor-flow'),autoCard,hiddenAuto);
 }
 if(isNotepad){
   const noteTemplates=`<div class="template-bar"><span class="section-label">AI Notepad Starters</span><div class="actions">${Object.entries(notepadTemplates).map(([k,t])=>btn(t.label,'apply-note-template',k)).join('')}</div></div>`;
   const noteBase=field('Strategy name','name',editor.name,'required maxlength="60" placeholder="e.g. AI Smart Dip Buyer"')+
     assetPicker('Instrument or pair','symbol',editor.symbol)+
     select('Saved version','version',[['','New draft'],...options],saved?key(saved):'')+
     select('Candle timeframe','timeframe',tfOptions,editor.timeframe??'15Min',true);
   const noteRisk=[['Position size (% equity)','size',.1,100],['Maximum exposure (% equity)','exposure',.1,100],['Stop-loss (%)','stop',.1,50],['Trailing stop (%, 0=off)','trailingStop',0,50,.1],['Take-profit (%)','take',.1,100],['Maximum daily loss (%)','dailyLoss',.1,50],['Stop-loss cooldown (bars)','cooldown',0,60,1],['Max hold (bars, 0=off)','maxHoldBars',0,1440,1]].map(([label,k,min,max,step])=>numeric(label,k,editor[k]??defaultParams[k],min,max,step)).join('');
   const hiddenDefaults=`<input type="hidden" name="mode" value="ai_notepad"><input type="hidden" name="period" value="${editor.period??12}"><input type="hidden" name="entry" value="${editor.entry??0.1}"><input type="hidden" name="exit" value="${editor.exit??-0.1}"><input type="hidden" name="atrStop" value="${editor.atrStop??0}"><input type="checkbox" name="ai" checked hidden>`;
   const notepadBox=`<label class="field notepad-field"><span>Trading instructions (optional when a document is selected)</span><textarea name="aiNotes" class="ai-notepad" rows="12" maxlength="4000" placeholder="Example:\nBUY when price is above EMA 20 and RSI(14) pulls back below 40 with no bearish news.\nSELL when RSI(14) > 72 or price drops below EMA 20.\nOtherwise HOLD.">${esc(editor.aiNotes??'')}</textarea><small>${(editor.aiNotes??'').length} / 4000 characters · ${state.aiConfigured?esc(state.aiProvider)+' will read these notes + live candles, EMA/SMA/RSI/ATR, position P&amp;L, and Alpaca News on every bar.':'Configure GEMINI_API_KEY or OPENAI_API_KEY in server env to run AI Notepad bots.'}</small></label>`;
   const guardCard=panel('AI Notepad guardrails','Hard risk limits always stay enforced in code',`<div class="bot-row"><span><b>AI engine</b><small>${state.aiConfigured?esc(state.aiProvider)+' active':'API key required'}</small></span>${badge(state.aiConfigured?'Ready':'Unconfigured',state.aiConfigured?'good':'bad')}</div><div class="bot-row"><span><b>Protective exits</b><small>Stop-loss ${editor.stop??2}% · Trail ${editor.trailingStop??0}% · Take-profit ${editor.take??4}%</small></span>${badge('Hard-coded','good')}</div><div class="bot-row"><span><b>Live context sent to AI</b><small>OHLCV candles, SMA12, EMA20/50, RSI14, ATR14, open P&amp;L &amp; Alpaca News</small></span>${badge(editor.timeframe??'15Min')}</div>`);
   return workspace(group('Strategy setup',noteBase)+group('Trading instructions',noteTemplates+notepadBox,'editor-flow')+group('Knowledge sources',knowledgePicker(),'editor-flow')+
     group('Position sizing and risk',sizingMode+numeric('Fixed size (USD)','sizeUsd',editor.sizeUsd??500,1,1e9,1)+noteRisk),guardCard,hiddenDefaults);
 }
 const templatesBar=`<div class="template-bar"><span class="section-label">1-Click Templates</span><div class="actions">${Object.entries(strategyTemplates).map(([k,t])=>btn(t.label,'apply-template',k)).join('')}</div></div>`;
 const baseInputs=field('Strategy name','name',editor.name,'required maxlength="60"')+assetPicker('Instrument or pair','symbol',editor.symbol)+
 select('Saved version','version',[['','New draft'],...options],saved?key(saved):'')+
 select('Strategy mode','mode',Object.entries(modeLabels).filter(([k])=>k!=='ai_notepad'&&k!=='ai_autonomous'),editor.mode??'momentum',true)+
 select('Candle timeframe','timeframe',tfOptions,editor.timeframe??'1Min',true);
 const numericFields=list=>list.map(([label,k,min,max,step])=>numeric(label,k,editor[k]??defaultParams[k],min,max,step)).join('');
 const signalKeys=['period','entry','exit'];
 const indicators=numericFields(fields.filter(([,k])=>signalKeys.includes(k)));
 const riskInputs=numericFields(fields.filter(([,k])=>!signalKeys.includes(k)));
 const ruleBuilder=renderRuleGroup('entry','Entry Rules (Buy)')+renderRuleGroup('exit','Exit Rules (Sell)');
 const aiSection=check('Require AI confirmation for non-protective signals','ai',editor.ai)+
 field('Custom AI confirmation rule (optional)','aiPrompt',editor.aiPrompt??'','maxlength="300" placeholder="e.g. Veto buys if news is bearish or candle jumped >2%"')+
 '<small>'+(state.aiConfigured?esc(state.aiProvider ?? 'AI provider')+' configured (with live Alpaca News headlines). Historical replay uses deterministic rules.':'Configure a Gemini or OpenAI key in the server environment to enable AI confirmation.')+'</small>';
 const htfField=select('Higher-timeframe trend filter','htfEma',[['0','Off'],['20','1H Close > 1H EMA(20)'],['50','1H Close > 1H EMA(50)'],['100','1H Close > 1H EMA(100)']],String(editor.htfEma??0))+
   select('ADX chop guard (min trend strength)','minAdx',[['0','Off'],['18','ADX(14) ≥ 18 (Skip dead chop)'],['22','ADX(14) ≥ 22 (Recommended for breakouts)'],['25','ADX(14) ≥ 25 (Strong trends only)']],String(editor.minAdx??0));
 return workspace(group('Strategy setup',baseInputs+htfField)+group('Signal rules',templatesBar+'<div class="fields">'+indicators+'</div>'+ruleBuilder,'editor-flow')+
   group('AI confirmation',aiSection,'editor-flow')+group('Position sizing and risk',sizingMode+riskInputs),renderLiveDebugger());
}
function backtesting(){
 const runs=state.runs;
 const eligible=state.strategies.filter(strategy=>!['ai_notepad','ai_autonomous'].includes(strategy.mode)).toReversed();
 const requested=params().get('version');
 if(requested!==backtestVersionRoute){
   backtestVersionRoute=requested;
   backtestDraft=null;
 }
 const chosen=eligible.find(strategy=>key(strategy)===(backtestDraft?.version??requested));
 const isCrypto=chosen?.symbol?.includes('/');
 const draft=backtestDraft??{};
 const options=runs.map(run=>[run.id,run.name+' v'+run.version+' · '+run.symbol+' · '+stamp(run.t)]);
 if(!runs.some(run=>run.id===runA))runA=runs[0]?.id??'';
 if(runB===null&&runs.length>1)runB=runs.find(run=>run.id!==runA)?.id??'';
 const a=runs.find(run=>run.id===runA);
 const b=runs.find(run=>run.id===runB&&run.id!==runA);
 const inputs=select('Saved strategy','version',[['','Choose a saved strategy'],...eligible.map(strategy=>
   [key(strategy),strategy.name+' v'+strategy.version+' · '+strategy.symbol+' ('+(strategy.timeframe??'1Min')+')'+(strategy.ai?' · rules only':'')])],chosen?key(chosen):'',true)+
   field('Start date','start',draft.start??date(Date.now()-86400000*7),'type="date" required')+
   field('End date','end',draft.end??date(Date.now()),'type="date" required')+
   numeric('Starting capital (USD)','capital',draft.capital??100000,100,1e9,1)+
   field('Bot budget cap (USD)','budget',draft.budget??'','type="number" min="1" max="1000000000" step="0.01" placeholder="Optional"')+
   numeric('Fees (bps)','fees',draft.fees??(isCrypto?25:1),0,500)+
   numeric('Slippage (bps)','slippage',draft.slippage??(isCrypto?5:2),0,500);
 const configuration=panel('Run configuration','Choose a saved strategy and model execution costs.',
   form('backtest',inputs,`<small>Orders fill at the next bar’s open. AI Notepad and Autonomous AI require live evaluation.</small>
     ${!eligible.length?link('Create a rule-based strategy','strategies?new'):submit('Run backtest',!online)}`),'','backtest-config');
 const m=a?.metrics;
 const resultReturn=a?.capital>0?100*(a.final/a.capital-1):null;
 const stats=`<div class="metrics dashboard-metrics backtest-metrics">
   ${metric('Final equity',usd(a?.final),a?'Started with '+usd(a.capital):'Run a backtest','wallet')}
   ${metric('Total return',pct(resultReturn),m?'Buy &amp; hold '+pct(m.buyAndHold):'From starting capital','equity')}
   ${metric('Max drawdown',pct(a?.drawdown),'From peak equity','trading')}
   ${metric('Win rate',Number.isFinite(m?.winRate)?m.winRate.toFixed(1)+'%':'—',m?m.wins+' wins · '+m.losses+' losses':'Closed trades','history')}
 </div>`;
 const runStats=run=>{
   const metrics=run.metrics, wf=metrics?.walkForward;
   const profitFactor=Number.isFinite(metrics?.profitFactor)?num(metrics.profitFactor):metrics?.wins>0&&metrics.losses===0?'∞':'—';
   const wfFmt=seg=>seg?`${pct(seg.returnPct)} (DD ${pct(seg.maxDrawdown)} · ${seg.closedTrades}T)`:'—';
   return [
     ['Starting capital',usd(run.capital)],['Final equity',usd(run.final)],
     ['Return',pct(run.capital>0?100*(run.final/run.capital-1):null)],['Max drawdown',pct(run.drawdown)],
     ['Win rate',Number.isFinite(metrics?.winRate)?metrics.winRate.toFixed(1)+'%':'—'],
     ['Profit factor',profitFactor],['Sharpe ratio',num(metrics?.sharpe)],['Buy & hold',pct(metrics?.buyAndHold)],
     ['In-sample (70%)',wfFmt(wf?.inSample)],['Out-of-sample (30%)',wfFmt(wf?.outOfSample)],
     ['Closed trades',num(metrics?.closedTrades)],['Fills',num(run.tradeCount??run.trades?.length)],
     ['Total fees',usd(metrics?.totalFees)],['Fee / slippage',num(run.fees)+' / '+num(run.slippage)+' bps'],
     ['Bot budget cap',run.budget?usd(run.budget):'—'],
     ['Bars',Number.isFinite(metrics?.bars)?num(metrics.bars)+' '+esc(metrics.timeframe??run.timeframe??'1Min'):'—']
   ];
 };
 const runStatsB=b?runStats(b):[];
 const comparisonRows=a?runStats(a).map(([label,value],i)=>[esc(label),value,...(b?[runStatsB[i][1]]:[])]):[];
 const metadata=run=>esc(run.name)+' v'+esc(run.version)+' · '+esc(run.symbol)+' · '+esc(run.timeframe??'1Min')+
   ' · '+esc(run.start)+' to '+esc(run.end)+(run.source?' · '+esc(run.source):'');
 const equityChart=panel('Equity Curve',a?metadata(a)+' · Green = Buy, Red = Sell':'',
   a?plot(a.curve,'price','#20aaff',a.trades):empty('Run a saved strategy to see its equity curve.'),
   a?`<strong class="mono backtest-equity-value">${usd(a.final)}</strong>`:'','dashboard-chart backtest-equity');
 const open=a?.metrics?.openPosition;
 const openNote=open?`<div class="backtest-open-note">Open at end · ${qtyText(open.qty)} units at ${usd(open.entry)} · Mark ${usd(open.mark)} · Unrealized ${usd(open.unrealized)}</div>`:'';
 const results=a?`
   <div class="backtest-result-grid">
    ${panel('Drawdown','Decline from the primary run’s equity peak',
      plot(a.curve.filter(point=>Number.isFinite(point.drawdown)).map(point=>({t:point.t,value:point.drawdown})),'percent','#b780ff'),'','dashboard-chart')}
    ${b?panel('Comparison Equity Curve',metadata(b),plot(b.curve,'price','#43e2ae'),'','dashboard-chart'):''}
   </div>
   ${panel(b?'Run Comparison':'Run Statistics',b?'Metrics for the primary and comparison runs.':'Execution and risk metrics for the primary run.',
     table(b?['Metric','Primary run','Comparison run']:['Metric','Primary run'],comparisonRows,'No statistics for this run.'),'','backtest-statistics')}
   ${panel('Trade Log','Latest 250 simulated fills from the primary run',openNote+
     table(['Time','Side','Quantity','Fill price','Fees','Realized P&L','Reason'],a.trades.slice(-250).toReversed().map(trade=>[
       stamp(trade.t),badge(trade.side),qtyText(trade.qty),usd(trade.price),usd(trade.fee),usd(trade.pnl),esc(trade.reason??'—')
     ]),'No executions in this run.'),btn('Export CSV','export-backtest'))}`:'';
 const picker=a?`<div id="run-select" class="backtest-run-select">${select('Primary run','runA',options,runA)}
   ${select('Compare with','runB',[['','No comparison'],...options.filter(([id])=>id!==runA)],b?.id??'')}</div>`:'';
 return `<div class="dashboard backtest-overview">
  <header class="dashboard-greeting"><div><h1>Backtesting</h1><p class="sub">Replay saved strategies and compare simulated performance.</p></div>${picker}</header>
  ${!online?`<div class="notice">Showing cached workspace data · ${esc(syncLabel())}</div>`:''}
  ${stats}
  <div class="backtest-workbench">${configuration}${equityChart}</div>
  ${results}
 </div>`;
}
function portfolioData(){
 const {positions,equity,account}=state;
 const cutoff=Date.now()-portfolioRanges[accountRange]*86400000;
 const points=equity.filter(point=>Number.isFinite(point.value)&&Date.parse(point.t)>=cutoff);
 const fills=state.orders.filter(order=>order.filled>0&&Date.parse(order.filledAt??order.t)>=cutoff)
   .toSorted((a,b)=>Date.parse(b.filledAt??b.t)-Date.parse(a.filledAt??a.t));
 const holdings=positions.map(position=>({ ...position, value:position.qty*position.price,
   pnl:position.qty*(position.price-position.entry) })).toSorted((a,b)=>Math.abs(b.value)-Math.abs(a.value));
 return {account,points,fills,holdings};
}
function portfolioAllocation(holdings,cash){
 const bySymbol=new Map(state.market.map(asset=>[asset.symbol,asset.assetClass]));
 let stocks=0, crypto=0, other=0;
 for(const holding of holdings){
   if(!Number.isFinite(holding.value))continue;
   const assetClass=holding.assetClass??bySymbol.get(holding.symbol);
   if(assetClass==='crypto'||holding.symbol.endsWith('/USD'))crypto+=Math.abs(holding.value);
   else if(assetClass==='stock'||assetClass==='us_equity'||!assetClass)stocks+=Math.abs(holding.value);
   else other+=Math.abs(holding.value);
 }
 const parts=[
   ['Stocks',stocks,'#167dff'],['Crypto',crypto,'#28cde9'],['Cash',Math.max(0,cash??0),'#43dbac'],['Other',other,'#ae59ff']
 ].filter(([,value])=>value>0);
 const total=parts.reduce((sum,[,value])=>sum+value,0);
 if(!total)return empty('Allocation appears when cash or positions are available.');
 let offset=0;
 const stops=parts.map(([,value,shade])=>{
   const end=offset+100*value/total;
   const stop=shade+' '+offset+'% '+end+'%';
   offset=end;
   return stop;
 });
 return `<div class="portfolio-allocation">
   <div class="allocation-donut" style="--allocation:conic-gradient(${stops.join(',')})"><div><b>${usd(total)}</b><small>Allocation total</small></div></div>
   <ul class="allocation-legend">${parts.map(([label,value,shade])=>`<li><i style="background:${shade}" aria-hidden="true"></i><span>${label}</span><b>${(100*value/total).toFixed(1)}%</b></li>`).join('')}</ul>
 </div>`;
}
function portfolio(){
 const {account,points,fills,holdings}=portfolioData();
 const hasAccount=state.mode==='demo'||state.equity.length>0;
 const value=hasAccount?account.equity:null, cash=hasAccount?account.cash:null;
 const dailyReturn=value!==null&&account.dayStart>0?100*(value/account.dayStart-1):null;
 const base=points[0]?.value;
 const periodReturn=points.length>1&&base>0&&value!==null?100*(value/base-1):null;
 const change=value=>`<span class="${color(value)}">${pct(value)}</span>`;
 const firstDate=points[0]?.t;
 const metrics=[
   metric('Portfolio value',usd(value),dailyReturn===null?'Awaiting account data':change(dailyReturn)+' today','portfolio'),
   metric('Cash balance',usd(cash),'Account cash','wallet'),
   metric('Buying power',usd(hasAccount?account.buyingPower:null),'Available for orders','trading'),
   metric('Period return',change(periodReturn),periodReturn===null?'Awaiting equity history':'Since '+esc(stamp(firstDate,{month:'short',day:'numeric',year:'numeric'})),'equity')
 ].join('');
 const rangeTabs=Object.keys(accountPeriods).map(period=>btn(period,'account-range',period,false,
   `aria-pressed="${period===accountRange}"`)).join('');
 const rangeSelect=select('Period','portfolio-period',Object.entries(accountPeriods),accountRange);
 const rows=(showAllPositions?holdings:holdings.slice(0,5)).map((holding,i)=>{
   const basis=Math.abs(holding.qty*holding.entry);
   const pctPnl=basis>0?100*holding.pnl/basis:null;
   return [`<span class="inline">${mark(holding.symbol,i)}<b>${esc(holding.symbol)}</b></span>`,
     qtyText(holding.qty),usd(holding.entry),usd(holding.price),usd(holding.value),
     `<span class="portfolio-position-pnl ${color(holding.pnl)}">${usd(holding.pnl)}<small>${pct(pctPnl)}</small></span>`];
 });
 const positionAction=holdings.length>5?btn(showAllPositions?'Show preview':'View all positions','portfolio-positions'):'';
 const activity=fills.slice(0,4).map(order=>`<div class="portfolio-activity-item">
   <span class="portfolio-activity-icon ${order.side==='buy'?'good':''}">${icon(order.side==='buy'?'equity':'history')}</span>
   <div><b>${order.side==='buy'?'Bought':order.side==='sell'?'Sold':'Filled'} ${esc(order.symbol)}</b>
   <small>${stamp(order.filledAt??order.t)} · ${qtyText(order.filled)} units · ${usd(order.price)}</small></div>
 </div>`).join('');
 return `<div class="dashboard portfolio-overview">
   <header class="dashboard-greeting"><div><h1>Portfolio Overview</h1><p class="sub">Track your portfolio performance and holdings.</p></div>
   <div class="actions portfolio-controls">${rangeSelect}${btn('Export CSV','export-portfolio', '',true)}</div></header>
   ${!online?`<div class="notice">Showing cached workspace data · ${esc(syncLabel())}</div>`:''}
   <div class="metrics dashboard-metrics">${metrics}</div>
   <div class="dashboard-primary">
    ${panel('Portfolio Value Trend',firstDate?esc(stamp(firstDate,{month:'short',day:'numeric'}))+' – '+esc(stamp(points.at(-1).t,{month:'short',day:'numeric'})):'',
      plot(points,'price','#20aaff'),`<div class="dashboard-chart-actions"><div class="segmented" aria-label="Portfolio chart range">${rangeTabs}</div></div>`,'dashboard-chart portfolio-trend')}
    ${panel('Asset Allocation','Gross position value and positive cash',portfolioAllocation(holdings,cash),'','portfolio-allocation-panel')}
   </div>
   <div class="dashboard-primary portfolio-details">
    ${panel('Positions','',table(['Symbol','Qty','Avg cost','Last price','Market value','P&L'],rows,'No open positions.'),positionAction,'portfolio-positions')}
    ${panel('Recent Activity','',activity?`<div class="portfolio-activity">${activity}</div>`:empty('No fills in this period.'),
      '<a class="dashboard-panel-link" href="#history?tab=orders">View all →</a>')}
   </div>
 </div>`;
}
function exportPortfolio(){
 const {points,fills,holdings}=portfolioData();
 const rows=[
   ['Record','Timestamp','Symbol','Side','Quantity','Average cost','Price','Market value','P&L','Portfolio value'],
   ...points.map(point=>['Equity',point.t,'','','','','','','',point.value]),
   ...holdings.map(holding=>['Position','',holding.symbol,'',holding.qty,holding.entry,holding.price,holding.value,holding.pnl,'']),
   ...fills.map(order=>['Fill',order.filledAt??order.t,order.symbol,order.side,order.filled,'',order.price,
     Number.isFinite(order.price)?order.filled*order.price:'',order.pnl??'',''])
 ];
 const csv=rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const download=document.createElement('a');
 download.href=url;download.download='fasttrader-portfolio-'+accountRange.toLowerCase()+'.csv';download.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function settings(){
 const row=(label,desc,status)=>`<div class="bot-row"><div><b>${label}</b><small>${desc}</small></div>${badge(status)}</div>`;
 const events=state.events.map(e=>`<div class="activity-item">${esc(e.message)}<small>${stamp(e.t)}</small></div>`).join('');
 const bai=state.botAiInfo;
 const perBotEntries=Object.entries(state.botAiKeys??{}).filter(([id])=>state.bots[id]);
 const disabled=online?'':'disabled';
 const perBotList=perBotEntries.length?'<section class="settings-overrides"><h3>Bot-specific keys</h3>'+perBotEntries.map(([id,k])=>`<div class="bot-row"><div><b>${esc(state.bots[id].name)}</b><small>${esc(k.provider)} · ${esc(k.model)} · ${esc(k.masked)}</small></div><div class="actions">${link('Open bot',sessionRoute(state.bots[id]))}${btn('Remove','remove-per-bot-ai-key',id,false,disabled)}</div></div>`).join('')+'</section>':'';
 const botAiPanel=panel('AI trading key','Used by autonomous bots unless a bot has its own key.',
   row('Dedicated key status',bai?`${esc(bai.provider)} · ${esc(bai.model)} · ${esc(bai.masked)}`:'Not set — Autonomous AI falls back to server .env key',bai?'configured':'unconfigured')+
   `<form id="bot-ai-key" class="form"><div class="fields">`+
   select('AI Provider','provider',[['Gemini','Google Gemini'],['OpenAI','OpenAI']],bai?.provider??'Gemini',true)+
   field('Model (optional)','model',bai?.model??'','maxlength="80" placeholder="e.g. gemini-3.5-flash or gemini-3.5-flash-lite"')+
   field('API Key','key','','type="password" autocomplete="off" maxlength="300" placeholder="'+(bai?'Enter new key to replace saved key':'Paste Gemini or OpenAI API key')+'"')+
   `</div><div class="actions">${submit('Save trading key',!online)}${btn('Test key','test-bot-ai-key','',false,!online?'disabled':'')}${bai?btn('Remove key','remove-bot-ai-key','',false,`style="color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`):''}</div></form>`+perBotList);
 const feedStatus=value=>online?(value??'connecting'):'cached';
 const connections=panel('Trading connections','Broker and feed credentials are managed on the server.',
   row('Paper broker',state.mode==='demo'?'Local simulated fills':'Alpaca Paper API',feedStatus(state.broker))+
   row('Stock market data',esc(state.feedName),feedStatus(state.feed))+
   row('Crypto market data',state.mode==='demo'?'Synthetic market':'Alpaca Crypto US',feedStatus(state.cryptoFeed))+
   row('AI signal confirmation',esc(state.aiProvider??'Gemini or OpenAI'),state.aiConfigured?'configured':'unconfigured'),'','settings-connections');
 const notifications=panel('Notifications','Select the events you want to receive.',
   `<form id="settings" class="form"><div class="settings-checks">${Object.entries({signals:'Trade signals',fills:'Order fills',risk:'Risk limits',connections:'Connection failures'}).map(([k,label])=>check(label,k,state.alerts[k])).join('')}</div>
    <div class="settings-delivery"><div class="inline"><h3>Telegram delivery</h3>${badge(state.telegramConfigured?'Configured':'Unconfigured',state.telegramConfigured?'good':'')}</div>
    ${check('Push alerts to Telegram','telegram',state.alerts.telegram!==false)}
    ${check('Daily end-of-day portfolio digest (21:00 UTC)','digest',state.alerts.digest!==false)}${state.telegramConfigured?'':'<small>Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID on the worker to connect Telegram.</small>'}</div>
    <div class="actions">${submit('Save preferences',!online)}${state.telegramConfigured?btn('Send test alert','test-telegram','',false,disabled)+btn('Send digest now','send-digest','',false,disabled):''}</div></form>`,'','settings-notifications');
 const simulator=state.mode==='demo'?panel('Connection simulator','Test how paper bots respond to a feed or broker outage.',
   `<div class="settings-buttons actions">${btn('Disconnect feed','outage','feed',false,disabled)}${btn('Disconnect broker','outage','broker',false,disabled)}${btn('Reconnect both','outage','clear',false,disabled)}</div>`,'','settings-simulator'):'';
 return `<div class="settings-page">${page('Workspace preferences','Settings','Manage trading connections, AI credentials, and alerts.',badge(state.mode==='demo'?'Demo workspace':'Alpaca Paper'))}
  ${online?'':'<div class="notice">Showing cached settings · '+syncLabel()+'</div>'}
  <div class="settings-layout"><div class="settings-column">${connections}${botAiPanel}${simulator}</div><div class="settings-column">${notifications}
  ${panel('Recent notifications',syncLabel(),events?'<div class="activity">'+events+'</div>':empty('No notifications yet.'),'','settings-events')}</div></div></div>`;

}
function profile(){
 const p=state.profile??{};
 const photo=avatarDraft!==null?avatarDraft:(p.avatar||'');
 const initials=(p.name||'PT').split(/ +/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'PT';
 const avatarPreview=photo?`<img src="${esc(photo)}" alt="Profile picture" class="profile-photo-img">`:`<span class="profile-photo-fallback">${esc(initials)}</span>`;
 const tzOptions=[['UTC','UTC'],['America/New_York','New York (ET)'],['America/Chicago','Chicago (CT)'],['America/Los_Angeles','Los Angeles (PT)'],['Europe/London','London (GMT/BST)'],['Europe/Paris','Central Europe (CET)'],['Africa/Lagos','Lagos (WAT)'],['Asia/Tokyo','Tokyo (JST)']];
 const filledOrders=state.orders.filter(o=>o.owned&&o.filled>0);
 const closedPnl=filledOrders.filter(o=>o.side==='sell'&&Number.isFinite(o.pnl));
 const wins=closedPnl.filter(o=>o.pnl>0).length, losses=closedPnl.filter(o=>o.pnl<0).length, decided=wins+losses;
 const winRate=decided?100*wins/decided:null;
 const winRatio=losses>0?(wins/losses).toFixed(2)+'x':wins>0?wins+':0':'—';
 const activeBots=Object.values(state.bots).filter(b=>b.desired==='running').length;
 const equityPts=state.equity??[];
 const eqStart=equityPts[0]?.value, eqNow=state.account?.equity;
 const eqRet=eqStart&&Number.isFinite(eqNow)?100*(eqNow/eqStart-1):null;
 const hero=`<section class="panel profile-hero">
   <div class="profile-hero-left">
     <div class="profile-photo">${avatarPreview}</div>
     <div>
       <h2>${esc(p.name||'Paper Trader')}</h2>
       <small>${p.username?'@'+esc(p.username)+' · ':''}${esc(p.email||'No email set')}</small>
       <div class="profile-traits">${badge((p.riskTier||'moderate')+' risk')}${badge(({scalp:'Scalping',day:'Day trading',swing:'Swing trading',position:'Position trading'})[p.tradingStyle]??'Swing trading')}</div>
     </div>
   </div>
   <div class="actions">
     <label class="button profile-upload">Upload photo<input type="file" id="avatar-file" accept="image/*" aria-label="Upload profile photo"></label>
     ${photo?btn('Remove photo','remove-avatar','',false,online?'':'disabled'):''}
   </div>
 </section>`;
 const profileFields=field('Display name','name',p.name??'Paper Trader','required maxlength="80"')+
   field('Username','username',p.username??'','maxlength="32" placeholder="trader_handle"')+
   field('Email','email',p.email??'','type="email" maxlength="120"')+
   select('Timezone','timezone',tzOptions,p.timezone??'UTC');
 const tradingFields=select('Risk profile','riskTier',[['conservative','Conservative'],['moderate','Moderate'],['aggressive','Aggressive']],p.riskTier??'moderate')+
   select('Trading style','tradingStyle',[['scalp','Scalping'],['day','Day trading'],['swing','Swing trading'],['position','Position trading']],p.tradingStyle??'swing');
 const bioField=`<label class="field">Bio &amp; trading notes<textarea name="bio" rows="3" maxlength="280" placeholder="Strategy focus, risk rules, or personal trading notes...">${esc(p.bio??'')}</textarea></label>`;
 const syncControl=authInfo?.required?'<small>Workspace data and drafts stay in this tab during a disconnect.</small>':check('Cache workspace data in this browser','offlineSync',p.offlineSync);
 const details=panel('Profile details','',
   `<form id="profile" class="form profile-form"><div class="fields">${profileFields}</div>
   <fieldset><legend>Trading preferences</legend><div class="fields">${tradingFields}</div>${bioField}</fieldset>
   <fieldset><legend>Offline access</legend>${syncControl}</fieldset>
   <div class="profile-save">${submit('Save profile',!online)}</div></form>`,'','profile-details');
 const account=panel('Account connection','',`<dl class="profile-facts">
   <div><dt>Environment</dt><dd>${state.mode==='demo'?'Local paper simulator':'Alpaca Paper'}</dd></div>
   <div><dt>Broker status</dt><dd>${badge(online?state.broker:'cached')}</dd></div>
   <div><dt>Account key</dt><dd class="mono">${esc(state.accountKey??state.mode)}</dd></div>
   <div><dt>Last sync</dt><dd>${stamp(state.synced)}</dd></div></dl>`,'','profile-account');
 const equityCurve=panel('Portfolio equity',eqRet!==null?`<span class="${color(eqRet)}">${pct(eqRet)}</span> since first snapshot`:'Recorded account snapshots',plot(equityPts),'','profile-curve');
 const metrics=metric('Account equity',usd(state.account?.equity),'Paper portfolio','equity',true)+metric('Buying power',usd(state.account?.buyingPower),'Available for orders','wallet')+
   metric('Win rate',winRate!==null?winRate.toFixed(1)+'%':'—',decided?`${wins}W / ${losses}L · ratio ${winRatio}`:'Awaiting closed trades','equity')+
   metric('Filled orders',filledOrders.length,activeBots+' enabled bots','portfolio');
 const securityPanel=authInfo?.required?panel('Security & sessions',`${state.activeSessions??1} active session(s)`,
   `<form id="change-password" class="form"><div class="fields">`+
   field('Current password','currentPassword','','type="password" required autocomplete="current-password"')+
   field('New password (min 12 chars)','newPassword','','type="password" required minlength="12" maxlength="256" autocomplete="new-password"')+
   field('Confirm new password','confirmPassword','','type="password" required minlength="12" maxlength="256" autocomplete="new-password"')+
   `</div><div class="actions">${submit('Update password',!online)}${btn('Sign out other devices','revoke-sessions','',false,!online?'disabled':'')}</div></form>`):'';
 return `<div class="profile-page">${page('Workspace preferences','Profile','Manage your trader identity and paper account preferences.',badge(online?'Connected':'Offline',online?'good':'bad'))}
   ${!online?'<div class="notice">Cached profile · '+syncLabel()+'</div>':''}
   ${hero}<div class="profile-layout">${details}<div class="profile-summary">${account}${securityPanel}<div class="metrics">${metrics}</div>${equityCurve}</div></div></div>`;

}
function historyOrders(){
 return state.orders.filter(o=>(!historyFilter.asset||o.symbol===historyFilter.asset)&&(!historyFilter.strategy||o.strategy===historyFilter.strategy)&&(!historyFilter.side||o.side===historyFilter.side)&&(!historyFilter.status||o.status===historyFilter.status)&&(!historyFilter.start||o.t?.slice(0,10)>=historyFilter.start)&&(!historyFilter.end||o.t?.slice(0,10)<=historyFilter.end));
}
function historyPerformance(exits){
 if(!exits.length)return empty('Performance appears when a sell fill has recorded realized P&L.');
 const days=new Map();
 for(const o of exits){
   const day=(o.filledAt??o.t).slice(0,10);
   const d=days.get(day)??{pnl:0,wins:0,count:0};
   d.pnl+=o.pnl;d.wins+=Number(o.pnl>0);d.count++;days.set(day,d);
 }
 const data=[...days].sort(([a],[b])=>a.localeCompare(b));
 const high=Math.max(0,...data.map(([,d])=>d.pnl)),low=Math.min(0,...data.map(([,d])=>d.pnl));
 const y=v=>150-128*(v-low)/(high-low||1),x=i=>65+(i+.5)*560/data.length;
 const width=Math.min(26,390/data.length),dots=[],bars=[];
 data.forEach(([day,d],i)=>{
   const rate=100*d.wins/d.count;
   dots.push([x(i),150-1.28*rate]);
   bars.push(`<g><title>${day} · ${usd(d.pnl)} · ${num(rate)}% wins</title><rect x="${x(i)-width/2}" y="${Math.min(y(0),y(d.pnl))}" width="${width}" height="${Math.max(1,Math.abs(y(d.pnl)-y(0)))}" rx="2" fill="${d.pnl<0?'#fb839a':'#299eff'}"/></g>`);
 });
 const ticks=[...new Set([0,Math.floor((data.length-1)/2),data.length-1])];
 return `<svg class="history-plot" viewBox="0 0 685 184" role="img" aria-label="Daily realized profit or loss in dollars and percentage of profitable recorded exits"><g fill="currentColor" font-size="11">${[0,.5,1].map(f=>`<path d="M65 ${150-128*f}h560" stroke="#243450"/><text x="58" y="${154-128*f}" text-anchor="end">${usd(low+f*(high-low))}</text><text x="635" y="${154-128*f}">${100*f}%</text>`).join('')}${ticks.map(i=>`<text x="${x(i)}" y="174" text-anchor="middle">${data[i][0].slice(5)}</text>`).join('')}</g>${bars.join('')}<polyline points="${dots.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#c681ff" stroke-width="2"/>${dots.filter((_,i)=>data.length<60||ticks.includes(i)).map(([cx,cy])=>`<circle cx="${cx}" cy="${cy}" r="3" fill="#d799ff"/>`).join('')}</svg>`;
}
let historyPeriod='all';
function historyPage(){
 if(params().get('tab')==='orders'&&historyTab!=='orders')historyTab='orders';
 const filteredOrders=historyOrders();
 const filteredSignals=state.signals.filter(item=>(!historyFilter.asset||item.symbol===historyFilter.asset)&&(!historyFilter.strategy||item.strategy===historyFilter.strategy)&&(!historyFilter.side||item.direction===historyFilter.side)&&(!historyFilter.start||item.t?.slice(0,10)>=historyFilter.start)&&(!historyFilter.end||item.t?.slice(0,10)<=historyFilter.end));
 const filled=filteredOrders.filter(o=>o.filled>0&&Number.isFinite(o.price));
 const exits=filled.filter(o=>o.side==='sell'&&Number.isFinite(o.pnl));
 const total=exits.reduce((sum,o)=>sum+o.pnl,0),wins=exits.filter(o=>o.pnl>0).length;
 const returns=exits.filter(o=>o.price*o.filled-o.pnl>0).map(o=>100*o.pnl/(o.price*o.filled-o.pnl));
 const groups=new Map();
 for(const row of [...filteredOrders,...filteredSignals]){
   if(!row.strategyId)continue;
   const group=groups.get(row.strategyId)??{name:row.strategy,symbols:new Set(),time:'',exits:0,pnl:0};
   group.symbols.add(row.symbol);
   if((row.t??'')>group.time)group.time=row.t;
   if(row.side==='sell'&&row.filled>0&&Number.isFinite(row.pnl)){group.exits++;group.pnl+=row.pnl}
   groups.set(row.strategyId,group);
 }
 const opt=(list,label)=>[['',label],...Array.from(new Set(list.filter(Boolean))).map(v=>[v,v])];
 const filterFields=select('Asset','asset',opt([...state.orders.map(o=>o.symbol),...state.signals.map(s=>s.symbol)],'All assets'),historyFilter.asset)+
   select('Strategy','strategy',opt([...state.orders.map(o=>o.strategy),...state.signals.map(s=>s.strategy)],'All strategies'),historyFilter.strategy)+
   select('Side','side',[['','All sides'],['buy','Buy'],['sell','Sell'],['hold','Hold']],historyFilter.side)+
   select('Status','status',opt(state.orders.map(o=>o.status),'All statuses'),historyFilter.status)+
   field('From','start',historyFilter.start,'type="date"')+field('To','end',historyFilter.end,'type="date"');
 const tabs=`<div class="tabs" role="tablist">${[['orders','Orders & Fills ('+filteredOrders.length+')'],['signals','Signal Log ('+filteredSignals.length+')'],['runs','Backtest Runs ('+state.runs.length+')']].map(([k,label])=>btn(label,'history-tab',k,false,`role="tab" aria-selected="${historyTab===k}"`)).join('')}</div>`;
 const content=historyTab==='orders'
   ? panel('Execution history','All broker & bot orders matching your filters.',table(['Time','Asset','Strategy','Side','Filled / Qty','Fill Price','Value','Status'],filteredOrders.slice(0,250).map(o=>[
       stamp(o.filledAt??o.t),esc(o.symbol),esc(o.strategy??'External'),badge(o.side),qtyText(o.filled)+' / '+qtyText(o.qty),usd(o.price),o.filled>0&&Number.isFinite(o.price)?usd(o.filled*o.price):'—',badge(o.status)
     ]),'No orders match these filters.'),btn('Export CSV','export-history'))
   : historyTab==='signals'
   ? panel('Signal log','Deterministic and AI-confirmed trade decisions.',table(['Time','Asset','Strategy','Direction','Source','Rationale'],filteredSignals.map(s=>[
       stamp(s.t),esc(s.symbol),esc(s.strategy)+' v'+s.version,badge(s.direction),esc(s.source),esc(s.rationale)
     ]),'No signals match these filters.'))
   : panel('Backtest runs','Historical replay snapshots.',table(['Run time','Strategy','Asset','Period','Capital','Final','Return','Max DD','Trades'],state.runs.map(r=>[
       stamp(r.t),esc(r.name)+' v'+r.version,esc(r.symbol),esc(r.start)+' → '+esc(r.end),usd(r.capital),usd(r.final),`<span class="${color(r.final-r.capital)}">${pct(100*(r.final/r.capital-1))}</span>`,pct(r.drawdown),num(r.tradeCount??r.trades.length)
     ]),'No backtest runs saved yet.'),link('Run backtest','backtesting',true));
 const toolbar=select('Period','history-period',[['all','All time'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days'],...(historyPeriod==='custom'?[['custom','Custom dates']]:[])],historyPeriod)+select('Symbol','history-symbol',opt([...state.orders,...state.signals].map(r=>r.symbol),'All symbols'),historyFilter.asset)+btn('Export orders','export-history','',true);
 const sessions=[...groups].sort((a,b)=>b[1].time.localeCompare(a[1].time)).map(([id,g])=>{
   const bot=state.bots[id];
   return [stamp(g.time),esc(g.name),esc([...g.symbols].join(', ')),g.exits?`<span class="${color(g.pnl)}">${usd(g.pnl)}</span>`:'—',bot?badge(botStatus(bot)):badge('Archived'),bot?link('View',sessionRoute(bot)):'—'];
 });
 const best=exits.reduce((a,b)=>!a||b.pnl>a.pnl?b:a,null);
 return `<div class="history-page">${page('Paper trading','Trading History','Review your past trading sessions and performance.','<div class="history-toolbar">'+toolbar+'</div>')}
 ${online?'':'<p class="notice">Cached history · '+syncLabel()+'</p>'}
 <div class="metrics">${metric('Bot sessions',groups.size,'Bots with matching activity','bot')}${metric('Realized P&L','<span class="'+color(total)+'">'+usd(exits.length?total:null)+'</span>',exits.length+' priced exits','equity')}${metric('Win rate',exits.length?num(100*wins/exits.length)+'%':'—',wins+' profitable exits','backtesting')}${metric('Avg. return',pct(returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:null),'Per exit with known cost','portfolio')}</div>
 <div class="history-grid"><div class="history-main">${panel('Performance overview','Daily realized results',''+historyPerformance(exits),'<small class="history-legend">● P&L &nbsp; <em>● Win rate</em></small>')}
 ${panel('Recent sessions','Latest matching activity per bot',table(['Last activity','Strategy','Symbols','Realized P&L','Current status','Session'],sessions,'No bot sessions match these filters.'))}</div>
 ${panel('Key insights','','<div class="history-insights"><small>Best recorded exit</small><strong>'+usd(best?.pnl)+'</strong><p>'+esc(best?best.symbol+' · '+stamp(best.filledAt??best.t):'Awaiting a realized exit.')+'</p><hr><small>Order activity</small><strong>'+filled.length+'</strong><p>Orders with fills across '+new Set(filled.map(o=>o.symbol)).size+' symbols.</p></div>','','history-aside')}</div>
 <div class="stack">${panel('Detailed filters','',form('history',filterFields,submit('Apply filters')))}${tabs}${content}</div></div>`;
}
function combinedLogs(){
 const raw=Array.isArray(state.logs)?state.logs:[];
 if(raw.length)return raw;
 const fallback=[];
 for(const o of (state.orders??[]).slice(0,40)){
   fallback.push({t:o.filledAt??o.t,category:'trade',level:o.status==='rejected'?'error':o.status==='filled'?'good':'info',message:`${(o.side??'').toUpperCase()} ${o.status} · ${o.symbol}`,botId:o.strategyId,bot:o.strategy??'External',symbol:o.symbol,detail:`Qty ${qtyText(o.filled)}/${qtyText(o.qty)}${Number.isFinite(o.price)?' @ '+usd(o.price):''}`});
 }
 for(const s of (state.signals??[]).slice(0,40)){
   fallback.push({t:s.t,category:'signal',level:s.direction==='hold'?'info':'good',message:`${(s.direction??'').toUpperCase()} signal · ${s.symbol}`,botId:s.strategyId,bot:s.strategy,symbol:s.symbol,detail:`${s.source}: ${s.rationale}`});
 }
 for(const e of (state.events??[]).slice(0,40)){
   const map={fills:'trade',signals:'signal',risk:'risk',connections:'system'};
   fallback.push({t:e.t,category:map[e.kind]??'system',level:e.kind==='connections'||e.kind==='risk'?'warn':'info',message:e.message});
 }
 return fallback.sort((a,b)=>(b.t??'').localeCompare(a.t??''));
}
function logsPage(){
 const all=combinedLogs();
 const bots=Object.values(state.bots??{});
 const activeBots=bots.filter(b=>b.desired==='running').length;
 const errWarn=all.filter(l=>l.level==='error'||l.level==='warn').length;
 const tradeSig=all.filter(l=>l.category==='trade'||l.category==='signal').length;
 const q=logFilter.search.trim().toLowerCase();
 const filtered=all.filter(l=>{
   if(logFilter.category!=='all'&&l.category!==logFilter.category)return false;
   if(logFilter.bot&&(l.bot!==logFilter.bot&&l.botId!==logFilter.bot))return false;
   if(logFilter.symbol&&l.symbol!==logFilter.symbol)return false;
   if(logFilter.level&&l.level!==logFilter.level)return false;
   if(q&&!`${l.message??''} ${l.detail??''} ${l.bot??''} ${l.symbol??''} ${l.category??''}`.toLowerCase().includes(q))return false;
   return true;
 });
 const catCounts=k=>k==='all'?all.length:all.filter(l=>l.category===k).length;
 const cats=[['all','All'],['bot','Bots'],['trade','Trades'],['signal','Signals'],['ai','AI'],['risk','Risk'],['system','System']];
 const catTabs=`<div class="tabs" role="tablist">${cats.map(([k,label])=>btn(`${label} (${catCounts(k)})`,'log-cat',k,false,`role="tab" aria-selected="${logFilter.category===k}"`)).join('')}</div>`;
 const botNames=Array.from(new Set([...bots.map(b=>b.name),...all.map(l=>l.bot).filter(Boolean)]));
 const syms=Array.from(new Set(all.map(l=>l.symbol).filter(Boolean)));
 const filterBar=form('logs-filter',
   select('Bot','bot',[['','All bots'],...botNames.map(n=>[n,n])],logFilter.bot)+
   select('Asset','symbol',[['','All assets'],...syms.map(s=>[s,s])],logFilter.symbol)+
   select('Level','level',[['','All levels'],['good','Success'],['info','Info'],['warn','Warning'],['error','Error']],logFilter.level)+
   field('Search logs','search',logFilter.search,'type="search" placeholder="Search message, rationale, error…"'),
   `<div class="actions">${submit('Apply')}${btn(logsLive?'Live stream: ON':'Live stream: PAUSED','toggle-logs-live','',logsLive)}${btn('Export CSV','export-logs')}${btn('Clear logs','clear-logs','',false,`style="color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`)}</div>`);
 const lvlTone=l=>l==='error'?'bad':l==='good'?'good':'';
 const catLabel={bot:'BOT',trade:'TRADE',signal:'SIGNAL',ai:'AI',risk:'RISK',system:'SYSTEM'};
 const rows=filtered.slice(0,250).map(l=>{
   const botObj=l.botId?state.bots[l.botId]:null;
   const botCell=botObj?`<a class="bot-name" href="#${sessionRoute(botObj)}"><b>${esc(l.bot??botObj.name)}</b></a>`:l.bot?`<b>${esc(l.bot)}</b>`:'<span style="color:var(--muted)">General</span>';
   const symCell=l.symbol?` <small class="mono">${esc(l.symbol)}</small>`:'';
   const msgCell=`<div><b>${esc(l.message)}</b>${l.detail?`<small style="display:block;color:var(--muted);margin-top:2px">${esc(l.detail)}</small>`:''}</div>`;
   return [
     `<span class="mono" style="white-space:nowrap">${stamp(l.t,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>`,
     badge(catLabel[l.category]??String(l.category??'SYS').toUpperCase(),lvlTone(l.level)),
     botCell+symCell,
     badge((l.level??'info').toUpperCase(),lvlTone(l.level)),
     msgCell
   ];
 });
 const aiBots=bots.filter(b=>version(key(b))?.ai);
 const botHealthRows=aiBots.map(b=>{
   const st=version(key(b));
   const keySrc=state.botAiKeys?.[b.id]?`Personal (${state.botAiKeys[b.id].provider})`:(st?.mode==='ai_autonomous'&&state.botAiConfigured)?`Dedicated (${state.botAiInfo.provider})`:(state.aiConfigured?`Main .env (${state.aiProvider})`:'No key');
   const err=b.lastAiError;
   const backoffMin=b.aiBackoffUntil&&b.aiBackoffUntil>Date.now()?Math.ceil((b.aiBackoffUntil-Date.now())/60000):0;
   const healthBadge=err
     ? badge(err.status===429?'Rate Limited (429)':err.status===401||err.status===403?'Key Rejected':'AI Error','bad')
     : backoffMin?badge(`Backoff (${backoffMin}m)`,'bad')
     : b.desired!=='running'?badge(b.desired)
     : badge('AI Healthy','good');
   const errLine=err
     ? `<small style="display:block;color:#ff8191;margin-top:3px"><b>${esc(err.message)}</b> (${stamp(err.t)}): ${esc(err.detail)}</small>`
     : `<small style="display:block;color:var(--muted);margin-top:2px">${esc(b.lastEvaluation?.rationale||'No AI errors — waiting for next evaluation')}</small>`;
   return `<div class="bot-row" style="align-items:flex-start"><div><a class="bot-name" href="#${sessionRoute(b)}"><b>${esc(b.name)}</b></a> <small class="mono">${esc(b.symbol)} · ${esc(st?.timeframe??'1Min')} · ${esc(keySrc)}${st?.mode==='ai_autonomous'?` · ${b.aiCallsToday??0}${st.aiDailyCap?'/'+st.aiDailyCap:''} calls today`:''}</small>${errLine}</div><div class="actions" style="flex-shrink:0">${healthBadge}${btn('Filter logs','log-bot',b.name)}</div></div>`;
 }).join('');
 const botHealthPanel=aiBots.length?panel('Bot AI Health & Error Diagnostics','Live AI provider status, key source, and exact failure reason for each AI bot.',botHealthRows):'';
 return page('System & bot telemetry','Activity Logs','Monitor real-time bot actions, AI decisions, trades, signals, risk alerts, and system events across your workspace.',
   btn(logsLive?'Live: ON':'Live: PAUSED','toggle-logs-live','',logsLive))+
   `<div class="metrics">${metric('Total logs',all.length,filtered.length+' matching filters','logs')}${metric('Active bots',activeBots,bots.length+' total bots configured','bot',true)}${metric('Trades & signals',tradeSig,'Executions & decisions','equity')}${metric('Warnings & errors',errWarn,errWarn?'Review alerts & 429s':'All systems clean','portfolio',errWarn>0)}</div>`+
   `<div class="stack">${botHealthPanel}${panel('Filter stream','Slice by category, bot, asset, severity, or keyword.',catTabs+filterBar)}${panel('Live event stream',`Showing ${Math.min(250,filtered.length)} of ${filtered.length} entries · ${syncLabel()}`,table(['Time','Category','Bot / Asset','Level','Event & details'],rows,'No log entries match your current filters.'))}</div>`;
}
const renderers={dashboard,trading,session,screener,strategies,backtesting,portfolio,history:historyPage,logs:logsPage,settings,profile};
function clearWorkspace(){
 portfolioResult=null;portfolioDraft={};
 playbookLibraryOpen=false;
 state=null;editor=null;runA='';runB=null;backtestDraft=null;backtestVersionRoute=null;online=false;
 clearTimeout(previewTimer);strategyPreview={key:'',result:null,next:0};
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
function renderDeleteModal(){
 if(!deleteBotId||!state?.bots?.[deleteBotId])return '';
 const bot=state.bots[deleteBotId];
 const book=state.botSessions?.[bot.id]??{};
 const brokerPos=state.positions.find(p=>p.symbol===bot.symbol&&p.qty>0);
 const openQty=brokerPos?.qty||book.qty||0;
 const hasPos=openQty>0;
 const posVal=brokerPos&&Number.isFinite(brokerPos.price)?usd(brokerPos.qty*brokerPos.price):'';
 return `<div style="position:fixed;inset:0;z-index:200;background:rgba(4,9,18,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px">
   <section class="panel" role="dialog" aria-modal="true" style="max-width:460px;width:100%;border-color:#592e42;box-shadow:0 24px 60px rgba(0,0,0,.6)">
     <div class="panel-head"><div><h2 style="color:#ff8191">Delete "${esc(bot.name)}"?</h2><small>${esc(bot.symbol)} · Strategy v${bot.version}</small></div></div>
     <div class="form">
       ${hasPos
         ? `<div class="notice" style="background:#39212e;border-color:#592e42;color:#ffd0d7"><strong>Warning:</strong> Open ${esc(bot.symbol)} position detected (${qtyText(openQty)} units${posVal?' · '+posVal:''}). Choosing <b>Liquidate &amp; Delete</b> will immediately sell all open ${esc(bot.symbol)} units at market price. Choosing <b>Delete &amp; Leave Position</b> removes the bot while leaving your ${esc(bot.symbol)} position open at the broker.</div>`
         : `<p style="margin:0;color:var(--muted);font-size:.9rem">This bot has no open ${esc(bot.symbol)} position. Deleting it removes it from Live Trading while keeping your saved strategy version and order history.</p>`}
       <div class="actions" style="flex-wrap:wrap;gap:8px;margin-top:6px">
         ${hasPos?btn('Liquidate &amp; Delete bot','confirm-delete-bot',bot.id,false,'data-liquidate="true" style="background:#6e1f32;color:#fff;border-color:#a1304b"'):''}
         ${btn(hasPos?'Delete bot &amp; Leave position':'Delete bot','confirm-delete-bot',bot.id,false,`data-liquidate="false" style="background:${hasPos?'#2a2418':'#6e1f32'};color:${hasPos?'#ffd68a':'#fff'};border-color:${hasPos?'#6e5726':'#a1304b'}"`)}
         ${btn('Cancel','cancel-delete-bot')}
       </div>
     </div>
   </section>
 </div>`;
}
function renderKillSwitchModal(){
 if(!killSwitchModal||!state)return '';
 const running=Object.values(state.bots??{}).filter(b=>b.desired==='running').length;
 const openPos=(state.positions??[]).filter(p=>p.qty>0).length;
 return `<div style="position:fixed;inset:0;z-index:205;background:rgba(4,9,18,.8);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px">
   <section class="panel" role="dialog" aria-modal="true" style="max-width:460px;width:100%;border-color:#a1304b;box-shadow:0 24px 60px rgba(0,0,0,.65)">
     <div class="panel-head"><div><h2 style="color:#ff8191">Emergency Kill Switch</h2><small>${running} running bot(s) · ${openPos} open position(s)</small></div></div>
     <div class="form">
       <div class="notice" style="background:#39212e;border-color:#592e42;color:#ffd0d7">Choose whether to <b>pause all running bots only</b>, or <b>pause all bots AND liquidate every open position at market price</b> immediately.</div>
       <div class="actions" style="flex-wrap:wrap;gap:8px;margin-top:6px">
         ${btn('Pause all bots only','confirm-kill-switch','pause',false,'style="background:#2a2418;color:#ffd68a;border-color:#6e5726"')}
         ${btn('Pause all &amp; Liquidate all','confirm-kill-switch','liquidate',false,'style="background:#6e1f32;color:#fff;border-color:#a1304b"')}
         ${btn('Cancel','cancel-kill-switch')}
       </div>
     </div>
   </section>
 </div>`;
}
function render(force=false){
 const signedOut=authInfo?.required&&!authInfo.authenticated;
 const hostedUnreachable=!localWorkspace&&!authInfo&&!state;
 document.body.classList.toggle('auth-screen',Boolean(signedOut||hostedUnreachable));
 const signOut=$('#sign-out');
 if(signOut)signOut.hidden=!authInfo?.required||!authInfo.authenticated;
 const main=$('#view');
 if(signedOut){
   const markup=authenticationView();
   if(main.dataset.html!==markup){main.innerHTML=markup;main.dataset.html=markup}
   return;
 }
 if(hostedUnreachable){
   const msg=authError||'Connecting to FastTrader worker…';
   const markup=`<section class="panel auth-card"><div class="auth-heading"><img src="/mark.svg" alt=""><h1>FastTrader</h1><p class="sub">${esc(msg)}</p></div><div class="form"><button type="button" class="button primary" data-action="retry-connect">Retry connection</button></div></section>`;
   if(main.dataset.html!==markup){main.innerHTML=markup;main.dataset.html=markup}
   return;
 }
 const route=location.hash.slice(1).split('?')[0];
 const next=Object.prototype.hasOwnProperty.call(pages,route)?route:'dashboard',changed=next!==active;
 active=next;chrome();
 if(!state){main.innerHTML=empty('Connect to FastTrader to load the workspace.');main.dataset.html='';return}
 if(!force&&!changed&&(pending||document.activeElement?.closest('form, .plot, #run-select')||main.querySelector('.plot:hover')))return;
 if(!force&&!changed&&(['backtesting','profile'].includes(active)||(active==='logs'&&!logsLive)))return;
 const markup=renderers[active]()+renderDeleteModal()+renderKillSwitchModal();
 if(markup!==main.dataset.html){main.innerHTML=markup;main.dataset.html=markup}
}
async function api(path,data,opts={}){
 const idemKey=opts.idempotencyKey||(typeof data?.mutation==='string'?data.mutation:crypto.randomUUID());
 const res=await fetch('/api/'+path,{
   method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json','Idempotency-Key':idemKey},
   body:JSON.stringify(data),
   signal:timeoutSignal(['backtest','strategy-preview','portfolio-replay'].includes(path)?70000:30000)
 });
 let result=null;
 try{result=await res.json()}catch{}
 if(!res.ok){
   if(res.status===401&&path!=='auth') signInRequired();
   throw Error(result?.error??`Request failed (HTTP ${res.status})`);
 }
 if(result===null) throw Error('Invalid server response.');
 return result;
}
const values=form=>Object.fromEntries(new FormData(form));
function capture(form){
 const data=values(form);
 delete data.version;
 delete data.knowledgeId;
 if(['ai_notepad','ai_autonomous'].includes(data.mode)){
   const ids=[...form.querySelectorAll('[name="knowledgeId"]:checked')].map(input=>input.value);
   data.knowledgeIds=JSON.stringify(ids)===JSON.stringify(editor.knowledgeIds??[])?editor.knowledgeIds??[]:ids;
 }
 if(data.symbol!==undefined)data.symbol=data.symbol.trim().toUpperCase();
 for(const [,k]of fields)if(data[k]!==undefined)data[k]=+data[k];
 if(data.aiDailyCap!==undefined)data.aiDailyCap=+data.aiDailyCap;
 if(data.htfEma!==undefined)data.htfEma=+data.htfEma;
 if(data.minAdx!==undefined)data.minAdx=+data.minAdx;
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
     const session=await fetch('/api/auth',{cache:'no-store',credentials:'same-origin',signal:timeoutSignal(15000)});
     if(!session.ok){
       let err='Worker unavailable ('+session.status+').';
       try{const j=await session.json();if(j?.error)err=j.error}catch{}
       authError=err;
       throw Error(err);
     }
     authError='';
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
   const stateHeaders=stateEtag&&state?{'If-None-Match':stateEtag}:{};
   const res=await fetch('/api/state',{cache:'no-store',credentials:'same-origin',headers:stateHeaders,signal:timeoutSignal(10000)});
   if(revision!==authRevision)return;
   if(res.status===401){signInRequired();return}
   if(res.status===304){online=true;return}
   if(!res.ok)throw Error('Unavailable');
   const etag=res.headers.get('etag');
   if(etag)stateEtag=etag;
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
 if(action==='retry-connect'&&!pending){authError='Retrying…';render(true);refresh(true);return}
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
 if(action==='resync-bot'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   pending=true;el.disabled=true;
   try{
     const res=await api('bot',{resync:true,id:value});
     toast(`Re-synced ledger to broker (${qtyText(res.brokerQty)} ${res.symbol}).`);
     await refresh(true);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='open-kill-switch'){if(!online||pending){toast('The workspace is reconnecting.');return}killSwitchModal=true;render(true);return}
 if(action==='cancel-kill-switch'){killSwitchModal=false;render(true);return}
 if(action==='confirm-kill-switch'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   const liquidateAll=value==='liquidate';
   pending=true;el.disabled=true;
   try{
     const res=await api('bot',{killSwitch:true,liquidateAll});
     killSwitchModal=false;
     toast(`Kill Switch: paused ${res.pausedCount} bot(s)${liquidateAll?` & liquidated ${res.liquidatedCount} position(s)`:''}.`);
     await refresh(true);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='send-digest'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   pending=true;el.disabled=true;
   try{await api('settings',{sendDigest:true});toast('Daily Telegram digest sent!')}
   catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='revoke-sessions'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   pending=true;el.disabled=true;
   try{const res=await api('auth',{action:'revoke_others'});toast(`Signed out ${res.revoked} other session(s).`);await refresh(true)}
   catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='export-backtest'){
   const run=state.runs.find(r=>r.id===runA);
   if(!run?.trades?.length){toast('No backtest trades to export.');return}
   const rows=[['Time','Side','Quantity','Fill Price','Fees','Realized P&L','Reason'],...run.trades.map(t=>[t.t??'',t.side??'',t.qty??'',t.price??'',t.fee??'',t.pnl??'',t.reason??''])];
   const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
   const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=`fasttrader-backtest-${(run.symbol||'run').replace('/','-')}.csv`;a.click();
   toast('Exported backtest trade log CSV.');return;
 }
 if(action==='open-delete-bot'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   deleteBotId=value;
   render(true);
   return;
 }
 if(action==='fleet-jump'){
   if(value==='bot-list'){botFilter='all';render(true)}
   const target=document.getElementById(value);
   target?.scrollIntoView({block:'start'});
   target?.querySelector('select,button')?.focus({preventScroll:true});
   return;
 }
 if(action==='fleet-command'){
   if(!online||pending||!['paused','stopped'].includes(value))return;
   const targets=Object.values(state.bots).filter(b=>value==='paused'?b.desired==='running':b.desired!=='stopped');
   const verb=value==='paused'?'Pause':'Stop';
   if(!targets.length||!confirm(verb+' '+targets.length+' paper bot(s)? Existing orders and positions will stay at the broker.'))return;
   pending=true;el.disabled=true;
   const failures=[];
   try{
     for(const b of targets){
       try{await api('bot',{id:b.id,version:b.version,action:value})}
       catch(error){failures.push(b.name+' · '+error.message)}
     }
     await refresh(true);
     toast(failures.length?'Updated '+(targets.length-failures.length)+' of '+targets.length+'. '+failures.join(', '):targets.length+' bot(s) '+value+'.');
   }finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='cancel-delete-bot'){
   deleteBotId=null;
   render(true);
   return;
 }
 if(action==='confirm-delete-bot'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   const liquidate=el.dataset.liquidate==='true';
   const bot=state.bots[value];
   pending=true;el.disabled=true;
   try{
     const res=await api('bot',{delete:true,id:value,liquidate});
     deleteBotId=null;
     toast(res.pending?'Liquidation pending. The bot will be deleted once the position is confirmed closed.':res.liquidated?`Liquidated the position and deleted ${bot?.name??'bot'}.`:res.leftOpen?(res.deleted?`Deleted ${bot?.name??'bot'}. Open ${bot?.symbol??'position'} left unmanaged.`:'Liquidation incomplete. The bot was kept.'):`Deleted ${bot?.name??'bot'}.`);
     if(active==='session'&&params().get('id')===value)location.hash='#trading';
     await refresh(true);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='liquidate-bot'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   const sym=el.dataset.symbol||'position', pause=el.dataset.pause==='true';
   if(!confirm(`Liquidate open ${sym} position at market price${pause?' and pause this bot':''}?`))return;
   pending=true;el.disabled=true;
   try{
     await api('bot',{liquidate:true,id:value,pause});
     toast(`Submitted market sell to close ${sym}${pause?' & paused bot':''}.`);
     await refresh(true);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='remove-avatar'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   pending=true;
   try{
     await api('profile',{...(state.profile??{}),avatar:''});
     avatarDraft=null;
     toast('Profile photo removed.');
     await refresh(true);
   }catch(error){toast(error.message)}
   finally{pending=false}
   return;
 }
 if(action==='test-per-bot-ai-key'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   const f=$('#per-bot-ai-key'), d=f?values(f):{};
   pending=true;el.disabled=true;
   try{
     const res=await api('settings',{testBotAiKey:true,botId:value,provider:d.provider,model:d.model,key:d.key});
     toast(`${res.provider} (${res.model}) personal bot key verified!`);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='remove-per-bot-ai-key'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   if(!confirm('Remove this bot’s personal API key? It will fall back to your main AI key.'))return;
   pending=true;el.disabled=true;
   try{
     await api('settings',{removeBotAiKey:true,botId:value});
     toast('Personal bot API key removed — falling back to main key.');
     await refresh(true);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='test-bot-ai-key'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   const f=$('#bot-ai-key'), d=f?values(f):{};
   pending=true;el.disabled=true;
   try{
     const res=await api('settings',{testBotAiKey:true,provider:d.provider,model:d.model,key:d.key});
     toast(`${res.provider} (${res.model}) key verified!`);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='remove-bot-ai-key'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   if(!confirm('Remove the dedicated AI Bot Trading Key? Autonomous AI bots will fall back to the server .env key.'))return;
   pending=true;el.disabled=true;
   try{
     await api('settings',{removeBotAiKey:true});
     toast('Dedicated AI Bot Trading Key removed.');
     await refresh(true);
   }catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='test-telegram'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   pending=true;el.disabled=true;
   try{await api('settings',{testTelegram:true});toast('Test Telegram alert sent!')}
   catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='watch'){selected=value;chartMode='Price'}
 if(action==='range')range=value;
 if(action==='portfolio-range')portfolioRange=value;
 if(action==='account-range'&&Object.hasOwn(accountPeriods,value))accountRange=value;
 if(action==='portfolio-positions')showAllPositions=!showAllPositions;
 if(action==='export-portfolio'){exportPortfolio();return}
 if(action==='chart')chartMode=value;
 if(action==='tv-style')tvStyle=value;
 if(action==='tv-range')tvRange=value;
 if(action==='tv-bot')tvBotId=value;
 if(action==='log-cat'){logFilter.category=value;render(true);return}
 if(action==='log-bot'){logFilter.bot=value;logFilter.category='all';render(true);return}
 if(action==='toggle-logs-live'){logsLive=!logsLive;toast(logsLive?'Live log stream resumed.':'Live log stream paused.');render(true);return}
 if(action==='export-logs'){
   const rows=[['Time','Category','Level','Bot','Symbol','Message','Detail'],...combinedLogs().map(l=>[l.t??'',l.category??'',l.level??'',l.bot??'',l.symbol??'',l.message??'',l.detail??''])];
   const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
   const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='fasttrader-logs.csv';a.click();
   toast('Exported logs CSV.');return;
 }
 if(action==='clear-logs'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   if(!confirm('Clear all stored workspace logs?'))return;
   pending=true;el.disabled=true;
   try{await api('settings',{clearLogs:true});toast('Logs cleared.');await refresh(true)}
   catch(error){toast(error.message)}
   finally{pending=false;el.disabled=false}
   return;
 }
 if(action==='history-tab'){
   if(params().has('tab'))window.history.replaceState(null,'','#history');
   historyTab=value;
 }
 if(action==='export-history'){
   const rows=[['Time','Asset','Strategy','Side','Qty','Filled','Price','Status','Realized P&L'],...historyOrders().map(o=>[o.filledAt??o.t??'',o.symbol??'',o.strategy??'External',o.side??'',o.qty??'',o.filled??'',o.price??'',o.status??'',o.pnl??''])];
   const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
   const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='fasttrader-history.csv';a.click();
   toast('Exported trade history CSV.');return;
 }
 if(action==='asset'){
   assetClass=value;
   if(value==='Catalog'&&!catalogResults&&!catalogLoading)void loadCatalog();
 }
 if(action==='bot-filter')botFilter=value;
 if(action==='edit')editor=structuredClone(version(value));
 if(action==='new'){editor=fresh();playbookLibraryOpen=false}
 if(action==='open-playbook-library')playbookLibraryOpen=true;
 if(action==='portfolio-session'){
   if(!online||pending)return;
   pending=true;
   try{await api('portfolio-session',{action:value});await refresh(true)}
   catch(error){toast(error.message)}
   finally{pending=false}
 }
 if(action==='open-playbook-run'){
   runA=value;
   location.hash='backtesting';
 }
 if(action==='create-playbook-draft'&&Object.hasOwn(strategyPlaybooks,value)){
   if(editor?.dirty&&!confirm('Replace the current unsaved strategy draft?'))return;
   const playbook=strategyPlaybooks[value];
   editor={...fresh(editor?.symbol??'','custom'),...structuredClone(playbook.draft),name:playbook.name,
     playbookId:value,dirty:true,mutation:crypto.randomUUID()};
   if(!authInfo?.required)write('ft-draft',editor);
   playbookLibraryOpen=false;
   toast('Playbook draft created. Review the rules and risk settings before saving.');
 }
 if(action==='apply-template'){
   const tpl=strategyTemplates[value];
   if(tpl){editor={...editor,...structuredClone(tpl),playbookId:undefined,id:editor?.id??'',version:editor?.version??0,symbol:editor?.symbol||state.market[0]?.symbol||'',dirty:true,mutation:crypto.randomUUID()};toast('Loaded template: '+tpl.label)}
 }
 if(action==='editor-type'){
   playbookLibraryOpen=false;
   if(value==='ai_notepad'){
     editor={...editor,mode:'ai_notepad',ai:true,timeframe:editor?.timeframe==='1Min'?'15Min':(editor?.timeframe??'15Min'),dirty:true,mutation:crypto.randomUUID()};
   }else if(value==='ai_autonomous'){
     const p=autoRiskPresets[editor?.aiRiskProfile??'balanced']??autoRiskPresets.balanced;
     editor={...editor,mode:'ai_autonomous',ai:true,timeframe:['5Min','15Min','1Hour'].includes(editor?.timeframe)?editor.timeframe:'15Min',aiWakeMode:editor?.aiWakeMode??'smart',aiRiskProfile:editor?.aiRiskProfile??'balanced',aiSizing:editor?.aiSizing??'dynamic',aiDailyCap:editor?.aiDailyCap??100,size:100,exposure:100,stop:p.stop,trailingStop:p.trailingStop,take:p.take,dailyLoss:p.dailyLoss,cooldown:p.cooldown,dirty:true,mutation:crypto.randomUUID()};
   }else{
     editor={...editor,mode:['ai_notepad','ai_autonomous'].includes(editor?.mode)?'momentum':(editor?.mode??'momentum'),dirty:true,mutation:crypto.randomUUID()};
   }
 }
 if(action==='apply-risk-preset'){
   const p=autoRiskPresets[value];
   if(p){
     editor={...editor,aiRiskProfile:value,stop:p.stop,trailingStop:p.trailingStop,take:p.take,dailyLoss:p.dailyLoss,cooldown:p.cooldown,dirty:true,mutation:crypto.randomUUID()};
     toast(`Applied ${p.label} risk guardrails.`);
   }
 }
 if(action==='apply-note-template'){
   const tpl=notepadTemplates[value];
   if(tpl){editor={...editor,...structuredClone(tpl),playbookId:undefined,mode:'ai_notepad',ai:true,id:editor?.id??'',version:editor?.version??0,symbol:editor?.symbol||state.market[0]?.symbol||'',dirty:true,mutation:crypto.randomUUID()};toast('Loaded AI Notepad starter: '+tpl.label)}
 }
 if(action==='rule-logic'){
   const r=ensureRules();
   if(el.dataset.side==='entry')r.entryLogic=value;else r.exitLogic=value;
   editor.mode='custom';editor.dirty=true;editor.mutation=crypto.randomUUID();
 }
 if(action==='rule-add'){
   const r=ensureRules();
   const def=value==='entry'?{left:{indicator:'rsi',period:14},op:'lt',right:{indicator:'number',value:35}}:{left:{indicator:'rsi',period:14},op:'gt',right:{indicator:'number',value:70}};
   r[value].push(def);
   editor.mode='custom';editor.dirty=true;editor.mutation=crypto.randomUUID();
 }
 if(action==='rule-remove'){
   const r=ensureRules();
   r[el.dataset.side].splice(+value,1);
   editor.dirty=true;editor.mutation=crypto.randomUUID();
 }
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
 const t=event.target;
 if(t.matches('[data-asset-picker]')){
   clearTimeout(assetSearchTimer);
   const query=t.value.trim(), list=t.list;
   const status=document.getElementById(list.id+'-status');
   assetSearchTimer=setTimeout(async()=>{
     try{
       const result=await api('assets',{query,eligible:true});
       if(!t.isConnected||t.value.trim()!==query)return;
       list.replaceChildren(...result.items.map(asset=>{
         const option=document.createElement('option');
         option.value=asset.symbol;option.label=asset.name;return option;
       }));
       status.textContent=result.total?'Enter a ticker or choose a search result.':
         result.partial?'Some Alpaca assets are unavailable or still loading.':'No eligible instruments found.';
     }catch(error){
       if(t.isConnected&&t.value.trim()===query)status.textContent=error.message;
     }
   },200);
 }
 if(t.dataset?.ruleSide){
   const r=ensureRules(), row=r[t.dataset.ruleSide][+t.dataset.ruleIdx];
   if(row){
     const [p1,p2]=t.dataset.rulePart.split('.');
     if(p2)row[p1][p2]=p2==='indicator'?t.value:+t.value;
     else row[p1]=t.value;
     editor.mode='custom';editor.dirty=true;editor.mutation=crypto.randomUUID();
      const preview=$('#strategy-preview');
      if(preview)preview.innerHTML=requestStrategyPreview();
   }
   return;
 }
 const form=t.closest('#strategy');
  if(form&&t.name!=='version'){
    capture(form);
    const preview=$('#strategy-preview');
    if(preview)preview.innerHTML=requestStrategyPreview();
  }
 if(t.closest('#backtest'))backtestDraft=values(t.form);
 if(t.matches('#launch-bot [name=instrument]'))launchInstrument=t.value;
 if(t.matches('#launch-bot [name=budget]'))launchBudget=t.value;
 if(t.matches('#fund-bot [name=budget]'))fundBudget=t.value;
});
document.addEventListener('change',event=>{
 const t=event.target;
 if(t.name==='history-period'){
   historyPeriod=t.value;historyFilter.start='';historyFilter.end='';
   if(t.value!=='all'){historyFilter.end=date(Date.now());historyFilter.start=date(Date.now()-(Number(t.value)-1)*86400000)}
   render(true);return;
 }
 if(t.name==='history-symbol'){historyFilter.asset=t.value;render(true);return}
 if(t.name==='portfolio-period'&&Object.hasOwn(accountPeriods,t.value)){
   accountRange=t.value;render(true);return;
 }
 if(t.id==='avatar-file'&&t.files?.[0]){
   const reader=new FileReader();
   reader.onload=()=>{
     const img=new Image();
     img.onload=async()=>{
       const size=160, canvas=document.createElement('canvas');
       canvas.width=size;canvas.height=size;
       const ctx=canvas.getContext('2d');
       const min=Math.min(img.width,img.height), sx=(img.width-min)/2, sy=(img.height-min)/2;
       ctx.drawImage(img,sx,sy,min,min,0,0,size,size);
       const dataUrl=canvas.toDataURL('image/jpeg',0.82);
       avatarDraft=dataUrl;
       render(true);
       if(online&&!pending){
         pending=true;
         try{
           await api('profile',{...(state.profile??{}),avatar:dataUrl});
           avatarDraft=null;
           toast('Profile photo saved.');
           await refresh(true);
         }catch(error){toast(error.message)}
         finally{pending=false}
       }else toast('Photo ready. Click Save profile to upload.');
     };
     img.src=reader.result;
   };
   reader.readAsDataURL(t.files[0]);
   return;
 }
 if(t.dataset?.ruleSide){
   const r=ensureRules(), row=r[t.dataset.ruleSide][+t.dataset.ruleIdx];
   if(row){
     const [p1,p2]=t.dataset.rulePart.split('.');
     if(p2){
       row[p1][p2]=p2==='indicator'?t.value:+t.value;
       if(p2==='indicator'){
         if(t.value==='number')row[p1]={indicator:'number',value:row[p1].value??50};
         else if(noPeriodInd.has(t.value))row[p1]={indicator:t.value};
         else row[p1]={indicator:t.value,period:row[p1].period??14};
       }
     } else row[p1]=t.value;
     editor.mode='custom';editor.dirty=true;editor.mutation=crypto.randomUUID();
     render(true);
   }
   return;
 }
 if(t.matches('#strategy [name=timeframe], #strategy [name=mode]')){
   capture(t.form);render(true);return;
 }
 if(event.target.matches('#launch-bot [name=version]')){
   launchVersion=event.target.value;
   const form=event.target.form;
   const symbol=version(launchVersion)?.symbol;
   const instrument=form.elements.instrument;
   instrument.value=symbol??'';
   launchInstrument=instrument.value;
 }
 if(event.target.matches('#launch-bot [name=instrument]'))launchInstrument=event.target.value;
 if(event.target.matches('#strategy [name=version]')){
   editor=event.target.value?{...version(event.target.value)}:fresh();
   render(true);
 }
 if(event.target.matches('#backtest [name=version]')){
   const strat=version(event.target.value);
   if(strat&&event.target.form){
     const isCryptoAsset=strat.symbol?.includes('/');
     event.target.form.elements.fees.value=isCryptoAsset?25:1;
     event.target.form.elements.slippage.value=isCryptoAsset?5:2;
     backtestDraft=values(event.target.form);
   }
 }
 if(event.target.closest('#run-select')){
   if(event.target.name==='runA'){
     runA=event.target.value;
     if(runB===runA)runB='';
   }else runB=event.target.value;
   render(true);
 }
});
document.addEventListener('submit',async event=>{
 const form=event.target;
 if(!form.id)return;
 event.preventDefault();
 if(pending||syncing)return;
 const data=values(form),control=event.submitter;
 if(form.id==='dashboard-search'){
   catalogSearch={query:data.query.trim(),assetClass:'',offset:0};
   assetClass='Catalog';
   location.hash='screener';
   await loadCatalog();return;
 }
 if(form.id==='catalog-search'){
   if(catalogLoading)return;
   const sameSearch=data.query.trim()===catalogSearch.query&&data.assetClass===catalogSearch.assetClass;
   const direction=control?.name==='page'?control.value:'';
   const offset=sameSearch&&direction?Math.max(0,catalogSearch.offset+(direction==='next'?30:-30)):0;
   catalogSearch={query:data.query.trim(),assetClass:data.assetClass,offset};
   await loadCatalog();return;
 }
 if(form.id==='screen'){
   Object.assign(assetClass==='Crypto'?cryptoScreen:screen,data,{volume:+data.volume,volatility:+data.volatility});
   render(true);return;
 }
 if(form.id==='history'){if(data.start!==historyFilter.start||data.end!==historyFilter.end)historyPeriod=data.start||data.end?'custom':'all';Object.assign(historyFilter,data);render(true);return}
 if(form.id==='logs-filter'){Object.assign(logFilter,data);render(true);return}
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
     const launched=await api('bot',{id:selected.id,version:selected.version,symbol:selected.symbol,instrument:data.instrument.trim().toUpperCase(),action:'running',budget:+data.budget,create:true});
     launchVersion=null;launchInstrument=null;launchBudget='';botFilter='all';
     toast(selected.name+' launched.');
     location.hash=sessionRoute(launched);
   }
   if(form.id==='adopt-position'){
     const selected=version(data.version);
     if(!selected)throw Error('Choose a saved strategy version.');
     const adopted=await api('bot',{adopt:true,id:selected.id,version:selected.version,symbol:data.symbol,addFunds:+data.addFunds||0});
     toast(selected.name+' assigned to '+data.symbol+' position.');
     location.hash=sessionRoute(adopted);
   }
   if(form.id==='topup-bot'){
     const bot=state.bots[params().get('id')];
     if(!bot)throw Error('Bot not found.');
     await api('bot',{topUp:true,id:bot.id,addFunds:+data.addFunds});
     form.reset();
     toast('Added '+usd(+data.addFunds)+' to '+bot.name+'.');
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
    if(form.id==='knowledge-upload'){
      const file=data.document;
      if(!file?.size||file.size>32768)throw Error('Choose a UTF-8 text or Markdown file up to 32 KB.');
      await api('knowledge',{name:file.name,text:await file.text()});
      form.reset();
      toast('Strategy document uploaded.');
    }
   if(form.id==='portfolio-replay'){
     portfolioDraft=data;
     const config={versions:[data.first,data.second],capital:+data.capital,split:+data.split/100,fees:+data.fees,slippage:+data.slippage};
     if(control?.value==='start'){
       await api('portfolio-session',{...config,action:'start'});
       toast('Paper session started.');
     }else{
       portfolioResult=await api('portfolio-replay',config);
       toast('Portfolio replay complete.');
     }
     render(true);
   }
   if(form.id==='backtest'){
     if(control)control.textContent='Running…';
     const [id,version]=data.version.split('@');
     const payload={...data,id,version:+version,capital:+data.capital,fees:+data.fees,slippage:+data.slippage};
     if(data.budget!=='')payload.budget=+data.budget; else delete payload.budget;
     const result=await api('backtest',payload);
     runA=result.id;toast('Backtest complete.');
   }
   if(form.id==='per-bot-ai-key'){
     const botId=form.dataset.bot;
     if(!data.key?.trim())throw Error('Paste a Gemini or OpenAI API key to save.');
     await api('settings',{botAiKey:{botId,provider:data.provider,model:data.model,key:data.key.trim()}});
     form.reset();
     toast('Personal API key saved for this bot.');
   }
   if(form.id==='bot-ai-key'){
     if(!data.key?.trim())throw Error('Paste a Gemini or OpenAI API key to save.');
     await api('settings',{botAiKey:{provider:data.provider,model:data.model,key:data.key.trim()}});
     form.reset();
     toast('Dedicated AI Bot Trading Key saved securely.');
   }
   if(form.id==='settings'){await api('settings',Object.fromEntries(Object.keys(data).map(k=>[k,true])));toast('Notifications saved.')}
   if(form.id==='change-password'){
     if(data.newPassword!==data.confirmPassword)throw Error('New password and confirmation do not match.');
     await api('auth',{action:'change_password',currentPassword:data.currentPassword,newPassword:data.newPassword});
     form.reset();
     toast('Password updated & other sessions signed out.');
   }
   if(form.id==='profile'){
     const avatar=avatarDraft!==null?avatarDraft:(state.profile?.avatar??'');
     await api('profile',{...data,avatar,offlineSync:Boolean(form.elements.offlineSync?.checked)});
     avatarDraft=null;
     toast('Profile saved.');
   }
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
 if(active==='dashboard'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
   event.preventDefault();
   $('#dashboard-search input')?.focus();
   return;
 }
 const node=event.target.closest('.plot');
 if(!node||!['ArrowRight','ArrowLeft'].includes(event.key))return;
 event.preventDefault();inspect(node,(node.index??0)+(event.key==='ArrowRight'?1:-1));
});
window.addEventListener('hashchange',()=>{
 const route=location.hash.split('?')[0];
 notifOpen=false;deleteBotId=null;
 if(route==='#trading'){launchVersion=null;launchInstrument=null;launchBudget=''}
 if(route==='#session')fundBudget=null;
 if(state&&route==='#strategies'&&params().has('new')&&!params().has('symbol'))editor=fresh();
 render(true);
});
window.addEventListener('online',()=>refresh(true));
window.addEventListener('offline',()=>{online=false;render(true)});
let pollTimer=null, pollFailures=0;
function scheduleRefresh(){
 clearTimeout(pollTimer);
 if(document.hidden)return;
 const delay=online?3500:Math.min(30000,3500*Math.pow(2,Math.min(3,pollFailures)));
 pollTimer=setTimeout(async()=>{
   await refresh(false);
   pollFailures=online?0:pollFailures+1;
   scheduleRefresh();
 },delay);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){pollFailures=0;refresh(false).finally(scheduleRefresh)}else clearTimeout(pollTimer)});
render(true);refresh(true).finally(scheduleRefresh);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
