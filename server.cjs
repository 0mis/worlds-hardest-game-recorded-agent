/* Recording-gated local controller for the publisher's unchanged game scripts. */
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const root=__dirname, runtime=path.join(root,'runtime');fs.mkdirSync(runtime,{recursive:true});
if(fs.existsSync(path.join(runtime,'actions.jsonl'))&&fs.statSync(path.join(runtime,'actions.jsonl')).size)
  throw Error('An action journal already exists. Archive runtime/ before starting a new recorded session.');
let playwright;try{playwright=require('playwright')}catch{
  if(!process.env.PLAYWRIGHT_MODULE)throw Error('Install playwright or set PLAYWRIGHT_MODULE');
  playwright=require(process.env.PLAYWRIGHT_MODULE);
}
const port=Number(process.env.WHG_PORT||8766);
const game=path.join(root,'private-game');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'research/game-asset-manifest.json')));
for(const asset of manifest){
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(game,asset.path))).digest('hex');
  if(actual!==asset.sha256)throw Error('Game asset changed: '+asset.path);
}
const scripts=manifest.filter(a=>a.path.endsWith('.js')&&a.path!=='main.js').map(a=>`<script src="/game/${a.path}"></script>`).join('\n');
const html=`<!doctype html><html><head><meta charset="utf-8"><title>Recorded game research</title>
<base href="/game/"><style>html,body{margin:0;background:#10151e;overflow:hidden}canvas{display:block}</style>
<script src="/clock.js"></script>${scripts}</head><body><script src="/game/main.js"></script><script src="/bridge.js"></script></body></html>`;
let page,browser,active=null,recordFile,recordFd,recordBytes=0,lastChunkAt=0,chunks=0,startedAt=Date.now();
const results=new Map(),journal=path.join(runtime,'actions.jsonl');
const writeEvent=e=>fs.appendFileSync(journal,JSON.stringify({at:new Date().toISOString(),...e})+'\n');
function status(){return {ready:!!page,active,recording:{bytes:recordBytes,chunks,lastChunkAgeMs:lastChunkAt?Date.now()-lastChunkAt:null,file:recordFile?path.relative(root,recordFile):null},pid:process.pid,uptimeSeconds:(Date.now()-startedAt)/1000};}
function respond(res,code,obj){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));}
async function act(body){
  const argHash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  if(results.has(body.id)) {const old=results.get(body.id);if(old.argHash!==argHash)throw Error('ID reused with different arguments');return old;}
  if(active)throw Error('Another action is running');
  if(!/^[a-zA-Z0-9_-]{6,80}$/.test(body.id))throw Error('Request ID required');
  const keys=body.keys||[];
  if(keys.some(k=>!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','p','m'].includes(k)))throw Error('Unsupported key');
  if(!Number.isInteger(body.frames)||body.frames<1||body.frames>2400)throw Error('Invalid frames');
  if(typeof body.caption!=='string'||body.caption.length>112)throw Error('Caption must be short');
  if(recordBytes<4096||chunks<2||Date.now()-lastChunkAt>3500)throw Error('No fresh recording');
  if(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize<500_000_000)throw Error('Recording reserve low');
  const before=await page.evaluate(()=>research.observe());
  if(before.frame!==body.expectedFrame)throw Error('Stale expected frame');
  active=body.id;const result={id:body.id,argHash,status:'running',before};results.set(body.id,result);
  writeEvent({event:'action_start',id:body.id,args:body,before});
  (async()=>{
    try {
      for(const k of keys)await page.keyboard.down(k);
      result.after=await page.evaluate(({frames,caption})=>research.step(frames,caption),body);
      if(result.after.error)throw Error(result.after.error);
      result.status='complete';
    }catch(e){result.status='failed';result.error=String(e);await page.evaluate(()=>research.freeze()).catch(()=>{});}
    finally{
      for(const k of keys)await page.keyboard.up(k).catch(()=>{});
      active=null;writeEvent({event:'action_end',...result,recording:status().recording});
      fs.writeFileSync(path.join(runtime,'last-result.json'),JSON.stringify(result,null,2));
      await page.screenshot({path:path.join(runtime,'latest.png')}).catch(()=>{});
    }
  })();return result;
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.headers.host!==`127.0.0.1:${port}`)return respond(res,403,{error:'Loopback host required'});
    if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)return respond(res,403,{error:'Cross-origin control refused'});
    if(req.method==='GET'&&url.pathname==='/status')return respond(res,200,status());
    if(req.method==='GET'&&url.pathname==='/observe')return respond(res,200,await page.evaluate(()=>research.observe()));
    if(req.method==='GET'&&url.pathname==='/result')return respond(res,200,results.get(url.searchParams.get('id'))||{status:'unknown'});
    if(req.method==='POST'){
      let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw Error('Request too large');}const body=JSON.parse(text||'{}');
      if(url.pathname==='/act')return respond(res,202,await act(body));
      if(url.pathname==='/snapshot'){await page.screenshot({path:path.join(runtime,'latest.png')});return respond(res,200,{file:'runtime/latest.png'});}
      if(url.pathname==='/stop'){
        if(active)throw Error('Action still running');const final=await page.evaluate(()=>research.stop());fs.fsyncSync(recordFd);fs.closeSync(recordFd);recordFd=null;
        writeEvent({event:'recording_stop',final,recording:status().recording});return respond(res,200,final);
      }
      return respond(res,404,{error:'Unknown operation'});
    }
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
    let file=url.pathname.startsWith('/game/')?path.join(game,url.pathname.slice(6)):path.join(root,url.pathname.slice(1));
    if(!file.startsWith(root+path.sep)||url.pathname.includes('..'))return respond(res,403,{error:'Invalid path'});
    if(!url.pathname.startsWith('/game/')&&!['/clock.js','/bridge.js'].includes(url.pathname))return respond(res,404,{error:'Not found'});
    const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.png':'image/png','.mp3':'audio/mpeg','.css':'text/css'})[ext]||'application/octet-stream');
    fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch(e){respond(res,409,{error:String(e)});}
});
server.listen(port,'127.0.0.1',async()=>{
  try{
    browser=await playwright.chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
    const context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:false});
    page=await context.newPage();
    const runId=new Date().toISOString().replace(/[:.]/g,'-');const folder=path.join(root,'recordings',runId);fs.mkdirSync(folder,{recursive:true});
    recordFile=path.join(folder,'raw.webm');recordFd=fs.openSync(recordFile,'wx');
    await page.exposeFunction('persistResearchChunk',async b64=>{
      const data=Buffer.from(b64,'base64');fs.writeSync(recordFd,data);fs.fsyncSync(recordFd);recordBytes+=data.length;chunks++;lastChunkAt=Date.now();
      fs.writeFileSync(path.join(runtime,'recording.json'),JSON.stringify({...status().recording,startedAt:runId,pid:process.pid}));
    });
    page.on('pageerror',e=>writeEvent({event:'page_error',error:String(e)}));
    await page.goto('http://127.0.0.1:'+port+'/');
    await page.waitForFunction(()=>typeof research!=='undefined'&&loadedAssets>=TOTAL_ASSETS,null,{timeout:30000});
    const recorder=await page.evaluate(()=>research.record());
    await page.waitForFunction(()=>research.chunks>=2&&research.bytes>4096,null,{timeout:15000});
    await page.screenshot({path:path.join(runtime,'latest.png')});
    writeEvent({event:'ready',recorder,recording:status().recording,gameHashes:manifest.filter(a=>a.path.endsWith('.js')).map(a=>({path:a.path,sha256:a.sha256}))});
    fs.writeFileSync(path.join(runtime,'server.json'),JSON.stringify({pid:process.pid,port,startedAt:new Date().toISOString()}));
    console.log(JSON.stringify({ready:true,...status()}));
  }catch(e){console.error(e);process.exitCode=1;server.close();await browser?.close();}
});
