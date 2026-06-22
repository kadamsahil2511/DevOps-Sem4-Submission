# Demonstration Screenshots Checklist

Capture these screenshots for submission evidence:

- Login page at `https://telnet.superuserz.com`.
- Dashboard after signing in as `importer@tradenet.demo`.
- Declaration workspace showing the seeded declarations.
- New declaration creation result and persisted detail view.
- Partner operations view.
- Audit timeline showing the new declaration event.
- GitHub Actions CI run for the final commit.
- GitHub Actions Deploy Demo run for the final commit.
- EC2 systemd service status: `systemctl status tradenet-api`.
- Health check: `https://telnet.superuserz.com/api/health`.
- Readiness check: `https://telnet.superuserz.com/api/ready`.
- Docker image build output.
- Jenkins pipeline run.
- Terraform validate or plan output.
- Kubernetes Helm template or deployment output.
- Prometheus targets page and Grafana dashboard.
- Kibana Discover view for TradeNet logs.
- Vault policy or secret path evidence without exposing secret values.
