'use strict';
const kit=require('openvibe-shared/kit');
const shell=require('openvibe-shared/shell');
const serve=require('openvibe-shared/serve');
const {rank,weights}=require('../public/rank');
const esc=v=>String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=v=>JSON.stringify(v).replace(/</g,'\\u003c');
const thingPath=id=>`/things/${encodeURIComponent(id)}`;
function number(r) {return r ? `<details class="evidence"><summary>${esc(r.value.toLocaleString('en-US',{maximumFractionDigits:4}))}</summary><time datetime="${esc(r.as_of)}">${esc(r.as_of.slice(0,10))}</time> · <a href="${esc(r.source.url)}">${esc(r.source.label)}</a></details>` : '<span>Not measured</span>';}
function score(n,c){return n===null?'Unranked':`<details><summary>${n.toFixed(1)}</summary>Derived from the dated results below, using <a href="#method">this method</a>. Updated ${esc(c.updated_at.slice(0,10))}.</details>`;}
function comparison(c,input={}) {
 const ranked=rank(c,input), w=weights(c,input);
 const cell=(t,k)=>number(c.results.find(r=>r.thing===t.id && r.criterion===k.id));
 return `${kit.head({title:c.title,sub:c.summary,icon:'compare',sticky:false})}${c.availability.map(s=>`<p role="status">${esc(s)}</p>`).join('')}
 <p>Updated <time>${esc(c.updated_at.slice(0,10))}</time> · <a href="/api/v1/comparisons/${c.slug}">JSON data</a></p>
 <fieldset><legend>What matters to you</legend>${c.criteria.map(k=>`<label class="weight">${esc(k.label)} <input type="range" min="0" max="100" value="${w[k.id]}" data-weight="${esc(k.id)}"><output>${w[k.id]}</output></label>`).join('')}</fieldset>
 <p id="rank-note">Missing evidence stays unranked. Scores change with your weights; they are not a claim of statistical significance.</p>
 <div class="phone-cards" id="cards">${ranked.map(({thing:t,score:n})=>`<article class="ovk-card" data-thing="${esc(t.id)}"><h2><a href="${thingPath(t.id)}">${esc(t.name)}</a></h2><p>Overall <span data-score>${score(n,c)}</span></p><dl>${c.criteria.map(k=>`<div><dt>${esc(k.label)} (${esc(k.unit)})</dt><dd>${cell(t,k)}</dd></div>`).join('')}</dl></article>`).join('')}</div>
 <div class="desktop-table"><table><caption>${esc(c.title)}; select a heading to sort</caption><thead><tr><th scope="col">Thing</th><th scope="col"><button data-sort="overall">Overall</button></th>${c.criteria.map(k=>`<th scope="col"><button data-sort="${esc(k.id)}">${esc(k.label)} (${esc(k.unit)})</button></th>`).join('')}</tr></thead><tbody id="rows">${ranked.map(({thing:t,score:n})=>`<tr data-thing="${esc(t.id)}"><th scope="row"><a href="${thingPath(t.id)}">${esc(t.name)}</a></th><td data-score>${score(n,c)}</td>${c.criteria.map(k=>`<td>${cell(t,k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
 <label>Chart <select id="chart-mode"><option value="none">Hidden</option><option value="bars">Bars by criterion</option>${c.kind==='ai.models'?'<option value="scatter">Price against quality</option>':''}</select></label><div id="chart" aria-live="polite"></div>
 <section id="method"><h2>Method</h2><p>${esc(c.method)}</p><h3>Sources</h3><ul>${c.sources.map(s=>`<li><a href="${esc(s.url)}">${esc(s.label)}</a></li>`).join('')}</ul></section>
 <script type="application/json" id="comparison-data">${json(c)}</script><script src="/rank.js" defer></script><script src="/comparison.js" defer></script>`;
}
function home(all,q='',task='balanced',budget='') {
 const c=all.find(c=>c.slug==='ai-models');
 const taskWeights={balanced:{input:40,output:40,quality:20},writing:{input:10,output:30,quality:60},coding:{input:20,output:20,quality:60},speed:{input:10,output:10,quality:0,speed:80}};
 const limit=budget===''?Infinity:Number(budget);
 const picks=c?rank(c,taskWeights[task]||taskWeights.balanced).filter(r=>r.score!==null && c.results.some(v=>v.thing===r.thing.id && v.criterion==='output' && v.value<=limit)).slice(0,3):[];
 return `${kit.head({title:'Compare anything',icon:'compare',sticky:false})}<form method="get"><fieldset><legend>For my use</legend><label>Task <select name="task">${[['balanced','General use'],['writing','Writing'],['coding','Coding'],['speed','Fast responses']].map(([v,l])=>`<option value="${v}" ${v===task?'selected':''}>${l}</option>`).join('')}</select></label> <label>Output budget (USD per million tokens) <input name="budget" type="number" min="0" step="0.01" value="${esc(budget)}" placeholder="Any"></label><button class="ovk-btn ovk-btn--primary">Find picks</button></fieldset></form>
 <p>Task presets adjust preferences. The available arena data does not establish task-specific coding or writing quality. Budget applies to output tokens, not monthly spend.</p>
 <div class="picks">${picks.map(({thing:t})=>`<article class="ovk-card"><h2><a href="${thingPath(t.id)}">${esc(t.name)}</a></h2><p>Fits your output-price budget and ranks under these weights${c.results.some(r=>r.criterion==='quality')?'':'; quality has not been measured'}.</p><p>Output price (${esc(c.criteria.find(k=>k.id==='output').unit)}): ${number(c.results.find(r=>r.thing===t.id&&r.criterion==='output'))}</p></article>`).join('')||'<p>No measured picks fit this budget.</p>'}</div>
 <form><label>Search comparisons <input name="q" value="${esc(q)}" type="search"></label><button class="ovk-btn ovk-btn--quiet">Search</button></form>
 <div class="comparison-list">${all.filter(c=>(c.title+' '+c.summary).toLowerCase().includes(q.toLowerCase())).map(c=>`<article class="ovk-card"><h2><a href="/comparisons/${c.slug}">${esc(c.title)}</a></h2><p>${esc(c.summary)}</p>${rank(c).filter(r=>r.score!==null).slice(0,3).map(r=>`<div>${esc(r.thing.name)} <meter min="0" max="100" value="${r.score}">${r.score.toFixed(1)}</meter> ${score(r.score,c)}</div>`).join('') || '<p>No comparable measurements yet.</p>'}<p>${c.things.length} things · ${c.results.length} dated results</p></article>`).join('')}</div><section id="method"><h2>How picks are ranked</h2><p>${esc(c?.method || '')}</p></section>`;
}
function markdown(c){return `# ${c.title}\n\n${c.summary}\n\nUpdated: ${c.updated_at}\n\n`+c.things.map(t=>`## ${t.name}\n\n`+c.criteria.map(k=>{const r=c.results.find(r=>r.thing===t.id&&r.criterion===k.id);return `- ${k.label}: ${r?`${r.value} ${k.unit} — ${r.as_of} — [${r.source.label}](${r.source.url})`:'Not measured'}`;}).join('\n')).join('\n\n')+`\n\n## Method\n\n${c.method}\n`;}
function page(title,body,path='/',ld=[]) {return shell.page({name:'OpenVibe.Compare',siteName:'OpenVibe.Compare',title,description:'Compare things with dated sources, transparent methods and your own priorities.',canonical:`https://openvibe.compare${path}`,robots:'index, follow',jsonLd:ld,navbar:{service:'compare',apiBase:'https://openvibe.network',links:[{label:'Comparisons',href:'/'}]},footer:{service:'compare',variant:'full',mount:'#ov-footer'},head:`<link rel="stylesheet" href="${serve.url('kit.css')}"><link rel="stylesheet" href="/compare.css"><script src="/compare-account.js" defer></script>`,body:`<div id="navbar-mount"></div><main id="main" class="ovk-container">${body}</main>`});}
module.exports={comparison,home,page,markdown,esc,thingPath,number};
