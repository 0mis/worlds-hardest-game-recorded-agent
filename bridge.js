// Local research bridge. No mutation of player, level, enemies, coins or rules.
window.research = {
  recorder:null, audio:null, video:null, lastAck:0, chunks:0, bytes:0,
  writeChain:Promise.resolve(), lastError:null, wallStarted:performance.now(),
  observe() {
    return {frame:researchClock.frame,state,level,deaths,curCheck,paused,
      player:JSON.parse(JSON.stringify(player)),
      enemies:JSON.parse(JSON.stringify(enemies[level])),
      coins:JSON.parse(JSON.stringify(coins[level])),
      walls:walls[level],checkpoints:checkpoints[level],
      finishLevelTimer,intermissionTimer,invincible,invincible_permanent,
      totalLevels:TOTAL_LEVELS,loadedAssets,totalAssets:TOTAL_ASSETS,
      gameTimer,recording:this.recorder?.state,
      recorderChunks:this.chunks,recorderBytes:this.bytes,
      recorderAgeMs:performance.now()-this.lastAck,
      clockHeld:researchClock.pending===0,error:this.lastError};
  },
  async record() {
    if (this.recorder) throw Error('Recorder already exists');
    if (loadedAssets < TOTAL_ASSETS) throw Error('Assets not loaded');
    // Silent capture by default. Never request microphone or desktop audio.
    this.video=document.createElement('canvas');
    this.video.id='researchCapture';this.video.width=1280;this.video.height=720;
    document.body.appendChild(this.video);
    canvasElement.style.display='none';
    this.paint();
    const stream=this.video.captureStream(40);
    const mime='video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mime)) throw Error('VP9 recorder unavailable');
    this.recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});
    this.recorder.ondataavailable=event=>{
      if(!event.data.size) return;
      this.writeChain=this.writeChain.then(async()=>{
        const bytes=new Uint8Array(await event.data.arrayBuffer());
        let binary='';for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        await window.persistResearchChunk(btoa(binary));
        this.chunks++;this.bytes+=bytes.length;this.lastAck=performance.now();
      }).catch(e=>{this.lastError=String(e);this.freeze();});
    };
    this.recorder.onerror=event=>{this.lastError=String(event.error);this.freeze();};
    this.recorder.start(1000);
    realSetInterval(()=>this.tick(),25);
    return {mimeType:this.recorder.mimeType,tracks:stream.getTracks().map(t=>t.kind)};
  },
  paint() {
    draw();
    if(!this.video)return;
    const c=this.video.getContext('2d');
    c.fillStyle='#10151e';c.fillRect(0,0,1280,720);
    c.drawImage(canvasElement,240,36,800,600);
    c.fillStyle='#e5edf7';c.font='600 18px Arial';c.textAlign='left';
    c.fillText("GPT-6 ASTRA  /  WORLD'S HARDEST GAME",28,27);
    c.fillStyle='#93a8bd';c.font='14px Arial';
    c.fillText('State-aware research • original game rules • 40 fps • pauses between actions',28,664);
    c.fillStyle='#f1f5fa';c.font='20px Arial';
    c.fillText(researchClock.caption.slice(0,112),28,699);
    c.font='16px Arial';c.fillStyle=this.recorder?.state==='recording'?'#91ddac':'#93a8bd';
    c.fillText(this.recorder?.state==='recording'?'RECORDING':'CAPTURE OFF',1080,70);
    c.fillStyle='#dce5ee';c.fillText('LEVEL '+level+' / 30',1080,100);
    c.fillText('DEATHS '+deaths,1080,128);
    c.fillStyle='#93a8bd';c.font='14px Arial';
    c.fillText(researchClock.pending>0?'EXECUTING':'CLOCK HELD',1080,162);
  },
  tick() {
    try {
      if(researchClock.pending>0) {
        if(this.recorder.state!=='recording'||performance.now()-this.lastAck>5000||this.lastError) {
          this.lastError=this.lastError||'Recorder acknowledgement became stale';this.freeze();
        } else {
          researchClock.frame++; researchClock.callback(); researchClock.pending--;
          if(researchClock.pending===0) {
            music.pause(); const done=researchClock.resolve;researchClock.resolve=null;done?.(this.observe());
          }
        }
      }
      this.paint();
    } catch(e) {this.lastError=String(e);this.freeze();}
  },
  freeze() {
    researchClock.pending=0;
    const done=researchClock.resolve;researchClock.resolve=null;
    music?.pause();done?.(this.observe());
  },
  step(frames,caption) {
    if(researchClock.pending)throw Error('Action already running');
    if(this.chunks<2||this.bytes<4096||performance.now()-this.lastAck>3500||this.recorder.state!=='recording'||this.lastError)throw Error('Recording guard failed');
    if(!Number.isInteger(frames)||frames<1||frames>2400)throw Error('Frame count outside bounds');
    researchClock.caption=caption||researchClock.caption;
    if(!muteMusic)music.play();
    researchClock.pending=frames;
    return new Promise(resolve=>researchClock.resolve=resolve);
  },
  async stop() {
    if(researchClock.pending)throw Error('Cannot stop during an action');
    await new Promise(resolve=>{this.recorder.onstop=resolve;this.recorder.stop();});
    await this.writeChain;return this.observe();
  }
};
