'use strict';
// Bench over loopback when it runs in Compare's process (OV_BENCH_INTERNAL_URL, plan §X step 2c), else its public host.
const BENCH = String(process.env.OV_BENCH_INTERNAL_URL || 'https://bench.openvibe.services').replace(/\/+$/, '');
const ENDPOINTS = {
 market: 'https://api.openvibe.exchange/api/v1/exchange/market',
 quality: `${BENCH}/api/v1/boards/chat.arena`,
 runs: `${BENCH}/api/v1/runs?kind=codes.patch&limit=100`,
 tickets: `${BENCH}/api/v1/runs?kind=codes.ticket&limit=100`,
 harnesses: 'https://openvibe.codes/api/v1/harnesses',
 plans: 'https://billing.openvibe.network/api/v1/plans',
 perf: 'https://openvibe.report/api/v1/ai/performance?group=model&days=30',
};
// Report is one call of several: a slow answer must not hold the whole page.
const TIMEOUT_MS = {perf: 3000};
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
// Report's public model rows are grouped by the model's own name (provider/model in Compare's price book), with a
// floor of 20 calls. The match is exact: the full id first, then the offer's provider model name.
function measuredRows(feed) {
 const rows=new Map();
 for(const r of feed?.rows || []) {
   if(!r || typeof r.key!=='string' || !r.key || !(Number(r.calls)>=20)) continue;
   rows.set(r.key,r);
 }
 return rows;
}
function measuredOf(rows,id,o) {
 return rows.get(id) || (o.provider_model ? rows.get(o.provider_model) : null) || (o.model ? rows.get(o.model) : null) || null;
}
function build(feeds, at) {
 const models=base('ai-models','AI models','ai.models','Provider prices and measured Bench results. Unmeasured quality stays unknown.',at);
 models.criteria=[criterion('input','Input price','USD / 1M tokens','lower',40,'Price'),criterion('output','Output price','USD / 1M tokens','lower',40,'Price'),
  {...criterion('ttft','Time to first token p50','ms','lower',0,'Measured'),format:'ms'},
  {...criterion('tps','Tokens per second p50','tok/s','higher',0,'Measured'),format:'tps'},
  {...criterion('success','Success rate','%','higher',0,'Measured'),format:'rate'},
  criterion('quality','Arena quality','Elo','higher',20,'Quality'),criterion('speed','Median response time','ms','lower',0,'Speed')];
 const perf=measuredRows(feeds.perf);
 const perfAt=date(feeds.perf?.range?.to ? `${feeds.perf.range.to}T00:00:00.000Z` : at) || at;
 const offers=new Map();
 for(const o of feeds.market?.offers || []) {
   if(o.kind !== 'chat' || !o.model || o.price?.currency !== 'USD' || o.price?.per !== '1M tokens' || typeof o.price.in !== 'number' || typeof o.price.out !== 'number' || !date(o.price_checked_at) || !/^https:\/\//.test(o.price_source || '')) continue;
   const prior=offers.get(o.model);
   if(!prior || o.price.in+o.price.out < prior.price.in+prior.price.out) offers.set(o.model,o);
 }
 for(const [id,o] of offers) {
   models.things.push({id,name:o.name || id,maker:o.maker || id.split('/')[0],url:o.price_source,icon:'model'});
   result(models,id,'input',o.price.in,o.price_checked_at,`${o.provider_name} price book`,o.price_source);
   result(models,id,'output',o.price.out,o.price_checked_at,`${o.provider_name} price book`,o.price_source);
   const m=measuredOf(perf,id,o);
   if(m) {
     const seenAt=date(m.range?.to ? `${m.range.to}T00:00:00.000Z` : perfAt);
     const label=`Report AI performance; ${Number(m.calls).toLocaleString('en-US')} calls in 30 days`;
     result(models,id,'ttft',m.ttft_ms?.p50,seenAt,label,ENDPOINTS.perf);
     result(models,id,'tps',m.tps?.p50,seenAt,label,ENDPOINTS.perf);
     result(models,id,'success',m.success_rate,seenAt,label,ENDPOINTS.perf);
   }
   // Exact identity only: fuzzy joins can silently compare a different model revision.
   const q=(feeds.quality?.board?.rows || []).find(r => r.model === id || r.subject === id);
   if(q && q.games >= 10) {
     result(models,id,'quality',q.elo == null ? null : Number(q.elo),q.updated_at || at,'Bench chat.arena; observation date when source date is absent',ENDPOINTS.quality);
     result(models,id,'speed',q.median_ms == null ? null : Number(q.median_ms),q.updated_at || at,'Bench chat.arena median total response time; observation date when absent',ENDPOINTS.quality);
   }
 }
 models.method += ' Prices use the cheapest dated offer by input + output price; both prices come from that same provider. Arena quality requires at least ten judged games and exact model identity. Speed is total response time, not tokens per second. The three measured columns are Report\'s public model rows over 30 days, matched by the model’s full id or its provider model name: time to first token p50, output tokens per second after the first token p50, and success rate. Report groups by model name across providers, so they describe the model, not this provider\'s serving of it. A model with fewer than 20 calls in 30 days, or with Report unavailable, shows a dash; nothing is estimated.';
 const agents=base('coding-agents','AI coding agents','ai.coding-agents','Coding harnesses from Codes, with verified public Bench runs where available.',at);
 const hs=feeds.harnesses?.harnesses || [];
 agents.things=hs.map(h => ({id:h.id,name:h.name,maker:h.provider,url:`https://openvibe.codes/harnesses#${encodeURIComponent(h.id)}`,icon:'code'}));
 agents.criteria=[];
 const seen=new Set();
 for(const r of [...(feeds.runs?.runs || []),...(feeds.tickets?.runs || [])].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))) {
   const id=r.harness?.id || r.harness?.name;
   if(r.provenance !== 'verified' || !agents.things.some(t=>t.id===id) || !r.benchmark || !date(r.created_at)) continue;
   const key=`score:${r.benchmark}:${r.model?.id || r.model}`;
   if(seen.has(`${id}:${key}`)) continue;
   seen.add(`${id}:${key}`);
   if(!agents.criteria.some(c=>c.id===key)) agents.criteria.push(criterion(key,`${r.benchmark} · ${r.model?.id || r.model}`,'score','higher',1,'Verified runs'));
   result(agents,id,key,typeof r.score==='number'?r.score:r.score?.value,r.created_at,`Bench verified run; ${id} ${r.harness?.version || 'version unspecified'}`,`https://bench.openvibe.services/api/v1/runs/${encodeURIComponent(r.id)}`);
 }
 if(!agents.criteria.length) agents.criteria=[criterion('verified-score','Verified benchmark score','score','higher',1,'Quality')];
 agents.method += ' Only the latest hundred public runs from each of codes.patch and codes.ticket are read; only verified runs are eligible. Benchmark version and model form separate criteria; newest verified run per harness and cohort is shown, with the harness version in its source label. Harness configuration prices are not product prices and are not used.';
 const plans=base('openvibe-plans','OpenVibe plans','openvibe.plans','Published Billing offers. Packages and memberships have separate units and are not ranked together.',at);
 plans.criteria=[criterion('package-price','Package price','USD / purchase','lower',1,'Packages'),criterion('vibes','Package Vibes','Vibes / purchase','higher',1,'Packages'),criterion('membership-price','Membership price','USD / period','lower',0,'Membership'),criterion('period','Membership period','days','higher',0,'Membership')];
 for(const p of feeds.plans?.plans || []) {
   plans.things.push({id:p.id,name:p.name,maker:'OpenVibe',url:p.url,icon:'wallet'});
   const label='Billing public plan list; observed at source response date';
   if(p.kind==='package') { result(plans,p.id,'package-price',p.price_cents/100,p.as_of,label,ENDPOINTS.plans); result(plans,p.id,'vibes',p.vibes,p.as_of,label,ENDPOINTS.plans); }
   if(p.kind==='membership') {result(plans,p.id,'membership-price',p.price_cents/100,p.as_of,label,ENDPOINTS.plans);result(plans,p.id,'period',p.period_days,p.as_of,label,ENDPOINTS.plans);}
 }
 for(const [c,names] of [[models,['market','quality','perf']],[agents,['runs','tickets','harnesses']],[plans,['plans']]]) {
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
   // Stale while revalidating (11-13): past the ten minutes, the last good build answers at once and the feeds refresh
   // behind it. A visitor never waits on the upstream timeouts (a page took 11 s when Bench was slow to answer).
   if(pending) return cached || pending;
   pending=(async()=>{
     const feeds={};
     await Promise.all(Object.entries(ENDPOINTS).map(async([key,url])=>{
       try {const r=await fetchImpl(url,{signal:AbortSignal.timeout(TIMEOUT_MS[key]||8000),headers:{Accept:'application/json'}});if(!r.ok) throw Error('upstream');feeds[key]=await r.json();} catch {feeds[key]=null;}
     }));
     cached=build(feeds,new Date(now()).toISOString()); expires=now()+ttl; return cached;
   })().finally(()=>{pending=null;});
   if(cached) { pending.catch(()=>{}); return cached; }
   return pending;
 };
}
module.exports={build,createData,ENDPOINTS,measuredRows,measuredOf};
