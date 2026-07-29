# robo.rdcc.ai Production Deployment

Railway remains the test server from the `main` branch.

Company production should deploy from the `prod` branch.

## Ports

| Purpose | Port |
| --- | --- |
| Robo portal / app | `3007` |
| PostgreSQL for Robo apps | `3008` |

Nginx is already configured to proxy:

```text
https://robo.rdcc.ai -> http://127.0.0.1:3007
```

## App Structure

| URL | Purpose |
| --- | --- |
| `/` | Robo application portal home |
| `/operations` | Robo Operations Reporting System |
| `/login` | Admin login |

The portal is designed to add more Robo applications later as more cards/tabs.

## Required Environment Variables

```bash
DATABASE_URL="postgresql://<user>:<password>@127.0.0.1:3008/<database>?schema=public"
ROBOOPS_ADMIN_PASSWORD="<set-secure-password>"
ROBOOPS_SESSION_SECRET="<long-random-secret>"
OPENAI_API_KEY="<optional-for-ai-commentary>"
OPENAI_MODEL="gpt-4.1-mini"
AZURE_STORAGE_CONNECTION_STRING=""
REPORT_STORAGE_CONTAINER="reports"
```

## Build And Start

```bash
git fetch origin
git checkout prod
git pull origin prod
npm ci
npm run prod:build
npm run prod:start
```

`npm run prod:start` runs Prisma migrations and starts the app on port `3007`.

For process management, run the same start command through `systemd`, `pm2`, or the server's standard Node service manager.

## Deployment Principle

- Test changes first on Railway using `main`.
- Promote accepted changes to `prod`.
- Deploy `prod` to `robo.rdcc.ai`.
