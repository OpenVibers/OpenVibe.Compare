'use strict';
const express=require('express');
const path=require('node:path');
const {createData}=require('./data');
const {createCompute,api:computeApi}=require('./compute');
const computeViews=require('./compute-views');
const v=require('./views');
const origins=new Set(require('./origins.json')); 
function createApp({getData=createData(),getCompute=createCompute()}={}) {
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','strict-origin-when-cross-origin');next();});
 app.use(express.static(path.join(__dirname,'../public')));
 app.use('/shared',require('openvibe-shared/serve').handler());
 app.get('/api/health',(_q,r)=>r.json({status:'ok',service:'compare'}));
 app.get('/api/ready',(_q,r)=>r.json({status:'ok',service:'compare'}));
 app.get('/release.json',(_q,r)=>r.json(require('openvibe-shared/release').createRelease({service:'compare',root:path.join(__dirname,'..')})));
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 app.use('/api/v1',(req,res,next)=>{
   const origin=req.get('Origin');
   if(origin && origins.has(origin)) res.set('Access-Control-Allow-Origin',origin);
   res.vary('Origin');res.set('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
   if(req.method==='OPTIONS')return res.sendStatus(204);next();
 });
 app.get('/api/v1/compute',wrap(async(req,res)=>res.json(computeApi(await getCompute()))));
 app.get('/api/v1/comparisons',wrap(async(req,res)=>res.json({comparisons:await getData()})));
 app.get('/api/v1/comparisons/:slug',wrap(async(req,res)=>{const c=(await getData()).find(c=>c.slug===req.params.slug);return c?res.json(c):res.status(404).json({error:'comparison.not_found'});}));
 app.get('/robots.txt',(_q,r)=>r.type('text').send('User-agent: *\nAllow: /\nSitemap: https://openvibe.compare/sitemap.xml\n'));
 app.get('/llms.txt',wrap(async(_q,r)=>{const [cs,compute]=await Promise.all([getData(),getCompute()]);return r.type('text').send('# OpenVibe.Compare\n\nDated comparisons. Missing evidence is not zero.\n\n'+`- [Compute prices](https://openvibe.compare/compute): GPUs and computers from OpenVibe.Exchange, per hour, per GPU GB-hour and per month at 24/7${compute.checked_at?`; checked ${compute.checked_at.slice(0,10)}`:''}.\n`+cs.map(c=>`- [${c.title}](https://openvibe.compare/comparisons/${c.slug}): ${c.summary}`).join('\n')+'\n\nJSON: https://openvibe.compare/api/v1/comparisons\nCompute JSON: https://openvibe.compare/api/v1/compute\nEach page also accepts Accept: text/markdown.\n')}));
 app.get('/sitemap.xml',wrap(async(_q,r)=>{
   const [cs,compute]=await Promise.all([getData(),getCompute()]);const newest=cs.map(c=>c.updated_at).sort().at(-1);const paths=new Map([['/',newest],['/compute',compute.checked_at||newest]]);
   for(const c of cs){paths.set(`/comparisons/${c.slug}`,c.updated_at);for(const t of c.things)paths.set(v.thingPath(t.id),c.updated_at);}
   r.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...paths].map(([p,d])=>`<url><loc>https://openvibe.compare${v.esc(p)}</loc><lastmod>${v.esc(d)}</lastmod></url>`).join('')+'</urlset>');
 }));
 app.get('/',wrap(async(req,res)=>{
   const [all,compute]=await Promise.all([getData(),getCompute()]);res.vary('Accept');
   if(req.accepts(['html','text/markdown'])==='text/markdown')return res.type('text/markdown').send('# Compare anything\n\n- [Compute prices](/compute): GPUs and computers from OpenVibe.Exchange, per hour, per GPU GB-hour and per month.\n'+all.map(c=>`- [${c.title}](/comparisons/${c.slug}): ${c.summary}`).join('\n'));
   res.send(v.page('Compare anything',v.home(all,compute,String(req.query.q||'').slice(0,120),String(req.query.task||'balanced'),String(req.query.budget||'').slice(0,20))));
 }));
 app.get('/compute',wrap(async(req,res)=>{const compute=await getCompute();res.vary('Accept');if(req.accepts(['html','text/markdown'])==='text/markdown')return res.type('text/markdown').send(computeViews.markdown(compute,req.query));res.send(v.page('Compute prices',computeViews.body(compute,req.query),'/compute',[computeViews.jsonLd(compute)]));}));
 app.get('/comparisons/:slug',wrap(async(req,res)=>{
   const c=(await getData()).find(c=>c.slug===req.params.slug);if(!c)return res.sendStatus(404);res.vary('Accept');
   if(req.accepts(['html','text/markdown'])==='text/markdown')return res.type('text/markdown').send(v.markdown(c));
   const weights=Object.fromEntries(c.criteria.filter(k=>req.query[`w.${k.id}`]!==undefined).map(k=>[k.id,req.query[`w.${k.id}`]]));
   res.send(v.page(c.title,v.comparison(c,weights),req.path,[{'@context':'https://schema.org','@type':'Dataset',name:c.title,description:c.summary,url:`https://openvibe.compare${req.path}`,dateModified:c.updated_at,creator:{'@type':'Organization',name:'OpenVibe'},distribution:{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:`https://openvibe.compare/api/v1/comparisons/${c.slug}`}}]));
 }));
 app.get('/models/:org/:model',(req,res)=>res.redirect(301,v.thingPath(`${req.params.org}/${req.params.model}`)));
 app.get('/things/:id',wrap(async(req,res)=>{
   const cs=(await getData()).filter(c=>c.things.some(t=>t.id===req.params.id));if(!cs.length)return res.sendStatus(404);
   const t=cs[0].things.find(t=>t.id===req.params.id);res.vary('Accept');
   if(req.accepts(['html','text/markdown'])==='text/markdown')return res.type('text/markdown').send(cs.map(c=>v.markdown({...c,things:[t]})).join('\n'));
   res.send(v.page(t.name,`<h1>${v.esc(t.name)}</h1><p>${v.esc(t.maker)}</p><a href="${v.esc(t.url)}">Original listing</a>${cs.map(c=>`<h2><a href="/comparisons/${c.slug}">${v.esc(c.title)}</a></h2><dl>${c.criteria.map(k=>`<dt>${v.esc(k.label)} (${v.esc(k.unit)})</dt><dd>${v.number(c.results.find(r=>r.thing===t.id && r.criterion===k.id),k)}</dd>`).join('')}</dl><p>${v.esc(c.method)}</p>`).join('')}`,req.path));
 }));
 app.use((_q,r)=>r.status(404).send('Not found'));
 app.use((_e,_q,r,_n)=>r.status(503).json({error:'compare.unavailable'}));
 return app;
}
module.exports={createApp};
