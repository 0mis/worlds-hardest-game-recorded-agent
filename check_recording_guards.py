"""Live, recorded menu-only validation; run before the first level."""
import json,time
from pathlib import Path
from client import call,observe
before=observe();assert before['state']=='preloader' and before['frame']==0
payload=dict(id='recorded-menu-smoke-001',expectedFrame=0,frames=2,keys=['Space'],
             caption='Capture verified. First check: retries must never replay controls.')
r=call('/act',payload)
while r['status']=='running':time.sleep(.1);r=call('/result?id='+payload['id'])
assert r['status']=='complete' and r['after']['frame']==2 and r['after']['state']=='main_menu'
duplicate=call('/act',payload)
assert duplicate['status']=='complete' and observe()['frame']==2
stale=payload|dict(id='stale-frame-smoke-001',expectedFrame=0,keys=[])
try:call('/act',stale);raise AssertionError('Stale frame was accepted')
except RuntimeError as e:assert 'Stale expected frame' in str(e)
receipt=dict(recording_before=before['recording'],recorded_chunks_before=before['recorderChunks'],
             idempotent_retry=True,stale_frame_rejected=True,final_frame=observe()['frame'])
(Path(__file__).parent/'runtime/guard-checks.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
call('/snapshot',{})
