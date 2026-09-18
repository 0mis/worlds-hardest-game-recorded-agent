# Results: one recorded 30-level run

On September 18, 2026, the controller completed all 30 levels of the publisher's
HTML5 World's Hardest Game, in order, with **one death**. The original game entered
its `finish` state and displayed **YOU WIN!** The sequential action audit found no
violations, and all 41 downloaded assets still matched their starting SHA-256 hashes.

[Full silent video](https://youtu.be/zeuWg2qGqW0) ·
[Video validation and SHA-256](media-verification.json)

| Measurement | Observed result |
| --- | ---: |
| Levels completed | 30 / 30 |
| Deaths | 1, on Level 4 |
| Displayed game time | 10:39.075 |
| Wall time from first entering Level 1 to winning | 30:06.058 |
| Raw recording duration | 32:19.317 |
| Silent public edit | About 20:51 |
| Removed long idle footage | 11:28.625 |
| Executed input requests | 2,028 |
| Executed game ticks, including menus and win animation | 25,767 |
| Recorded chunks finalized to disk | 1,902 |
| Public video audio streams | 0 required and verified before upload |

The game timer is virtual active game time. It excludes held planning time and
includes ordinary game intermissions. It must not be presented as a human-speed
completion time. The public edit removes selected long setup/planning freezes;
some shorter pauses remain. It does not accelerate the actual gameplay.

## What the agent did

GPT-6 Astra wrote and supervised the controller, inspected snapshots, investigated
the Level 4 failure, and changed the planner. The program read exact game state,
simulated the original movement/hazard functions, searched routes, and sent normal
keyboard controls. Most individual movements were automated by that program.
This is a source-aware, state-aware, tool-assisted engineering experiment.

## The failure that changed the planner

The first Level 4 attempt reached a coin but stopped at an unsafe endpoint. The
rotating hazards left no escape, and the run incurred its only death. A successful
short route was not enough: the endpoint needed a viable continuation.

The revised planner required an additional **120 ticks / 3 seconds** of feasible
survival before accepting a coin endpoint. The executor also continued to that
checked endpoint when the coin was collected earlier along the route.

An offline comparison reused the same historical observation and varied only
the endpoint survival requirement:

| Same Level 4 observation | No viability check | 120-tick viability check |
| --- | ---: | ---: |
| Route length | 60 ticks | 60 ticks |
| Search nodes expanded | 70 | 71 |
| Chosen endpoint (x, y) | (416, 278) | (434, 278) |
| Next coin reachable within the tested search | No | Yes, in 4 ticks |

This is a single illustrative case, not a general reliability estimate. The
comparison ran only in simulation and did not replace or rewrite the recorded
failure. See [level4-ablation.json](level4-ablation.json).

## Evidence and limits

- [RESULTS.json](RESULTS.json) contains sanitized measurements and a completion
  receipt for each level. Raw state journals and recordings remain private.
- [game-asset-hashes.json](game-asset-hashes.json) lists the publisher's public
  asset URLs and hashes. Copyrighted game assets are not redistributed here.
- Every executed action had a matching request ID, expected frame, and recording
  health checks. The menu smoke test rejected stale frames and did not replay an
  identical request ID. These checks are safeguards, not a proof against every
  possible storage or system failure.
- The public video is silent. Capture never accessed the microphone or desktop.
  The initial private raw file contained game-only audio; that track was omitted
  from every public export, and the reusable recorder now records video only.
- There was one run and an intervention after the Level 4 death. No claim of
  vision-only play, reflex performance, optimal routes, or broad benchmark
  superiority follows from this result.

The campaign journal contains 307 automated planning calls totaling 106.204
seconds (median 0.250 seconds). This excludes the early manual development and
Level 4 intervention and should not be interpreted as total model thinking time.

Private raw recording SHA-256:
`64f842c00d1c4b97ced137e233fce07dba83b7405cb52b574063b074c42bb617`

## Credits

Game: Stephen Critoph / Snubby Land. The original game credits music to Snayk;
the published research video has no audio.

- [Play the publisher's edition](https://www.coolmathgames.com/0-worlds-hardest-game)
- [Original Newgrounds release](https://www.newgrounds.com/portal/view/431039)
- [Method and controller design](METHODS.md)

The MIT license in this repository applies only to the original harness and
documentation, not to the game, artwork, or music.
