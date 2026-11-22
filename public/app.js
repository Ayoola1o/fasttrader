const pages={dashboard:'Dashboard',trading:'Live Trading',session:'Bot Session',screener:'Screener',strategies:'Strategy Editor',backtesting:'Backtesting',portfolio:'Portfolio',history:'History',settings:'Settings',profile:'Profile'};
const paths={
dashboard:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',screener:'M3 4h18v4l-7 6v5l-4 2v-7L3 8z',
strategies:'M4 7h16M4 17h16M8 4v6m8 4v6',backtesting:'M3 12a9 9 0 1 0 3-6m-3-2v5h5m4-2v5l3 2',
portfolio:'M4 8h16v12H4zm4 0V5h8v3M4 13h16m-9 0v2h2v-2',history:'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v2m0 14v2m9-9h-2M5 12H3m15-6-2 2m-8 8-2 2m12 0-2-2m-8-8-2-2',
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
let state=null,online=false,active='',selected='',chartMode='Price',range='1H',assetClass='Stocks',editor=null,editorRoute='',runA='',runB=null,pending=false,syncing=false,toastTimer;
const ranges={'15M':15,'1H':60,'4H':240,'1D':1440};
const screen={search:'',volume:0,volatility:0};
const cryptoScreen={search:'',volume:0,volatility:0};
let botFilter='all', launchVersion=null, launchInstrument=null, launchBudget='', fundBudget=null, deleteBotId=null;
let notifOpen=false, notifFilter='all', lastSeenNotif='', avatarDraft=null;
let tvStyle='Candles', tvRange='1H', tvBotId='';
let historyTab='orders';
const historyFilter={asset:'',strategy:'',side:'',status:'',start:'',end:''};
const key=s=>s.id+'@'+s.version;
const version=k=>state.strategies.find(s=>key(s)===k);
const latest=()=>Object.values(Object.fromEntries(state.strategies.map(s=>[s.id,s])));
const params=()=>new URLSearchParams(location.hash.split('?')[1]??'');
const botStatus=b=>b.desired==='running'?b.status:b.desired;
const syncLabel=()=>state.synced?'Last sync '+stamp(state.synced):'Awaiting first sync';
function toast(s){const n=$('#toast');n.textContent=s;n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,4500)}
function chrome(){
 const groups=[['WORKSPACE',['dashboard','trading','screener','strategies','backtesting','portfolio','history']],['PREFERENCES',['settings','profile']]];
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
 return panel(label,desc,legend+`<div class="plot" tabindex="0" aria-label="Bot trading view chart" data-points="${esc(JSON.stringify(points))}" data-unit="price" data-low="${low}" data-high="${high}"><svg viewBox="0 0 790 265" role="img" aria-label="Trading view chart"><defs><linearGradient id="${id}" x1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#43e2ae" stop-opacity=".23"/><stop offset="100%" stop-color="#43e2ae" stop-opacity="0"/></linearGradient></defs>${grids}${ticks}${seriesSvg}${entryLine}${markers}<line class="crosshair" y1="12" y2="230" stroke="#7e98b5" stroke-dasharray="4 4" visibility="hidden"/><circle class="point" r="4" fill="#4be4b2" stroke="#0b1018" stroke-width="2" visibility="hidden"/></svg><div class="tooltip" role="status" hidden></div></div>`,controls,'chart-panel');
}
function unmanagedPositions(){
 return state.positions.filter(p=>p.qty>0&&!Object.values(state.bots).some(b=>b.symbol===p.symbol&&((state.botSessions?.[b.id]?.qty??0)>1e-8||b.desired==='running')));
}
function trading(){
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
 return page('Automated execution','Live Trading','Launch and manage paper bots from saved strategy versions.',badge(mode,'good'))+
   (!online?'<div class="notice">Showing cached bot status · '+syncLabel()+'</div>':'')+
   '<div class="metrics">'+metric('Active bots',counts.running,counts.running?bots.filter(b=>b.status==='Running'&&b.desired==='running').length+' processing signals':'No active bots','bot',true)+
   metric('Paused bots',counts.paused,'Available to resume','strategies')+metric('Stopped bots',counts.stopped,'Available to restart','portfolio')+
   metric('Paper broker',esc(online?state.broker:'cached'),esc(state.feedName)+' · '+esc(online?state.feed:'cached'),'equity')+'</div>'+
   '<div class="stack">'+tvPanel+adoptPanel+panel('Launch a bot','Choose the saved trading rules, the instrument to trade, and the maximum USD budget.',
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
 const versions=state.strategies.filter(s=>s.id===bot.id).slice().reverse().map(s=>[s.version,s.symbol+' · v'+s.version]);
 const requestedVersion=params().get('version')??bot.version;
 const selectedVersion=versions.some(([v])=>String(v)===String(requestedVersion))?requestedVersion:'';
 const moneyChange=value=>`<span class="${color(value)}">${usd(value)}</span>`;
 const command=(label,action)=>btn(label,'bot-command',action,false,`data-bot="${esc(bot.id)}" data-version="${bot.version}" ${!online?'disabled':''}`);
 const controls=bot.desired==='running'?'<div class="form"><div class="actions">'+command('Pause','paused')+command('Stop','stopped')+'</div></div>':
   bot.desired==='paused'?'<div class="form">'+command('Stop','stopped')+'</div>':'';
 const hasOpenPos=holding||state.positions.some(p=>p.symbol===bot.symbol&&p.qty>0);
 const liquidateControls=hasOpenPos&&!open.some(o=>o.side==='sell')
   ?`<div class="form"><div class="actions">${btn('Close position','liquidate-bot',bot.id,false,`data-symbol="${esc(bot.symbol)}" data-pause="false" style="background:#39212e;color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`)}${bot.desired==='running'?btn('Close &amp; Pause','liquidate-bot',bot.id,false,`data-symbol="${esc(bot.symbol)}" data-pause="true" style="background:#39212e;color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`):''}</div></div>`:'';
 const topUpForm=form('topup-bot',numeric('Add additional funds (USD)','addFunds','',1,1e9),submit('Add funds to bot',!online));
 const risk=bot.desired==='running'&&bot.budget?topUpForm:form('fund-bot',select('Strategy version','version',[['','Choose a strategy version'],...versions],selectedVersion,true)+numeric('Bot budget (USD)','budget',fundBudget??bot.budget??'',1,1e9),
       submit(bot.desired==='running'?'Set budget':bot.desired==='paused'?'Resume bot':'Restart bot',!online))+topUpForm;
 const aiCallsBadge=strategy?.mode==='ai_autonomous'?badge(`AI calls today: ${bot.aiCallsToday??0}${strategy.aiDailyCap?' / '+strategy.aiDailyCap:''}`):'';
 const personalKey=state.botAiKeys?.[bot.id];
 const advKeyBox=`<details class="form" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)"><summary style="cursor:pointer;font-weight:600;font-size:.88rem;color:var(--text);display:flex;align-items:center;justify-content:space-between;gap:8px"><span>Advanced: Personal Bot API Key</span>${badge(personalKey?personalKey.provider+' · '+personalKey.masked:'Fallback to main key',personalKey?'good':'')}</summary><div style="margin-top:10px"><small style="display:block;margin-bottom:8px;color:var(--muted)">Assign this bot its own dedicated Gemini or OpenAI key so it never shares rate limits with other bots. Leave empty to fall back to your main key.</small><form id="per-bot-ai-key" data-bot="${esc(bot.id)}" class="form"><div class="fields">${select('Provider','provider',[['Gemini','Google Gemini'],['OpenAI','OpenAI']],personalKey?.provider??'Gemini',true)}${field('Model (optional)','model',personalKey?.model??'','maxlength="80" placeholder="e.g. gemini-2.5-flash"')}${field('Personal API Key','key','','type="password" autocomplete="off" maxlength="300" placeholder="'+(personalKey?'Enter new key to replace':'Paste dedicated API key')+'"')}</div><div class="actions">${submit('Save bot key',!online)}${btn('Test key','test-per-bot-ai-key',bot.id,false,!online?'disabled':'')}${personalKey?btn('Use main key','remove-per-bot-ai-key',bot.id,false,`style="color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`):''}</div></form></div></details>`;
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
     '<small>'+usd(book.reserved)+' reserved for pending buys</small></div>'+controls+liquidateControls+risk+advKeyBox+deleteControl)+'</div>'+
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
const ruleIndLabels={close:'Close',sma:'SMA',ema:'EMA',rsi:'RSI',bb_upper:'BB Upper',bb_lower:'BB Lower',macd:'MACD',macd_signal:'MACD Signal',donchian_high:'Donchian High',donchian_low:'Donchian Low',atr:'ATR',volume:'Volume',avg_volume:'Avg Volume',pct_change:'% Change',number:'Number'};
const leftIndicators=['close','sma','ema','rsi','bb_upper','bb_lower','macd','macd_signal','donchian_high','donchian_low','atr','volume','avg_volume','pct_change'];
const rightIndicators=['number','close','sma','ema','rsi','bb_upper','bb_lower','macd','macd_signal','donchian_high','donchian_low','avg_volume'];
const opLabels={gt:'>',lt:'<',gte:'≥',lte:'≤',crosses_above:'Crosses Above',crosses_below:'Crosses Below'};
const noPeriodInd=new Set(['close','volume','macd','macd_signal','number']);
const strategyTemplates={
 ema_cross:{label:'EMA Crossover',name:'EMA 9/21 Crossover',mode:'custom',timeframe:'5Min',trailingStop:1.5,stop:2,take:5,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'ema',period:9},op:'crosses_above',right:{indicator:'ema',period:21}}],exit:[{left:{indicator:'ema',period:9},op:'crosses_below',right:{indicator:'ema',period:21}}]}},
 trend_pullback:{label:'Trend Pullback',name:'Trend Pullback RSI',mode:'custom',timeframe:'5Min',trailingStop:1.5,stop:2,take:4.5,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'gt',right:{indicator:'ema',period:50}},{left:{indicator:'rsi',period:14},op:'lt',right:{indicator:'number',value:38}}],exit:[{left:{indicator:'rsi',period:14},op:'gt',right:{indicator:'number',value:70}}]}},
 bb_reversion:{label:'Bollinger Reversion',name:'Bollinger RSI Dip',mode:'custom',timeframe:'5Min',trailingStop:0,stop:2.5,take:4,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'lt',right:{indicator:'bb_lower',period:20}},{left:{indicator:'rsi',period:14},op:'lt',right:{indicator:'number',value:35}}],exit:[{left:{indicator:'close'},op:'gt',right:{indicator:'sma',period:20}}]}},
 donchian:{label:'Donchian Breakout',name:'Donchian 20 Breakout',mode:'custom',timeframe:'15Min',trailingStop:2,stop:2.5,take:6,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'gt',right:{indicator:'donchian_high',period:20}}],exit:[{left:{indicator:'close'},op:'lt',right:{indicator:'donchian_low',period:10}}]}},
 crypto_swing:{label:'Crypto Swing 15m',name:'Crypto Fee-Safe Swing',mode:'custom',timeframe:'15Min',sizeMode:'usd',sizeUsd:500,trailingStop:1.8,stop:2.5,take:5.5,cooldown:4,rules:{entryLogic:'all',exitLogic:'any',entry:[{left:{indicator:'close'},op:'gt',right:{indicator:'ema',period:20}},{left:{indicator:'rsi',period:14},op:'gt',right:{indicator:'number',value:52}},{left:{indicator:'rsi',period:14},op:'lt',right:{indicator:'number',value:72}}],exit:[{left:{indicator:'close'},op:'crosses_below',right:{indicator:'ema',period:20}},{left:{indicator:'rsi',period:14},op:'gt',right:{indicator:'number',value:78}}]}}
};
function clientAgg(bars,tf){
 const ms=tfMsMap[tf]??60000;
 if(!bars?.length||ms<=60000)return bars??[];
 const out=[];
 for(const b of bars){
   const ts=Date.parse(b.t),bucket=Math.floor(ts/ms)*ms,prev=out.at(-1);
   const h=Number.isFinite(b.h)?b.h:Math.max(b.o,b.c),l=Number.isFinite(b.l)?b.l:Math.min(b.o,b.c);
   if(prev&&prev._b===bucket){prev.h=Math.max(prev.h,h);prev.l=Math.min(prev.l,l);prev.c=b.c;prev.v=(prev.v??0)+(b.v??0);prev.t=b.t}
   else out.push({_b:bucket,t:b.t,o:b.o,h,l,c:b.c,v:b.v??0});
 }
 return out;
}
function clientEma(vals,p){if(vals.length<p)return null;const k=2/(p+1);let e=vals.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<vals.length;i++)e=vals[i]*k+e*(1-k);return e}
function clientRsi(vals,p){if(vals.length<=p)return null;const s=vals.slice(-(p+1));let g=0,l=0;for(let i=1;i<s.length;i++){const d=s[i]-s[i-1];if(d>0)g+=d;else l-=d}const ag=g/p,al=l/p;return al===0?(ag===0?50:100):100-100/(1+ag/al)}
function clientInd(bars,spec,off=0){
 if(!spec)return null;
 if(spec.indicator==='number')return Number.isFinite(spec.value)?spec.value:null;
 const end=(bars?.length??0)-off;if(end<=0)return null;
 const sl=bars.slice(0,end),cs=sl.map(b=>b.c),p=Math.max(1,Math.round(spec.period??14)),last=sl.at(-1);
 if(spec.indicator==='close')return last.c;
 if(spec.indicator==='volume')return last.v??0;
 if(spec.indicator==='sma')return cs.length>=p?cs.slice(-p).reduce((a,b)=>a+b,0)/p:null;
 if(spec.indicator==='ema')return clientEma(cs,p);
 if(spec.indicator==='rsi')return clientRsi(cs,p);
 if(spec.indicator==='bb_upper'||spec.indicator==='bb_lower'){if(cs.length<p)return null;const w=cs.slice(-p),m=w.reduce((a,b)=>a+b,0)/p,sd=Math.sqrt(w.reduce((a,v)=>a+(v-m)**2,0)/p);return spec.indicator==='bb_upper'?m+2*sd:m-2*sd}
 if(spec.indicator==='macd'||spec.indicator==='macd_signal'){if(cs.length<35)return null;const s=[];for(let i=26;i<=cs.length;i++){const sub=cs.slice(0,i);s.push(clientEma(sub,12)-clientEma(sub,26))}return spec.indicator==='macd'?s.at(-1):clientEma(s,9)}
 if(spec.indicator==='donchian_high'||spec.indicator==='donchian_low'){if(sl.length<=p)return null;const pr=sl.slice(-(p+1),-1);return spec.indicator==='donchian_high'?Math.max(...pr.map(b=>b.h??Math.max(b.o,b.c))):Math.min(...pr.map(b=>b.l??Math.min(b.o,b.c)))}
 if(spec.indicator==='atr'){if(sl.length<=p)return null;const s=sl.slice(-(p+1));let sum=0;for(let i=1;i<s.length;i++){const h=s[i].h??Math.max(s[i].o,s[i].c),l=s[i].l??Math.min(s[i].o,s[i].c);sum+=Math.max(h-l,Math.abs(h-s[i-1].c),Math.abs(l-s[i-1].c))}return sum/p}
 if(spec.indicator==='avg_volume')return sl.length>=p?sl.slice(-p).reduce((a,b)=>a+(b.v??0),0)/p:null;
 if(spec.indicator==='pct_change'){if(cs.length<=p)return null;const pr=cs[cs.length-1-p];return pr>0?100*(last.c/pr-1):null}
 return null;
}
function clientEvalRule(bars,rule){
 const lv=clientInd(bars,rule.left,0),rv=clientInd(bars,rule.right,0);
 if(!Number.isFinite(lv)||!Number.isFinite(rv))return{ready:false,pass:false,lv,rv};
 if(rule.op==='crosses_above'||rule.op==='crosses_below'){
   const pl=clientInd(bars,rule.left,1),pr=clientInd(bars,rule.right,1);
   if(!Number.isFinite(pl)||!Number.isFinite(pr))return{ready:false,pass:false,lv,rv};
   return{ready:true,pass:rule.op==='crosses_above'?pl<=pr&&lv>rv:pl>=pr&&lv<rv,lv,rv};
 }
 return{ready:true,pass:rule.op==='gt'?lv>rv:rule.op==='lt'?lv<rv:rule.op==='gte'?lv>=rv:lv<=rv,lv,rv};
}
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
function renderLiveDebugger(){
 const sym=editor.symbol, tf=editor.timeframe??'1Min', mode=editor.mode??'momentum';
 const tfBars=sym?clientAgg(state.bars[sym]??[],tf):[];
 const rules=editor.rules;
 const hasCustom=Boolean(rules?.entry?.length||rules?.exit?.length);
 const sizeText=(editor.sizeMode==='usd'?usd(editor.sizeUsd??500)+' fixed':(editor.size??10)+'% equity');
 const riskBits=[`SL ${editor.stop??2}%`,editor.trailingStop>0?`Trail ${editor.trailingStop}%`:null,editor.atrStop>0?`ATR×${editor.atrStop}`:null,`TP ${editor.take??4}%`,editor.cooldown>0?`Cooldown ${editor.cooldown}b`:null,editor.maxHoldBars>0?`Max hold ${editor.maxHoldBars}b`:null].filter(Boolean).join(' · ');
 const summary=hasCustom
   ?`Trades ${esc(sym||'selected asset')} on ${esc(tf)} candles using ${(rules.entry?.length??0)} custom entry (${(rules.entryLogic??'all').toUpperCase()}) & ${(rules.exit?.length??0)} exit (${(rules.exitLogic??'any').toUpperCase()}) rules · Size ${sizeText} · ${riskBits}.`
   :`Trades ${esc(sym||'selected asset')} on ${esc(tf)} candles using ${esc(modeLabels[mode]??mode)} (period ${editor.period??12}) · Size ${sizeText} · ${riskBits}.`;
 let checks='';
 if(!sym||tfBars.length<2){
   checks=empty('Select an instrument with candle history to see live PASS/WAIT condition values.');
 } else if(hasCustom){
   const evalSection=(side,label)=>{
     const list=rules[side]??[];if(!list.length)return '';
     const items=list.map(rule=>{
       const res=clientEvalRule(tfBars,rule);
       const valText=res.ready?`${num(res.lv)} ${opLabels[rule.op]} ${num(res.rv)}`:'Warming up';
       return `<div class="bot-row"><span><b>${esc(specLabel(rule.left))} ${opLabels[rule.op]} ${esc(specLabel(rule.right))}</b><small class="mono">${valText}</small></span>${badge(res.ready?(res.pass?'PASS':'WAIT'):'WARMUP',res.pass?'good':'')}</div>`;
     }).join('');
     return `<div class="section-label" style="padding:10px 16px 4px">${label} (${(side==='entry'?rules.entryLogic:rules.exitLogic).toUpperCase()})</div>${items}`;
   };
   checks=evalSection('entry','Entry conditions')+evalSection('exit','Exit conditions');
 } else {
   const p=editor.period??12, cs=tfBars.map(b=>b.c), last=cs.at(-1), sma=clientInd(tfBars,{indicator:'sma',period:p});
   const mom=sma?100*(last/sma-1):null, rsi=clientInd(tfBars,{indicator:'rsi',period:Math.min(14,p)});
   checks=`<div class="bot-row"><span><b>Latest ${esc(tf)} Close</b><small class="mono">${usd(last)} · ${tfBars.length} bars loaded</small></span>${badge(tfBars.length>=p?'READY':'WARMUP',tfBars.length>=p?'good':'')}</div>`+
     `<div class="bot-row"><span><b>Momentum vs SMA(${p})</b><small class="mono">${pct(mom)} (entry > ${editor.entry??0.1}%)</small></span>${badge(mom!==null&&mom>(editor.entry??0.1)?'PASS':'WAIT',mom!==null&&mom>(editor.entry??0.1)?'good':'')}</div>`+
     `<div class="bot-row"><span><b>RSI(${Math.min(14,p)})</b><small class="mono">${num(rsi)}</small></span>${badge(rsi!==null&&rsi<40?'OVERSOLD':rsi!==null&&rsi>65?'OVERBOUGHT':'NEUTRAL')}</div>`;
 }
 return panel('Live rule debugger','Real-time check on '+esc(sym||'current')+' · '+esc(tf)+' candles',`<div class="form"><p class="sub" style="margin:0">${summary}</p></div>`+checks);
}
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
 const isNotepad=editor.mode==='ai_notepad';
 const isAutonomous=editor.mode==='ai_autonomous';
 const editorSwitcher=`<div class="tabs" role="tablist" aria-label="Editor type">${btn('Visual Rule Builder','editor-type','visual',false,`role="tab" aria-selected="${!isNotepad&&!isAutonomous}"`)}${btn('AI Strategy Notepad','editor-type','ai_notepad',false,`role="tab" aria-selected="${isNotepad}"`)}${btn('Autonomous AI','editor-type','ai_autonomous',false,`role="tab" aria-selected="${isAutonomous}"`)}</div>`;
 const startTrade=s=>link('Start trade','trading?version='+encodeURIComponent(key(s)),true);
 const botActions=saved?`<div class="actions">${!['ai_notepad','ai_autonomous'].includes(saved.mode)?link('Backtest v'+saved.version,'backtesting?version='+key(saved)):''}${bot?link('Open bot session',sessionRoute(bot)+'&version='+saved.version):''}${startTrade(saved)}</div>`:'';
 const savedList=latest().map(s=>`<div class="bot-row"><div><b>${esc(s.name)}</b><small>${esc(s.symbol)} · ${s.mode==='ai_autonomous'?'Autonomous AI':s.mode==='ai_notepad'?'AI Notepad':esc(s.timeframe??'1Min')} · v${s.version}</small></div><div class="actions">${btn('Edit','edit',key(s))}${startTrade(s)}</div></div>`).join('');
 if(isAutonomous){
   const riskButtons=`<div class="template-bar"><span class="section-label">Risk Guardrail Presets</span><div class="actions">${Object.entries(autoRiskPresets).map(([k,p])=>btn(p.label,'apply-risk-preset',k,(editor.aiRiskProfile??'balanced')===k)).join('')}</div></div>`;
   const autoTf=[['5Min','5 Minutes'],['15Min','15 Minutes (Recommended)'],['1Hour','1 Hour']];
   const autoBase=field('Bot strategy name','name',editor.name,'required maxlength="60" placeholder="e.g. BTC Autonomous Agent"')+
     select('Asset / Token to trade','symbol',[['','Choose an instrument'],...state.market.map(m=>[m.symbol,m.symbol+' · '+m.name])],asset?.symbol??'',true)+
     select('Saved version','version',[['','New draft'],...options],saved?key(saved):'')+
     select('Candle timeframe','timeframe',autoTf,['5Min','15Min','1Hour'].includes(editor.timeframe)?editor.timeframe:'15Min',true)+
     select('AI wake-up mode','aiWakeMode',[['smart','Smart Wake-Up (saves ~80% AI calls)'],['fixed','Fixed Candle (every closed bar)']],editor.aiWakeMode??'smart',true)+
     select('Position sizing','aiSizing',[['dynamic','Dynamic (AI picks 25% / 50% / 100%)'],['simple','Simple (100% in / 100% out)']],editor.aiSizing??'dynamic',true)+
     numeric('Max AI calls / day (0=unlimited)','aiDailyCap',editor.aiDailyCap??100,0,500,1);
   const autoRisk=[['Hard stop-loss (%)','stop',.1,50],['Trailing stop (%, 0=off)','trailingStop',0,50,.1],['Hard take-profit (%)','take',.1,100],['Daily loss circuit breaker (%)','dailyLoss',.1,50],['Post-stop cooldown (bars)','cooldown',0,60,1]].map(([label,k,min,max,step])=>numeric(label,k,editor[k]??defaultParams[k],min,max,step)).join('');
   const hiddenAuto=`<input type="hidden" name="mode" value="ai_autonomous"><input type="hidden" name="aiRiskProfile" value="${esc(editor.aiRiskProfile??'balanced')}"><input type="hidden" name="sizeMode" value="percent"><input type="hidden" name="size" value="100"><input type="hidden" name="sizeUsd" value="${editor.sizeUsd??500}"><input type="hidden" name="exposure" value="100"><input type="hidden" name="period" value="12"><input type="hidden" name="entry" value="0.1"><input type="hidden" name="exit" value="-0.1"><input type="hidden" name="atrStop" value="0"><input type="hidden" name="maxHoldBars" value="0"><input type="checkbox" name="ai" checked hidden>`;
   const guidanceBox=`<label class="field notepad-field"><span>Optional guidance for the AI (leave blank for full autonomy)</span><textarea name="aiNotes" class="ai-notepad" rows="4" maxlength="1000" placeholder="Optional: e.g. Prefer swing dips, avoid chasing green spikes, hold winners patiently.">${esc(editor.aiNotes??'')}</textarea><small>Set the USD budget when launching on Live Trading. The AI sees live candles, EMA/RSI/MACD/Bollinger/ATR, Alpaca News, round-trip fee costs, and its own last 5 decisions.</small></label>`;
   const keySource=state.botAiConfigured?`Dedicated Bot Key (${state.botAiInfo.provider} · ${state.botAiInfo.masked})`:state.aiConfigured?`Fallback server key (${state.aiProvider})`:'No AI key configured';
   const feeInfo=asset?.symbol?.includes('/')?'50 bps round-trip (Crypto)':'~2 bps round-trip (Stock)';
   const autoCard=panel('Autonomous AI guardrails','Hard safety limits stay enforced even if AI is offline',
     `<div class="bot-row"><span><b>AI API Key</b><small>${esc(keySource)}</small></span>${badge(state.botAiConfigured||state.aiConfigured?'Ready':'Key needed',state.botAiConfigured||state.aiConfigured?'good':'bad')}</div>`+
     `<div class="bot-row"><span><b>Hard safety net</b><small>SL -${editor.stop??5}% · Trail ${editor.trailingStop??3}% · Daily cap -${editor.dailyLoss??6}%</small></span>${badge('Hard-coded','good')}</div>`+
     `<div class="bot-row"><span><b>Fee-aware prompting</b><small>${feeInfo} · Cooldown ${editor.cooldown??2} bars</small></span>${badge(editor.aiWakeMode==='fixed'?'Fixed':'Smart Wake')}</div>`+
     `<div class="form" style="padding-top:4px">${link('Manage Dedicated AI Bot Key in Settings','settings')}</div>`);
   return page('Automated trading','Strategy Editor','Give an Autonomous AI bot a token and budget — it manages entries, scaling, and exits under hard guardrails.',btn(icon('plus')+' New strategy','new','',true))+
     editorSwitcher+
     `<div class="grid">${panel('Autonomous AI Agent','Pick a token, timeframe, wake-up mode, and hard risk limits',riskButtons+form('strategy',autoBase+autoRisk,hiddenAuto+guidanceBox+submit(online?'Save Autonomous AI strategy':'Queue draft sync')+`<small id="draft-status">${editor.queued?'Queued for sync':editor.dirty?'Local draft':''}</small>`))}
     <div class="stack">${autoCard}${panel('Paper bot',bot?'Pinned to version '+bot.version:'Select a saved strategy version',
     (bot?`<div class="bot-row"><span>${esc(bot.symbol)}</span>${badge(botStatus(bot))}</div>`:empty('Save this strategy, then click Start trade to assign a USD budget and launch.'))+'<div class="form">'+botActions+'</div>')}
     ${panel('Saved strategies','Latest versions',savedList)}</div></div>`;
 }
 if(isNotepad){
   const noteTemplates=`<div class="template-bar"><span class="section-label">AI Notepad Starters</span><div class="actions">${Object.entries(notepadTemplates).map(([k,t])=>btn(t.label,'apply-note-template',k)).join('')}</div></div>`;
   const noteBase=field('Strategy name','name',editor.name,'required maxlength="60" placeholder="e.g. AI Smart Dip Buyer"')+
     select('Instrument or pair','symbol',[['','Choose an instrument'],...state.market.map(m=>[m.symbol,m.symbol+' · '+m.name])],asset?.symbol??'',true)+
     select('Saved version','version',[['','New draft'],...options],saved?key(saved):'')+
     select('Candle timeframe','timeframe',tfOptions,editor.timeframe??'15Min',true)+
     select('Position sizing mode','sizeMode',[['percent','% of Equity'],['usd','Fixed USD per trade']],editor.sizeMode??'usd',true)+
     numeric('Fixed size (USD)','sizeUsd',editor.sizeUsd??500,1,1e9,1);
   const noteRisk=[['Position size (% equity)','size',.1,100],['Maximum exposure (% equity)','exposure',.1,100],['Stop-loss (%)','stop',.1,50],['Trailing stop (%, 0=off)','trailingStop',0,50,.1],['Take-profit (%)','take',.1,100],['Maximum daily loss (%)','dailyLoss',.1,50],['Stop-loss cooldown (bars)','cooldown',0,60,1],['Max hold (bars, 0=off)','maxHoldBars',0,1440,1]].map(([label,k,min,max,step])=>numeric(label,k,editor[k]??defaultParams[k],min,max,step)).join('');
   const hiddenDefaults=`<input type="hidden" name="mode" value="ai_notepad"><input type="hidden" name="period" value="${editor.period??12}"><input type="hidden" name="entry" value="${editor.entry??0.1}"><input type="hidden" name="exit" value="${editor.exit??-0.1}"><input type="hidden" name="atrStop" value="${editor.atrStop??0}"><input type="checkbox" name="ai" checked hidden>`;
   const notepadBox=`<label class="field notepad-field"><span>Write your strategy for the AI (plain English rules, entries, exits, news &amp; candle conditions)</span><textarea name="aiNotes" class="ai-notepad" rows="12" required minlength="10" maxlength="4000" placeholder="Example:\nBUY when price is above EMA 20 and RSI(14) pulls back below 40 with no bearish news.\nSELL when RSI(14) > 72 or price drops below EMA 20.\nOtherwise HOLD.">${esc(editor.aiNotes??'')}</textarea><small>${(editor.aiNotes??'').length} / 4000 characters · ${state.aiConfigured?esc(state.aiProvider)+' will read these notes + live candles, EMA/SMA/RSI/ATR, position P&amp;L, and Alpaca News on every bar.':'Configure GEMINI_API_KEY or OPENAI_API_KEY in server env to run AI Notepad bots.'}</small></label>`;
   const guardCard=panel('AI Notepad guardrails','Hard risk limits always stay enforced in code',`<div class="bot-row"><span><b>AI engine</b><small>${state.aiConfigured?esc(state.aiProvider)+' active':'API key required'}</small></span>${badge(state.aiConfigured?'Ready':'Unconfigured',state.aiConfigured?'good':'bad')}</div><div class="bot-row"><span><b>Protective exits</b><small>Stop-loss ${editor.stop??2}% · Trail ${editor.trailingStop??0}% · Take-profit ${editor.take??4}%</small></span>${badge('Hard-coded','good')}</div><div class="bot-row"><span><b>Live context sent to AI</b><small>OHLCV candles, SMA12, EMA20/50, RSI14, ATR14, open P&amp;L &amp; Alpaca News</small></span>${badge(editor.timeframe??'15Min')}</div>`);
   return page('Automated trading','Strategy Editor','Write a plain-English strategy in the AI Notepad or switch to the Visual Rule Builder.',btn(icon('plus')+' New strategy','new','',true))+
     editorSwitcher+
     `<div class="grid">${panel('AI Strategy Notepad','Write how the AI should read the market, enter, and exit',noteTemplates+form('strategy',noteBase+noteRisk,hiddenDefaults+notepadBox+submit(online?'Save AI strategy':'Queue draft sync')+`<small id="draft-status">${editor.queued?'Queued for sync':editor.dirty?'Local draft':''}</small>`))}
     <div class="stack">${guardCard}${panel('Paper bot',bot?'Pinned to version '+bot.version:'Select a saved strategy version',
     (bot?`<div class="bot-row"><span>${esc(bot.symbol)}</span>${badge(botStatus(bot))}</div>`:empty('Save your AI Notepad strategy to launch a bot.'))+'<div class="form">'+botActions+'</div>')}
     ${panel('Saved strategies','Latest versions',latest().map(s=>`<div class="bot-row"><div><b>${esc(s.name)}</b><small>${esc(s.symbol)} · ${s.mode==='ai_notepad'?'AI Notepad':esc(s.timeframe??'1Min')} · v${s.version}</small></div><div class="actions">${btn('Edit','edit',key(s))}${startTrade(s)}</div></div>`).join(''))}</div></div>`;
 }
 const templatesBar=`<div class="template-bar"><span class="section-label">1-Click Templates</span><div class="actions">${Object.entries(strategyTemplates).map(([k,t])=>btn(t.label,'apply-template',k)).join('')}</div></div>`;
 const baseInputs=field('Strategy name','name',editor.name,'required maxlength="60"')+select('Instrument or pair','symbol',[['','Choose an instrument'],...state.market.map(m=>[m.symbol,m.symbol+' · '+m.name])],asset?.symbol??'',true)+
 select('Saved version','version',[['','New draft'],...options],saved?key(saved):'')+
 select('Strategy mode','mode',Object.entries(modeLabels).filter(([k])=>k!=='ai_notepad'&&k!=='ai_autonomous'),editor.mode??'momentum',true)+
 select('Candle timeframe','timeframe',tfOptions,editor.timeframe??'1Min',true)+
 select('Position sizing mode','sizeMode',[['percent','% of Equity'],['usd','Fixed USD per trade']],editor.sizeMode??'percent',true);
 const riskInputs=fields.map(([label,k,min,max,step])=>numeric(label,k,editor[k]??defaultParams[k],min,max,step)).join('');
 const ruleBuilder=renderRuleGroup('entry','Entry Rules (Buy)')+renderRuleGroup('exit','Exit Rules (Sell)');
 const aiSection=check('Require AI confirmation for non-protective signals','ai',editor.ai)+
 field('Custom AI confirmation rule (optional)','aiPrompt',editor.aiPrompt??'','maxlength="300" placeholder="e.g. Veto buys if news is bearish or candle jumped >2%"')+
 '<small>'+(state.aiConfigured?esc(state.aiProvider ?? 'AI provider')+' configured (with live Alpaca News headlines). Historical replay uses deterministic rules.':'Configure a Gemini or OpenAI key in the server environment to enable AI confirmation.')+'</small>';
 return page('Automated trading','Strategy Editor','Build custom indicator rules or switch to the AI Strategy Notepad.',btn(icon('plus')+' New strategy','new','',true))+
 editorSwitcher+
 `<div class="grid">${panel('Strategy & rule builder','Pick a template or stack custom Entry/Exit conditions',templatesBar+form('strategy',baseInputs+riskInputs,ruleBuilder+aiSection+
 submit(online?'Save version':'Queue draft sync')+`<small id="draft-status">${editor.queued?'Queued for sync':editor.dirty?'Local draft':''}</small>`))}
 <div class="stack">${renderLiveDebugger()}${panel('Paper bot',bot?'Pinned to version '+bot.version:'Select a saved strategy version',
 (bot?`<div class="bot-row"><span>${esc(bot.symbol)}</span>${badge(botStatus(bot))}</div>`:empty('Save a strategy to enable paper bot controls.'))+'<div class="form">'+botActions+'</div>')}
 ${panel('Saved strategies','Latest versions',latest().map(s=>`<div class="bot-row"><div><b>${esc(s.name)}</b><small>${esc(s.symbol)} · ${s.mode==='ai_notepad'?'AI Notepad':esc(s.timeframe??'1Min')} · v${s.version}</small></div><div class="actions">${btn('Edit','edit',key(s))}${startTrade(s)}</div></div>`).join(''))}</div></div>`;
}
function backtesting(){
 const runs=state.runs,eligible=state.strategies.filter(s=>!['ai_notepad','ai_autonomous'].includes(s.mode)).reverse(),notepadCount=state.strategies.filter(s=>['ai_notepad','ai_autonomous'].includes(s.mode)).length,requested=params().get('version');
 const chosen=eligible.some(s=>key(s)===requested)?requested:'';
 const chosenStrat=eligible.find(s=>key(s)===chosen);
 const cryptoDefault=chosenStrat?.symbol?.includes('/');
 const option=run=>[run.id,run.name+' v'+run.version+' · '+run.symbol+' ('+(run.timeframe??'1Min')+') · '+stamp(run.t)];
 if(!runs.some(r=>r.id===runA))runA=runs[0]?.id??'';
 if(runB===null&&runs.length>1)runB=runs[1].id;
 const a=runs.find(r=>r.id===runA),b=runs.find(r=>r.id===runB);
 const inputs=select('Saved strategy','version',[['','Choose a saved strategy'],...eligible.map(s=>[key(s),s.name+' v'+s.version+' · '+s.symbol+' ('+(s.timeframe??'1Min')+')'+(s.ai?' · rules only':'')])],chosen,true)+
 field('Start date','start',date(Date.now()-86400000*7),'type="date" required')+field('End date','end',date(Date.now()),'type="date" required')+
 numeric('Starting capital ($)','capital',100000,100,1e9,1)+
 field('Bot budget cap ($, optional)','budget','','type="number" min="1" max="1000000000" step="0.01" placeholder="Optional cap"')+
 numeric('Fees (bps)','fees',cryptoDefault?25:1,0,500)+numeric('Slippage (bps)','slippage',cryptoDefault?5:2,0,500);
 const notepadHint=notepadCount?`<small style="display:block;margin-top:6px;color:var(--muted)">${notepadCount} AI-driven (AI Notepad / Autonomous AI) ${notepadCount===1?'strategy is':'strategies are'} excluded from historical replay because they evaluate live AI rather than deterministic rules. Rule-based strategies with AI confirmation enabled replay their underlying rules.</small>`:'';
 const pfText=m=>!m?'—':m.profitFactor!==null?m.profitFactor.toFixed(2):(m.wins>0&&m.losses===0?'∞':'—');
 const summary=r=>{
   if(!r)return empty('Choose a second run to compare.');
   const m=r.metrics, ret=100*(r.final/r.capital-1);
   const stats=m?`<small>Win rate <b>${m.winRate!==null?m.winRate.toFixed(1)+'%':'—'}</b> (${m.wins}W/${m.losses}L) · Profit factor <b>${pfText(m)}</b> · Sharpe <b>${m.sharpe!==null?m.sharpe.toFixed(2):'—'}</b></small>`+
     `<small>Buy &amp; Hold <b class="${color(m.buyAndHold)}">${pct(m.buyAndHold)}</b> · Fees <b>${usd(m.totalFees)}</b> · ${m.bars} ${esc(m.timeframe??r.timeframe??'1Min')} bars${m.openPosition?' · <span class="badge warn">Open at end ('+usd(m.openPosition.unrealized)+')</span>':''}</small>`:'';
   return panel(esc(r.name)+' v'+r.version,esc(r.source)+' · '+esc(r.timeframe??'1Min')+' · '+esc(r.start)+' to '+esc(r.end)+(r.budget?' · Budget '+usd(r.budget):''),
   `<div class="form"><b class="mono">${usd(r.final)} &nbsp; <span class="${color(r.final-r.capital)}">${pct(ret)}</span></b><small>Max drawdown ${pct(r.drawdown)} · ${m?m.closedTrades+' closed trades ('+(r.tradeCount??r.trades.length)+' fills)':(r.tradeCount??r.trades.length)+' executions'} · ${r.fees} bps fee / ${r.slippage} bps slip</small>${stats}</div>`+plot(r.curve));
 };
 const openNote=a?.metrics?.openPosition?`<small style="display:block;margin-bottom:8px;color:var(--muted)">Open position at end of test: ${qtyText(a.metrics.openPosition.qty)} @ ${usd(a.metrics.openPosition.entry)} (mark ${usd(a.metrics.openPosition.mark)}, unrealized <b class="${color(a.metrics.openPosition.unrealized)}">${usd(a.metrics.openPosition.unrealized)}</b>).</small>`:'';
 return page('Strategy research','Backtesting','Replay a saved strategy with next-bar-open fills, intrabar stops, and modeled trading costs.')+
 `<div class="stack">${panel('Run configuration','Signals evaluate on each strategy’s configured timeframe (1m / 5m / 15m / 1h). Next-bar open determines simulated execution; crypto defaults to 25 bps taker fees.',form('backtest',inputs,submit('Run backtest',!online||!eligible.length))+notepadHint)}
 ${a?panel('Run comparison','Compare equity curves and risk-adjusted metrics.',`<div id="run-select" class="form"><div class="fields">${select('First run','runA',runs.map(option),runA)}${select('Second run','runB',[['','Select run'],...runs.map(option)],runB)}</div></div><div class="form comparison">${summary(a)}${summary(b)}</div>`):''}
 ${a?panel('Drawdown','First run · decline from the equity high-water mark',plot(a.curve.map(p=>({t:p.t,value:p.drawdown})),'percent')):''}
 ${a?panel('Trade log','First run · latest 250 modeled fills, fees, and exit reasons',openNote+table(['Time','Side','Quantity','Fill price','Fees','Realized P&L','Reason'],a.trades.slice(-250).reverse().map(t=>[stamp(t.t),badge(t.side),qtyText(t.qty),usd(t.price),usd(t.fee),usd(t.pnl),esc(t.reason??'—')]),'No executions in this run.')):''}</div>`;
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
 const bai=state.botAiInfo;
 const perBotEntries=Object.entries(state.botAiKeys??{}).filter(([id])=>state.bots[id]);
 const perBotList=perBotEntries.length?'<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><small style="display:block;margin-bottom:6px;color:var(--muted)">Per-bot personal API keys</small>'+perBotEntries.map(([id,k])=>`<div class="bot-row"><div><b>${esc(state.bots[id].name)}</b><small>${esc(k.provider)} · ${esc(k.model)} · ${esc(k.masked)}</small></div><div class="actions">${link('Open bot',sessionRoute(state.bots[id]))}${btn('Remove','remove-per-bot-ai-key',id,false,`style="color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`)}</div></div>`).join('')+'</div>':'';
 const botAiPanel=panel('AI Bot Trading Key','Dedicated API key for Autonomous AI bots (saved encrypted in Supabase). Individual bots can also override this with their own personal key in Bot Session → Advanced.',
   row('Dedicated key status',bai?`${esc(bai.provider)} · ${esc(bai.model)} · ${esc(bai.masked)}`:'Not set — Autonomous AI falls back to server .env key',bai?'configured':'unconfigured')+
   `<form id="bot-ai-key" class="form"><div class="fields">`+
   select('AI Provider','provider',[['Gemini','Google Gemini'],['OpenAI','OpenAI']],bai?.provider??'Gemini',true)+
   field('Model (optional)','model',bai?.model??'','maxlength="80" placeholder="e.g. gemini-2.5-flash or gemini-2.5-flash-lite"')+
   field('API Key','key','','type="password" autocomplete="off" maxlength="300" placeholder="'+(bai?'Enter new key to replace saved key':'Paste Gemini or OpenAI API key')+'"')+
   `</div><div class="actions">${submit('Save trading key',!online)}${btn('Test key','test-bot-ai-key','',false,!online?'disabled':'')}${bai?btn('Remove key','remove-bot-ai-key','',false,`style="color:#ff8191;border-color:#592e42" ${!online?'disabled':''}`):''}</div></form>`+perBotList);
 return page('Workspace preferences','Settings','Review data providers, dedicated AI Bot Trading Key, paper connectivity, and notifications.')+
 `<div class="grid equal"><div class="stack">${panel('Integrations','Credentials are configured in the server environment.',row('Stock data',esc(state.feedName),state.feed)+row('Paper broker',state.mode==='demo'?'Local simulated fills':'Alpaca Paper API',state.broker)+row('General AI confirmation',esc(state.aiProvider ?? 'Gemini or OpenAI'),state.aiConfigured?'configured':'unconfigured')+row('Dedicated AI Bot Key',bai?esc(bai.provider+' · '+bai.masked):'Using fallback key',bai?'configured':'unconfigured')+row('Telegram alerts',state.telegramConfigured?'Bot connected':'Set TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID',state.telegramConfigured?'configured':'unconfigured')+row('Crypto data',state.mode==='demo'?'Synthetic market':'Alpaca Crypto US',state.cryptoFeed??'connecting'))}
 ${botAiPanel}
 ${state.mode==='demo'?panel('Connection simulator','Exercise bot behavior during feed or broker outages.',`<div class="form"><div class="actions">${btn('Disconnect feed','outage','feed')}${btn('Disconnect broker','outage','broker')}${btn('Reconnect both','outage','clear',true)}</div></div>`):''}</div>
 <div class="stack">${panel('Notifications','Choose which events appear in the workspace and push to Telegram.',`<form id="settings" class="form">${Object.entries({signals:'Trade signals',fills:'Order fills',risk:'Risk limits',connections:'Connection failures',telegram:'Push alerts to Telegram'}).map(([k,v])=>check(v,k,k==='telegram'?state.alerts[k]!==false:state.alerts[k])).join('')}<div class="actions">${submit('Save preferences',!online)}${state.telegramConfigured?btn('Send test alert','test-telegram','',false,!online?'disabled':''):''}</div></form>`)}
 ${panel('Recent notifications',syncLabel(),events?'<div class="activity">'+events+'</div>':empty('No notifications yet.'))}</div></div>`;
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
       <div class="actions" style="margin-top:8px">${badge(p.riskTier||'moderate','good')}${badge((p.tradingStyle||'swing')+' trader')}${badge(activeBots+' active bots')}</div>
     </div>
   </div>
   <div class="actions">
     <label class="button primary" for="avatar-file">Upload photo</label>
     <input type="file" id="avatar-file" accept="image/*" hidden>
     ${photo?btn('Remove photo','remove-avatar'):''}
   </div>
 </section>`;
 const profileFields=field('Display name','name',p.name??'Paper Trader','required maxlength="80"')+
   field('Username','username',p.username??'','maxlength="32" placeholder="trader_handle"')+
   field('Email','email',p.email??'','type="email" maxlength="120"')+
   select('Timezone','timezone',tzOptions,p.timezone??'UTC')+
   select('Risk profile','riskTier',[['conservative','Conservative'],['moderate','Moderate'],['aggressive','Aggressive']],p.riskTier??'moderate')+
   select('Trading style','tradingStyle',[['scalp','Scalping'],['day','Day trading'],['swing','Swing trading'],['position','Position trading']],p.tradingStyle??'swing');
 const bioField=`<label class="field">Bio &amp; trading notes<textarea name="bio" rows="3" maxlength="280" placeholder="Strategy focus, risk rules, or personal trading notes...">${esc(p.bio??'')}</textarea></label>`;
 const equityCurve=panel('Portfolio equity curve',eqRet!==null?`<span class="${color(eqRet)}">${pct(eqRet)}</span> since first snapshot · ${syncLabel()}`:'Paper account equity over time · '+syncLabel(),plot(equityPts),'','chart-panel');
 return page('Trader identity','Profile','Manage your trader profile, photo, performance metrics, and trading preferences.')+
 `<div class="stack">${hero}<div class="metrics">${metric('Account equity',usd(state.account?.equity),'Paper portfolio','equity',true)}${metric('Buying power',usd(state.account?.buyingPower),'Available for orders','wallet')}${metric('Win / loss rate',winRate!==null?winRate.toFixed(1)+'%':'—',decided?`${wins}W / ${losses}L · ratio ${winRatio}`:'Awaiting closed trades','equity',true)}${metric('Account trades',filledOrders.length,activeBots+' active bots','portfolio')}</div>${equityCurve}<div class="grid">${panel('Profile details','Saved per isolated account',form('profile',profileFields,bioField+(authInfo?.required?'<small>Signed-in workspace data and drafts are kept in this tab during a disconnect.</small>':check('Cache workspace data in this browser','offlineSync',p.offlineSync))+submit('Save profile',!online)))}
 <div class="stack">${panel('Account isolation','Your trades are strictly partitioned by account key',`<div class="bot-row"><span><b>Account key</b><small class="mono">${esc(state.accountKey??state.mode)}</small></span>${badge('Isolated','good')}</div><div class="bot-row"><span><b>Broker environment</b><small>${state.mode==='demo'?'Local simulated broker':'Alpaca Paper API'}</small></span>${badge(state.broker)}</div><div class="bot-row"><span><b>Last sync</b><small>${syncLabel()}</small></span>${badge(online?'online':'offline',online?'good':'bad')}</div>`)}</div></div></div>`;
}
function historyPage(){
 const filteredOrders=state.orders.filter(item=>(!historyFilter.asset||item.symbol===historyFilter.asset)&&(!historyFilter.strategy||item.strategy===historyFilter.strategy)&&(!historyFilter.side||item.side===historyFilter.side)&&(!historyFilter.status||item.status===historyFilter.status)&&(!historyFilter.start||item.t?.slice(0,10)>=historyFilter.start)&&(!historyFilter.end||item.t?.slice(0,10)<=historyFilter.end));
 const filteredSignals=state.signals.filter(item=>(!historyFilter.asset||item.symbol===historyFilter.asset)&&(!historyFilter.strategy||item.strategy===historyFilter.strategy)&&(!historyFilter.side||item.direction===historyFilter.side)&&(!historyFilter.start||item.t?.slice(0,10)>=historyFilter.start)&&(!historyFilter.end||item.t?.slice(0,10)<=historyFilter.end));
 const filled=filteredOrders.filter(o=>o.filled>0&&Number.isFinite(o.price));
 const buyVol=filled.filter(o=>o.side==='buy').reduce((sum,o)=>sum+o.filled*o.price,0);
 const sellVol=filled.filter(o=>o.side==='sell').reduce((sum,o)=>sum+o.filled*o.price,0);
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
 return page('Execution audit','History','Inspect filled trades, strategy signals, and historical backtests.',btn('Export CSV','export-history'))+
   `<div class="metrics">${metric('Filled orders',filled.length,filteredOrders.length+' total matching','portfolio')}${metric('Buy volume',usd(buyVol),'Filled purchases','wallet',true)}${metric('Sell volume',usd(sellVol),'Filled sales','equity')}${metric('Signals logged',filteredSignals.length,state.runs.length+' backtests saved','bot',true)}</div>`+
   `<div class="stack">${panel('Filters','Slice executions and signals by asset, strategy, side, or date.',form('history',filterFields,submit('Apply filters')))}${tabs}${content}</div>`;
}
const renderers={dashboard,trading,session,screener,strategies,backtesting,portfolio,history:historyPage,settings,profile};
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
 if(!force&&!changed&&['backtesting','profile'].includes(active))return;
 const markup=renderers[active]()+renderDeleteModal();
 if(markup!==main.dataset.html){main.innerHTML=markup;main.dataset.html=markup}
}
async function api(path,data){
 const res=await fetch('/api/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:timeoutSignal(path==='backtest'?70000:30000)});
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
 for(const [,k]of fields)if(data[k]!==undefined)data[k]=+data[k];
 if(data.aiDailyCap!==undefined)data.aiDailyCap=+data.aiDailyCap;
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
   const res=await fetch('/api/state',{cache:'no-store',credentials:'same-origin',signal:timeoutSignal(10000)});
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
 if(action==='open-delete-bot'){
   if(!online||pending){toast('The workspace is reconnecting.');return}
   deleteBotId=value;
   render(true);
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
     toast(res.liquidated?`Deleted ${bot?.name??'bot'} & submitted market sell for ${bot?.symbol??'position'}.`:res.leftOpen?`Deleted ${bot?.name??'bot'}. Open ${bot?.symbol??'position'} left unmanaged.`:`Deleted ${bot?.name??'bot'}.`);
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
 if(action==='chart')chartMode=value;
 if(action==='tv-style')tvStyle=value;
 if(action==='tv-range')tvRange=value;
 if(action==='tv-bot')tvBotId=value;
 if(action==='history-tab')historyTab=value;
 if(action==='export-history'){
   const rows=[['Time','Asset','Strategy','Side','Qty','Filled','Price','Status'],...state.orders.map(o=>[o.filledAt??o.t??'',o.symbol??'',o.strategy??'External',o.side??'',o.qty??'',o.filled??'',o.price??'',o.status??''])];
   const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
   const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='fasttrader-history.csv';a.click();
   toast('Exported trade history CSV.');return;
 }
 if(action==='asset')assetClass=value;
 if(action==='bot-filter')botFilter=value;
 if(action==='edit')editor=structuredClone(version(value));
 if(action==='new')editor=fresh();
 if(action==='apply-template'){
   const tpl=strategyTemplates[value];
   if(tpl){editor={...editor,...structuredClone(tpl),id:editor?.id??'',version:editor?.version??0,symbol:editor?.symbol||state.market[0]?.symbol||'',dirty:true,mutation:crypto.randomUUID()};toast('Loaded template: '+tpl.label)}
 }
 if(action==='editor-type'){
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
   if(tpl){editor={...editor,...structuredClone(tpl),mode:'ai_notepad',ai:true,id:editor?.id??'',version:editor?.version??0,symbol:editor?.symbol||state.market[0]?.symbol||'',dirty:true,mutation:crypto.randomUUID()};toast('Loaded AI Notepad starter: '+tpl.label)}
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
 if(t.dataset?.ruleSide){
   const r=ensureRules(), row=r[t.dataset.ruleSide][+t.dataset.ruleIdx];
   if(row){
     const [p1,p2]=t.dataset.rulePart.split('.');
     if(p2)row[p1][p2]=p2==='indicator'?t.value:+t.value;
     else row[p1]=t.value;
     editor.mode='custom';editor.dirty=true;editor.mutation=crypto.randomUUID();
   }
   return;
 }
 const form=t.closest('#strategy');
 if(form&&t.name!=='version')capture(form);
 if(t.matches('#launch-bot [name=budget]'))launchBudget=t.value;
 if(t.matches('#fund-bot [name=budget]'))fundBudget=t.value;
});
document.addEventListener('change',event=>{
 const t=event.target;
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
 if(t.matches('#strategy [name=symbol], #strategy [name=timeframe], #strategy [name=mode]')){
   capture(t.form);render(true);return;
 }
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
 if(event.target.matches('#backtest [name=version]')){
   const strat=version(event.target.value);
   if(strat&&event.target.form){
     const isCryptoAsset=strat.symbol?.includes('/');
     event.target.form.elements.fees.value=isCryptoAsset?25:1;
     event.target.form.elements.slippage.value=isCryptoAsset?5:2;
   }
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
render(true);refresh(true);setInterval(refresh,3500);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
