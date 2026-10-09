import 'dotenv/config';
import { createApp } from './app';

const port=Number(process.env.PORT || 3001);
if(!Number.isInteger(port) || port<1 || port>65535) throw new Error('PORT must be an integer between 1 and 65535');
const host=process.env.HOST || '127.0.0.1';
if(!['127.0.0.1','localhost','::1'].includes(host)) throw new Error('HOST must be a loopback address; place an authenticated gateway in front of public deployments');
const app=createApp();
const server=app.listen(port,host,(error?: Error)=> {
  if (error) {
    console.error(`[startup] 无法监听 ${host}:${port}: ${error.message}`);
    app.locals.store.close();
    process.exitCode=1;
    return;
  }
  console.log(`Travel Agent API is ready at http://${host.includes(':')?'['+host+']':host}:${port}`);
});
function stop() { server.close(()=>{app.locals.store.close();process.exit(0);}); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
