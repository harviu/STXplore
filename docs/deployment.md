# Deployment Guide: Vercel Frontend + Azure VM Backend (Docker)

This guide deploys:
- Frontend (Vite React): Vercel
- Backend (FastAPI) + PostgreSQL: Azure Student VM with Docker Compose

It preserves frontend calls to `/api/...` via a Vercel rewrite.

## 1) Prerequisites

- Azure for Students subscription and one Ubuntu VM with a public IP.
- GitHub fork of this repository.
- Vercel account connected to GitHub.
- SSH access to VM (`ssh azureuser@<VM_IP>`).

## 2) Prepare This Repository

1. Replace the placeholder backend destination in [vercel.json](CrimeSightAI/vercel.json):
   - Replace `http://203.0.113.10:8000` with `http://<YOUR_VM_PUBLIC_IP>:8000`
2. Commit and push:

```bash
git add vercel.json deploy docs .gitignore
git commit -m "Add production deployment stack and runbooks"
git push origin main
```

## 3) Bootstrap Docker on Azure VM

Run on the VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
docker --version
docker compose version
```

## 4) Deploy Backend + Postgres

Run on the VM:

```bash
git clone https://github.com/nishanKhanal/CrimeSightAI

git clone 

sudo apt-get update
sudo apt-get install -y git-lfs
git lfs install

# pull the large CSV file tracked by Git LFS
git lfs pull --include="data/Chicago-Data/Crime/cleaned_Crimes_-_2001_to_Present_20250114.csv"

# verify
head -n 2 data/Chicago-Data/Crime/cleaned_Crimes_-_2001_to_Present_20250114.csv

cd CrimeSightAI
cp deploy/.env.prod.example deploy/.env.prod
```

Edit `deploy/.env.prod`:
- Set `POSTGRES_PASSWORD`
- Set `CORS_ORIGINS` to include your Vercel URL

Load those variables in your shell for commands that reference `$POSTGRES_USER` and `$POSTGRES_DB`:

```bash
set -a
source deploy/.env.prod
set +a
```

Start database:

```bash
docker compose --project-directory . --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d db
docker compose --project-directory . --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml ps
```

Create schema:

```bash
docker compose --project-directory . --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < deploy/sql/create_crime_data_table.sql
```

Import CSV into Postgres:

```bash
docker compose --project-directory . --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\copy crime_data (
    csv_index,
    id,
    case_number,
    \"date\",
    block,
    iucr,
    primary_type,
    description,
    location_description,
    arrest,
    domestic,
    beat,
    district,
    ward,
    community_area,
    fbi_code,
    x_coordinate,
    y_coordinate,
    year,
    updated_on,
    latitude,
    longitude
  ) FROM '/seed/Chicago-Data/Crime/cleaned_Crimes_-_2001_to_Present_20250114.csv'
  WITH (FORMAT csv, HEADER true);"
```

Build and start backend:

```bash
docker compose --project-directory . --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build backend
docker compose --project-directory . --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml ps
```

## 5) Configure Frontend on Vercel

1. Import your fork in Vercel.
2. In Project Settings -> Environment Variables, set:
   - `VITE_MAPBOX_ACCESS_TOKEN`
3. Deploy from `main`.

Because [src/lib/api.js](/mnt/home/khanalni/shield-project/extra/S-D-Mamba/Community-Heatmaps/src/lib/api.js) uses `BASE = ""`, browser calls `/api/...` on Vercel, and Vercel rewrites those calls to your VM backend.

## 6) Smoke Tests (Post-Deploy)

Run from your local machine:

```bash
curl "http://<VM_IP>:8000/api/health"
curl "http://<VM_IP>:8000/api/map/totals?layer=community_area&start=2001-01-01&end=2001-02-01"
curl "http://<VM_IP>:8000/api/selection-summary?layer=community&id=1&start=2001-01-01&end=2001-02-01"
curl "http://<VM_IP>:8000/api/predictions/anchor-bounds"
curl "http://<VM_IP>:8000/api/predictions/by-date?date=<ANCHOR_FROM_PREV_RESPONSE>&model=Transformer"
```

Then verify on the Vercel URL:
- App loads
- Map renders (Mapbox token is working)
- Past / Predicted / Actual / Error flows and relation tabs load

## 7) Operational Notes

- Current mode is fast demo (Vercel HTTPS + backend HTTP IP).
- Next hardening step: add domain + TLS termination on VM and update rewrite destination.
- Keep `deploy/.env.prod` only on VM (already ignored by `.gitignore`).
