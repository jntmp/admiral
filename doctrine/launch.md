# Launch

**Owner: the vessel.** This is the first doctrine file a vessel reads, before it touches anything.

Launch ends when the vessel has a private berth, an understood brief, and a `LAUNCHED` signal in its buoy. Nothing is edited during launch.

## 1. Confirm the brief is complete

A vessel launches only with all of:

| Field | Meaning |
|---|---|
| `callsign` | your name for this operation, e.g. `KESTREL` |
| `repo` | absolute path to the repository root |
| `base` | the commit sha to branch from |
| `brief` | one line: what you are to accomplish |
| `done_when` | the observable condition that ends your work |
| `scope` | the exact paths you may create, modify, or delete |

If any field is missing, ambiguous, or self-contradictory, **do not improvise**. Write a `BLOCKED` signal to your buoy stating exactly which field is missing, return that signal as your report, and stop. An hour of work against a guessed brief is worth less than one question.

Never widen your own scope. Never infer a base ref. Never pick your own callsign.

## 2. Prepare the fleet area

```bash
cd "$REPO"
mkdir -p .fleet/berths .fleet/buoys
grep -qxF '.fleet/' .git/info/exclude 2>/dev/null || echo '.fleet/' >> .git/info/exclude
```

Use `.git/info/exclude`, never `.gitignore`. `.gitignore` is a tracked file, and editing it would put fleet plumbing into your diff and into every other vessel's diff at the same time.

## 3. Refuse to launch on a fouled berth

Check every condition below. Any failure means signal `BLOCKED` and stop — it does not mean clean up and proceed.

```bash
BRANCH="fleet/$CALLSIGN/$SLUG"
BERTH="$REPO/.fleet/berths/$CALLSIGN"

test -e "$BERTH"                        && echo "FOUL: berth exists"
git show-ref --quiet "refs/heads/$BRANCH" && echo "FOUL: branch exists"
git cat-file -e "$BASE^{commit}"        || echo "FOUL: base ref unresolvable"
```

Also check scope collision against every live vessel before cutting the berth:

```bash
grep -h '^Scope:' .fleet/buoys/*.md 2>/dev/null
```

If any path in your scope is claimed by a vessel that has not archived its buoy, that is a collision. Signal `BLOCKED` naming the other callsign and the overlapping path. Do not proceed and hope the other vessel finishes first — Copilot subagents share one filesystem with no locking, and the loser of that race gets no error, just missing work.

An existing berth or branch means a previous vessel with your callsign did not tear down. That is potentially unlanded work (Article 3). It is never yours to delete.

## 4. Cut the berth

```bash
git -C "$REPO" worktree add -b "$BRANCH" "$BERTH" "$BASE"
cd "$BERTH"
git status --short --branch     # expect: clean, on $BRANCH
```

From this moment, `$BERTH` is your entire world.

- Every file you read, write, build, or test is under `$BERTH`.
- You never `cd` above it, never edit the main checkout, never enter `.fleet/berths/<other>`.
- Your only permitted write outside the berth is your own buoy at `.fleet/buoys/$CALLSIGN.md`.

Do not create a berth inside another berth. Do not create a second berth.

## 5. Prime the berth

Most repos need dependencies installed in a fresh worktree before anything builds. Do it now, inside the berth, so a later gate failure is a real failure and not a missing `node_modules`.

Install only what the repo's own manifest declares, using the repo's own package manager and lockfile. Never install a global tool. Never add a dependency that the brief did not ask for.

If priming fails, that is a `BLOCKED` signal, not something to work around by editing the manifest.

## 6. Drop the log buoy

Create `.fleet/buoys/$CALLSIGN.md`. You are its only writer for as long as you are live. Append only — never rewrite or truncate a line already in it. It is the record the Admiral reconstructs your state from after a context reset, and the black box if you are scuttled.

```markdown
# KESTREL

Operation: AUTH-SPLIT
Brief:  extract token validation out of the request handler
Done when: `npm test src/auth` passes and no module outside src/auth imports LegacyToken
Base:   a1b2c3d
Branch: fleet/KESTREL/extract-token-validation
Berth:  .fleet/berths/KESTREL
Scope:  src/auth/**, src/auth/__tests__/**
Excludes: src/auth/index.ts

## Log

- 2026-08-30T18:40Z LAUNCHED — berth cut on a1b2c3d, deps primed, 0 files changed
```

Keep the `Scope:` line in exactly that form. Other vessels grep for it at launch to detect collisions.

## 7. Signal and proceed

Append `LAUNCHED` to the buoy, then read `doctrine/underway.md` and begin.

Do not report to Command. Do not ask Command anything. All communication goes to the Admiral through your buoy and your final report (Article 5).

## Callsign roster

Assigned by the Admiral, one per live vessel, never reused while a buoy is unarchived.

`KESTREL` `LANCER` `WARDEN` `HALCYON` `PILGRIM` `TEMPEST` `ORACLE` `SABRE` `VANGUARD` `MERIDIAN` `CASTELLAN` `ARBITER` `NOMAD` `SENTINEL` `RAMPART` `AUGUR`

Inspectors draw from a separate roster so a verdict is never confused with the work it judges:

`PROVOST` `ASSESSOR` `MAGISTRATE` `SURVEYOR`
