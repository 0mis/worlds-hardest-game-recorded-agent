"""Audit actual controller receipts; planning success is never treated as a win."""
import argparse,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--require-finish',action='store_true');args=parser.parse_args()
    rows=[json.loads(line) for line in (ROOT/'runtime/actions.jsonl').read_text().splitlines() if line.strip()]
    starts={r['id']:r for r in rows if r['event']=='action_start'}
    ends=[r for r in rows if r['event']=='action_end']
    violations=[];milestones=[];previous=0;ids=set();total_frames=0
    for end in ends:
        rid=end['id'];start=starts.get(rid);before=end.get('before',{});after=end.get('after',{})
        if rid in ids:violations.append('Duplicate executed request ID')
        ids.add(rid)
        if not start or end['status']!='complete':violations.append('Missing start or incomplete action: '+rid);continue
        if before['frame']!=previous:violations.append('Frame discontinuity at '+rid)
        delta=after['frame']-before['frame'];total_frames+=delta;previous=after['frame']
        if delta!=start['args']['frames']:violations.append('Unexpected frame count: '+rid)
        if start['args']['expectedFrame']!=before['frame']:violations.append('Stale frame accepted: '+rid)
        if before['recording']!='recording' or after['recording']!='recording':violations.append('Unrecorded action: '+rid)
        if before['recorderAgeMs']>3500 or before['recorderChunks']<2 or before['recorderBytes']<4096:violations.append('Recording preflight failed: '+rid)
        if before['invincible_permanent'] or after['invincible_permanent']:violations.append('Permanent invincibility observed')
        if any(k not in ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','p','m'] for k in start['args']['keys']):violations.append('Unexpected key')
        if after['level']!=before['level']:
            if after['level']!=before['level']+1:violations.append('Nonsequential level transition')
            if before['finishLevelTimer']<=0 or not all(c['gathered'] for c in before['coins']):violations.append('Unproven completion transition')
            milestones.append({'level':before['level'],'frame':after['frame'],'at':end['at'],'deaths':after['deaths'],'coins':len(before['coins'])})
        elif after['state']=='finish' and before['state']!='finish':
            if before['level']!=30 or before['finishLevelTimer']<=0 or not all(c['gathered'] for c in before['coins']):violations.append('Unproven final transition')
            milestones.append({'level':30,'frame':after['frame'],'at':end['at'],'deaths':after['deaths'],'coins':len(before['coins'])})
    asset_rows=json.loads((ROOT/'research/game-asset-manifest.json').read_text())
    for asset in asset_rows:
        if hashlib.sha256((ROOT/'private-game'/asset['path']).read_bytes()).hexdigest()!=asset['sha256']:violations.append('Game asset changed: '+asset['path'])
    last=ends[-1]['after'] if ends else {}
    completed=[m['level'] for m in milestones]
    missing=[i for i in range(1,31) if i not in completed]
    report={'action_count':len(ends),'executed_frames':total_frames,'executed_seconds':total_frames/40,
        'current_level':last.get('level'),'current_state':last.get('state'),'deaths':last.get('deaths'),
        'game_timer_seconds':last.get('gameTimer',0)/1000,'completed_levels':completed,'missing_levels':missing,
        'all_game_assets_match':not any(v.startswith('Game asset') for v in violations),'violations':violations,'milestones':milestones,
        'gameplay_complete':not violations and not missing and last.get('state')=='finish',
        'recording_decode_and_visual_review':'separate requirement','publication':'separate requirement'}
    (ROOT/'runtime/audit.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='milestones'}))
    if violations or args.require_finish and not report['gameplay_complete']:raise SystemExit(1)
if __name__=='__main__':main()
