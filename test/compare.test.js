'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build,createData,ENDPOINTS}=require('../server/data');
const {createAi}=require('../server/ai-data');
const {rank}=require('../public/rank');
const at='2026-11-10T00:00:00.000Z';
const fixture={market:{offers:[1,2,3].map(n=>({model:`maker/m${n}`,provider_model:`m${n}`,name:`Model ${n}`,kind:'chat',price:{in:n,out:n*2,currency:'USD',per:'1M tokens'},price_source:'https://example.com/prices',price_checked_at:at}))},harnesses:{harnesses:[{id:'codex',name:'Codex',provider:'openai'}]},runs:{runs:[]},plans:{plans:[]},quality:{board:{rows:[]}}};
const data=build(fixture,at);
test('every measurement is finite, dated, sourced and references a known thing and criterion',()=>{
 for(const c of data)for(const r of c.results){assert(Number.isFinite(r.value));assert(Number.isFinite(Date.parse(r.as_of)));assert.match(r.source.url,/^https:/);assert(r.source.label);assert(c.things.some(t=>t.id===r.thing));assert(c.criteria.some(k=>k.id===r.criterion));}
 assert.equal(data[0].things[0].url,'https://example.com/prices');assert.equal(data[1].things[0].url,'https://openvibe.codes/harnesses#codex');
 const bad=structuredClone(fixture);bad.market.offers[0].price_checked_at=null;bad.market.offers[1].price.out=null;assert.equal(build(bad,at)[0].things.length,1);
});
test('rank handles direction, equal values, missing evidence, zero and invalid weights',()=>{
 const c=structuredClone(data[0]);assert.deepEqual(rank(c).map(r=>r.score),[100,50,0]);
 assert(rank(c,{input:0,output:0,quality:0,speed:0}).every(r=>r.score===null));
 c.criteria[0].better='higher';assert.equal(rank(c,{input:100,output:0})[0].thing.id,'maker/m3');
 c.results=c.results.filter(r=>!(r.thing==='maker/m1'&&r.criterion==='output'));assert.equal(rank(c).at(-1).score,null);
 const equal=structuredClone(data[0]);equal.results.forEach(r=>r.value=7);assert(rank(equal).every(r=>r.score===50));
 assert(rank(data[0],{input:'NaN',output:-1}).every(r=>r.score!==null));
});
test('cache coalesces requests, lasts ten minutes, and expires without fabricating unavailable data',async()=>{
 let calls=0,now=0;const get=createData({now:()=>now,fetchImpl:async url=>{calls++;return {ok:true,json:async()=>fixture[Object.entries(ENDPOINTS).find(([,v])=>v===url)[0]]};}});
 await Promise.all([get(),get()]);assert.equal(calls,Object.keys(ENDPOINTS).length);now=599999;await get();assert.equal(calls,Object.keys(ENDPOINTS).length);now=600001;await get();assert.equal(calls,2*Object.keys(ENDPOINTS).length);
 const fail=createData({fetchImpl:async()=>{throw Error('offline');}});assert((await fail()).every(c=>c.results.length===0&&c.availability.length));
});
test('API, phone/table markup, URL weights, Markdown, Dataset, discovery and CORS',async()=>{
 const {createApp}=require('../server/app');const ai=await makeAi();const server=createApp({getData:async()=>data,ai}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  let r=await fetch(base+'/api/v1/comparisons',{headers:{Origin:'https://openvibe.network'}});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'https://openvibe.network');assert.equal((await r.json()).comparisons.length,3);
  r=await fetch(base+'/api/v1/comparisons',{headers:{Origin:'https://openvibe.network.evil.com'}});assert.equal(r.headers.get('access-control-allow-origin'),null);
  const html=require('../server/views').comparison(data[0],{input:0});assert.match(html,/phone-cards/);assert.match(html,/desktop-table/);assert.match(html,/<table/);assert.match(html,/value="0" data-weight="input"/);assert.match(html,/2026-11-10/);assert.match(html,/https:\/\/example.com\/prices/);
  const page=await (await fetch(base+'/comparisons/openvibe-plans')).text();assert.match(page,/Dataset/);assert.match(page,/dateModified/);
  const md=await (await fetch(base+'/comparisons/openvibe-plans',{headers:{Accept:'text/markdown'}})).text();assert.match(md,/# OpenVibe plans/);
  for(const url of ['/','/things/codex','/llms.txt','/sitemap.xml','/robots.txt','/api/v1/comparisons/ai-models'])assert.equal((await fetch(base+url)).status,200,url);
  const home=await (await fetch(base+'/')).text();assert.match(home,/<h2><a href="\/ai">AI models<\/a><\/h2>/);
  const thing=await (await fetch(base+'/things/codex')).text();assert.match(thing,/Codex/);assert.match(thing,/openvibe.codes/);
  assert.equal((await fetch(base+'/api/v1/comparisons/nope')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
test('upstream adapters preserve cohorts, observation dates and unknown quality',()=>{
 const f=structuredClone(fixture);f.quality.board.rows=[{model:'maker/m1',games:10,elo:null,median_ms:12}];
 f.runs.runs=[{id:'run-a',benchmark:'patch@1',harness:{id:'codex',version:'1.2'},model:'model-a',score:70,created_at:at,provenance:'verified'},{id:'run-b',benchmark:'patch@1',harness:{id:'codex',version:'1.2'},model:'model-a',score:90,created_at:at,provenance:'submitted'}];
 f.plans.plans=[{id:'vibes-100',name:'100 Vibes',kind:'package',vibes:100,price_cents:150,as_of:at,url:'https://openvibe.network/vibes'},{id:'membership',name:'Membership',kind:'membership',price_cents:499,period_days:30,as_of:at,url:'https://openvibe.vip'}];
 const [models,agents,plans]=build(f,at);assert(!models.results.some(r=>r.criterion==='quality'));assert.equal(models.results.find(r=>r.criterion==='speed').value,12);assert.equal(agents.results.length,1);assert.equal(agents.results[0].value,70);assert.equal(agents.results[0].as_of,at);assert.match(agents.results[0].source.label,/1.2/);assert.equal(plans.results.find(r=>r.criterion==='package-price').value,1.5);assert.equal(plans.results.find(r=>r.criterion==='membership-price').value,4.99);
});

const BMK='bmk_'+'0'.repeat(26);
const aiAt='2026-11-13T00:00:00.000Z';
const aiCatalogue={generated_at:aiAt,models:[
 {slug:'maker/alpha',canonical:'maker/alpha',name:'alpha',kind:'chat',maker:'Maker',open_weights:false,offers:[{provider:'maker',provider_name:'Maker',model:'alpha',kind:'chat',price:{in:1,out:2,currency:'USD',per:'1M tokens'},price_source:'https://example.com/alpha',price_checked_at:aiAt,requests_7d:30,speed:{p50_ms:500,p95_ms:900},uptime:0.99,error_rate:0.01,routed:true}]},
 {slug:'maker/beta',canonical:'maker/beta',name:'beta',kind:'chat',maker:'Maker',open_weights:true,offers:[]}
]};
const aiMarket={generated_at:aiAt,next_cursor:null,offers:[{model:'alpha',provider_model:'alpha',name:'Alpha',kind:'chat',maker:'Maker',price:{in:1,out:2,currency:'USD',per:'1M tokens'},price_source:'https://example.com/alpha',price_checked_at:aiAt,routed:true,requests_7d:30,speed:{p50_ms:500,p95_ms:900},uptime:0.99,error_rate:0.01}]};
const aiPerf={range:{from:'2026-10-15',to:'2026-11-13'},rows:[{key:'maker/alpha',calls:30,success_rate:0.98,ttft_ms:{p50:240},tps:{p50:45.2}}]};
const aiKind={id:'chat.arena',room:'exchange',judge:'human_pairwise',name:'Exchange arena'};
const aiBoardRow={subject:'maker/alpha',elo:1100,ci_lower:1050,ci_upper:1150,games:30,win_rate:0.6,median_cost_usd:0.02,median_ms:1200,score:80};
function aiResponse(body){return {ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(body),json:async()=>body};}
function aiStubFetch({benchDown=false,perfDown=false,marketDown=false}={}) {
 return async (url)=>{
  const p=new URL(url).pathname;
  if(benchDown)throw Error('offline');
  if(p==='/api/v1/exchange/catalog')return aiResponse(aiCatalogue);
  if(p==='/api/v1/exchange/market'){if(marketDown)throw Error('offline');return aiResponse(aiMarket);}
  if(p==='/api/v1/ai/performance'){if(perfDown)throw Error('offline');return aiResponse(aiPerf);}
  if(p==='/api/v1/kinds')return aiResponse({count:1,kinds:[aiKind]});
  if(p.startsWith('/api/v1/ratings/'))return aiResponse({board:{kind_id:'chat.arena',rows:[aiBoardRow]}});
  if(p.startsWith('/api/v1/boards/'))return aiResponse({board:{kind_id:'chat.arena',type:'pareto',rows:[{subject:'maker/alpha',quality:0.8,median_ms:1200}]}});
  if(p==='/api/v1/benchmarks')return aiResponse({benchmarks:[{id:BMK,title:'Bench A',kind:'chat.arena',runs:1,last_run:aiAt}]});
  if(p==='/api/v1/benchmarks/'+BMK)return aiResponse({benchmark:{id:BMK,title:'Bench A',kind:'chat.arena'},version:{version:'1'},definition:{tasks:[{id:'t1'}]}});
  if(p==='/api/v1/rankings')return aiResponse({rankings:{entries:[{model:'maker/alpha',score:80,cost_usd:0.02,ms:1200,runs:1,last_run:aiAt}]}});
  if(p==='/api/v1/runs')return aiResponse({runs:[{id:'run-1',benchmark_id:BMK,model:'maker/alpha',score:80,cost_usd:0.02,ms:1200,created_at:aiAt,provenance:'verified'}]});
  if(p==='/api/v1/overview')return aiResponse({benchmarks:1,tasks:1,runs:1,models:1,last_run:aiAt,list:[{id:BMK,title:'Bench A',kind:'chat.arena',runs:1,last_run:aiAt}]});
  if(p.endsWith('/summary'))return aiResponse({model:'maker/alpha',runs:1,benchmarks:[{benchmark_id:BMK,title:'Bench A',kind:'chat.arena',score:80,runs:1,last_run:aiAt}],recent_runs:[],tasks:[]});
  return aiResponse(null);
 };
}
async function makeAi(opts){return createAi({fetchImpl:aiStubFetch(opts),log:{warn(){}}});}

const measuredFeed={group:'model',range:{from:'2026-10-15',to:'2026-11-13'},rows:[
 {group:'model',key:'m1',calls:30,success_rate:0.981,ttft_ms:{p50:240,p90:500,p95:800,n:30},tps:{p50:45.2,p90:70,p95:90,n:30}},
 {group:'model',key:'m2',calls:19,success_rate:0.5,ttft_ms:{p50:100,p90:200,p95:300,n:19},tps:{p50:10,p90:20,p95:30,n:19}}
]};
test('measured AI columns come from Report public model rows with Shared words and a dash when absent',()=>{
 const f=structuredClone(fixture);f.perf=measuredFeed;
 const [models]=build(f,at);
 const get=(id,k)=>models.results.find(r=>r.thing===id&&r.criterion===k);
 assert.equal(get('maker/m1','ttft').value,240);assert.equal(get('maker/m1','tps').value,45.2);assert.equal(get('maker/m1','success').value,0.981);
 assert.equal(get('maker/m1','ttft').source.url,ENDPOINTS.perf);assert.equal(get('maker/m1','ttft').as_of,'2026-11-13T00:00:00.000Z');assert.match(get('maker/m1','ttft').source.label,/30 calls in 30 days/);
 assert.equal(get('maker/m2','ttft'),undefined,'19 calls is under the public floor');
 assert.equal(models.results.filter(r=>r.criterion==='ttft').length,1);
 assert.deepEqual(models.criteria.slice(0,5).map(c=>c.id),['input','output','ttft','tps','success']);
 assert.deepEqual(models.criteria.slice(2,5).map(c=>c.format),['ms','tps','rate']);
 const html=require('../server/views').comparison(models);
 assert.match(html,/240 ms/);assert.match(html,/45\.2 tok\/s/);assert.match(html,/98\.1%/);
 assert.match(html,/<td data-criterion="ttft"><span class="ovm-unknown">—<\/span><\/td>/);assert.match(html,/data-sort="ttft"/);
 assert.match(html,/Measured on OpenVibe\.AI's real traffic; a model shows after 20 calls in 30 days/);
 assert.match(html,/https:\/\/openvibe\.report\/developers/);
 const md=require('../server/views').markdown(models);
 assert.match(md,/- Time to first token p50: 240 ms — 2026-11-13/);assert.match(md,/- Time to first token p50: —/);
});
test('each /ai page answers 200 from stubbed sources, measured columns sit beside prices',async()=>{
 const {createApp}=require('../server/app');const ai=await makeAi();const server=createApp({getData:async()=>data,ai}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const paths=['/ai','/ai/leaderboard','/ai/providers','/ai/models/maker%2Falpha','/ai/compare','/ai/compare/maker%2Falpha-vs-maker%2Fbeta','/ai/method','/ai/feed.xml','/ai/arena','/ai/chat.arena',`/ai/${BMK}`];
  for(const path of paths)assert.equal((await fetch(base+path)).status,200,path);
  const board=await (await fetch(base+'/ai/leaderboard')).text();assert.match(board,/First token p50/);assert.match(board,/Tokens\/s p50/);assert.match(board,/Success/);assert.match(board,/240 ms/);assert.match(board,/45\.2 tok\/s/);assert.match(board,/98\.0%/);assert.match(board,/Price/);assert.match(board,/ovk-table--stack/);
  const model=await (await fetch(base+'/ai/models/maker%2Falpha')).text();assert.match(model,/first token p50/);assert.match(model,/tokens\/s p50/);assert.match(model,/success/);assert.match(model,/240 ms/);assert.match(model,/45\.2 tok\/s/);assert.match(model,/98\.0%/);assert.match(model,/canonical" href="https:\/\/openvibe.compare\/ai\/models\/maker%2Falpha/);
  const feed=await (await fetch(base+'/ai/feed.xml')).text();assert.match(feed,/https:\/\/openvibe.compare\/ai\//);assert.doesNotMatch(feed,/openvibe\.report\/ai/);
  assert.equal((await fetch(base+'/ai/nope')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
test('a source down still answers 200 with words; the pair and old AI URLs 301',async()=>{
 const {createApp}=require('../server/app');const ai=await makeAi({benchDown:true,perfDown:true,marketDown:true});const server=createApp({getData:async()=>data,ai}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const hub=await fetch(base+'/ai');assert.equal(hub.status,200);const hubHtml=await hub.text();assert.match(hubHtml,/OpenVibe.Bench is unavailable/);assert.match(hubHtml,/measured AI performance is unavailable/);
  const board=await fetch(base+'/ai/chat.arena');assert.equal(board.status,200);assert.match(await board.text(),/Bench is unavailable/);
  const model=await fetch(base+'/ai/models/maker%2Falpha');assert.equal(model.status,200);assert.match(await model.text(),/measured AI performance is unavailable/);
  const feed=await fetch(base+'/ai/feed.xml');assert.equal(feed.status,200);
  let r=await fetch(base+'/ai/compare/maker%2Fbeta-vs-maker%2Falpha',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/ai/compare/maker%2Falpha-vs-maker%2Fbeta');
  r=await fetch(base+'/ai/compare?a=maker%2Fbeta&b=maker%2Falpha',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/ai/compare/maker%2Falpha-vs-maker%2Fbeta');
  r=await fetch(base+'/comparisons/ai-models',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/ai');
  r=await fetch(base+'/things/maker%2Fm1',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/ai/models/maker%2Fm1');
 }finally{await new Promise(r=>server.close(r));}
});
test('the sitemap, robots and llms.txt name the Compare AI pages',async()=>{
 const {createApp}=require('../server/app');const ai=await makeAi();const server=createApp({getData:async()=>data,ai}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const sitemap=await (await fetch(base+'/sitemap.xml')).text();for(const path of ['/ai','/ai/leaderboard','/ai/providers','/ai/method','/ai/arena','/ai/models/maker%2Falpha','/ai/chat.arena'])assert(sitemap.includes(`https://openvibe.compare${path}`),path);assert.doesNotMatch(sitemap,/\/comparisons\/ai-models/);assert.doesNotMatch(sitemap,/\/things\/maker%2Fm1/);
  const robots=await (await fetch(base+'/robots.txt')).text();assert.match(robots,/Allow: \/ai/);assert.match(robots,/https:\/\/openvibe\.compare\/sitemap\.xml/);
  const llms=await (await fetch(base+'/llms.txt')).text();assert.match(llms,/https:\/\/openvibe\.compare\/ai/);assert.match(llms,/https:\/\/openvibe\.compare\/ai\/leaderboard/);assert.match(llms,/https:\/\/openvibe\.compare\/ai\/models\/maker%2Falpha/);
 }finally{await new Promise(r=>server.close(r));}
});

test('the public AI pages link to Bench\'s owner page, so a person finds their own evaluations (A16)',async()=>{
 const {createApp}=require('../server/app');const ai=await makeAi();const server=createApp({getData:async()=>data,ai}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const paths=['/ai','/ai/leaderboard','/ai/models/maker%2Falpha','/ai/compare/maker%2Falpha-vs-maker%2Fbeta','/ai/chat.arena',`/ai/${BMK}`];
  for(const path of paths){
   const html=await (await fetch(base+path)).text();
   assert.match(html,/href="https:\/\/bench\.openvibe\.services\/benchmarks\/mine"/,path+' links to the owner page');
   assert.match(html,/Your own benchmarks and runs/,path+' says what the link is');
  }
 }finally{await new Promise(r=>server.close(r));}
});

test('past ten minutes the last good build answers at once while the feeds refresh behind it',async()=>{
 let now=0,hang=false,calls=0;const n=Object.keys(ENDPOINTS).length;
 const get=createData({now:()=>now,fetchImpl:async url=>{calls++;if(hang) return new Promise(()=>{});return {ok:true,json:async()=>fixture[Object.entries(ENDPOINTS).find(([,v])=>v===url)[0]]};}});
 const first=await get();now=600001;hang=true;
 const t0=Date.now();const again=await get();assert.equal(again,first);assert.ok(Date.now()-t0<50);assert.equal(calls,2*n);
 assert.equal(await get(),first);assert.equal(calls,2*n,'one refresh at a time');
});

test('a Bench read past its minute serves the last answer at once and refreshes once behind it',async()=>{
 const {createBenchClient}=require('../server/ai-bench');
 let now=0,calls=0,hang=false;
 const fetchImpl=async()=>{calls++;if(hang) return new Promise(()=>{});return {ok:true,status:200,headers:{get:()=>'application/json'},json:async()=>({kinds:[{id:'codes.patch'}]}),text:async()=>JSON.stringify({kinds:[{id:'codes.patch'}]})};};
 const bench=createBenchClient({fetchImpl,now:()=>now,log:{warn(){},info(){}}});
 const a=await bench.kinds();assert.ok(a&&a.data);assert.equal(a.stale,false);assert.equal(calls,1);
 now=61_000;hang=true;
 const t0=Date.now();const b=await bench.kinds();assert.ok(Date.now()-t0<50);assert.deepEqual(b.data,a.data);assert.equal(b.stale,false);
 await bench.kinds();assert.equal(calls,2,'one refresh per key at a time');
 now=200_000;const c=await bench.kinds();assert.equal(c.stale,true,'older than two minutes reads as stale');
});
