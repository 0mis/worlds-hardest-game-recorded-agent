"""Small client for the recording-gated research controller."""
import argparse,json,time,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
BASE='http://127.0.0.1:8766'
def call(route,data=None):
    request=Request(BASE+route,data=None if data is None else json.dumps(data).encode(),
                    headers={'Content-Type':'application/json'})
    try:
        with urlopen(request,timeout=10) as response:return json.load(response)
    except HTTPError as exc:raise RuntimeError(exc.read().decode()) from exc
def observe():return call('/observe')
def act(frames,keys=(),caption='Observe the result before choosing the next move.',request_id=None):
    before=observe()
    payload=dict(id=request_id or uuid.uuid4().hex,expectedFrame=before['frame'],
                 frames=frames,keys=list(keys),caption=caption)
    result=call('/act',payload)
    deadline=time.monotonic()+frames/40+20
    while result['status']=='running':
        if time.monotonic()>deadline:raise TimeoutError('Inspect the same request ID; do not replay: '+payload['id'])
        time.sleep(.1);result=call('/result?id='+payload['id'])
    if result['status']!='complete':raise RuntimeError(result)
    return result
def compact(state):
    return {k:state[k] for k in ['frame','state','level','deaths','curCheck','paused','finishLevelTimer','intermissionTimer','recording','clockHeld','error']}|{'player':{k:state['player'][k] for k in ['x','y','dying','alpha']},'coins':sum(c['gathered'] for c in state['coins'])}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('frames',type=int);p.add_argument('keys',nargs='*');p.add_argument('--caption',default='Observe the result before choosing the next move.');a=p.parse_args()
    result=act(a.frames,a.keys,a.caption);print(json.dumps(compact(result['after'])));call('/snapshot',{})
