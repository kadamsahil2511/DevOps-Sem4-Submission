#!/usr/bin/env bash
set -uo pipefail

mkdir -p reports
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="reports/aws-cleanup-inventory-${timestamp}.md"

run() {
  local title="$1"
  shift
  local command=("$@")
  if [ "${command[0]}" = "aws" ]; then
    command=(aws --cli-connect-timeout 5 --cli-read-timeout 12 "${command[@]:1}")
  fi
  {
    echo
    echo "### ${title}"
    echo
    echo '```text'
    "${command[@]}" 2>&1
    local status=$?
    echo '```'
    if [ "$status" -ne 0 ]; then
      echo
      echo "Command exited with status ${status}."
    fi
  } >> "$report"
}

run_optional() {
  run "$@"
}

echo "# TradeNet AWS Read-Only Cleanup Inventory" > "$report"
echo >> "$report"
echo "Generated: ${timestamp}" >> "$report"
echo >> "$report"
echo "Safety mode: read-only. This script does not delete resources." >> "$report"

identity_json="$(aws sts get-caller-identity --output json 2>/tmp/tradenet-aws-identity.err)"
identity_status=$?
if [ "$identity_status" -ne 0 ]; then
  {
    echo
    echo "## AWS identity check failed"
    echo
    echo '```text'
    cat /tmp/tradenet-aws-identity.err
    echo '```'
  } >> "$report"
  echo "Unable to inventory AWS. Reauthenticate first. Report: $report" >&2
  exit "$identity_status"
fi

account_id="$(printf '%s' "$identity_json" | sed -n 's/.*"Account"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
arn="$(printf '%s' "$identity_json" | sed -n 's/.*"Arn"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

{
  echo
  echo "## Identity"
  echo
  echo "| Field | Value |"
  echo "| --- | --- |"
  echo "| Account | ${account_id} |"
  echo "| Principal | ${arn} |"
  echo "| Default Region | ${AWS_REGION:-not set} |"
  echo
  echo "Deletion approval phrase required before any future cleanup: DELETE-APPROVED-${account_id}"
} >> "$report"

regions="$(aws ec2 describe-regions --all-regions --query 'Regions[?OptInStatus==`opt-in-not-required` || OptInStatus==`opted-in`].RegionName' --output text)"

for region in $regions; do
  {
    echo
    echo "## Region: ${region}"
  } >> "$report"
  run "EC2 instances" aws ec2 describe-instances --region "$region" --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType,Tags:Tags}' --output table
  run "EBS volumes" aws ec2 describe-volumes --region "$region" --query 'Volumes[].{Id:VolumeId,State:State,SizeGiB:Size,Type:VolumeType,Tags:Tags}' --output table
  run "EBS snapshots owned by account" aws ec2 describe-snapshots --owner-ids self --region "$region" --query 'Snapshots[].{Id:SnapshotId,State:State,VolumeSize:VolumeSize,StartTime:StartTime,Tags:Tags}' --output table
  run "Elastic IPs" aws ec2 describe-addresses --region "$region" --query 'Addresses[].{PublicIp:PublicIp,AllocationId:AllocationId,AssociationId:AssociationId,Tags:Tags}' --output table
  run "NAT gateways" aws ec2 describe-nat-gateways --region "$region" --query 'NatGateways[].{Id:NatGatewayId,State:State,VpcId:VpcId,SubnetId:SubnetId,Tags:Tags}' --output table
  run "VPC endpoints" aws ec2 describe-vpc-endpoints --region "$region" --query 'VpcEndpoints[].{Id:VpcEndpointId,State:State,Service:ServiceName,VpcId:VpcId,Tags:Tags}' --output table
  run "Load balancers" aws elbv2 describe-load-balancers --region "$region" --query 'LoadBalancers[].{Name:LoadBalancerName,Arn:LoadBalancerArn,State:State.Code,Type:Type}' --output table
  run "RDS instances" aws rds describe-db-instances --region "$region" --query 'DBInstances[].{Id:DBInstanceIdentifier,Engine:Engine,Status:DBInstanceStatus,Class:DBInstanceClass}' --output table
  run "RDS clusters" aws rds describe-db-clusters --region "$region" --query 'DBClusters[].{Id:DBClusterIdentifier,Engine:Engine,Status:Status,MultiAZ:MultiAZ}' --output table
  run "EKS clusters" aws eks list-clusters --region "$region" --output table
  run "ECS clusters" aws ecs list-clusters --region "$region" --output table
  run "ElastiCache clusters" aws elasticache describe-cache-clusters --region "$region" --query 'CacheClusters[].{Id:CacheClusterId,Engine:Engine,Status:CacheClusterStatus,Class:CacheNodeType}' --output table
  run "OpenSearch domains" aws opensearch list-domain-names --region "$region" --output table
  run "MSK clusters" aws kafka list-clusters-v2 --region "$region" --query 'ClusterInfoList[].{Name:ClusterName,Arn:ClusterArn,State:State,Type:ClusterType}' --output table
  run "Redshift clusters" aws redshift describe-clusters --region "$region" --query 'Clusters[].{Id:ClusterIdentifier,Status:ClusterStatus,NodeType:NodeType,DbName:DBName}' --output table
  run "ECR repositories" aws ecr describe-repositories --region "$region" --query 'repositories[].{Name:repositoryName,Uri:repositoryUri,Created:createdAt}' --output table
  run "SQS queues" aws sqs list-queues --region "$region" --output table
  run "Secrets Manager secrets" aws secretsmanager list-secrets --region "$region" --query 'SecretList[].{Name:Name,DeletedDate:DeletedDate,Tags:Tags}' --output table
  run "API Gateway REST APIs" aws apigateway get-rest-apis --region "$region" --query 'items[].{Id:id,Name:name,Created:createdDate}' --output table
  run "API Gateway HTTP/WebSocket APIs" aws apigatewayv2 get-apis --region "$region" --query 'Items[].{Id:ApiId,Name:Name,Protocol:ProtocolType}' --output table
  run "CloudWatch log groups" aws logs describe-log-groups --region "$region" --query 'logGroups[].{Name:logGroupName,Retention:retentionInDays,StoredBytes:storedBytes}' --output table
  run "Backup vaults" aws backup list-backup-vaults --region "$region" --query 'BackupVaultList[].{Name:BackupVaultName,RecoveryPoints:NumberOfRecoveryPoints,Locked:Locked}' --output table
done

{
  echo
  echo "## Global resources"
} >> "$report"
run "S3 buckets" aws s3api list-buckets --query 'Buckets[].{Name:Name,Created:CreationDate}' --output table
run "S3 bucket regions" aws s3api list-buckets --query 'Buckets[].Name' --output text
run "Route 53 hosted zones" aws route53 list-hosted-zones --query 'HostedZones[].{Name:Name,Id:Id,Private:Config.PrivateZone}' --output table

echo "Inventory complete: $report"
