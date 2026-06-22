# TradeNet ELK Logging

The API writes structured JSON startup logs and can be extended to send request/audit logs to Logstash over TCP port `5000`.

Local ELK demonstration:

```bash
cd deploy/logging
docker compose -f docker-compose.elk.yml up
```

Kibana runs at `http://localhost:5601`; Elasticsearch runs at `http://localhost:9200`.
