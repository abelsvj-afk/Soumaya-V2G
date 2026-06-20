# Deployment

## How this app ships (the important part)

**Deploys happen automatically when you push to the deploy branch.** Fly.io's
GitHub integration watches the repo, builds the `Dockerfile` on Fly's own
infrastructure, and rolls out a new machine. You do **not** need a terminal, an
IDE, or `flyctl` — committing from the phone/GitHub web is enough.

The flow:

1. You commit + push to `claude/soumaya-second-brain-v1-m4z4hc`.
2. Fly builds the image (web build + server) and deploys it to app
   `brain-soumaya-v1` (region `iad`), using the `/data` volume for the SQLite DB.
3. The new machine must pass the health check (`GET /api/health`) before it
   serves traffic. If the new build is broken, the previous machine keeps
   running.

If the app ever shows **"Suspended"** after a string of crashes, open the Fly
app, find the machine, and tap **Start/Resume** once — a healthy deploy normally
clears this on its own.

## Why there's no GitHub Actions workflow

There used to be `.github/workflows/fly-deploy.yml` (test → deploy). It was
**removed** because GitHub Actions could not run on this account — every run
failed within ~3 seconds because no runner was ever assigned (an account/billing
setting, not a code problem). A workflow that can never run only produces red
"failed" marks on every push and protects nothing, so it was pure noise. Deploys
were already being handled by Fly's push integration described above.

## Restoring CI later (recommended once Actions works)

When GitHub Actions can run again (e.g. account verified / billing enabled, or
the repo lives under an account with working Actions), a proper CI **check** is
worth having — it runs the test suite on every push so regressions are caught
before they reach Fly. Recreate `.github/workflows/ci.yml` with:

```yaml
name: CI
on:
  push:
    branches: [claude/soumaya-second-brain-v1-m4z4hc]
  pull_request:
  workflow_dispatch:

jobs:
  checks:
    name: Typecheck, test, build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build # web static build
```

This version intentionally **does not deploy** — Fly already deploys on push, so
CI's only job is to be a green/red signal on code health. (If you ever want CI to
own the deploy instead of Fly's integration, add a second job that runs
`flyctl deploy --remote-only` with a `FLY_API_TOKEN` repo secret, and turn off
the Fly GitHub integration so the two don't race.)

## Verifying a deploy locally (optional, for a developer)

You can prove the server boots against a database shaped like the production
volume:

```bash
DB_PATH=/path/to/old.db EMBED_PROVIDER=hash PORT=8099 \
  npx tsx packages/server/src/index.ts
curl localhost:8099/api/health   # -> {"ok":true,...}
```

`npm test` also includes `migration.test.ts`, which opens a pre-existing
(space_id-less) database and asserts it upgrades in place without crashing.
