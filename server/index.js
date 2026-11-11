'use strict';
const {createApp}=require('./app');
const server=createApp().listen(Number(process.env.PORT)||5280,process.env.HOST||'127.0.0.1');
process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
