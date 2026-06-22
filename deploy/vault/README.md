# TradeNet Vault Secret Management

Vault is the reference secret-management layer for production-grade deployments.

Recommended KV paths:

```plain text
secret/data/tradenet/database
secret/data/tradenet/session
secret/data/tradenet/aws
```

Expected keys:

```plain text
DATABASE_URL=file:/opt/tradenet/data/tradenet.db
SESSION_COOKIE_SECRET=<generated>
AWS_REGION=ap-south-1
```

The live EC2 demo does not commit secrets. It writes non-secret runtime values to `/etc/tradenet/tradenet.env` and relies on GitHub OIDC for AWS access instead of long-lived AWS keys.
