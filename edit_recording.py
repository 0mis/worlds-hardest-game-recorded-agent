"""Trim verified idle spans; publish video-only, with no audio stream."""
import argparse,hashlib,json,math,re,subprocess
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def stamp(text):return datetime.fromisoformat(text.replace('Z','+00:00')).timestamp()
def subtract(spans,protected):
    for p,q in protected:
        result=[]
        for a,b in spans:
            if q<=a or p>=b:result.append((a,b))
            else:
                if a<p:result.append((a,p))
                if q<b:result.append((q,b))
        spans=result
    return spans
def main():
    p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--detect-only',action='store_true');a=p.parse_args()
    ff=str(Path(a.ffmpeg).resolve());source=Path(a.source).resolve();output=Path(a.output).resolve()
    audit=json.loads((ROOT/'runtime/audit.json').read_text())
    if not audit['gameplay_complete']:raise RuntimeError('Gameplay completion must be audited first')
    rows=[json.loads(line) for line in (ROOT/'runtime/actions.jsonl').read_text().splitlines()]
    if not any(r['event']=='recording_stop' for r in rows):raise RuntimeError('Finalize the recording before editing')
    edit=ROOT/'research/edit';edit.mkdir(parents=True,exist_ok=True)
    source_hash=hashlib.file_digest(source.open('rb'),'sha256').hexdigest()
    log=edit/'freeze-detection.log';progress=edit/'detection-progress.txt'
    if not (edit/'cuts.json').exists():
        cmd=[ff,'-hide_banner','-nostdin','-nostats','-i',str(source),'-an','-vf','crop=800:600:240:36,freezedetect=n=0.0001:d=3','-progress',str(progress),'-f','null','NUL']
        print('Scanning recorded game pixels for long freezes...',flush=True)
        with log.open('w') as stream:subprocess.run(cmd,stdout=stream,stderr=stream,check=True)
        duration=int(re.findall(r'out_time_us=(\d+)',progress.read_text())[-1])/1e6
        freezes=[];start=None
        for line in log.read_text().splitlines():
            m=re.search(r'freeze_start: ([\d.]+)',line)
            if m:start=float(m[1])
            m=re.search(r'freeze_end: ([\d.]+)',line)
            if m and start is not None:freezes.append((start,float(m[1])));start=None
        if start is not None:freezes.append((start,duration))
        ready=next(r for r in rows if r['event']=='ready')
        # Approximate recorder epoch from its second persisted one-second chunk.
        # Protect every action by two seconds on both sides to cover timestamp
        # uncertainty. A freeze alone never authorizes removal of gameplay.
        epoch=stamp(ready['at'])-ready['recording']['lastChunkAgeMs']/1000-2
        starts={r['id']:r for r in rows if r['event']=='action_start'}
        protected=[]
        for r in rows:
            if r['event']=='action_end':protected.append((stamp(starts[r['id']]['at'])-epoch-2,stamp(r['at'])-epoch+2))
        candidates=[(max(0,s+.75),min(duration,e-.25)) for s,e in freezes if e-s>3]
        cuts=subtract(candidates,protected)
        cuts=[(math.ceil(s*40)/40,math.floor(e*40)/40) for s,e in cuts if e-s>=.5]
        keep=[];cursor=0
        for s,e in sorted(cuts):
            if s>cursor:keep.append((cursor,s))
            cursor=max(cursor,e)
        if cursor<duration:keep.append((cursor,math.floor(duration*40)/40))
        plan={'source':str(source),'source_sha256':source_hash,'source_duration':duration,'recorder_epoch_approx':epoch,'protected_margin_seconds':2,
              'cuts':cuts,'keep':keep,'removed_seconds':sum(e-s for s,e in cuts),'edited_gameplay_seconds':sum(e-s for s,e in keep),
              'method':'Only long visual freezes outside all action intervals plus a 2-second margin; no gameplay speed changes.'}
        (edit/'cuts.json').write_text(json.dumps(plan,indent=2))
    plan=json.loads((edit/'cuts.json').read_text())
    if plan.get('source_sha256')!=source_hash:raise RuntimeError('Cached cut plan belongs to a different source recording')
    print(json.dumps({k:v for k,v in plan.items() if k not in ['cuts','keep','source']}),flush=True)
    if a.detect_only:return
    chunks=edit/'segments';chunks.mkdir(exist_ok=True)
    for i,(start,end) in enumerate(plan['keep']):
        dest=chunks/f'{i:04d}.mkv';duration=end-start
        receipt=chunks/f'{i:04d}.ok'
        signature={'source_sha256':source_hash,'start':start,'end':end,'format':'h264_nvenc-p5-cq19-silent-v2'}
        if dest.exists() and receipt.exists():
            saved=json.loads(receipt.read_text())
            if all(saved.get(k)==v for k,v in signature.items()) and saved['bytes']==dest.stat().st_size:continue
        cmd=[ff,'-y','-hide_banner','-nostdin','-loglevel','warning','-ss',f'{start:.6f}','-i',str(source),'-t',f'{duration:.6f}',
             '-map','0:v:0','-vf','fps=40,format=yuv420p','-an',
             '-c:v','h264_nvenc','-preset','p5','-rc','vbr','-cq','19','-b:v','0',str(dest)]
        with (chunks/f'{i:04d}.log').open('w') as stream:subprocess.run(cmd,stdout=stream,stderr=stream,check=True)
        receipt.write_text(json.dumps({**signature,'bytes':dest.stat().st_size}))
        print(json.dumps({'rendered_segment':i+1,'total':len(plan['keep'])}),flush=True)
    listing=edit/'concat.txt';listing.write_text(''.join("file '"+(chunks/f'{i:04d}.mkv').as_posix()+"'\n" for i in range(len(plan['keep']))))
    output.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run([ff,'-y','-hide_banner','-nostdin','-loglevel','warning','-f','concat','-safe','0','-i',str(listing),'-map','0:v:0','-c:v','copy','-an','-movflags','+faststart',str(output)],check=True)
    (edit/'render-complete.json').write_text(json.dumps({'output':str(output),'bytes':output.stat().st_size,'plan':'cuts.json','audio_streams_requested':0}))
    print('Render complete: '+str(output),flush=True)
if __name__=='__main__':main()
