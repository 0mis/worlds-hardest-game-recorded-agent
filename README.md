# World's Hardest Game: recorded control research

A state-aware, frame-stepped agent experiment on the 30-level HTML5 edition
served by Coolmath Games. The game was created by Stephen Critoph / Snubby Land.

**Result: all 30 levels completed, one death, and the original YOU WIN screen.**
The displayed game timer was **10:39.075**; elapsed wall time from first entering
Level 1 to completion was **30:06.058**. The game clock was held during planning.
The complete recording was 32:19; the silent public edit is approximately 20:51.
See [RESULTS.md](RESULTS.md) and [RESULTS.json](RESULTS.json) for the evidence,
the Level 4 failure, and the limitations of this single run.

[Watch the full silent run on YouTube](https://youtu.be/zeuWg2qGqW0).

This is a tool-assisted experiment, not a claim of human-speed or vision-only
play. The controller can inspect level geometry and hazard state, pause the
game clock between actions, and plan bounded sequences of ordinary key inputs.
It must never set the player position, skip levels, enable invincibility, or
change collision rules. A win requires the original game's completion state
after sequentially completing all 30 levels on recording.

GPT-6 Astra built and supervised the harness. Most movement was generated and
executed automatically by the planner; this was not a language model visually
reacting to each frame. The video uses concise strategy summaries and observable
outcomes, not a private reasoning transcript. Selected long planning/setup pauses
were removed, with no gameplay speed changes. The failed attempt is retained.

## Privacy and recording

The game runs in an isolated browser profile. Recording captures a dedicated
canvas with no audio track. Desktop pixels, browser chrome, account pages,
notifications, and microphone audio are excluded by construction. The completed
research run originally captured game-only audio; at the user's request every
published export is silent, and the reusable recorder now also defaults to silence.
Gameplay input is refused until the recorder has delivered live chunks to
disk. Requests have unique identifiers; retrying the same identifier does not
replay the controls. Full raw recordings and action receipts remain local.

Downloaded game assets are excluded from this repository. `fetch_assets.py`
retrieves them from the publisher and records their SHA-256 hashes. No game
mechanics files are rewritten. The local wrapper supplies a controllable clock
and omits the surrounding website's advertising and analytics wrapper.

Source: https://www.coolmathgames.com/0-worlds-hardest-game

## Local setup

Install Python 3.11+, Node.js 20+, and Google Chrome. Then:

```sh
npm install
python fetch_assets.py
node server.cjs
```

The controller listens only at `http://127.0.0.1:8766`. It launches a fresh,
isolated headless Chrome context. Keep this process running. In another terminal,
after it reports `ready`, start the game through its normal menu controls:

```sh
python client.py 1 Space --caption "Recording verified. Begin the original 30-level game."
python client.py 1
python client.py 1 Space
python run_campaign.py
```

The supervisor stops for review if the model disagrees with the observed game,
the bounded search fails, or the recorder becomes unhealthy. It never resets
the recorded game automatically after a tool timeout. Inspect `/status` and the
existing request ID before retrying an uncertain action.

For a new experiment, archive the previous `runtime/` directory first. The server
refuses to mix a new session into an existing action journal. Keep `recordings/`
and the archived journal together as private evidence. Do not expose either local
server to the network or add authentication cookies to the isolated game context.

To watch that same run, use another terminal:

```sh
python viewer.py
```

Open `http://127.0.0.1:8767` in your browser. This is a read-only live preview,
not a second copy of the game. The preview refreshes approximately four times
per second; the recorder requests 40 fps from its dedicated canvas.

`python analyze_run.py --require-finish` audits sequential completion and input
receipts. Recording decode/visual review and publication remain separate checks.
`ablation.cjs` compares endpoint viability on the historical Level 4 case when
that local journal is available. Read [METHODS.md](METHODS.md) for the design and
limitations. Downloaded assets and raw journals are intentionally not committed.

## Silent edit

After the game finishes, finalize capture with `POST /stop`, then run the audit
while the game controller remains open. FFmpeg with NVIDIA H.264 encoding is
required by the provided editor (change the encoder arguments for another GPU):

```sh
python analyze_run.py --require-finish
python edit_recording.py --ffmpeg /path/to/ffmpeg --source recordings/RUN_ID/raw.webm --output full-run.mp4
```

The editor removes only long visual freezes that fall outside all executed input
intervals, with a two-second protection margin. It explicitly maps video only and
uses `-an`. The original raw file is left intact. Verify zero audio streams and
decode the entire output before publishing.
