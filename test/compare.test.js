'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build,createData,ENDPOINTS}=require('../server/data');
const {rank}=require('../public/rank');
const at='2026-11-10T00:00:00.000Z';
const fixture={market:{offers:[1,2,3].map(n=>({model:`maker/m${n}`,name:`Model ${n}`,kind:'chat',price:{in:n,out:n*2,currency:'USD',per:'1M tokens'},price_source:'https://example.com/prices',price_checked_at:at}))},harnesses:{harnesses:[{id:'codex',name:'Codex',provider:'openai'}]},runs:{runs:[]},plans:{plans:[]},quality:{board:{rows:[]}}};
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
 const {createApp}=require('../server/app');const server=createApp({getData:async()=>data}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  let r=await fetch(base+'/api/v1/comparisons',{headers:{Origin:'https://openvibe.network'}});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'https://openvibe.network');assert.equal((await r.json()).comparisons.length,3);
  r=await fetch(base+'/api/v1/comparisons',{headers:{Origin:'https://openvibe.network.evil.com'}});assert.equal(r.headers.get('access-control-allow-origin'),null);
  const html=await (await fetch(base+'/comparisons/ai-models?w.input=0')).text();assert.match(html,/phone-cards/);assert.match(html,/desktop-table/);assert.match(html,/<table/);assert.match(html,/value="0" data-weight="input"/);assert.match(html,/Dataset/);assert.match(html,/dateModified/);assert.match(html,/2026-11-10/);assert.match(html,/https:\/\/example.com\/prices/);
  const md=await (await fetch(base+'/comparisons/ai-models',{headers:{Accept:'text/markdown'}})).text();assert.match(md,/# AI models/);assert.match(md,/2026-11-10.*example.com/);
  for(const url of ['/','/things/maker%2Fm1','/llms.txt','/sitemap.xml','/robots.txt','/api/v1/comparisons/ai-models'])assert.equal((await fetch(base+url)).status,200,url);
  const thing=await (await fetch(base+'/things/maker%2Fm1')).text();assert.match(thing,/<details class="evidence">/);assert.match(thing,/example.com\/prices/);
  assert.equal((await fetch(base+'/api/v1/comparisons/nope')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
test('upstream adapters preserve cohorts, observation dates and unknown quality',()=>{
 const f=structuredClone(fixture);f.quality.board.rows=[{model:'maker/m1',games:10,elo:null,median_ms:12}];
 f.runs.runs=[{id:'run-a',benchmark:'patch@1',harness:{id:'codex',version:'1.2'},model:'model-a',score:70,created_at:at,provenance:'verified'},{id:'run-b',benchmark:'patch@1',harness:{id:'codex',version:'1.2'},model:'model-a',score:90,created_at:at,provenance:'submitted'}];
 f.plans.plans=[{id:'vibes-100',name:'100 Vibes',kind:'package',vibes:100,price_cents:150,as_of:at,url:'https://openvibe.network/vibes'},{id:'membership',name:'Membership',kind:'membership',price_cents:499,period_days:30,as_of:at,url:'https://openvibe.vip'}];
 const [models,agents,plans]=build(f,at);assert(!models.results.some(r=>r.criterion==='quality'));assert.equal(models.results.find(r=>r.criterion==='speed').value,12);assert.equal(agents.results.length,1);assert.equal(agents.results[0].value,70);assert.equal(agents.results[0].as_of,at);assert.match(agents.results[0].source.label,/1.2/);assert.equal(plans.results.find(r=>r.criterion==='package-price').value,1.5);assert.equal(plans.results.find(r=>r.criterion==='membership-price').value,4.99);
});
