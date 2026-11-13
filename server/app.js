'use strict';
const express=require('express');
const path=require('node:path');
const {createData}=require('./data');
const {createCompute,api:computeApi}=require('./compute');
const computeViews=require('./compute-views');
const {createAi}=require('./ai-data');
const aiViews=require('./ai-views');
const v=require('./views');
const origins=new Set(require('./origins.json'));
const {createSsoClient}=require('openvibe-sdk/sso');
const PUBLIC_URL=String(process.env.OV_PUBLIC_URL||'https://openvibe.compare').replace(/\/+$/,'');
// Sign-in (plan 16a, 11-13): Compare's own, through OpenVibe.Network (openvibe-sdk/sso, the `compare` client). Votes,
// "for your task" and the Arena move here next; until then a signed-in person is only shown as such.
function defaultSso(){
 return createSsoClient({site:'compare',baseUrl:PUBLIC_URL,clientId:process.env.OV_OAUTH_CLIENT_ID||'compare',clientSecret:process.env.OV_OAUTH_CLIENT_SECRET||'',
   networkUrl:process.env.OV_NETWORK_PUBLIC_URL||'https://openvibe.network',networkInternalUrl:process.env.OV_NETWORK_INTERNAL_URL||undefined,secureCookies:/^https:/.test(PUBLIC_URL)});
}
// bench: Bench's Express app when Compare carries Bench (server/bench-mount.js, plan §X step 2b): it answers every
// path Compare's own routes do not (its API, MCP, battles, imports, renders), before Compare's 404. benchHost: Bench's
// own host (bench.openvibe.services): a request for it is Bench's whole, so its 301s to Compare and its internal routes
// answer as before and Compare's pages never appear under Bench's name.
function createApp({getData=createData(),getCompute=createCompute(),ai=createAi(),sso=null,bench=null,benchHost=null}={}) {
 const app=express();app.disable('x-powered-by');
 if(bench&&benchHost) app.use((req,res,next)=>String(req.headers.host||'').split(':')[0].toLowerCase()===benchHost?bench(req,res,next):next());
 app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','strict-origin-when-cross-origin');next();});
 app.use(express.static(path.join(__dirname,'../public')));
 app.use('/shared',require('openvibe-shared/serve').handler());
 app.get('/api/health',(_q,r)=>r.json({status:'ok',service:'compare'}));
 app.get('/api/ready',(_q,r)=>r.json({status:'ok',service:'compare'}));
 // /auth/login, /callback, /fedcm, /logout, /me, /refresh; req.user on every later route.
 const auth=sso||defaultSso();
 app.use('/auth',auth.router(express));
 app.use(auth.optionalAuth());
 app.use(require('./arena').createArenaRoutes({page:(title,body,path)=>v.page(title,body,path,[],{robots:'noindex, nofollow',description:'Two anonymous AI answers to one prompt: pick the better one, then see which models wrote them.'}),baseUrl:PUBLIC_URL}));
 app.get('/release.json',(_q,r)=>r.json(require('openvibe-shared/release').createRelease({service:'compare',root:path.join(__dirname,'..')})));
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 // CORS for Compare's own read-only API only: Bench's API (mounted below) answers its own preflights and methods.
 app.use(['/api/v1/compute','/api/v1/comparisons'],(req,res,next)=>{
   const origin=req.get('Origin');
   if(origin && origins.has(origin)) res.set('Access-Control-Allow-Origin',origin);
   res.vary('Origin');res.set('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
   if(req.method==='OPTIONS')return res.sendStatus(204);next();
 });
 app.get('/api/v1/compute',wrap(async(req,res)=>res.json(computeApi(await getCompute()))));
 app.get('/api/v1/comparisons',wrap(async(req,res)=>res.json({comparisons:await getData()})));
 app.get('/api/v1/comparisons/:slug',wrap(async(req,res)=>{const c=(await getData()).find(c=>c.slug===req.params.slug);return c?res.json(c):res.status(404).json({error:'comparison.not_found'});}));
 app.get('/robots.txt',(_q,r)=>r.type('text').send('User-agent: *\nAllow: /\nAllow: /ai\nSitemap: https://openvibe.compare/sitemap.xml\n'));
 app.get('/llms.txt',wrap(async(_q,r)=>{const [cs,compute,aiData]=await Promise.all([getData(),getCompute(),ai.comparison()]);return r.type('text').send('# OpenVibe.Compare\n\nDated comparisons. Missing evidence is not zero.\n\n'+`- [Compute prices](https://openvibe.compare/compute): GPUs and computers from OpenVibe.Exchange, per hour, per GPU GB-hour and per month at 24/7${compute.checked_at?`; checked ${compute.checked_at.slice(0,10)}`:''}.\n`+`- [AI model leaderboard](https://openvibe.compare/ai): ratings from blind votes, provider prices and measured speed.\n- [AI leaderboard](https://openvibe.compare/ai/leaderboard): every model with filters and sorts.\n- [AI providers](https://openvibe.compare/ai/providers): every provider offer with price, reply time, errors and uptime.\n- [AI method](https://openvibe.compare/ai/method): how a score, a cost and a speed are made.\n- [Harness effects](https://openvibe.compare/ai/harnesses): each harness's Elo effect apart from its model, with an interval.\n- [Harness × model matrix](https://openvibe.compare/ai/matrix): every agent as its harness and model, with interactions.\n- [AI results feed](https://openvibe.compare/ai/feed.xml): new public Bench runs as RSS.\n`+aiData.rows.map(c=>`- [${c.id}](https://openvibe.compare/ai/models/${encodeURIComponent(c.id)}): rating, prices and measured speed.`).join('\n')+'\n'+cs.map(c=>`- [${c.title}](https://openvibe.compare${c.slug==='ai-models'?'/ai':`/comparisons/${c.slug}`}): ${c.summary}`).join('\n')+'\n\nJSON: https://openvibe.compare/api/v1/comparisons\nCompute JSON: https://openvibe.compare/api/v1/compute\nEach page also accepts Accept: text/markdown.\n')}));
 app.get('/sitemap.xml',wrap(async(_q,r)=>{
   const [cs,compute,aiData]=await Promise.all([getData(),getCompute(),ai.comparison()]);const newest=cs.map(c=>c.updated_at).sort().at(-1);const paths=new Map([['/',newest],['/compute',compute.checked_at||newest],['/ai',aiData.updated_at],['/ai/leaderboard',aiData.updated_at],['/ai/providers',aiData.updated_at],['/ai/method',aiData.updated_at],['/ai/harnesses',aiData.updated_at],['/ai/matrix',aiData.updated_at],['/arena',aiData.updated_at]]);
   for(const c of cs){if(c.slug==='ai-models')continue;paths.set(`/comparisons/${c.slug}`,c.updated_at);for(const t of c.things)paths.set(v.thingPath(t.id),c.updated_at);}
   for(const row of aiData.rows)paths.set(`/ai/models/${encodeURIComponent(row.id)}`,row.source&&row.source.date||aiData.updated_at);
   for(const task of aiData.tasks)paths.set(`/ai/${encodeURIComponent(task.id)}`,aiData.updated_at);
   r.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...paths].map(([p,d])=>`<url><loc>https://openvibe.compare${v.esc(p)}</loc><lastmod>${v.esc(d)}</lastmod></url>`).join('')+'</urlset>');
 }));
 app.get('/',wrap(async(req,res)=>{
   const [all,compute]=await Promise.all([getData(),getCompute()]);res.vary('Accept');
   if(req.accepts(['html','text/markdown'])==='text/markdown')return res.type('text/markdown').send('# Compare anything\n\n- [Compute prices](/compute): GPUs and computers from OpenVibe.Exchange, per hour, per GPU GB-hour and per month.\n- [AI model leaderboard](/ai): ratings from blind votes, provider prices and measured speed.\n'+all.map(c=>`- [${c.title}](${c.slug==='ai-models'?'/ai':`/comparisons/${c.slug}`}): ${c.summary}`).join('\n'));
   res.send(v.page('Compare anything',v.home(all,compute,String(req.query.q||'').slice(0,120),String(req.query.task||'balanced'),String(req.query.budget||'').slice(0,20))));
 }));
 app.get('/compute',wrap(async(req,res)=>{const compute=await getCompute();res.vary('Accept');if(req.accepts(['html','text/markdown'])==='text/markdown')return res.type('text/markdown').send(computeViews.markdown(compute,req.query));res.send(v.page('Compute prices',computeViews.body(compute,req.query),'/compute',[computeViews.jsonLd(compute)]));}));
 app.get('/ai',wrap(async(_q,r)=>r.send(aiViews.hub(await ai.comparison()))));
 app.get('/ai/leaderboard',wrap(async(req,res)=>res.send(aiViews.leaderboard(await ai.leaderboard(req.query)))));
 app.get('/ai/providers',wrap(async(_q,r)=>{const data=await ai.comparison();return r.send(aiViews.providers(data));}));
 app.get('/ai/harnesses',wrap(async(req,res)=>res.send(aiViews.harnesses(await ai.factorBoard(req.query)))));
 app.get('/ai/matrix',wrap(async(req,res)=>res.send(aiViews.matrix(await ai.factorBoard(req.query)))));
 // The Arena lives at /arena (plan §V.2, 11-13); the old explainer's address goes there.
 app.get('/ai/arena',(_q,r)=>r.redirect(301,'/arena'));
 app.get('/ai/compare',wrap(async(req,res)=>{
   // The picker sends a and b; older links send models=a,b.
   const picked=[req.query.a,req.query.b].map(x=>String(x||'').trim()).filter(Boolean);
   const models=picked.length?picked:String(req.query.models||'').split(',').map(x=>x.trim()).filter(Boolean);
   if(models.length===2){const ordered=[...models].sort();return res.redirect(301,`/ai/compare/${encodeURIComponent(ordered[0])}-vs-${encodeURIComponent(ordered[1])}`);}
   return res.send(aiViews.compare(await ai.compare(models.slice(0,3))));
 }));
 app.get('/ai/compare/:pair',wrap(async(req,res)=>{
   const match=String(req.params.pair).match(/^(.+)-vs-(.+)$/);
   if(!match)return res.sendStatus(404);
   const ordered=[decodeURIComponent(match[1]),decodeURIComponent(match[2])].sort();
   const canonical=`/ai/compare/${encodeURIComponent(ordered[0])}-vs-${encodeURIComponent(ordered[1])}`;
   if(req.path!==canonical)return res.redirect(301,canonical);
   return res.send(aiViews.compare(await ai.compare(ordered)));
 }));
 app.get('/ai/models/:model',wrap(async(req,res)=>{const data=await ai.modelPage(req.params.model);if(!data)return res.sendStatus(404);return res.send(aiViews.model(data));}));
 app.get('/ai/method',wrap(async(req,res)=>res.send(aiViews.methodPage(await ai.method()))));
 app.get('/ai/feed.xml',wrap(async(req,res)=>{const feed=await ai.feed();res.status(200).set('Cache-Control','public, max-age=120').type('application/rss+xml; charset=utf-8').send(aiViews.rss(feed));}));
 app.get('/ai/:ref',wrap(async(req,res)=>{const ref=String(req.params.ref||'');const bench=ai.isBenchmarkId(ref);const data=bench?await ai.benchmarkPage(ref):await ai.kindBoard(ref,ai.normaliseTab(req.query.tab));if(!data)return res.sendStatus(404);return res.send(bench?aiViews.benchmarkPage(data):aiViews.boardPage(data));}));
 app.get('/comparisons/ai-models',(_q,r)=>r.redirect(301,'/ai'));
 app.get('/comparisons/:slug',wrap(async(req,res)=>{
   const c=(await getData()).find(c=>c.slug===req.params.slug);if(!c)return res.sendStatus(404);res.vary('Accept');
   if(req.accepts(['html','text/markdown'])==='text/markdown')return res.type('text/markdown').send(v.markdown(c));
   const weights=Object.fromEntries(c.criteria.filter(k=>req.query[`w.${k.id}`]!==undefined).map(k=>[k.id,req.query[`w.${k.id}`]]));
   res.send(v.page(c.title,v.comparison(c,weights),req.path,[{'@context':'https://schema.org','@type':'Dataset',name:c.title,description:c.summary,url:`https://openvibe.compare${req.path}`,dateModified:c.updated_at,creator:{'@type':'Organization',name:'OpenVibe'},distribution:{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:`https://openvibe.compare/api/v1/comparisons/${c.slug}`}}]));
 }));
 app.get('/models/:org/:model',(req,res)=>res.redirect(301,`/ai/models/${encodeURIComponent(`${req.params.org}/${req.params.model}`)}`));
 app.get('/things/:id',wrap(async(req,res)=>{
   const all=await getData();
   const aiModels=all.find(c=>c.slug==='ai-models');
   if(aiModels && aiModels.things.some(t=>t.id===req.params.id))return res.redirect(301,`/ai/models/${encodeURIComponent(req.params.id)}`);
   const cs=all.filter(c=>c.things.some(t=>t.id===req.params.id));if(!cs.length)return res.sendStatus(404);
   const t=cs[0].things.find(t=>t.id===req.params.id);res.vary('Accept');
   if(req.accepts(['html','text/markdown'])==='text/markdown')return res.type('text/markdown').send(cs.map(c=>v.markdown({...c,things:[t]})).join('\n'));
   res.send(v.page(t.name,`<h1>${v.esc(t.name)}</h1><p>${v.esc(t.maker)}</p><a href="${v.esc(t.url)}">Original listing</a>${cs.map(c=>`<h2><a href="/comparisons/${c.slug}">${v.esc(c.title)}</a></h2><dl>${c.criteria.map(k=>`<dt>${v.esc(k.label)} (${v.esc(k.unit)})</dt><dd>${v.number(c.results.find(r=>r.thing===t.id && r.criterion===k.id),k)}</dd>`).join('')}</dl><p>${v.esc(c.method)}</p>`).join('')}`,req.path));
 }));
 if(bench) app.use(bench);
 app.use((_q,r)=>r.status(404).send('Not found'));
 app.use((_e,_q,r,_n)=>r.status(503).json({error:'compare.unavailable'}));
 return app;
}
module.exports={createApp};
