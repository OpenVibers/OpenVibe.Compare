'use strict';
const ENDPOINTS = {
 market: 'https://api.openvibe.exchange/api/v1/exchange/market',
 quality: 'https://bench.openvibe.services/api/v1/boards/chat.arena',
 runs: 'https://bench.openvibe.services/api/v1/runs?kind=codes.patch&limit=100',
 harnesses: 'https://openvibe.codes/api/v1/harnesses',
 plans: 'https://billing.openvibe.network/api/v1/plans',
};
const METHOD = 'Weights use min–max normalization within this comparison (higher or lower as labelled), then a weighted mean on a 0–100 scale. Equal values receive 50. Criteria with no measurements are excluded. A thing missing any selected, measured criterion is unranked; missing is never zero. All-zero weights give no ranking. Scores express these preferences, not statistical significance. Dates are source dates or explicitly labelled observation dates. No costs or benchmark results are estimated. Different benchmark versions are separate criteria. Builder and version history are reserved for a later release.';
const criterion = (id,label,unit,better,weight,group) => ({id,label,unit,better,weight,group});
const date = v => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
function result(c, thing, key, value, at, label, url) {
 if (typeof value !== 'number' || !Number.isFinite(value) || !date(at) || !/^https:\/\//.test(url || '')) return;
 c.results.push({thing,criterion:key,value,as_of:date(at),source:{label,url}});
}
function base(slug,title,kind,summary,at) {
 return {slug,title,kind,summary,things:[],criteria:[],results:[],method:METHOD,sources:[],updated_at:at,versions:[],availability:[]};
}
function build(feeds, at) {
 const models=base('ai-models','AI models','ai.models','Provider prices and measured Bench results. Unmeasured quality stays unknown.',at);
 models.criteria=[criterion('input','Input price','USD / 1M tokens','lower',40,'Price'),criterion('output','Output price','USD / 1M tokens','lower',40,'Price'),criterion('quality','Arena quality','Elo','higher',20,'Quality'),criterion('speed','Median response time','ms','lower',0,'Speed')];
 const offers=new Map();
 for(const o of feeds.market?.offers || []) {
   if(o.kind !== 'chat' || !o.model || o.price?.currency !== 'USD' || o.price?.per !== '1M tokens' || typeof o.price.in !== 'number' || typeof o.price.out !== 'number' || !date(o.price_checked_at) || !/^https:\/\//.test(o.price_source || '')) continue;
   const prior=offers.get(o.model);
   if(!prior || o.price.in+o.price.out < prior.price.in+prior.price.out) offers.set(o.model,o);
 }
 for(const [id,o] of offers) {
   models.things.push({id,name:o.name || id,maker:o.maker || id.split('/')[0],url:`https://openvibe.exchange/models/${id}`,icon:'model'});
   result(models,id,'input',o.price.in,o.price_checked_at,`${o.provider_name} price book`,o.price_source);
   result(models,id,'output',o.price.out,o.price_checked_at,`${o.provider_name} price book`,o.price_source);
   // Exact identity only: fuzzy joins can silently compare a different model revision.
   const q=(feeds.quality?.board?.rows || []).find(r => r.model === id || r.subject === id);
   if(q && q.games >= 10) {
     result(models,id,'quality',Number(q.elo),q.updated_at || at,'Bench chat.arena; observation date when source date is absent',ENDPOINTS.quality);
     result(models,id,'speed',q.median_ms == null ? null : Number(q.median_ms),q.updated_at || at,'Bench chat.arena median total response time; observation date when absent',ENDPOINTS.quality);
   }
 }
 models.method += ' Prices use the cheapest dated offer by input + output price; both prices come from that same provider. Arena quality requires at least ten judged games and exact model identity. Speed is total response time, not tokens per second.';
 const agents=base('coding-agents','AI coding agents','ai.coding-agents','Coding harnesses from Codes, with verified public Bench runs where available.',at);
 const hs=feeds.harnesses?.harnesses || [];
 agents.things=hs.map(h => ({id:h.id,name:h.name,maker:h.provider,url:`https://openvibe.codes/harnesses/${encodeURIComponent(h.id)}`,icon:'code'}));
 agents.criteria=[];
 const seen=new Set();
 for(const r of feeds.runs?.runs || []) {
   const id=r.harness?.id || r.harness?.name;
   if(r.provenance !== 'verified' || !agents.things.some(t=>t.id===id) || !r.benchmark || !date(r.created_at)) continue;
   const key=`score:${r.benchmark}:${r.harness?.version || 'unspecified'}:${r.model?.id || r.model}`;
   if(seen.has(`${id}:${key}`)) continue;
   seen.add(`${id}:${key}`);
   if(!agents.criteria.some(c=>c.id===key)) agents.criteria.push(criterion(key,`${r.benchmark} · ${r.model?.id || r.model}`,'score','higher',1,'Verified runs'));
   result(agents,id,key,typeof r.score==='number'?r.score:r.score?.value,r.created_at,'Bench verified run',`https://bench.openvibe.services/api/v1/runs/${encodeURIComponent(r.id)}`);
 }
 if(!agents.criteria.length) agents.criteria=[criterion('verified-score','Verified benchmark score','score','higher',1,'Quality')];
 agents.method += ' Only verified public codes.patch runs are eligible. Benchmark, harness version and model form separate criteria; newest run per cohort is shown. Harness configuration prices are not product prices and are not used.';
 const plans=base('openvibe-plans','OpenVibe plans','openvibe.plans','Published Billing offers. Packages and memberships have separate units and are not ranked together.',at);
 plans.criteria=[criterion('package-price','Package price','USD / purchase','lower',1,'Packages'),criterion('vibes','Package Vibes','Vibes / purchase','higher',1,'Packages'),criterion('membership-price','Membership price','USD / period','lower',0,'Membership'),criterion('period','Membership period','days','higher',0,'Membership')];
 for(const p of feeds.plans?.plans || []) {
   plans.things.push({id:p.id,name:p.name,maker:'OpenVibe',url:p.url,icon:'wallet'});
   const label='Billing public plan list; observed at source response date';
   if(p.kind==='package') { result(plans,p.id,'package-price',p.price_cents/100,p.as_of,label,ENDPOINTS.plans); result(plans,p.id,'vibes',p.vibes,p.as_of,label,ENDPOINTS.plans); }
   if(p.kind==='membership') {result(plans,p.id,'membership-price',p.price_cents/100,p.as_of,label,ENDPOINTS.plans);result(plans,p.id,'period',p.period_days,p.as_of,label,ENDPOINTS.plans);}
 }
 for(const [c,names] of [[models,['market','quality']],[agents,['runs','harnesses']],[plans,['plans']]]) {
   c.sources=names.map(n=>({label:n,url:ENDPOINTS[n]}));
   c.availability=names.filter(n=>!feeds[n]).map(n=>`${n} is unavailable; no values have been filled in.`);
   c.updated_at=c.results.length ? c.results.map(r=>r.as_of).sort().at(-1) : at;
 }
 return [models,agents,plans];
}
function createData({fetchImpl=fetch,now=Date.now,ttl=600000}={}) {
 let cached, expires=0, pending;
 return async function get() {
   if(cached && now()<expires) return cached;
   if(pending) return pending;
   pending=(async()=>{
     const feeds={};
     await Promise.all(Object.entries(ENDPOINTS).map(async([key,url])=>{
       try {const r=await fetchImpl(url,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});if(!r.ok) throw Error('upstream');feeds[key]=await r.json();} catch {feeds[key]=null;}
     }));
     cached=build(feeds,new Date(now()).toISOString()); expires=now()+ttl; return cached;
   })().finally(()=>{pending=null;});
   return pending;
 };
}
module.exports={build,createData,ENDPOINTS};
