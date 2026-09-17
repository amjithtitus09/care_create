# CARE reference environment

Runs CARE with the [care-abdm](https://github.com/ohcnetwork/care-abdm) plug using only Docker. Every run builds from the latest code:

| Part | Source |
| --- | --- |
| CARE backend | `ghcr.io/ohcnetwork/care:latest`, published from care `develop` |
| CARE frontend | care_fe `develop` |
| ABDM plug | care-abdm `main` (`backend/` and `frontend/`) |

## Run

Needs Docker with Compose 2.37 or later (tested with Docker Desktop 28). Pass your ABDM sandbox client ID and secret.

macOS and Linux:

```bash
ABDM_CLIENT_ID=<client id> ABDM_CLIENT_SECRET=<client secret> docker compose -f https://github.com/amjithtitus09/care_create.git#reference:reference/compose.yaml up --build --wait --yes
```

Windows PowerShell:

```powershell
$env:ABDM_CLIENT_ID="<client id>"; $env:ABDM_CLIENT_SECRET="<client secret>"; docker compose -f https://github.com/amjithtitus09/care_create.git#reference:reference/compose.yaml up --build --wait --yes
```

When the command returns, open http://localhost:4400 and sign in as `care-admin` with the password `Ohcn@123`. To list every demo user, run `docker compose -p care-reference logs setup`.

The first run downloads and builds everything, which took about 7 minutes on an Apple Silicon Mac. Later runs rebuild only what changed.

## Milestones

M1 runs by default. For M2, add `--profile m2` before `up`. It opens a public HTTPS tunnel for ABDM callbacks and sets it as the plug's callback URL. Only `/api/abdm/` is reachable through the tunnel. Register the URL as the bridge URL from a facility's ABDM setup page. The tunnel URL changes on every run.

To use your own public URL instead of the tunnel, set `ABDM_CALLBACK_BASE_URL` and leave out `--profile m2`.

## Port

The app runs on port 4400. To use another port, set `REFERENCE_PORT`, for example `REFERENCE_PORT=5000`.

## Stop

```bash
docker compose -p care-reference down
```

Add `-v` to also delete the database and uploaded files.
