# Update Runbook: Ongoing Development + Production Deploys

This runbook is for active team development where upstream changes continue after launch.

## 1) One-Time Git Remote Setup (Local)

```bash
git remote -v
git remote add upstream https://github.com/gvsucis/Community-Heatmaps.git
git fetch upstream
```

## 2) Branch and Release Policy

- Use your fork as production source of truth.
- Deploy only from your fork's `main`.
- Pull updates from upstream into a feature branch or directly into `main` via PR.
- No direct hotfixes on VM without committing to Git first.

## 3) Pre-Release Checks (Before Merge to `main`)

Run in CI (and optionally locally) before production deploy:

```bash
npm ci
npm run build
pytest -q backend/tests/test_windowing.py backend/tests/test_prediction_routes.py backend/tests/test_runtime_validation.py backend/tests/test_runtime_smoke.py
```

If backend CI runtime is too high, keep at least:
- `backend/tests/test_windowing.py`
- `backend/tests/test_prediction_routes.py`

## 4) Standard Release Flow

Local:

```bash
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

Vercel:
- Frontend auto-deploys from `main`.

VM:

```bash
ssh <vm-user>@<VM_IP>
cd Community-Heatmaps
git fetch origin
git checkout main
git pull --ff-only origin main
set -a
source deploy/.env.prod
set +a
```

## 5) Deploy by Change Type

### A) Frontend-only change

- Merge to `main`, verify Vercel deployment.
- No VM restart needed.

### B) Backend code change (no dependency change)

On VM:

```bash
cd Community-Heatmaps
git pull --ff-only origin main
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build backend
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml ps
```

### C) Backend dependency change

On VM:

```bash
cd Community-Heatmaps
git pull --ff-only origin main
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml build --no-cache backend
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d backend
```

### D) DB schema/data change

On VM:

```bash
cd Community-Heatmaps
mkdir -p backups
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "backups/predeploy_$(date +%F_%H%M%S).sql"
```

Apply migration/import:

```bash
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < deploy/sql/<migration_or_schema_file>.sql
```

Then redeploy backend:

```bash
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build backend
```

## 6) Tagged Backend Deploy + Rollback

Capture running backend image before deploy:

```bash
PREV_IMAGE=$(docker inspect --format='{{.Config.Image}}' chm-backend)
echo "$PREV_IMAGE"
```

Deploy current commit as tagged image:

```bash
cd Community-Heatmaps
GIT_SHA=$(git rev-parse --short HEAD)
export BACKEND_IMAGE="community-heatmaps-backend:${GIT_SHA}"
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml build backend
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d backend
```

Rollback backend image:

```bash
export BACKEND_IMAGE="$PREV_IMAGE"
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d backend
```

Rollback DB from latest backup (if migration/import caused breakage):

```bash
LATEST_BACKUP=$(ls -1t backups/predeploy_*.sql | head -n 1)
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$LATEST_BACKUP"
```

## 7) Post-Deploy Smoke Checklist

```bash
curl "http://<VM_IP>:8000/api/health"
curl "http://<VM_IP>:8000/api/map/totals?layer=community_area&start=2001-01-01&end=2001-02-01"
curl "http://<VM_IP>:8000/api/selection-summary?layer=community&id=1&start=2001-01-01&end=2001-02-01"
curl "http://<VM_IP>:8000/api/predictions/anchor-bounds"
```

Then verify the Vercel production URL in browser:
- no API errors in console/network
- map renders
- key tabs and filters still work
