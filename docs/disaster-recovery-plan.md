# Disaster Recovery Plan

## Recovery Objectives

- RTO: 30 minutes for the demo EC2 deployment.
- RPO: 15 minutes when SQLite backups are scheduled; current manual demo backup happens before each release.

## Backups

- Preserve `/opt/tradenet/data/tradenet.db` across releases.
- Before major demos, copy the database to `/opt/tradenet/backups/tradenet-YYYYMMDD-HHMM.db`.
- Keep `/opt/tradenet.previous` as the last application release.

## Rollback

1. Stop `tradenet-api`.
2. Move the failed `/opt/tradenet` to `/opt/tradenet.failed`.
3. Move `/opt/tradenet.previous` back to `/opt/tradenet`.
4. Restore `/opt/tradenet/data` if the failed release moved it.
5. Start `tradenet-api`.
6. Verify `/api/health`, `/api/ready`, login, dashboard, and declaration creation.

The direct force deploy script automates this rollback if smoke checks fail.

## Regional Failure

For production, restore the latest database backup onto a replacement EC2 instance or Kubernetes persistent volume, reapply Terraform, point DNS to the replacement Elastic IP or load balancer, then rerun the deployment pipeline.

## Security Incident

1. Revoke GitHub OIDC role trust or narrow the subject claim.
2. Rotate Vault-managed secrets.
3. Invalidate active sessions by clearing the `Session` table.
4. Preserve audit logs and deployment logs for review.
