#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
EC2_INSTANCE_ID="${EC2_INSTANCE_ID:-i-0715e18824145339e}"
EC2_HOST="${EC2_HOST:-13.201.205.69}"
EC2_AVAILABILITY_ZONE="${EC2_AVAILABILITY_ZONE:-ap-south-1a}"
EC2_SECURITY_GROUP_ID="${EC2_SECURITY_GROUP_ID:-sg-018b39741e4818441}"
EC2_USER="${EC2_USER:-ec2-user}"
APP_DIR="${APP_DIR:-/opt/tradenet}"
PUBLIC_URL="${PUBLIC_URL:-https://telnet.superuserz.com}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact_dir="$repo_root/deploy-artifacts"
runtime_dir="$repo_root/deploy-runtime"
archive="$artifact_dir/tradenet-runtime.tar.gz"
ssh_key="$(mktemp -t tradenet-eic.XXXXXX)"
runner_ip=""

cleanup() {
  rm -f "$ssh_key" "$ssh_key.pub"
  if [ -n "$runner_ip" ]; then
    aws ec2 revoke-security-group-ingress \
      --region "$AWS_REGION" \
      --group-id "$EC2_SECURITY_GROUP_ID" \
      --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${runner_ip}/32,Description=\"Local TradeNet force deploy\"}]" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "$repo_root"
npm install
npm run lint
npm test
npm run build

rm -rf "$runtime_dir" "$artifact_dir"
mkdir -p "$runtime_dir/services/api" "$artifact_dir"
cp package.json package-lock.json prisma.config.ts "$runtime_dir/"
cp services/api/package.json "$runtime_dir/services/api/package.json"
cp -R services/api/prisma "$runtime_dir/services/api/prisma"
cp -R dist "$runtime_dir/dist"
cp -R services/api/dist "$runtime_dir/services/api/dist"
tar --no-xattrs -czf "$archive" -C "$runtime_dir" .

runner_ip="$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')"
aws ec2 authorize-security-group-ingress \
  --region "$AWS_REGION" \
  --group-id "$EC2_SECURITY_GROUP_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${runner_ip}/32,Description=\"Local TradeNet force deploy\"}]" >/dev/null 2>&1 || true

ssh-keygen -t ed25519 -f "$ssh_key" -N "" -C local-tradenet-force-deploy >/dev/null
aws ec2-instance-connect send-ssh-public-key \
  --region "$AWS_REGION" \
  --instance-id "$EC2_INSTANCE_ID" \
  --availability-zone "$EC2_AVAILABILITY_ZONE" \
  --instance-os-user "$EC2_USER" \
  --ssh-public-key "file://$ssh_key.pub" >/dev/null

scp -o StrictHostKeyChecking=no -i "$ssh_key" "$archive" "$EC2_USER@$EC2_HOST:/tmp/tradenet-runtime.tar.gz"

ssh -o StrictHostKeyChecking=no -i "$ssh_key" "$EC2_USER@$EC2_HOST" \
  "APP_DIR='$APP_DIR' PUBLIC_URL='$PUBLIC_URL' bash -s" <<'REMOTE'
set -euo pipefail

rollback() {
  echo "Smoke check failed; rolling back to previous release" >&2
  sudo systemctl stop tradenet-api || true
  sudo rm -rf "$APP_DIR.rollback.data"
  if [ -d "$APP_DIR/data" ]; then
    sudo mv "$APP_DIR/data" "$APP_DIR.rollback.data"
  fi
  sudo rm -rf "$APP_DIR.failed"
  if [ -d "$APP_DIR" ]; then
    sudo mv "$APP_DIR" "$APP_DIR.failed"
  fi
  if [ -d "$APP_DIR.previous" ]; then
    sudo mv "$APP_DIR.previous" "$APP_DIR"
  fi
  if [ -d "$APP_DIR.rollback.data" ]; then
    sudo rm -rf "$APP_DIR/data"
    sudo mv "$APP_DIR.rollback.data" "$APP_DIR/data"
  fi
  sudo systemctl start tradenet-api || true
}
trap rollback ERR

sudo systemctl stop tradenet-api || true
sudo rm -rf "$APP_DIR.release" "$APP_DIR.data.keep"
sudo mkdir -p "$APP_DIR.release"
sudo tar -xzf /tmp/tradenet-runtime.tar.gz -C "$APP_DIR.release"
sudo chown -R ec2-user:ec2-user "$APP_DIR.release"

if [ -d "$APP_DIR/data" ]; then
  sudo mv "$APP_DIR/data" "$APP_DIR.data.keep"
fi

sudo rm -rf "$APP_DIR.previous"
if [ -d "$APP_DIR" ]; then
  sudo mv "$APP_DIR" "$APP_DIR.previous"
fi
sudo mv "$APP_DIR.release" "$APP_DIR"
if [ -d "$APP_DIR.data.keep" ]; then
  sudo mv "$APP_DIR.data.keep" "$APP_DIR/data"
fi

sudo mkdir -p "$APP_DIR/data" /etc/tradenet
sudo chown -R ec2-user:ec2-user "$APP_DIR/data"
sudo tee /etc/tradenet/tradenet.env >/dev/null <<ENV
NODE_ENV=production
PORT=8080
STATIC_DIR=$APP_DIR/dist
DATABASE_URL=file:$APP_DIR/data/tradenet.db
ENV

sudo tee /etc/systemd/system/tradenet-api.service >/dev/null <<SERVICE
[Unit]
Description=TradeNet API
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/tradenet/tradenet.env
ExecStart=/usr/bin/node $APP_DIR/services/api/dist/index.js
Restart=always
RestartSec=5
User=ec2-user

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
cd "$APP_DIR"
if ! node -e "const [major]=process.versions.node.split('.').map(Number); process.exit(major >= 20 ? 0 : 1)"; then
  curl -fsSL https://rpm.nodesource.com/setup_26.x | sudo bash -
  sudo dnf install -y nodejs --allowerasing
fi
node --version
npm --version
npm ci --omit=dev --workspace @tradenet/api
DATABASE_URL="file:$APP_DIR/data/tradenet.db" npm run db:generate
DATABASE_URL="file:$APP_DIR/data/tradenet.db" npm run db:migrate
DATABASE_URL="file:$APP_DIR/data/tradenet.db" npm run seed
sudo systemctl enable tradenet-api
sudo systemctl start tradenet-api
sudo nginx -t
sudo systemctl reload nginx

curl -fsS http://127.0.0.1:8080/api/health
curl -fsS http://127.0.0.1:8080/api/ready
curl -fsSL "$PUBLIC_URL/" >/dev/null
cookie="$(mktemp)"
curl -fsS -c "$cookie" -H 'Content-Type: application/json' \
  -d '{"email":"importer@tradenet.demo","password":"TradeNet@2026"}' \
  "$PUBLIC_URL/api/auth/login" >/dev/null
curl -fsS -b "$cookie" "$PUBLIC_URL/api/dashboard" >/dev/null
curl -fsS -b "$cookie" -H 'Content-Type: application/json' -H "Idempotency-Key: force-$(date +%s)" \
  -d '{"referenceNo":"TN-2026-FORCE-'$(date +%s)'","originCountry":"SG","destinationCountry":"IN","commodityCategory":"electronics","hsCode":"8517.62","declaredValue":88000,"previousViolation":false,"documents":["invoice","packing-list","origin-certificate"]}' \
  "$PUBLIC_URL/api/declarations" >/dev/null
rm -f "$cookie"
trap - ERR
REMOTE

curl -fsS "$PUBLIC_URL/api/health"
curl -fsS "$PUBLIC_URL/api/ready"
