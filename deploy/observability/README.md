# TradeNet Monitoring

Prometheus should scrape the API at `/api/metrics`. The legacy `/api/metrics/domain` endpoint remains available as JSON for quick smoke checks and dashboard code.

Grafana dashboard evidence should include:

- Declaration count by status.
- Average risk score.
- Oldest open processing item.
- Health and readiness probe state.
- EC2 or Kubernetes pod CPU and memory.
