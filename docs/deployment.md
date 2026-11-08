# Private CQA deployment

This runbook is for the deployment owner. It does not authorize additional provider
requests, public source publication, DNS changes or changes to other applications.
Build and review source first; the owner performs the server cutover separately.

## Topology and prerequisites

The verified target is `root@89.126.193.108`, with existing SSH authentication and
`StrictHostKeyChecking=yes`. Keep AgileAI and Microdrama running. The existing
`agileai-caddy-1` runs Caddy 2.11.4 on external network `agileai_default` and owns
normal TLS renewal. Do not repeat the completed Forte removal.

Exactly two CQA containers run under Compose project `cqa`:

- `cqa-api`: Python 3.12, locked backend dependencies, UID/GID 10001, one Uvicorn
  worker, writable private `/data`, no published host port, backend bridge only.
  This bridge allows outbound provider HTTPS; it is deliberately not `internal`.
- `cqa-web`: Caddy 2.11.4 and the existing Node 22.18-built frontend. It joins the
  backend bridge and `agileai_default`. HTTP port 80 is private to Docker networks;
  only TCP host port 8443 is published to its manual-TLS port 443.

Both web listeners import the same authentication and routing snippet. Every
request, including `/api`, `/api/*`, static files and SPA routes, requires Basic
Authentication. After authentication, the web proxy removes `Authorization` before
sending the full unchanged `/api` path to the API. Provider responses have a
180-second proxy header timeout. Browser traffic must use HTTPS.

Until the user sets `freedom.incode.kz` DNS to this server, use
`https://incode.kz:8443`. This fallback uses the existing `incode.kz` certificate,
not a new ACME order. Only its exact per-domain directory is mounted read-only:

```
/var/lib/docker/volumes/agileai_caddy_data/_data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/incode.kz
```

The web process runs as root to read the existing root-owned 0600 private key.
Do not copy the key into a release/image, mount the whole Caddy volume, or weaken
its permissions. The observed certificate has SAN `incode.kz` and expires
2027-01-21; inspect public certificate metadata again during deployment. The main
Caddy renews it, but the web container loads manual certificates into memory.
After renewal, force a web reload with `caddy reload --force` (command below), or
retire the fallback before expiry. Mounting the directory preserves replacement
file visibility; it does not itself reload the certificate.

## Private files and required variables

Use a persistent layout outside all immutable source releases:

```
/home/ubuntu/cqa/releases/<reviewed-commit>/
/home/ubuntu/cqa/data/cqa.sqlite3
/home/ubuntu/cqa/data/model-jobs.lock
/home/ubuntu/cqa/secrets/backend.env
/home/ubuntu/cqa/deploy.env
/home/ubuntu/cqa/backups/
```

Create `data` owned by 10001:10001 with mode 0700. The backend credential file must
be owned by 10001:10001 and mode 0400, inside a private host directory; its read-only
container path is `/run/secrets/backend.env`. Provision exactly one standard
`ANTHROPIC_API_KEY=...` assignment through a private channel or private editor.
Never source or print this file, put the key in shell arguments/history, include
it in logs, send it as a build argument or put it in a `VITE_*` variable. Startup
and read-only API checks do not require a provider request.

The root-owned 0600 `deploy.env` must define every variable below. There are no
password defaults or fallback credentials:

| Variable | Required value |
| --- | --- |
| `CQA_RELEASE` | Full reviewed Git commit SHA, also used for immutable image tags |
| `CQA_DATA_DIR` | Absolute existing path `/home/ubuntu/cqa/data` |
| `CQA_BACKEND_ENV_FILE` | Absolute existing path `/home/ubuntu/cqa/secrets/backend.env` |
| `CQA_BASIC_USER` | Chosen private-site username |
| `CQA_BASIC_PASSWORD_HASH` | Caddy bcrypt hash of the privately delivered site password |

Generate the hash with Caddy 2.11.4 `hash-password` interactively in a private
terminal. Store the hash **single-quoted** in `deploy.env` so its dollar signs are
literal. Give the plaintext site password only to the intended reviewers. Keep
this environment file private: it contains an authentication verifier. Do not run
plain `docker compose config`, `docker inspect` environment dumps or shell tracing.
Use `config --quiet` for validation. Check both bind paths are absolute, not merely
nonempty; Compose interpolation checks presence but cannot enforce absolute paths.

Compose fixes `CQA_DATABASE_PATH=/data/cqa.sqlite3`,
`CQA_MODEL_LOCK=/data/model-jobs.lock` and
`CQA_ENV_FILE=/run/secrets/backend.env`. The production launcher rejects relative
database/model-lock paths and unreadable configured credentials. It holds
`/data/cqa.sqlite3.server.lock` before importing the app or entering job recovery,
then releases ownership after shutdown or failure. Never unlink that lock file,
scale the API, enable reload, or bypass the launcher with a direct Uvicorn command.
A file lock coordinates owners of the same underlying file only; it cannot prevent
a copied database on another host from creating a second ledger.

## Immutable source and preflight

1. Review and commit source, record its full SHA, then create a source archive from
   that exact commit, not from the dirty working directory. Review tracked paths,
   keep the archive private and verify its SHA-256 after transfer. Extract it into
   a new `releases/<reviewed-commit>` directory. Do not overlay an existing release.
   `.dockerignore` allows only required build inputs and excludes credentials,
   runtime databases, evidence, Git, dependencies, cached builds and artifacts.
2. Record existing container names, status/health, published ports and normal
   AgileAI/Microdrama HTTP outcomes before making changes. Confirm port 8443 is
   still free, `agileai_default` exists and the exact certificate directory and
   private files exist. Do not run a global Compose shutdown or prune operation.
