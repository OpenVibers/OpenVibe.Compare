'use strict';
const {createApp}=require('./app');
const {mountBench}=require('./bench-mount');
// Bench rides in Compare's process when BENCH_ENV_FILE names its env file (plan §X step 2b); otherwise Compare alone.
(async()=>{
 const bench=await mountBench({env:process.env});
 const port=Number(process.env.PORT)||5280;
 const server=createApp({bench:bench&&bench.app,benchHost:bench&&bench.host}).listen(port,process.env.HOST||'127.0.0.1',()=>{
   console.log(`[OpenVibe.Compare] on ${port}${bench?` with Bench (db ${bench.ctx.s.db.store})`:''}`);
 });
 server.keepAliveTimeout=65_000;
 if(bench) bench.start({port});
 let stopping=false;
 process.on('SIGTERM',()=>{
   if(stopping)return;stopping=true;
   setTimeout(()=>process.exit(1),10000).unref();
   server.close(async()=>{if(bench)await bench.stop();process.exit(0);});
 });
})().catch((err)=>{console.error('[OpenVibe.Compare] failed to start:',err);process.exit(1);});
