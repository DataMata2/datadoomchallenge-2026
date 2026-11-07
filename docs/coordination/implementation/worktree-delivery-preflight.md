# Worktree delivery preflight

Read-only snapshot: 2026-11-08, before Task 6 completion. Author: `/root/delivery_preflight`; decision owner: overseer. No Git, source, credential, evidence, database, process or network changes were made. This report is the only write.

## Recommendation

Deliver and demonstrate from the active native worktree for now. Keep the canonical database at `/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026/runtime/cqa.sqlite3`. No database migration or copy is needed. Integrating source into original `main` can happen after Task 6 review without moving runtime state. Do not manually remove or relocate the managed native worktree.

`git worktree list --porcelain` and `git rev-parse` identify:

| Checkout | Branch | Observed HEAD |
| --- | --- | --- |
| `/home/datamata/Projects/hackathons/datadoomchallenge-2026` | `main` | `b4505aad02473e8b696e8994cfea797a406dab2b` |
| `/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026` | `feat/cqa-prototype` | `5fe6c904d5e7043e74ef2c0c15f49b5040669940` |

`git merge-base --is-ancestor main feat/cqa-prototype` exited 0. Original tracked files are clean. Active worktree has a modified implementation ledger and untracked frontend implementation files; Task 6 is unfinished. Final delivery must use the subsequently reviewed commit, not assume this snapshot is final.

## Original-checkout path conflicts

Intersection of original `git ls-files --others --exclude-standard` with feature `git ls-tree -r --name-only HEAD` is exactly these eight paths. Preserve all eight before attempting a fast-forward; no destructive merge rehearsal was run. Equality was checked against feature HEAD bytes and its working file; both comparisons agreed.

| Original untracked path | Equals feature copy |
| --- | --- |
| `docs/coordination/implementation/assistant-design-check.md` | Yes |
| `docs/coordination/implementation/demo-checkpoints.md` | No |
| `docs/coordination/implementation/demo-selection.md` | Yes |
| `docs/coordination/implementation/holiday-calendar.md` | No |
| `docs/coordination/implementation/ledger.md` | No |
| `docs/coordination/implementation/local-experiment-preflight.md` | Yes |
| `docs/coordination/implementation/readiness.md` | Yes |
| `docs/superpowers/plans/2026-11-07-cqa-prototype.md` | No |

The other ten original untracked documents do not intersect the current feature tree: five materials-review documents, two product-discovery feasibility reports, and three repository coordination documents. This report adds another nonconflicting original untracked document. Recompute the intersection after the final Task 6 commit because that commit may introduce more paths.

Ignored original paths observed by directory inventory: `.env`, `.aws/`, `.codex/`, and `docs/coordination/{implementation,materials-review,product-discovery}/evidence/`. None is tracked in the observed feature tree. Leave them in place. Do not use `git clean`, force checkout, broad reset, or broad stash to clear the untracked documents.

If the overseer later chooses original-main integration:

1. Finish and review Task 6, record its exact commit, and recheck both statuses and ancestry.
2. Preserve every then-conflicting original untracked document, including byte-identical copies, in a uniquely named ignored directory under original `docs/coordination/implementation/evidence/`, retaining relative paths. Move only the enumerated conflicts after preservation verification. Keep the differing originals available for reconciliation; do not overwrite them with feature copies. Other untracked documents and all ignored evidence stay in place.
3. Run the fast-forward below. If it fails, inspect its explicit conflict list; do not force it. Preserved files can be restored to their original paths if integration is abandoned, provided those destinations are absent.

```bash
delivery_project=/home/datamata/Projects/hackathons/datadoomchallenge-2026
delivery_active=/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026
git -C "$delivery_project" status --short --untracked-files=all
git -C "$delivery_active" status --short --untracked-files=all
git -C "$delivery_project" merge-base --is-ancestor main feat/cqa-prototype
# After preserving and clearing only verified untracked path conflicts:
git -C "$delivery_project" merge --ff-only feat/cqa-prototype
```

This changes source checkout state only. Continue pointing any backend at the same active absolute database and lock paths. Do not create an original-checkout `runtime/cqa.sqlite3` as a second live ledger.

## Startup and ownership

Current README line 15 still defers startup instructions. Task 6 brief lines 3–5 and 40–42 require `scripts/dev.sh`, one backend at port 8000, Vite at 5173, explicit credentials/database, and server ownership reporting. The script did not yet exist when checked. The eventual command template, conditional on its reviewed implementation, is:

```bash
delivery_project=/home/datamata/Projects/hackathons/datadoomchallenge-2026
delivery_active=/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026
cd "$delivery_active"
CQA_ENV_FILE="$delivery_project/.env" \
CQA_DATABASE_PATH="$delivery_active/runtime/cqa.sqlite3" \
CQA_MODEL_LOCK="$delivery_active/runtime/model-jobs.lock" \
bash scripts/dev.sh
```

Use those same absolute runtime paths even if source later starts from original `main`. Settings currently default database and lock to relative `runtime/...` paths (`backend/src/cqa/config.py:10,17`), so relying on a different working directory would create a new ledger. `CQA_ENV_FILE` reads the original backend credential file lazily; do not source, print, copy, normalize again, or expose its value through `VITE_*`. Default CORS permits localhost/127.0.0.1:5173 (`config.py:18–20`).

My `ss -ltnp` attempt could not open a netlink socket; no workaround was attempted. Parent subsequently reported an approved host check at 01:21 Asia/Almaty found no 8000/5173 listeners and assigned the frontend worker sole ownership of one dev.sh backend/frontend pair. Reuse that worker's recorded sessions/PIDs after QA; do not start this template alongside them. Confirm ownership with that worker before any stop/restart. No process absence is asserted beyond the parent's timestamped check.

Restart is a database-affecting operation: app creation initializes the store/checklist (`backend/src/cqa/main.py:39–54`), and `JobManager.startup()` recovers active runs as interrupted and accounts for unknown reservations (`backend/src/cqa/jobs.py:34–69`). Gracefully quiesce the existing sole owner and wait for in-flight work before replacing it. No second JobManager may open the live database concurrently.

## Preservation and SQLite conditions

Filesystem metadata confirms canonical active `runtime/cqa.sqlite3` and its model-job lock exist; original has no runtime directory. No WAL/SHM siblings were present at inspection. Database contents were not opened. USD 1.029502 / 68 attempts / zero outstanding reservations is parent/ledger evidence, not an independently recomputed result in this preflight (`active docs/coordination/implementation/ledger.md:74,114`). Preserve the latest paid ledger even if source integration is reversed.

No SQLite backup is required for the recommended source-only delivery. If a later operation genuinely needs a backup, first identify and quiesce all writers and in-flight model jobs, then use SQLite's backup API into a private ignored archival directory and verify the archive before any relocation. A raw live-file copy is insufficient. The archive must never become a second active database. Never restore a backup taken before subsequent paid calls; reconcile from the latest authoritative ledger instead. Changing source branches does not authorize rolling back database state.

## Open items and limits

- Parent decides source integration after review; runtime remains active in either option.
- Task 6 worker must supply reviewed startup behavior, owned process/session details, and actual UI/build/test evidence. This preflight does not approve its unfinished implementation.
- Existing Task 5 real-smoke approval rejection remains a separate parent-owned boundary. No cloud calls, imports, evaluations, model jobs, installations, server startup or private/public release action occurred here.
- No credentials, raw transcripts, recordings, ignored evidence contents or database records were read. No remote state, final Task 6 schema/build, browser behavior, SQLite integrity, backup restoration, or final merge was tested. The eight-path collision inventory must be refreshed when Task 6 finishes.