3. As the deployment owner, check the private deployment environment and bind
   ownership/permissions without printing contents. Use the same absolute
   `deploy.env` and release file for all following commands:

   ```bash
   cd /home/ubuntu/cqa/releases/<reviewed-commit>
   docker compose --env-file /home/ubuntu/cqa/deploy.env -f deploy/compose.yaml config --quiet
   docker compose --env-file /home/ubuntu/cqa/deploy.env -f deploy/compose.yaml build
   ```

   The build must resolve the actual Python/uv/Node/Caddy tags and run frozen
   `uv sync`, `npm ci` and `npm run build`. A source/static check does not prove an
   image builds. Do not inject runtime credentials into either build. Record
   resulting image IDs with the reviewed release SHA; do not reuse its tag for
   changed source. API startup and health checks must send no model request.

## Quiescent SQLite migration and single-ledger cutover

1. Stop new model actions and wait for all running/queued jobs and reservations to
   settle. Record canonical read-only usage counts, spend/reservations, source
   counts, latest evaluations, reports and workspace language. If any dispatch
   outcome is unknown, preserve its reservation and investigate; do not retry as
   part of deployment.
2. Gracefully stop the **identified local supervisor** and wait for both API and
   Vite children to exit before copying data. Confirm the database owner lock is
   free and no other process is using it. Canonical pre-cutover paths are:

   ```
   /home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026/runtime/cqa.sqlite3
   /home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026/runtime/model-jobs.lock
   ```

   The original local backend credential file remains in its original project;
   do not print it. Prevent the local owner from restarting after cutover.
3. Under the shared model-job flock, create a consistent private SQLite backup
   using Python `sqlite3.Connection.backup` (or SQLite `.backup`) after quiescence.
   Do not copy only a live database while ignoring its WAL. Check `PRAGMA
   integrity_check`, record the backup digest, and preserve this pre-cutover copy.
4. Transfer the backup privately to a temporary server path, verify its digest and
   integrity, and place it as `data/cqa.sqlite3` with owner 10001:10001 and mode
   0600. Do not transfer a held lock descriptor. The server creates its own lock
   files. Designate this server database as the **only** canonical ledger before
   starting the remote owner; never run the old local copy at the same time.
5. Start only the CQA project from its immutable release:

   ```bash
   docker compose --env-file /home/ubuntu/cqa/deploy.env -f deploy/compose.yaml up -d
   docker compose --env-file /home/ubuntu/cqa/deploy.env -f deploy/compose.yaml ps
   docker compose --env-file /home/ubuntu/cqa/deploy.env -f deploy/compose.yaml exec -T cqa-web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

   Observe API health/ownership and web startup without dumping credentials or
   source payloads. No startup model call is expected. Compare retained data and
   usage with the pre-cutover snapshot before allowing new model actions. Do not
   create a fresh empty database or restore an earlier billing snapshot.

## Acceptance and normal-domain proxy

Check both `/` and `/api/health` without credentials return **401** on the fallback
HTTPS URL; test an invalid password too. With privately supplied credentials,
verify `/`, a referenced JS/CSS asset and a deep SPA route load; `/api/health`
returns `{"status":"ok"}` and `/api/settings` retains `{"analysis_language":"RU"}`.
Check retained conversation/evaluation/report counts, source immutability and
usage match the migration snapshot. These read-only checks must not create a
report, assistant message, run or provider request. Verify Russian UI text and
actual rendered behavior in a browser separately from HTTP/build checks.

Confirm there is no host-published API port and private HTTP port 80 is not
published by `cqa-web`; inspect only the ports field, not container environment.
Record the same other-service checks as preflight and compare them after cutover.
The temporary HTTPS URL is the deliverable until normal-domain DNS/TLS succeeds.

After the user changes DNS, add only the site in
`deploy/Caddyfile.freedom.example` to the existing shared
`/home/ubuntu/agileai/Caddyfile`. The main proxy **must preserve Authorization**:
`cqa-web` authenticates it. Do not strip the header at the main proxy or put
separate credentials there.

Make a private backup of that shared file first. Validate the complete candidate
configuration with the existing Caddy 2.11.4 container before activating it.
Preserve the live bind-mounted file's inode: write validated candidate bytes into
the existing file, rather than renaming/replacing it. Then validate and reload
inside `agileai-caddy-1`, retaining all existing sites. If the candidate validation
needs its own temporary container, use the existing image/networks and private
certificate mounts without logging its resolved configuration. Recheck the main
Caddy's existing sites, then repeat unauthenticated 401 and authenticated checks
at `https://freedom.incode.kz`.

To refresh the fallback certificate after main-Caddy renewal:

```bash
docker compose --env-file /home/ubuntu/cqa/deploy.env -f deploy/compose.yaml exec -T cqa-web caddy reload --force --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Rollback without losing usage

Stop new work, quiesce jobs and gracefully stop the CQA API before any rollback.
Preserve a consistent backup of the **latest** server database, including every
new attempt, usage record, reservation and user-created object. Roll back source
by selecting the previously reviewed immutable release/image while keeping that
same latest canonical data directory. Check schema compatibility before starting;
if uncertain, keep the API stopped and investigate. Never restore the pre-cutover
backup over a database that has accepted new usage.

If moving ownership back to the local machine is unavoidable, stop the remote
owner first, back up and transfer the latest ledger with integrity/digest checks,
and designate one local canonical database before restart. Do not resume the
stale pre-cutover local copy. Restore only this site's main-Caddy addition from
the private pre-change backup when required, preserving the shared file inode,
validate/reload, and verify the other applications again. No rollback requires
removing shared networks, Caddy volumes, other containers or certificate files.
