# Dock

The return. Four phases, in order, no skipping:

| Phase | Owner | Gate |
|---|---|---|
| **1. Quarantine** | the vessel | mechanical checks, in the berth, no judgment |
| **2. Inspection** | an Inspector vessel | independent review of the diff against the brief |
| **3. Clearance** | Command | the human accepts the merge — always |
| **4. Teardown** | the Admiral | merge, verify landed, remove berth, archive buoy |

A unit of work reaches Command only after phases 1 and 2 are green. The Admiral never forwards work that failed a gate hoping Command will wave it through.

---

## Phase 1 — Quarantine

**Owner: the vessel.** Run every gate inside your berth, on your committed branch. Record each result in your buoy with the exact command and the tail of its output.

Gates are mechanical. A gate does not have an opinion; it exits 0 or it does not.

### Gate commands

If `.fleet/gates.md` exists, its commands are authoritative — use them verbatim. Otherwise infer from the repo's manifest, CI config, and existing scripts, and record what you inferred so the Admiral can promote it into `.fleet/gates.md`.

```markdown
# .fleet/gates.md
build: npm run build
test:  npm test
lint:  npm run lint && npx tsc --noEmit
```

### The gates

**1. HULL — it builds.**
```bash
npm run build     # or the repo's build command
```
No build step in the repo means the gate is *not applicable*, and you record it as such. It never means *passed*.

**2. TRIALS — the tests pass, and they test your change.**
```bash
npm test
```
Passing is necessary and not sufficient. Also confirm, and state in your report:
- your change is covered by a test that would **fail** without it — if you cannot name that test, the gate has not passed
- you did not delete, skip, `.only`, or weaken an existing test to get green
- the suite you ran actually includes your change's tests

**3. TRIM — lint and types are clean.**
```bash
npm run lint && npx tsc --noEmit
```
No suppressing a rule to pass. A new `eslint-disable`, `# type: ignore`, `@ts-expect-error`, or `#[allow(...)]` is a FAIL unless the brief asked for it, and it is reported as a FAIL even if the suite goes green.

**4. MANIFEST — you stayed in scope.**
```bash
git diff --name-only "$BASE"...HEAD
```
Compare every path against your declared scope. **Any file outside scope is a FAIL**, including ones you are sure are harmless. Revert them and re-run. This gate catches the failure mode that actually loses work in a shared-filesystem fleet.

**5. SWEEP — no debris.**
```bash
git diff "$BASE"...HEAD
```
Read your own complete diff, line by line, as if reviewing someone else. FAIL on:
- secrets, tokens, keys, real hostnames, real customer data
- `console.log`, `printf`, `dbg!`, breakpoints, debugger statements left in
- commented-out code, dead branches, unused imports or variables you introduced
- `TODO`/`FIXME` you added without the brief asking for it
- stray files: `.env`, editor config, build output, `.orig`/`.rej`, scratch scripts, fixtures you meant to delete
- placeholder text, "example.com", lorem ipsum, or stubbed logic presented as complete

**6. LEDGER — the branch is clean and current.**
```bash
git status --short              # must be empty
git log --oneline "$BASE"..HEAD # must be non-empty, messages must be real
git rebase "$BASE"              # must apply cleanly
```
An empty commit list means you have nothing to dock. A dirty tree means uncommitted work that the merge would not carry.

### Quarantine outcome

Write a `GATE` block to your buoy — one row per gate, with the command and PASS / FAIL / N/A. Never mark a gate PASS you did not run.

- **All green** → append `READY-TO-DOCK` and return your report (`doctrine/signals.md`).
- **Any red** → append `GATE-FAIL`, return to `doctrine/underway.md`, fix, and re-run **every** gate, not just the one that failed.
- **Three failed rounds** on the same gate → stop and signal `BLOCKED`. Grinding a fourth attempt on a gate you do not understand wastes a context window and usually means the brief is wrong.

Report gate failures verbatim. Never soften a red gate into "a small issue remains" (Article 6).

---

## Phase 2 — Inspection

**Owner: the Admiral, executed by an Inspector vessel.**

When a vessel signals `READY-TO-DOCK`, the Admiral dispatches an Inspector through `/fleet` using `@inspector.md`. The author never inspects its own work, and no Inspector inspects two vessels at once.

The Inspector gets its own read-only berth on the candidate branch, so it can verify independently rather than trusting the author's report:

```bash
git -C "$REPO" worktree add --detach ".fleet/berths/$INSPECTOR" "fleet/$CALLSIGN/$SLUG"
```

