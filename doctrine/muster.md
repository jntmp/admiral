# Muster

**Owner: the Admiral.** Vessels do not read this file.

Muster is everything that happens between Command stating an objective and the first vessel launching. It is read-only work. No project file changes during muster.

## 1. Take bearings

Survey before planning. Read-only, and bounded — this is orientation, not the work itself.

```bash
git -C <repo> status --short --branch
git -C <repo> log --oneline -10
git -C <repo> worktree list
ls .fleet/buoys/ 2>/dev/null
```

Establish:
- The **base ref** every vessel branches from. Default `HEAD` of the current branch. Say which it is.
- Whether the main checkout is clean. A dirty main checkout is Command's uncommitted work — never touch it, and say so if it will affect the merge later.
- Which vessels are already live, and what file scopes they hold. New scopes must not overlap live ones.

If `.fleet/gates.md` does not exist, read the repo's build/test/lint configuration and propose one at muster (see `doctrine/dock.md`). Getting the gates right once is worth more than any single work item.

## 2. Decide whether this is fleet work at all

A fleet is not automatically the right answer. Dispatch a fleet only when the objective decomposes into work items that are:

- **Independent** — no item needs another item's output to begin.
- **Disjoint in files** — no two items touch the same file. Not "probably won't"; *will not*.
- **Individually verifiable** — each item can pass the quarantine gates on its own.
- **Worth a context window** — an item that is two lines of edit costs more to dispatch than to do.

If the work is inherently sequential, say so and dispatch **one** vessel. A chain of dependent items run in parallel produces conflicts, not speed. Parallelism is also not free: every vessel is its own context window and its own credit spend.

If the objective is too vague to partition — "make the app faster", "clean up the auth code" — do not guess a partition. Dispatch a single **scout** vessel whose brief is to investigate and report, with an empty write scope, and muster again on its findings.

## 3. Partition by file, not by feature

Partition on the filesystem, because that is where collisions actually happen.

For each work item, write down the exact set of paths it may create, modify, or delete. Globs are allowed; overlap is not. Walk the list twice and confirm no path is claimed by two items.

Shared files are where fleets die. A lockfile, a barrel `index.ts`, a route table, a migrations directory, a `CHANGELOG`, a DI container registration — if two items both need it, that file belongs to exactly one item, or the items are not independent and must be sequenced.

When two items genuinely need the same file, choose one:
- **Sequence them.** Hold the second until the first has docked, then launch it from the new base.
- **Merge them** into a single work item for one vessel.
- **Assign the shared file to one item** and have the other item's brief state explicitly that it does not touch it.

Never resolve it by hoping.

## 4. Write the fleet order

Write `.fleet/orders/<operation>.md` before dispatching anything. It is the record that survives a context reset, and the Admiral reconstructs fleet state from it plus the buoys plus `git worktree list`.

```markdown
# Operation <NAME>

Objective: <one sentence, in Command's terms>
Base ref: <sha> (<branch>)
Mustered: <ISO timestamp>

## Work items

### KESTREL — <one-line brief>
Scope:    src/auth/**, src/auth/__tests__/**
Excludes: src/auth/index.ts   (held by LANCER)
Done when: <observable, testable condition>
Depends on: none
Status: launched

### LANCER — <one-line brief>
Scope:    src/auth/index.ts, src/routes/**
Done when: <observable, testable condition>
Depends on: KESTREL         # held until KESTREL docks
Status: held
```

`Done when` is the most important line in the order. It must be observable by someone who did not write the code — a passing test, an exit code, a command's output. "auth is refactored" is not a done condition. "`npm test src/auth` passes and no module outside `src/auth` imports `LegacyToken`" is.

## 5. Present the plan before launching

Show Command the plan before dispatch whenever the fleet is more than two vessels, the objective was ambiguous, the partition required a judgment call, or any item touches migrations, dependencies, CI config, or auth.

Keep it to the shape below. Command should be able to approve or redirect in one read.

```
Operation AUTH-SPLIT — 3 vessels, base a1b2c3d (main)

  KESTREL   extract token validation      src/auth/**
  LANCER    rewire routes to new API      src/auth/index.ts, src/routes/**   (held: after KESTREL)
  WARDEN    backfill missing auth tests   src/auth/__tests__/**

Sequential: LANCER holds on KESTREL — both need src/auth/index.ts.
Launch?
```

For a single obvious vessel on a small change, skip the ceremony and just dispatch.

## 6. Dispatch

Every work item is dispatched as a vessel through `/fleet`, with `@vessel.md` as the agent. The Admiral does not implement work items itself under any circumstance (Article 1).

The `/fleet` prompt must carry, for every item, everything the vessel needs to run without asking a follow-up question — a subagent has its own context window and cannot see this conversation:

- callsign, and the doctrine path to read first
- the one-line brief and the `Done when` condition
- the base ref, as a sha
- the exact file scope, and any explicit exclusions
- the repo root as an absolute path

Dispatch only items whose dependencies have already docked. Held items stay held; launching a held item early is how two vessels end up in the same file.

Assign callsigns from the roster in `doctrine/launch.md`. Never reuse a callsign while its previous vessel is live or its buoy is unarchived.

## 7. Stand watch

While vessels are underway the Admiral is read-only and quiet.

Fleet state comes from evidence, never from inference:

```bash
git -C <repo> worktree list
git -C <repo> log --oneline <base>..fleet/<callsign>/<slug>
tail -20 .fleet/buoys/<callsign>.md
```

Never tell Command what a vessel is "probably doing" or "should be close to done with". Report the last recorded signal and its timestamp, or say that nothing new has come in.

Do not ping Command with progress that contains no new information. Speak when a vessel signals `READY-TO-DOCK`, `BLOCKED`, or `GATE-FAIL` three times; when a decision is needed; or when Command asks.

When a vessel signals `READY-TO-DOCK`, go to `doctrine/dock.md`.
When a vessel signals `BLOCKED`, decide: re-brief it, re-scope it, sequence it behind another vessel, or escalate to Command with a recommendation. Escalate one decision at a time.
