# Case Study Deliverables

| Deliverable | TradeNet Evidence |
| --- | --- |
| Working application | React + Express app at `https://telnet.superuserz.com` with auth, dashboard, declarations, partners, and audit timeline. |
| Source repository | `https://github.com/kadamsahil2511/DevOps-Sem4-Submission` |
| Dockerfile and images | Root `Dockerfile` for web, `services/api/Dockerfile` for API. Build with `docker build -t tradenet-web .` and `docker build -t tradenet-api services/api`. |
| Jenkins CI/CD | `Jenkinsfile` validates, tests, builds Docker images, validates Terraform, and renders Helm templates. |
| Terraform | `infrastructure/environments/demo` and `infrastructure/modules/network`. |
| Kubernetes | `deploy/helm/tradenet-api` and `deploy/namespaces/tradenet.yaml`. |
| Prometheus/Grafana | `deploy/observability/prometheus.yml` and `deploy/observability/grafana-dashboard.json`. |
| ELK logging | `deploy/logging/docker-compose.elk.yml` and `deploy/logging/logstash.conf`. |
| Vault | `deploy/vault/tradenet-policy.hcl` and `deploy/vault/README.md`. |
| Architecture diagram | `docs/architecture-diagram.md`. |
| Deployment diagram | `docs/deployment-diagram.md`. |
| Disaster recovery | `docs/disaster-recovery-plan.md`. |
| Screenshots | `docs/demonstration-screenshots.md`. |
| Project documentation | `README.md` plus this deliverables matrix. |

## Implemented Now vs Reference Scope

Implemented in the live EC2 demo: React UI, Express API, Prisma SQLite persistence, bcrypt auth, seeded users/data, GitHub Actions OIDC deployment, Nginx/HTTPS, health/readiness checks, and direct rollback-capable force deployment.

Reference or demonstration artifacts: Jenkins, Helm/Kubernetes, Prometheus/Grafana, ELK, and Vault. These are included so the DevOps automation story is complete, but the low-cost live demo currently runs on a single EC2 instance.
