# Scuttle

The abort path. A vessel is scuttled when its work will not dock: the brief was wrong, the approach failed, the partition collapsed, or Command called it off.

**Scuttling is not deleting.** It is the controlled disposal of a berth while preserving everything that might still matter. Article 3 applies with full force here — this is precisely the phase where work gets destroyed by accident.

## Who may scuttle

Only the Admiral, and only for one of:

- Command explicitly cancelled the work item
- the vessel signalled `BLOCKED` and re-mustering superseded the item
- the vessel reported unrecoverable failure
- a partition collapse means the item must be re-cut and re-launched
- two `FOUL` inspections and Command chose to abandon rather than iterate

A vessel never scuttles itself. A blocked vessel holds position and reports; it does not tidy itself away. A vessel deciding its own work is worthless and deleting it is the worst outcome this system can produce.

## The order of operations

### 1. Establish what exists

```bash
cd ".fleet/berths/$CALLSIGN"
git status --short                          # uncommitted work?
git log --oneline "$BASE"..HEAD             # committed work?
```

This determines everything that follows. Never scuttle without running it.

### 2. Preserve committed work — always

If `git log "$BASE"..HEAD` is non-empty, **the branch is kept**. It costs nothing and it is the only copy.

Remove only the berth:

```bash
cd "$REPO"
git worktree remove ".fleet/berths/$CALLSIGN"    # never --force
git worktree prune
```

Do **not** run `git branch -d`, and never `git branch -D`. The branch is the black box. Say so in the report: *"WARDEN scuttled. Its work is preserved on `fleet/WARDEN/retry-logic` — 3 commits, unmerged."*

Command can recover it later. Deleted, it cannot.

### 3. Uncommitted work needs Command's word

If `git status --short` is non-empty, there is work that exists nowhere else. `git worktree remove` will refuse, and it is right to.

Two paths, and the Admiral picks neither on its own:

- **Preserve it** (default, and what to recommend): commit it to the vessel's branch as a work-in-progress commit, then remove the berth cleanly. Nothing is lost, and the branch tells the whole story.
  ```bash
  git -C ".fleet/berths/$CALLSIGN" add -A
  git -C ".fleet/berths/$CALLSIGN" commit -m "wip: scuttled mid-flight — <reason>"
  ```
- **Discard it** — only on explicit, current authorization from Command that names this vessel and says to discard the uncommitted work. Not implied by "cancel that", not implied by "we're not doing that anymore".

Never `--force`, never `git reset --hard`, never `git clean -fd`, never `git checkout -- .` to get past the refusal.

### 4. Close the log honestly

Append to the buoy before archiving it, then archive rather than delete — a scuttled vessel's buoy is often the most useful record in the operation, because it says why something did not work.

```markdown
- 2026-08-30T20:14Z SCUTTLED — brief superseded: the token cache turned out to be
  a separate subsystem and the partition was wrong.
  Work preserved on fleet/WARDEN/token-cache (3 commits, unmerged).
  Berth removed. Findings: the cache is invalidated in two places, not one —
  see src/cache/index.ts:88 and src/auth/session.ts:31.
```

```bash
mv ".fleet/buoys/$CALLSIGN.md" .fleet/buoys/archive/
```

Mark the item scuttled in `.fleet/orders/<operation>.md`, with the reason.

### 5. Report plainly

Bad news first, no flavor, no framing (Article 6).

```
WARDEN scuttled — the brief was wrong, not the code.
The token cache is its own subsystem, so the src/auth partition never held.
Work preserved on fleet/WARDEN/token-cache (3 commits, unmerged), berth removed.
Re-mustering that item as two: cache invalidation, and auth call sites.
```

Do not bury a scuttle inside a status update about other vessels. Do not describe it as "paused" or "deferred" when the berth is gone.

## Recovering a derelict

A **derelict** is a berth in `git worktree list` whose vessel is gone — a crashed subagent, a killed session, a context that never returned.

Derelicts are not garbage to be swept. Treat one exactly as a scuttle in progress: establish what exists, preserve committed work on its branch, get Command's word before discarding anything uncommitted.

```bash
git worktree list                       # berths with no live vessel
ls .fleet/buoys/                        # unarchived buoys = vessels believed live
git worktree prune --dry-run            # what git thinks is stale — read, do not act
```

A buoy with a `LAUNCHED` and no terminal signal, whose berth still exists, is a derelict. Its last `CHECKPOINT` tells you how far it got, and that is usually enough to decide between resuming the branch with a fresh vessel and re-mustering the item.

Never run a bulk cleanup across berths. Handle derelicts one at a time, with evidence, as you would a scuttle.
