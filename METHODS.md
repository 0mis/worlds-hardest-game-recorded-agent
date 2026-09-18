# Experimental method

## Question and scope

Can a state-aware controller finish all 30 levels of the publisher's HTML5
World's Hardest Game using normal keyboard inputs, while refusing to advance
the game unless a local recorder is delivering fresh chunks to disk?

This is an engineering demonstration and a single run, not a standardized
benchmark or a comparison with human players. Source access, exact state
observations, simulation, and externally held game time are strong advantages.

## Game and isolation

The fetcher downloads the public game scripts and assets from Coolmath Games.
It records SHA-256 hashes, which the controller verifies before starting.
The scripts implementing movement, enemies, walls, coins, checkpoints, and
completion are unchanged. A local HTML wrapper leaves out the publisher's
surrounding advertising/analytics integration.

A fresh Chrome context has no personal account cookies. The wrapper intercepts
the original 25 ms game callback and executes an explicitly bounded number of
ticks. Its virtual Date advances with those ticks, so the displayed game timer
measures active game time, including ordinary intermissions. Wall time is
recorded separately. The controller does not set player coordinates, award
coins, skip levels, reset hazards, or enable invincibility. The game's own
checkpoint protection and normal completion fade remain in effect.

## Planner

`planner.cjs` creates a separate simulation from the original movement and
enemy functions. Live state is copied into the simulation; no simulation
writes are sent back to the recorded game. A static distance field guides a
weighted time-expanded search. Hazards are predicted at every original tick;
candidate keyboard holds are collision-checked at every tick, even when
search nodes are six ticks apart. Finer four- and three-tick searches are
fallbacks. This is bounded, heuristic search and is not an optimality claim.

The controller selects an uncollected coin by static travel distance, then
replans from the observed endpoint. Once all coins are collected it targets
the finish area. It checks the observed player position and every hazard
position against prediction after each contiguous key hold. A mismatch,
death, stale request, or recording fault stops that route for inspection.

The first Level 4 attempt demonstrated a short-horizon failure: collecting
a coin was feasible, but that endpoint had no escape before the rotating
hazards arrived. The actual death is preserved. The planner was changed to
require a feasible additional 120 ticks of survival before accepting a coin
endpoint. Execution also continues to that checked endpoint if the coin was
collected earlier in the route. This is a finite viability check, not a
guarantee of eventual completion.

## Recording and privacy

A 1280x720 canvas combines the original 800x600 game with a small strategy
caption and status. MediaRecorder captures this canvas and game-only WebAudio
at a requested 40 fps, VP9/Opus. No desktop capture, browser chrome, account pages,
notifications, or microphone audio enter this stream. The strategy captions
describe intended actions and observable outcomes, not a private reasoning
transcript. After completion the user requested silent publication. All public
video exports contain zero audio streams. The reusable recorder was then changed
to video-only VP9; the completed run's original game-only audio stays in the
private raw source. The microphone was never accessed.

The published harness also adds a guard against mixing a new run into an existing
action journal and rejects cross-origin requests or non-loopback Host headers.
These packaging safeguards were added after the completed recording; they did
not change the recorded routes or the reported game result.

One-second chunks are written and fsynced before acknowledgement. Input
requires a fresh acknowledgement, sufficient disk reserve, and a matching
expected game-frame number. A recorder watchdog holds game time if chunk
acknowledgements become stale. Unique request IDs make exact retries
idempotent. The menu smoke test verified that a repeated ID did not execute
twice and that a stale expected frame was rejected.

The local read-only viewer displays snapshots of the same session. Its lower
refresh rate does not set the recorder's frame rate and it sends no game input.

Raw recording and detailed state journals stay local. A public repository must
exclude game assets, recordings, runtime state, account details, credentials,
and machine-specific paths. Published clips must be checked against the raw
recording and the sequential level-completion receipts.

## Reporting

Report actual deaths, all 30 level transitions, active game time, elapsed wall
time, planning work, recording validation, and any intervention. Disclose
removed planning pauses or speed changes. A completion claim requires the
original game's `finish` state and visible win screen, not just a planner's
prediction. Publication is a separate requirement after gameplay succeeds.
