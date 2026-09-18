/* Offline model-predictive planner. This module never writes to the live game. */
const fs=require('fs'),path=require('path');
const W=800,H=600,SIZE=W*H,STRIDE=25;
const KEYS=[[],['ArrowRight'],['ArrowLeft'],['ArrowUp'],['ArrowDown'],
 ['ArrowRight','ArrowUp'],['ArrowRight','ArrowDown'],['ArrowLeft','ArrowUp'],['ArrowLeft','ArrowDown']];
function model(observation){
  const files=['vars.js','colors.js','walls.js','enemy.js','coins.js','checkpoint.js','player.js'];
  const source=files.map(f=>fs.readFileSync(path.join(__dirname,'private-game',f),'utf8')).join('\n');
  const factory=new Function('observation',`var window={},navigator={userAgent:'research'},keydown={};
    function playSFX(){}; var localStorage={setItem(){}};\n${source}\n
    level=observation.level; state='game'; paused=false; hideKeys=true;
    player=JSON.parse(JSON.stringify(observation.player));
    enemies[level]=JSON.parse(JSON.stringify(observation.enemies));
    return {
      enemies:enemies[level],
      advanceEnemies(){updateEnemies();},
      move(x,y,keys,count){
        player.x=x;player.y=y;player.prevX=x;player.prevY=y;
        player.dying=false;player.bouncing=false;
        keydown={right:keys.includes('ArrowRight'),left:keys.includes('ArrowLeft'),
                 up:keys.includes('ArrowUp'),down:keys.includes('ArrowDown')};
        const points=[];
        for(let i=0;i<count;i++){getPlayerBounds();playerMove();getPrevPlayerCoords();points.push([player.x,player.y]);}
        return points;
      }
    };`);
  return factory(observation);
}
class Heap{
 constructor(){this.a=[];}
 push(n){let a=this.a,i=a.length;a.push(n);while(i){let p=(i-1)>>1;if(a[p].f<=n.f)break;a[i]=a[p];i=p;}a[i]=n;}
 pop(){let a=this.a,r=a[0],n=a.pop();if(a.length){let i=0;while(true){let l=i*2+1;if(l>=a.length)break;let r=l+1,c=r<a.length&&a[r].f<a[l].f?r:l;if(a[c].f>=n.f)break;a[i]=a[c];i=c;}a[i]=n;}return r;}
 get length(){return this.a.length;}
}
function validCells(walls){
 const valid=new Uint8Array(SIZE);
 for(let y=32;y<H-2;y++)for(let x=16;x<W-16;x++){
   const l=Math.floor((x-16)/40),r=Math.floor((x+15)/40),t=Math.floor((y-30)/40),b=Math.floor((y+1)/40);
   if(!walls[t][l]&&!walls[t][r]&&!walls[b][l]&&!walls[b][r])valid[y*W+x]=1;
 }
 return valid;
}
function targetHit(x,y,target){
 if(target.kind==='coin')return Math.abs(x-target.x)<19.75&&Math.abs(y-14-target.y)<19.75;
 if(target.kind==='point')return Math.max(Math.abs(x-target.x),Math.abs(y-target.y))<=target.radius;
 return x+14>target.x&&x-14<target.x+target.width&&y>target.y&&y-28<target.y+target.height;
}
function distances(valid,target){
 const d=new Int16Array(SIZE);d.fill(32767);const q=new Int32Array(SIZE);let head=0,tail=0;
 for(let i=0;i<SIZE;i++)if(valid[i]&&targetHit(i%W,(i/W)|0,target)){d[i]=0;q[tail++]=i;}
 while(head<tail){const p=q[head++],nd=d[p]+1;for(const off of [-801,-800,-799,-1,1,799,800,801]){
   const j=p+off;if(j<0||j>=SIZE||!valid[j]||d[j]<=nd)continue;
   if(Math.abs(off)>1&&off%800!==0){const dy=off<0?-800:800,dx=off-dy;if(!valid[p+dy]||!valid[p+dx])continue;}
   d[j]=nd;q[tail++]=j;
 }}return d;
}
function safeCheckpoint(x,y,checks){return checks.some(c=>x-14>c[0]*40&&x+14<(c[0]+c[2])*40&&y-28>c[1]*40&&y<(c[1]+c[3])*40);}
function hazards(sim,horizon){
 const frames=[null],positions=[sim.enemies.map(e=>[e.x,e.y])];
 for(let t=1;t<=horizon;t++){
   sim.advanceEnemies(); const bits=new Uint32Array(STRIDE*H);
   positions.push(sim.enemies.map(e=>[e.x,e.y]));
   for(const e of sim.enemies){
     const x0=Math.max(0,Math.floor(e.x-20.25)+1),x1=Math.min(W-1,Math.ceil(e.x+20.25)-1);
     const y0=Math.max(0,Math.floor(e.y-6.25)+1),y1=Math.min(H-1,Math.ceil(e.y+34.25)-1);
     const w0=x0>>5,w1=x1>>5;
     for(let y=y0;y<=y1;y++)for(let w=w0;w<=w1;w++){
       const low=w===w0?x0&31:0,high=w===w1?x1&31:31;
       bits[y*STRIDE+w]|=(0xffffffff<<low)&(0xffffffff>>>(31-high));
     }
   }frames.push(bits);
 }return {frames,positions};
}
function plan(obs,options={}){
 const started=Date.now(),valid=validCells(obs.walls),sim=model(obs);
 const targets=options.target?[options.target]:obs.coins.map((c,i)=>({...c,kind:'coin',index:i})).filter(c=>!c.gathered);
 if(!targets.length)for(const [index,c]of obs.checkpoints.entries())if(c[4])targets.push({kind:'finish',index,x:c[0]*40,y:c[1]*40,width:c[2]*40,height:c[3]*40});
 const startCell=Math.round(obs.player.y)*W+Math.round(obs.player.x);
 const ranking=targets.map(target=>{const d=distances(valid,target);return {target,d,distance:d[startCell]};}).sort((a,b)=>a.distance-b.distance);
 const choice=ranking[options.targetRank||0];if(!choice||choice.distance===32767)throw Error('No statically reachable target');
 const {target,d}=choice,block=options.block||6,horizon=options.horizon||1200;
 const survival=options.survival??120;
 const danger=hazards(sim,horizon+survival+block),heap=new Heap(),seen=new Set(),moves=new Map();
 function next(n,a){
   const mk=(n.y*W+n.x)*9+a;let pts=moves.get(mk);if(!pts){pts=sim.move(n.x,n.y,KEYS[a],block);moves.set(mk,pts);}
   for(let k=0;k<pts.length;k++){
     const [x,y]=pts[k],bits=danger.frames[n.t+k+1];
     if(x<0||x>=W||y<0||y>=H||((bits[y*STRIDE+(x>>5)]>>>(x&31))&1)&&!safeCheckpoint(x,y,obs.checkpoints))return null;
   }
   const [x,y]=pts[pts.length-1];return {x,y,t:n.t+block,parent:n,action:a};
 }
 function viable(n){
   if(target.kind==='finish'||survival===0)return true;
   const until=n.t+survival,visited=new Set(),stack=[n];let budget=15000;
   while(stack.length&&budget-->0){const p=stack.pop(),id=p.t*SIZE+p.y*W+p.x;
     if(visited.has(id))continue;visited.add(id);
     if(p.t>=until||safeCheckpoint(p.x,p.y,obs.checkpoints))return true;
     for(let a=8;a>=0;a--){const q=next(p,a);if(q)stack.push(q);}
   }return false;
 }
 const h=(x,y)=>{let v=d[y*W+x];if(v===32767){v=32767;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)v=Math.min(v,d[(y+dy)*W+x+dx]??32767);}return v/3;};
 const start={x:obs.player.x,y:obs.player.y,t:0,parent:null,action:0};start.f=h(start.x,start.y);heap.push(start);
 let expanded=0,best=start,found=null;const maxNodes=options.maxNodes||600000;
 while(heap.length&&expanded<maxNodes){
   const n=heap.pop(),id=n.t*SIZE+n.y*W+n.x;if(seen.has(id))continue;seen.add(id);expanded++;
   if(targetHit(n.x,n.y,target)&&n.t>0&&viable(n)){found=n;break;}
   if(h(n.x,n.y)<h(best.x,best.y))best=n;
   if(n.t+block>horizon)continue;
   for(let a=0;a<KEYS.length;a++){
     const q=next(n,a);if(!q)continue;const {x,y,t}=q,key=t*SIZE+y*W+x;
     if(seen.has(key))continue;
     const remaining=h(x,y);if(remaining>=10000)continue;
     heap.push({x,y,t,parent:n,action:a,f:t+(options.weight||1.65)*remaining+Math.hypot(x-target.x,y-14-target.y)*.0001});
   }
 }
 if(!found)return {ok:false,level:obs.level,frame:obs.frame,target,expanded,queued:heap.length,best:{x:best.x,y:best.y,t:best.t,distance:h(best.x,best.y)},seconds:(Date.now()-started)/1000};
 const chain=[];for(let n=found;n.parent;n=n.parent)chain.push(n);chain.reverse();const actions=[];
 for(const n of chain){const prior=actions[actions.length-1];if(prior&&prior.action===n.action){prior.frames+=block;prior.x=n.x;prior.y=n.y;prior.t=n.t;}else actions.push({action:n.action,keys:KEYS[n.action],frames:block,x:n.x,y:n.y,t:n.t});}
 for(const a of actions)a.enemies=danger.positions[a.t];
 return {ok:true,level:obs.level,frame:obs.frame,deaths:obs.deaths,start:{x:obs.player.x,y:obs.player.y},target,frames:found.t,expanded,seconds:(Date.now()-started)/1000,actions};
}
module.exports={model,plan,KEYS,targetHit,validCells,distances};
if(require.main===module)(async()=>{
 const obs=await(await fetch('http://127.0.0.1:8766/observe')).json();
 const options=process.argv[2]?JSON.parse(process.argv[2]):{};const result=plan(obs,options);
 const file=path.join(__dirname,'runtime','plan.json');fs.writeFileSync(file,JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,actions:result.actions?.map(({enemies,...a})=>a)}));
})();
