"""Read-only visible viewer for the same isolated, recorded browser session."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request,urlopen
import threading
ROOT=Path(__file__).resolve().parent
LOCK=threading.Lock()
HTML=b'''<!doctype html><meta charset="utf-8"><title>Live World's Hardest Game run</title>
<style>body{margin:0;background:#10151e;color:#edf3fa;font:16px system-ui}main{max-width:1400px;margin:auto;padding:12px}h1{font-size:20px;margin:0 0 8px}p{color:#a9b9cc;margin:8px 0}img{display:block;max-width:100%;max-height:calc(100vh - 130px);width:auto;height:auto;margin:auto;object-fit:contain}</style>
<main><h1>LIVE VIEW | The same recorded run</h1><p>Read-only viewer. The game pauses between actions. Preview refreshes about four times per second; the recording is 40 fps.</p><img id="game" alt="Live game canvas"><p id="health">Connecting to the recorded game...</p></main>
<script>const game=document.getElementById('game'),health=document.getElementById('health');
function next(){game.src='/frame.png?t='+Date.now()}
game.onload=()=>{health.textContent='Connected - last frame '+new Date().toLocaleTimeString();setTimeout(next,250)};
game.onerror=()=>{health.textContent='Waiting for the game controller; no inputs are sent from this viewer.';setTimeout(next,1000)};next();</script>'''
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if self.path=='/' or self.path.startswith('/?'):
                content,mime=HTML,'text/html; charset=utf-8'
            elif self.path.startswith('/frame.png'):
                with LOCK:
                    with urlopen(Request('http://127.0.0.1:8766/snapshot',data=b'{}',headers={'Content-Type':'application/json'}),timeout=8) as response:response.read()
                    content=(ROOT/'runtime/latest.png').read_bytes()
                mime='image/png'
            else:self.send_error(404);return
            self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception:self.send_error(503,'Recorded game controller unavailable')
    def log_message(self,*args):pass
if __name__=='__main__':
    print('Read-only game viewer: http://127.0.0.1:8767',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8767),Handler).serve_forever()
