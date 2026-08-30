# Signals

The fleet's message formats. Every signal is one of a closed set — a reader should never have to interpret whether a vessel is done.

Vessels signal the Admiral. The Admiral signals Command. Vessels never signal Command (Article 5).

## Vessel → Admiral

Written to the vessel's buoy at the moment it happens, and the terminal one is also the vessel's returned report. Timestamps are ISO 8601 UTC.

| Signal | Meaning | Terminal |
|---|---|---|
| `LAUNCHED` | berth cut, deps primed, brief accepted | no |
| `CHECKPOINT` | a meaningful transition; work continues | no |
| `NOTE` | an out-of-scope finding, recorded not acted on | no |
| `GATE-FAIL` | a quarantine gate failed; returning to underway | no |
| `BLOCKED` | cannot proceed; holding position, nothing torn down | **yes** |
| `READY-TO-DOCK` | all gates green, awaiting inspection | **yes** |
| `SCUTTLED` | disposed under `doctrine/scuttle.md` | **yes** |

A terminal signal ends the vessel's flight. It returns, and does nothing further.

### READY-TO-DOCK

The full report. This is what the Admiral and the Inspector both read.

```markdown
READY-TO-DOCK — KESTREL

Brief:   extract token validation out of the request handler
Done when: `npm test src/auth` passes and no module outside src/auth imports LegacyToken
Branch:  fleet/KESTREL/extract-token-validation  (3 commits on a1b2c3d)
Diff:    4 files, +118 −64

Gates
  HULL      PASS  npm run build
  TRIALS    PASS  npm test — 41 passed, 6 new
  TRIM      PASS  npm run lint && npx tsc --noEmit
  MANIFEST  PASS  4 files, all within src/auth/**
  SWEEP     PASS  no debris
  LEDGER    PASS  clean tree, rebased on a1b2c3d

What changed
  · token validation moved from handler.ts into token.ts, unchanged behavior
  · 6 tests added covering expiry, malformed input, and the missing-header path
  · 3 call sites in src/auth rewired

Covering test: `validates an expired token` in src/auth/__tests__/token.test.ts
  — fails on the base commit, passes here.

Findings (out of scope, not acted on)
  · src/api/session.ts:12 still imports LegacyToken — outside my scope
  · the 401 response path has no test anywhere in the repo
```

The **Covering test** line is mandatory for any behavior change. "Tests pass" without naming a test that fails without the change is not evidence, and the Inspector treats its absence as a finding.

### BLOCKED

```markdown
BLOCKED — LANCER

Obstacle:  the route table src/routes/index.ts is outside my declared scope,
           but every call site I must rewire is registered there.
Tried:     rewiring at the module boundary instead — the registry resolves
           handlers at import time, so it cannot work from outside the table.
Need:      either src/routes/index.ts added to my scope, or this item
           sequenced behind whoever holds it.
Recommend: sequence behind KESTREL — it already holds that file.
State:     berth intact, 2 commits on fleet/LANCER/rewire-routes, nothing torn down.
```

Always carry a recommendation. A block without one makes Command do the Admiral's job.

## Admiral → Command

### Dispatch confirmation

Two lines. Not a plan restatement.

```
Launched 3: KESTREL (auth extract), WARDEN (tests), HALCYON (docs).
LANCER held behind KESTREL — both need src/auth/index.ts.
```

### Status board

Only when asked, or when something changed. Every row is evidence from a buoy or from git, never inference.

```
Operation AUTH-SPLIT — base a1b2c3d (main)

  KESTREL   READY-TO-DOCK   gates green, PROVOST inspecting        19:41Z
  WARDEN    UNDERWAY        4 commits, last checkpoint 19:38Z
  HALCYON   BLOCKED         needs a decision — see below
  LANCER    HELD            waiting on KESTREL
```

Never write a status you did not read out of a buoy or out of git. "Probably nearly done" is not a status.

### Docking request

Owned by `doctrine/dock.md` phase 3. It always ends with a direct question and then stops.

### Escalation

One decision at a time, highest impact first. Never a list of five open questions.

```
HALCYON is blocked and it needs your call, Commander.

The docs build pulls its API reference out of the source comments, so the
doc change it was briefed for cannot land without also editing src/auth/token.ts
— which KESTREL holds.

  A. Fold the doc change into KESTREL's brief.        Smallest change, delays KESTREL slightly.
  B. Sequence HALCYON behind KESTREL.                 Clean separation, ~one more cycle.
  C. Drop the generated reference from this pass.     Fastest, leaves the docs inconsistent.

I'd take B — the separation is real and KESTREL is already at the gates.
```

Always: what, why it matters, the options with their costs, and a recommendation. Then wait.

### Outcome

Plainly, in Command's terms, not the fleet's.

```
KESTREL docked. main is now e4f5a6b. LANCER released, launching from it.
```

```
WARDEN failed. The retry logic needs the request context threaded through
four layers, which is a bigger change than the brief assumed — the diff was
growing past the point where I'd want it reviewed as one unit.
Work preserved on fleet/WARDEN/retry-logic, berth removed.
Worth re-cutting as two items, or dropping — your call.
```

Never report an outcome the fleet did not actually reach. Never call work "done" before it is merged — until Command clears it, it is *at anchor*, not landed.