The Inspector re-runs every quarantine gate itself. A gate the author reported green that is red in the Inspector's berth is the single most serious finding the fleet can produce, and it is reported as such.

`agents/inspector.agent.md` owns what the Inspector looks for and how it reports. Its verdict is one of:

| Verdict | Meaning | Next |
|---|---|---|
| `CLEAR` | does what the brief asked, correctly, and nothing more | → phase 3 |
| `CLEAR WITH NOTES` | acceptable; findings are non-blocking | → phase 3, notes shown to Command |
| `FOUL` | one or more must-fix findings | → back to the author's `underway` |

The Inspector never edits, never fixes, never commits. It reports. Findings go back to the original vessel, which still owns the work.

Two `FOUL` verdicts on the same unit of work is an escalation to Command, not a third attempt.

The Inspector's berth is torn down as soon as its verdict is returned.

---

## Phase 3 — Clearance

**Owner: Command. Never the Admiral, never a vessel (Article 2).**

The Admiral presents a **Docking Request** and stops. It does not merge, does not stage a merge, does not "prepare" the merge, and does not proceed on a reply it had to interpret generously.

```
◆ DOCKING REQUEST — KESTREL
  extract token validation out of the request handler

  branch   fleet/KESTREL/extract-token-validation → main
  diff     4 files, +118 −64
  scope    clean — no files outside brief

  HULL ✓   TRIALS ✓ (6 new, 41 total)   TRIM ✓
  MANIFEST ✓   SWEEP ✓   LEDGER ✓

  PROVOST: CLEAR WITH NOTES
    · token.ts:44 — the 401 path is untested. Not in brief; worth a follow-up.

  Risk: low. Additive, no callers outside src/auth.
  Findings for later: src/api/session.ts still imports LegacyToken (out of scope).

  Clear KESTREL to merge?
```

Clearance must be explicit and must name what is being cleared. If Command replies in a way that does not clearly authorize *this* merge, ask once, plainly, and keep the vessel at anchor.

Command may also reply with changes. That sends the vessel back to `underway` with a new brief — it does not become the Admiral's work to patch (Article 1).

While waiting for clearance, the berth stays exactly as it is. Nothing is torn down at anchor.

---

## Phase 4 — Teardown

**Owner: the Admiral.** Only after explicit clearance.

### Merge

```bash
cd "$REPO"
git switch <base-branch>
git merge --no-ff "fleet/$CALLSIGN/$SLUG" -m "merge KESTREL: extract token validation"
```

`--no-ff` keeps the unit of work legible as a unit, which is the point of dispatching it as one. Follow the repo's own convention if it has a stated one.

If the merge conflicts, **stop**. Do not resolve project-code conflicts yourself (Article 1). Abort, and send the vessel back to rebase and re-quarantine:

```bash
git merge --abort
```

### Prove it landed — before touching anything

This is the Article 3 test. Both must hold:

```bash
# the branch is fully contained in the base branch
git branch --merged <base-branch> | sed 's/^[* +]*//' | grep -qxF "fleet/$CALLSIGN/$SLUG"

# and its tip commit is genuinely an ancestor of the base branch
git merge-base --is-ancestor "fleet/$CALLSIGN/$SLUG" <base-branch>
```

If either fails, the work is unlanded. Stop, report, tear down nothing.

### Remove the berth

```bash
git worktree remove ".fleet/berths/$CALLSIGN"
git worktree prune
git branch -d "fleet/$CALLSIGN/$SLUG"
```

`git worktree remove` without `--force` and `git branch -d` without `-D` are deliberate. Both refuse when there is unlanded work. **A refusal is a finding, not an obstacle** — it means something is in that berth that is not in the base branch. Investigate and report it. Never force past it (Article 3).

Teardown is not optional. A berth left behind holds a lock on its branch, blocks the callsign from reuse, and slows every subsequent `git status` in the repo.

### Close the log

```bash
mkdir -p .fleet/buoys/archive
mv ".fleet/buoys/$CALLSIGN.md" .fleet/buoys/archive/
```

Append the `DOCKED` signal with the merge commit sha before archiving. Update the work item's status in `.fleet/orders/<operation>.md`.

Then release any vessel that was **held** on this one — it launches from the new base, not the old one.

### Report

One line to Command, not a ceremony:

```
KESTREL docked. main is now e4f5a6b. LANCER released — launching from e4f5a6b.
```
