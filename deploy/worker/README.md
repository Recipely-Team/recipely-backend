# Import workers

## What a worker is

A second entry point on the **same image** as the API (`dist/worker/main.js`
instead of `dist/presentation/server/index.js`). Same repository, same domain
code, same importer — the image already carries yt-dlp, ffmpeg and python
because the API needed them for the synchronous import.

## What a worker does NOT have

This is the important half, and it is what makes adding boxes cheap:

| | worker |
|---|---|
| `DATABASE_URL` | no — it never touches Postgres |
| the API's network / VCN | no — it reaches the public hostname over HTTPS |
| an inbound port | no — nothing connects *to* a worker |
| a user account or JWT | no — it presents `WORKER_SHARED_SECRET` |
| shared disk | no — cover frames are POSTed to the API, which stores them |

A worker can therefore live in another Oracle tenancy, another provider, or
behind NAT on a home connection, and it works identically. Losing one costs
throughput and nothing else: its claims expire and another worker takes the
jobs.

## The three calls

```
POST /internal/import-jobs/claim          → 200 {jobId,url,locale} | 204 (idle)
POST /internal/import-jobs/:id/complete   → the recipe + the cover frame
POST /internal/import-jobs/:id/fail       → an error KEY, never a sentence
```

Authenticated with `X-Worker-Secret` and `X-Worker-Id` headers. The secret goes
in a header and never a query string, because URLs are logged by every proxy in
the path.

## Current fleet

| name | address | shape | notes |
|---|---|---|---|
| `recipely-worker-1` | 79.76.100.116 | VM.Standard.E2.1.Micro | Oracle Linux 9, 1 GB + 3 GB swap |
| `recipely-worker-2` | 92.5.5.241 | VM.Standard.E2.1.Micro | Oracle Linux 9, 1 GB + 2 GB swap |

Both in the `eksiamine` tenancy, eu-frankfurt-1, VCN `recipely-worker-vcn`.
Ampere A1 (4 OCPU / 24 GB free) was attempted first and is **out of capacity in
all three availability domains** — see `docs/`. If capacity appears, an A1 box
joins the fleet by running the same compose file; nothing else changes.

SSH user is `opc`, key `~/.ssh/recipely-worker`.

## Setting up a new worker

```bash
# on the box
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker && sudo usermod -aG docker opc

mkdir -p ~/recipely-worker && cd ~/recipely-worker
# copy deploy/worker/docker-compose.yml here, then write .env:
cat > .env <<'EOF'
WORKER_API_BASE_URL=https://api.recipely.net
WORKER_SHARED_SECRET=<same value the API has>
WORKER_ID=recipely-worker-N
GROQ_API_KEY=<key>
EOF
chmod 600 .env

docker compose pull && docker compose up -d
docker compose logs -f
```

A healthy idle worker logs `import_worker_started` and then nothing. **Silence
is the correct state** — the queue is empty almost always.

## Swap is not optional on a 1 GB box

ffmpeg over a video will exceed 1 GB. Without swap the kernel kills it, and an
OOM kill looks like a random import failure. Both boxes have a swapfile in
`/etc/fstab`.

## Deploying a new version

Every worker runs the same tag, so a deploy is a pull on each box:

```bash
for host in 79.76.100.116 92.5.5.241; do
  ssh -i ~/.ssh/recipely-worker opc@$host \
    'cd ~/recipely-worker && docker compose pull && docker compose up -d'
done
```

`restart: unless-stopped` plus a graceful `SIGTERM` means a job in flight is
allowed to finish and report before the container goes down. A hard kill is
still safe — the claim expires and another worker picks the job up.

## If a worker looks like it keeps restarting

A restarting container and a busy one look the same in `docker ps`, which is
what made this hard to see the first time: the poll timer was `unref()`d, so an
idle worker — the normal state — had nothing left on Node's event loop, exited
`0` after its first empty poll, and `restart: unless-stopped` turned that into a
permanent loop. Nothing logged an error, because nothing had failed.

`docker compose ps` showing a container whose uptime never exceeds the poll
interval is the symptom. It is covered by a test now
(`tests/unit/worker/import-worker.test.ts`, "keeps the process alive while it
waits for work"), but the general lesson applies to anything added to this loop:
**this process is idle almost all the time, so whatever keeps it alive while
idle is load-bearing.**

## The one setting that must agree across boxes

`WORKER_IMPORT_TIMEOUT_MS` must stay **under** the API's `IMPORT_LEASE_MS`
(default 180 s vs 300 s). If a worker is allowed to run longer than its claim is
honoured, a second worker takes the job while the first is still running it, and
both finish — producing two drafts and two notifications for one request.
