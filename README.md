# admiral

A fleet-command distro for **GitHub Copilot CLI**.

You talk to one agent — the **Admiral**. It decomposes your objective, dispatches the work through `/fleet` as parallel **vessels**, keeps each one in its own git worktree so they cannot destroy each other, runs every returning unit of work through automated gates and an independent inspector, and then brings it to you for clearance.

**You are the only one who can merge.** Nothing lands without your explicit word.

Shaped after [firstmate](https://github.com/kunchenguid/firstmate)'s crew model, rebuilt on Copilot CLI's `/fleet` primitive.

## The problem it solves

Copilot CLI's `/fleet` runs subagents in parallel, and they all share one working directory with **no file locking**. From GitHub's own writeup: *if two agents write to the same file, the last one to finish wins — silently.* No error, no conflict marker, just missing work.

This distro closes that hole two ways:

1. **Every vessel gets its own git worktree** (a *berth*) and never leaves it.
2. **Every vessel gets a declared file scope**, and a file outside it in the diff is a hard gate failure.

Work comes back as a branch, not as edits in your tree — so nothing merges until you say so, and nothing is lost if a vessel fails.

## Install

```bash
./install.sh --user            # ~/.copilot/agents + ~/.copilot/fleet/doctrine
/install.sh --repo ~/code/x   # <repo>/.github/agents + <repo>/.github/fleet/doctrine
```

Repo-level installs win over user-level, which is what you want for per-project gate configuration.

## Use

```bash
cd ~/code/your-repo
copilot --agent admiral
```

Then either give it an objective in plain language, or drive `/fleet` directly:

```
/fleet extract token validation out of the auth handler, backfill the missing
       auth tests, and update the API docs to match
```

The Admiral musters, shows you the partition, and waits before launching anything non-trivial.

Non-interactive:

```bash
copilot --agent admiral -p "/fleet <objective>" --no-ask-user
```

Bear in mind that a fleet costs a context window and a credit spend per vessel. The Admiral is instructed to refuse to fan out work that is actually sequential.

## What's in the box

```
agents/
  admiral.agent.md      the one you talk to — orchestrates, never writes code
  vessel.agent.md       a worker — one brief, one berth, one branch, one scope
  inspector.agent.md    independent reviewer — re-runs the gates, never fixes

doctrine/
  articles.md           the law: 8 hard rules binding on everyone
  muster.md             Admiral: decompose an objective into a fleet order
  launch.md             Vessel: cut a berth, accept the brief
  underway.md           Vessel: do the work
  dock.md               quarantine → inspection → clearance → teardown
  scuttle.md            abort and derelict recovery without losing work
  signals.md            the report formats used throughout
```

The Admiral reads `articles.md` first every session. Vessels read `articles.md` and `launch.md` before touching a single file.

## The lifecycle

```
  MUSTER      Admiral partitions the objective by file scope, writes the order,
              shows you the plan
     ↓
  LAUNCH      each vessel cuts its own worktree at .fleet/berths/<CALLSIGN>
              on branch fleet/<CALLSIGN>/<slug>
     ↓
  UNDERWAY    work, commit, log to .fleet/buoys/<CALLSIGN>.md
     ↓
  DOCK        1. QUARANTINE   six mechanical gates, run by the vessel
              2. INSPECTION   an Inspector re-runs them and reviews the diff
              3. CLEARANCE    ── you ──  the only way anything merges
              4. TEARDOWN     merge, prove it landed, remove the berth
     ↓
  SCUTTLE     the abort path: work is preserved on its branch, never deleted
```

### The six quarantine gates

| Gatr | Checks |
|---|---|
| **HULL** |  builds |
| **TRIALS** | tests pass, *and* a named test fails without the change |
| **TRIM** | lint and types clean, with no new suppressions |
| **MANIFEST** | zero files outside the declared scope |
| **SWEEP** | no secrets, debug output, dead code, or stray files |
| **LEDGER** | clean tree, real commits, rebases onto base |

Configure the commands per repo in `.fleet/gates.md`:

```markdown
build: npm run build
test:  npm test
lint:  npm run lint && npx tsc --noEmit
```

Gates are mechanical — they exit 0 or they don't. Judgment lives in the Inspector, which returns `CLEAR`, `CLEAR WITH NOTES`, or `FOUL`, and never edits anything.

## Fleet state on disk

Everything lives under `.fleet/`, excluded through `.git/info/exclude` so your tracked `.gitignore` is never touched.

```
.fle
├── orders/<operation>.md   the decomposition and dispatch record
├── berths/<CALLSIGN>/      one git worktree per vessel  (transient)
├── buoys/<CALLSIGN>.md     one append-only log per vessel, single writer
├── buoys/archive/          logs of docked and scuttled vessels
└── gates.md                per-repo gate commands
```

One writer per file, always — which is why logs are per-callsign and never shared. All of it is reconstructible from disk plus `git worktree list`, so a compacted context or a killed session doesn't lose the fleet.

## The Articles

The hard rules, in priority order. They outrank every brief.

1. **The Admiral never writes to the project.** Vessels make every change.
2. **Only you grant clearance to merge.** Per unit of work, explicitly, every time.
3. **Never destroy unlanded work.** No `--force`, no `-D`, no `reset --hard`. A refusal from git is evidence, not an obstacle.
4. **One vessel, one berth, one branch, one scope.**
5. **Vessels never address you.** Everything routes through the Admiral.
6. **Report faithfully.** A red gate is reported red, with its output.
7. **The brief is the boundary.** Out-of-scope discoveries are findings, not diffs.
8. **Nothing leaves the machine without orders.** No pushes, no PRs, no network.

## Tuning it

- **What you're called.** The Admiral addresses you as *Commander*. One line in `agents/admiral.agent.md` and one in `doctrine/articles.md`.
- **How it talks.** The *Bridge manner* section of `agents/admiral.agent.md` is the whole conversational contract — length, escalation shape, when to stay quiet. Edit it there.
- **Callsigns.** The roster is at the bottom of `doctrine/launch.md`.
- **Gates.** Per repo, in `.fleet/gates.md`.
- **Tool restrictions.** The Admiral's read-only boundary is enforced in prose, not by the `tools:` frontmatter field — it needs `write` for `.fleet/` and `shell` for git. If you want it enforced mechanically, add `tools:` to the agent profiles and verify the alias names against `copilot --help`; a wrong alias silently removes a capability the agent needs.
