# Project TradeNet

TradeNet is a DevOps case-study product for customs and border-processing operations. The current implementation is a full React + Express application with authenticated roles, persistent SQLite storage through Prisma, seeded operating data, CI/CD, and a direct EC2 force-deployment path.

## Current Scope

- React operations console with login, dashboard, declaration workspace, declaration detail, partner operations, and audit timeline.
- Email/password authentication with bcrypt-hashed seeded users and HTTP-only session cookies.
- Roles: `Importer`, `Customs Officer`, and `Ops Admin`.
- Express API with health, readiness, metrics, auth, dashboard, declarations, partner status, and audit endpoints.
- Prisma + SQLite persistence. Production uses `/opt/tradenet/data/tradenet.db` so data survives app releases.
- Seeded demo data for users, organisations, import/export declarations, documents, risk assessments, duties, inspections, partner sync records, and audit history.

## Demo Accounts

All seeded demo users use this password:

```plain text
TradeNet@2026
```

```plain text
importer@tradenet.demo
officer@tradenet.demo
admin@tradenet.demo
```

## Local Development

```bash
npm install
npm run db:migrate
npm run seed:dev
npm run dev
```

The web app runs on `http://localhost:5173` and proxies API calls to `http://localhost:8080`.

## Verification

```bash
npm run lint
npm test
npm run build
```

The API test suite includes an HTTP smoke test that migrates a temporary SQLite database, starts the API, logs in, creates a declaration, and verifies audit persistence.

## GitHub Actions CI/CD

This repository includes three workflows:

- `CI`: installs dependencies, lints, runs API tests, and builds the React and Node apps.
- `Security`: runs `npm audit` and a Trivy filesystem scan.
- `Deploy Demo`: rebuilds the app, packages clean runtime output, uploads it to EC2, installs production dependencies on the host, runs Prisma generation and migrations, seeds when empty, restarts systemd, reloads Nginx, and checks health/readiness.

GitHub Actions authenticates to AWS through OpenID Connect using this deploy role:

```plain text
arn:aws:iam::116981787180:role/TradeNetGitHubActionsDeployRole
```

The current demo deployment target is:

```plain text
EC2 instance: i-0715e18824145339e
Elastic IP: 13.201.205.69
URL: https://telnet.superuserz.com
```

## Direct Force Deploy

Use the direct force deploy only as a safety fallback or final proof deployment from a machine with AWS CLI access to the target account:

```bash
bash scripts/force-deploy.sh
```

The script builds locally, creates a clean archive without `node_modules`, opens temporary SSH ingress, sends an EC2 Instance Connect key, uploads the archive, preserves `/opt/tradenet/data`, installs production dependencies on EC2, runs Prisma migration and seed, restarts `tradenet-api`, and verifies health, readiness, login, dashboard access, and declaration creation. If smoke checks fail, it restores `/opt/tradenet.previous`.

## AWS Cleanup Safety

The cleanup workflow starts with:

```bash
make inventory-aws
```

This command is read-only. It runs identity checks, inventories enabled Regions, and writes a report under `reports/`. It does not delete resources. Any future deletion must use an explicit preserve list, a reviewed target list, and the confirmation phrase generated in the report.

## Infrastructure Commands

```bash
make plan ENV=demo AWS_REGION=ap-south-1
make deploy ENV=demo
make verify ENV=demo
make plan-destroy ENV=demo
make destroy ENV=demo
make verify-clean ENV=demo
```

The Terraform, Helm, Docker, and Makefile surfaces remain available for the broader DevOps case study, while the live product deployment currently runs as a Node systemd service behind Nginx/HTTPS on EC2.
