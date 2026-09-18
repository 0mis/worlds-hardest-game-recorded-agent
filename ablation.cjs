/* Historical, simulation-only comparison. Never sends gameplay commands. */
const fs=require('fs'),path=require('path'),{plan,model,targetHit}=require('./planner.cjs');
const rows=fs.readFileSync(path.join(__dirname,'runtime/actions.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const event=rows.find(r=>r.event==='action_end'&&r.after?.level===4&&r.after.state==='game'&&r.before.state==='intermission');
if(!event)throw Error('Historical initial Level 4 observation missing');
const original=event.after;
function advance(obs,route){
 const out=JSON.parse(JSON.stringify(obs)),sim=model(obs);let x=obs.player.x,y=obs.player.y;
 for(const a of route.actions){
   const points=sim.move(x,y,a.keys,a.frames);
   for(const p of points){sim.advanceEnemies();for(const c of out.coins)if(targetHit(p[0],p[1],{...c,kind:'coin'}))c.gathered=true;}
   [x,y]=points[points.length-1];
 }
 out.enemies=sim.enemies;out.player.x=x;out.player.y=y;out.player.prevX=x;out.player.prevY=y;out.frame+=route.frames;
 return out;
}
const comparisons=[];
for(const survival of [0,120]){
 const route=plan(original,{survival});
 if(!route.ok)throw Error('No initial route in ablation');
 const after=advance(original,route);
 const followup=plan(after,{block:1,horizon:800,maxNodes:600000,survival:0});
 comparisons.push({survivalTicks:survival,routeTicks:route.frames,expanded:route.expanded,
   endpoint:{x:after.player.x,y:after.player.y},nextCoinReachableWithinSearch:followup.ok,
   followupExpanded:followup.expanded,followupQueued:followup.queued??null,followupTicks:followup.frames??null});
}
const report={case:'Initial Level 4 recorded observation',sourceFrame:original.frame,
 method:'Same historical observation, same rules and target ranking; vary only endpoint viability. Simulation only.',
 limitations:'One case, bounded search; not a general success-rate estimate.',comparisons};
fs.writeFileSync(path.join(__dirname,'research/level4-ablation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
