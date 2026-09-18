"""Bounded, resumable supervisor for the unchanged game's normal-input run."""
import argparse,json,os,subprocess,time
from pathlib import Path
from client import observe,act,call,compact
from execute_plan import execute
ROOT=Path(__file__).resolve().parent
def log(event,**fields):
    record={'at':time.time(),'event':event,**fields}
    with (ROOT/'runtime/campaign.jsonl').open('a') as f:f.write(json.dumps(record)+'\n')
    summary=record.copy()
    if 'state' in summary:summary['state']=compact(summary['state']) if 'player' in summary['state'] and 'enemies' in summary['state'] else summary['state']
    print(json.dumps(summary),flush=True)
def main():
    p=argparse.ArgumentParser();p.add_argument('--node',default=os.environ.get('NODE_EXE','node'));p.add_argument('--through',type=int,default=30);a=p.parse_args()
    (ROOT/'research/plans').mkdir(parents=True,exist_ok=True)
    for attempt in range(500):
        s=observe()
        if s['error'] or s['recording']!='recording':raise RuntimeError('Recording is not healthy')
        if s['state']=='finish':
            log('game_finished',state=s);call('/snapshot',{});return
        if s['level']>a.through:
            log('bounded_review',state=compact(s));return
        if s['finishLevelTimer']>0:
            if not all(c['gathered'] for c in s['coins']):raise RuntimeError('Unexpected finish with missing coins')
            log('level_completed',state=s)
            act(s['finishLevelTimer'],[],f"Level {s['level']} cleared. All required coins collected; recording verified.")
            continue
        if s['state']=='intermission':
            act(s['intermissionTimer']+1,[],f"Level {s['level']}: observe the new pattern before moving.")
            continue
        if s['state']!='game':raise RuntimeError('Unexpected game state: '+s['state'])
        if s['player']['dying']:
            log('death_observed',state=s);act(80,[],f"A collision: keep the failed attempt and retry from the game's checkpoint.");continue
        found=False
        for block in [6,4,3]:
            process=subprocess.run([a.node,str(ROOT/'planner.cjs'),json.dumps({'block':block})],capture_output=True,text=True,timeout=90)
            if process.returncode:raise RuntimeError(process.stderr[-3000:])
            plan=json.loads((ROOT/'runtime/plan.json').read_text())
            (ROOT/'research/plans'/f"level-{s['level']:02d}-frame-{s['frame']:07d}-block-{block}.json").write_text(json.dumps(plan))
            log('planning',level=s['level'],frame=s['frame'],block=block,ok=plan['ok'],expanded=plan['expanded'],seconds=plan['seconds'],target=plan['target'],frames=plan.get('frames'))
            if plan['ok']:found=True;break
        if not found:raise RuntimeError('No collision-free route found within the current search bounds; inspect the held state')
        after=execute()
        if after['frame']==s['frame']:raise RuntimeError('No input progress')
    raise RuntimeError('Supervisor bound reached; game held for review')
if __name__=='__main__':main()
