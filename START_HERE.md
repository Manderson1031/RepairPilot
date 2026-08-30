# Start Here — RepairPilot V15

## What you can run locally now

Backend:
```bash
cd backend
python -m app.owner_setup --write-env
```

Development demo:
```bash
python -m app.seed_demo
```

Production-style local stack:
```bash
docker compose up --build
```

Release preflight:
```bash
python ops/preflight.py
```

Safety/tests:
```bash
cd backend
PYTHONPATH=. pytest -q
```

## Where development stops

Read `OWNER_ACTION_REQUIRED.md`.

That document describes the first external resource that must be created/connected before RepairPilot can become a real hosted beta.
