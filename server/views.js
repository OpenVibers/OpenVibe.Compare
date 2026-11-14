'use strict';
const kit=require('openvibe-shared/kit');
const shell=require('openvibe-shared/shell');
const serve=require('openvibe-shared/serve');
const metrics=require('openvibe-shared/ov-metrics');
const {rank,weights}=require('../public/rank');
const esc=v=>String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=v=>JSON.stringify(v).replace(/</g,'\\u003c');
const thingPath=id=>`/things/${encodeURIComponent(id)}`;
// The words are Shared's, so Compare, Report and Exchange write 240 ms, 45.2 tok/s and 98.0% the same way.
const FORMAT={ms:metrics.format.ms,tps:metrics.format.tps,rate:metrics.format.rate};
const word=(k,v)=>k&&FORMAT[k.format]?FORMAT[k.format](v):null;
function number(r,k) {
 const f=k&&FORMAT[k.format];
 if(!r) return f?`<span class="ovm-unknown">${esc(f(null))}</span>`:'<span>Not measured</span>';
 const text=f?f(r.value):r.value.toLocaleString('en-US',{maximumFractionDigits:4});
 return `<details class="evidence"><summary>${esc(text)}</summary><time datetime="${esc(r.as_of)}">${esc(r.as_of.slice(0,10))}</time> · <a href="${esc(r.source.url)}">${esc(r.source.label)}</a></details>`;
}
function score(n,c){return n===null?'Unranked':`<details><summary>${n.toFixed(1)}</summary>Derived from the dated results below, using <a href="#method">this method</a>. Updated ${esc(c.updated_at.slice(0,10))}.</details>`;}
function comparison(c,input={}) {
 const ranked=rank(c,input), w=weights(c,input);
 const cell=(t,k)=>number(c.results.find(r=>r.thing===t.id && r.criterion===k.id),k);
 return `${kit.head({title:c.title,sub:c.summary,icon:'scale',sticky:false})}${c.availability.map(s=>`<p role="status">${esc(s)}</p>`).join('')}
 <p>Updated <time>${esc(c.updated_at.slice(0,10))}</time> · <a href="/api/v1/comparisons/${c.slug}">JSON data</a></p>
 <fieldset><legend>What matters to you</legend>${c.criteria.filter(k=>!k.format).map(k=>`<label class="weight">${esc(k.label)} <input type="range" min="0" max="100" value="${w[k.id]}" data-weight="${esc(k.id)}"><output>${w[k.id]}</output></label>`).join('')}</fieldset>
 <p id="rank-note">Missing evidence stays unranked. Scores change with your weights; they are not a claim of statistical significance.</p>
 <div class="phone-cards" id="cards">${ranked.map(({thing:t,score:n})=>`<article class="ovk-card" data-thing="${esc(t.id)}"><h2><a href="${thingPath(t.id)}">${esc(t.name)}</a></h2><p>Overall <span data-score>${score(n,c)}</span></p><dl>${c.criteria.map(k=>`<div><dt>${esc(k.label)} (${esc(k.unit)})</dt><dd data-criterion="${esc(k.id)}">${cell(t,k)}</dd></div>`).join('')}</dl></article>`).join('')}</div>
 <div class="desktop-table"><table><caption>${esc(c.title)}; select a heading to sort</caption><thead><tr><th scope="col">Thing</th><th scope="col"><button data-sort="overall">Overall</button></th>${c.criteria.map(k=>`<th scope="col"><button data-sort="${esc(k.id)}">${esc(k.label)} (${esc(k.unit)})</button></th>`).join('')}</tr></thead><tbody id="rows">${ranked.map(({thing:t,score:n})=>`<tr data-thing="${esc(t.id)}"><th scope="row"><a href="${thingPath(t.id)}">${esc(t.name)}</a></th><td data-score>${score(n,c)}</td>${c.criteria.map(k=>`<td data-criterion="${esc(k.id)}">${cell(t,k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
 ${c.kind==='ai.models'?'<p class="measured-note">Measured on OpenVibe.AI\'s real traffic; a model shows after 20 calls in 30 days. The numbers come from OpenVibe.Report&rsquo;s <a href="https://openvibe.report/developers">open AI performance data</a>.</p>':''}
 <label>Chart <select id="chart-mode"><option value="none">Hidden</option><option value="bars">Bars by criterion</option>${c.kind==='ai.models'?'<option value="scatter">Price against quality</option>':''}</select></label><div id="chart" aria-live="polite"></div>
 <section id="method"><h2>Method</h2><p>${esc(c.method)}</p><h3>Sources</h3><ul>${c.sources.map(s=>`<li><a href="${esc(s.url)}">${esc(s.label)}</a></li>`).join('')}</ul></section>
 <script type="application/json" id="comparison-data">${json(c)}</script><script src="/rank.js" defer></script><script src="/comparison.js" defer></script>`;
}
function computeCard(compute,q='') {
 const when=compute.checked_days_ago==null?'at an unknown date':compute.checked_days_ago===0?'today':compute.checked_days_ago===1?'1 day ago':`${compute.checked_days_ago} days ago`;
 const cheapest=compute.offers.find(o=>o.id===compute.cheapest.gpu);
 const text=`GPUs and computers from OpenVibe.Exchange: per hour, per GPU GB-hour and per month at 24/7, checked ${when}.`;
 if(q && !('compute prices '+text).toLowerCase().includes(q.toLowerCase())) return '';
 return `<article class="ovk-card"><h2><a href="/compute">Compute prices</a></h2><p>${esc(text)}</p>${compute.unavailable?`<p role="status">${esc(compute.unavailable)}</p>`:`<p>${compute.offers.length} offers${cheapest?` · cheapest GPU: ${esc(cheapest.provider)} ${esc(cheapest.gpu||'')} at $${cheapest.hourly.toFixed(2)}/hour`:''}</p>`}<p><a href="/api/v1/compute">JSON</a></p></article>`;
}
// The home (the 11-14 redesign, plan §AB.49): what Compare compares, each with its real number; a way to a model for
// your work through the leaderboard's own filters; and the three rules every page keeps. The AI card reads /ai's own
// data (ai.comparison()), never the empty ai-models comparison the old home ranked "picks" from.
const HOME_NOUN={'ai.coding-agents':['agent','agents','verified run','verified runs'],'openvibe.plans':['plan','plans','dated price','dated prices']};
const plural=(n,one,many)=>`${n.toLocaleString('en-US')} ${n===1?one:many}`;
function homeCard({href,icon,title,text,fact}){return `<li><a class="cmp-card" href="${esc(href)}"><span class="cmp-card-ic" aria-hidden="true">${kit.icon(icon)}</span><b>${esc(title)}</b><span class="cmp-card-text">${esc(text)}</span>${fact?`<small>${esc(fact)}</small>`:''}</a></li>`;}
function home(all,compute,ai=null,q='') {
 const query=String(q||'').trim().toLowerCase();
 const has=text=>!query||String(text).toLowerCase().includes(query);
 const rows=(ai&&ai.rows)||[];
 const chat=rows.filter(r=>(r.model_kind||'chat')==='chat');
 const makers=new Set(chat.map(r=>r.maker).filter(Boolean));
 const outPrice=o=>{const v=o&&o.price&&o.price.out;return v==null||v===''?NaN:Number(v);};
 const cheap=chat.flatMap(r=>(r.provider_offers||[]).map(o=>({id:r.id,out:outPrice(o)}))).filter(x=>Number.isFinite(x.out)&&x.out>0).sort((a,b)=>a.out-b.out)[0];
 const offers=compute&&!compute.unavailable?compute.offers.length:0;
 const gpu=compute&&compute.cheapest&&compute.offers.find(o=>o.id===compute.cheapest.gpu);
 const when=!compute||compute.checked_days_ago==null?'':compute.checked_days_ago===0?'checked today':compute.checked_days_ago===1?'checked 1 day ago':`checked ${compute.checked_days_ago} days ago`;
 const cards=[
  {href:'/ai',icon:'brain',title:'AI models',text:'Prices from each provider\'s own page, speed and uptime from real traffic, ratings from blind votes.',
   fact:chat.length?`${plural(chat.length,'model','models')} from ${plural(makers.size,'maker','makers')}${cheap?` · from $${cheap.out.toFixed(2)} per 1M output tokens`:''}`:'The model list is not available right now.'},
  {href:'/compute',icon:'gpu',title:'Compute prices',text:'GPUs and computers from OpenVibe.Exchange: per hour, per GPU GB-hour and per month at 24/7.',
   fact:compute&&compute.unavailable?compute.unavailable:[offers?plural(offers,'offer','offers'):'',gpu?`cheapest GPU ${gpu.gpu||gpu.provider} at $${gpu.hourly.toFixed(2)}/hour`:'',when].filter(Boolean).join(' · ')},
  ...all.filter(c=>c.slug!=='ai-models').map(c=>{const [one,many,rOne,rMany]=HOME_NOUN[c.kind]||['thing','things','dated result','dated results'];
   const icon=c.kind==='ai.coding-agents'?'code':c.kind==='openvibe.plans'?'wallet':'list';
   const measured=c.results.length?plural(c.results.length,rOne,rMany):c.kind==='ai.coding-agents'?'no verified runs yet':'nothing measured yet';
   return {href:`/comparisons/${c.slug}`,icon,title:c.title,text:c.summary,fact:`${plural(c.things.length,one,many)} · ${measured}`};}),
  {href:'/arena',icon:'trophy',title:'Arena',text:'Two anonymous AI answers to one prompt: pick the better one, then see which models wrote them.',fact:'Your votes rate the models'},
 ];
 const shown=cards.filter(c=>has(`${c.title} ${c.text}`));
 const models=query?chat.filter(r=>has(`${r.id} ${r.maker||''}`)):[];
 const agents=all.find(c=>c.kind==='ai.coding-agents'), plans=all.find(c=>c.kind==='openvibe.plans');
 const found=query?(shown.length||models.length?'':`<p class="ai-fine" role="status">Nothing on Compare matches “${esc(q)}”. <a href="/">Show everything</a></p>`)
  +(models.length?`<p class="ai-fine">${plural(models.length,'model matches','models match')}:</p><ul class="ai-chips">${models.slice(0,12).map(r=>`<li><a href="/ai/models/${encodeURIComponent(r.id)}">${esc(r.id)}</a></li>`).join('')}${models.length>12?`<li><a href="/ai/leaderboard?q=${encodeURIComponent(q)}">All ${models.length}</a></li>`:''}</ul>`:''):'';
 const pick=`<form class="cmp-pick" method="get" action="/ai/leaderboard">`
  +`<fieldset><legend>What for</legend>${kit.chips({name:'kind',single:true,options:[['','Anything',true],['code','Code'],['writing','Writing']]})}</fieldset>`
  +`<fieldset><legend>Price per 1M output tokens</legend>${kit.chips({name:'price',single:true,options:[['','Any',true],['free','Free'],['low','Up to $1'],['mid','$1 to $10']]})}</fieldset>`
  +`<fieldset><legend>Order</legend>${kit.chips({name:'sort',single:true,options:[['rating','Best rated',true],['price','Cheapest'],['speed','Fastest']]})}</fieldset>`
  +`<p><button class="ovk-btn ovk-btn--primary" type="submit">Show models</button></p></form>`;
 const how=[['calendar','Every number is dated','Each price, time and score names its source and the day it was read.'],
  ['minus','Missing is not zero','What nobody has measured shows as a dash and stays out of the ranking.'],
  ['sliders','Your priorities decide','Move a comparison\'s weights and its order moves with them; the method is on every page.']];
 return `<div class="ai-page cmp-home"><header class="ai-head"><p class="ai-kicker">OpenVibe.Compare</p><h1>Compare anything, with the date on every number</h1>`
  +`<p class="ai-lede">AI models, GPUs, coding agents and plans, side by side. Every number names its source and its date.</p>`
  +kit.find({action:'/',placeholder:'Search comparisons, models and makers',label:'Search Compare',value:q})
  +kit.stats([[chat.length,'AI models','/ai'],[offers,'GPU and computer offers','/compute'],[agents?agents.things.length:0,'coding agents',agents?`/comparisons/${agents.slug}`:null],[plans?plans.things.length:0,'OpenVibe plans',plans?`/comparisons/${plans.slug}`:null]],{label:'Compare in numbers'})
  +`</header>${found}`
  +(shown.length?kit.section({title:query?'Comparisons that match':'Comparisons',body:`<ul class="cmp-cards">${shown.map(homeCard).join('')}</ul>`}):'')
  +(query?'':kit.section({title:'Find a model for your work',note:'Opens the leaderboard with these filters; change them there.',body:pick}))
  +(query?'':kit.section({title:'How Compare works',body:`<ul class="cmp-how">${how.map(([ic,b,t])=>`<li><span class="cmp-card-ic" aria-hidden="true">${kit.icon(ic)}</span><b>${esc(b)}</b><span>${esc(t)}</span></li>`).join('')}</ul><p class="ai-fine"><a href="/ai/method">How AI ratings are made</a> · Open data: <a href="/api/v1/comparisons">comparisons</a>, <a href="/api/v1/compute">compute</a></p>`}))
  +`</div>`;
}
function markdown(c){return `# ${c.title}\n\n${c.summary}\n\nUpdated: ${c.updated_at}\n\n`+c.things.map(t=>`## ${t.name}\n\n`+c.criteria.map(k=>{const r=c.results.find(r=>r.thing===t.id&&r.criterion===k.id);if(!r)return `- ${k.label}: ${word(k,null)||'Not measured'}`;const shown=word(k,r.value)||`${r.value} ${k.unit}`;return `- ${k.label}: ${shown} — ${r.as_of} — [${r.source.label}](${r.source.url})`;}).join('\n')).join('\n\n')+`\n\n## Method\n\n${c.method}\n`;}
function page(title,body,path='/',ld=[],opts={}) {return shell.page({name:'OpenVibe.Compare',siteName:'OpenVibe.Compare',title,description:opts.description||'Compare things with dated sources, transparent methods and your own priorities.',canonical:`https://openvibe.compare${path}`,robots:opts.robots||'index, follow',jsonLd:ld,navbar:{service:'compare',apiBase:'https://openvibe.network',links:[{label:'Comparisons',href:'/'},{label:'AI',href:'/ai'},{label:'Compute',href:'/compute'}],silentLogin:'https://openvibe.compare/auth/login?silent=1&next={url}',loginUrl:'/auth/login?next={path}',logoutUrl:'/auth/logout?next={path}'},footer:{service:'compare',variant:'full',mount:'#ov-footer'},head:`<link rel="stylesheet" href="${serve.url('kit.css')}"><link rel="stylesheet" href="/compare.css">${opts.head||''}<script src="${serve.url('ov-metrics.js')}" defer></script>`,body:`<div id="navbar-mount"></div><main id="main" class="ovk-container">${body}</main>`});}
module.exports={comparison,home,page,markdown,esc,thingPath,number,computeCard};
