"""Execute a precomputed route through guarded normal keyboard inputs."""
import json,sys,time
from pathlib import Path
from client import observe,act,call,compact
ROOT=Path(__file__).resolve().parent
def execute(limit=None,verbose=False):
    plan=json.loads((ROOT/'runtime/plan.json').read_text())
    if not plan['ok']:raise RuntimeError('Planner did not find a complete route')
    before=observe()
    if (before['frame'],before['level'],before['deaths'])!=(plan['frame'],plan['level'],plan['deaths']):raise RuntimeError('Plan is stale')
    if before['player']['dying']:raise RuntimeError('Wait for normal respawn before planning')
    target=plan['target']
    circular=any('circular' in e['enemyType'].lower() for e in before['enemies'])
    stationary=all(e['enemyType']=='static' for e in before['enemies'])
    if target['kind']=='coin':
        strategy='Follow the rotating gap; collect the coin with an escape route.' if circular else 'Time the moving gaps; collect the coin with an escape route.'
    elif stationary:
        strategy='Keep enough clearance from the stationary hazards to reach the finish.'
    else:
        strategy='All coins accounted for. Follow the safe opening to the green finish.'
    caption=f"Level {plan['level']}: {strategy}"
    for i,action in enumerate(plan['actions'][:limit]):
        result=act(action['frames'],action['keys'],caption)
        after=result['after']
        if verbose:print(json.dumps({'segment':i+1,'of':len(plan['actions']),**compact(after)}),flush=True)
        if after['player']['dying'] or after['deaths']!=before['deaths']:raise RuntimeError('Actual collision; route stopped for diagnosis')
        if after['level']!=before['level'] or after['finishLevelTimer']>0:break
        error=max(abs(after['player']['x']-action['x']),abs(after['player']['y']-action['y']))
        enemy_error=max((max(abs(e['x']-p[0]),abs(e['y']-p[1])) for e,p in zip(after['enemies'],action['enemies'])),default=0)
        if error>.01 or enemy_error>.0001:raise RuntimeError(f'Model mismatch: player {error}, enemy {enemy_error}')
        # Continue to the route's checked endpoint even if contact collected
        # the coin earlier; that endpoint also has a feasible survival path.
    call('/snapshot',{})
    return observe()
if __name__=='__main__':execute(int(sys.argv[1]) if len(sys.argv)>1 else None,verbose=True)
