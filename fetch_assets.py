"""Fetch the publisher's publicly served game assets for an isolated research run.

The downloaded game remains private/local; the public harness includes this
fetcher and hashes, not a redistributed copy of the game.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
from urllib.request import urlopen,Request
import json,re
ROOT=Path(__file__).resolve().parent
BASE='https://www.coolmathgames.com/sites/default/files/public_games/48362/'
(ROOT/'research').mkdir(exist_ok=True)
page_request=Request('https://www.coolmathgames.com/0-worlds-hardest-game/play',headers={'User-Agent':'Mozilla/5.0'})
html=urlopen(page_request,timeout=30).read().decode('utf-8')
(ROOT/'research/play.html').write_text(html,encoding='utf-8')
names=re.findall(r'src="([^"/:]+\.js)"',html)+['style.css']
dest=ROOT/'private-game';dest.mkdir(exist_ok=True)
def fetch(name):
    assert re.fullmatch(r'[a-zA-Z0-9_. /-]+',name) and '..' not in name
    target=dest/name;target.parent.mkdir(parents=True,exist_ok=True)
    request=Request(BASE+name,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.coolmathgames.com/0-worlds-hardest-game/play'})
    data=urlopen(request,timeout=30).read()
    target.write_bytes(data)
    return dict(path=name,url=BASE+name,bytes=len(data),sha256=sha256(data).hexdigest())
with ThreadPoolExecutor(max_workers=6) as pool: rows=list(pool.map(fetch,names))
preloader=re.sub(r'//[^\n]*','',(dest/'preloader.js').read_text(encoding='utf-8'))
media=sorted(set(re.findall(r'"((?:images|sounds)/[^"\n]+\.(?:png|mp3))"',preloader)))
with ThreadPoolExecutor(max_workers=6) as pool: rows+=list(pool.map(fetch,media))
(ROOT/'research/game-asset-manifest.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print(json.dumps(dict(files=len(rows),bytes=sum(r['bytes'] for r in rows),source=BASE)))
