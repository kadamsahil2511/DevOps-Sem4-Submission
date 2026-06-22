# Project TradeNet

TradeNet is a DevOps case-study implementation for a customs and border-processing platform. This repository contains a local npm-based demonstration, AWS cleanup tooling, container assets, Kubernetes scaffolding, and Terraform foundations.

## Current scope

- React operations console for declaration intake and processing evidence.
- Node/Express API with deterministic customs workflow, idempotency handling, risk scoring, tariff calculation, inspection routing, clearance decisions, and audit history.
- Read-only AWS inventory command for the required pre-deployment cleanup step.
- Docker, Helm, Terraform, and Makefile command surface for the remaining DevOps phases.

## Local development

```bash
npm install
make doctor
make inventory-aws
make dev
```

The web app runs on `http://localhost:5173` and proxies API calls to `http://localhost:8080`.

## Verification

```bash
make test
make build
```

## GitHub Actions CI/CD

This repository includes three workflows:

- `CI`: installs dependencies, lints, runs API unit tests, and builds the React and Node apps.
- `Security`: runs `npm audit` and a Trivy filesystem scan.
- `Deploy Demo`: rebuilds the app and deploys it to the running EC2 demo host at `https://telnet.superuserz.com`.

The deploy workflow uses temporary EC2 Instance Connect SSH access and closes port `22` after deployment. Add these repository secrets before relying on automatic deployment:

```plain text
No long-lived AWS access key is required.
```

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

## AWS cleanup safety

The cleanup workflow starts with:

```bash
make inventory-aws
```

This command is read-only. It runs identity checks, inventories enabled Regions, and writes a report under `reports/`. It does not delete resources. Any future deletion must use an explicit preserve list, a reviewed target list, and the confirmation phrase generated in the report.

## Deployment commands

```bash
make plan ENV=demo AWS_REGION=ap-south-1
make deploy ENV=demo
make verify ENV=demo
make plan-destroy ENV=demo
make destroy ENV=demo
make verify-clean ENV=demo
```

The deploy and destroy scripts are intentionally conservative placeholders until the AWS cleanup report and target account are confirmed.
