ENV ?= demo
AWS_REGION ?= ap-south-1

.PHONY: doctor dev build test lint inventory-aws docker-build plan deploy verify load-test chaos-test plan-destroy destroy verify-clean

doctor:
	node --version
	npm --version
	aws --version || true
	docker --version || true
	terraform version || true
	kubectl version --client=true || true

dev:
	npm run dev

build:
	npm run build

test:
	npm test

lint:
	npm run lint

inventory-aws:
	npm run inventory-aws

docker-build:
	docker build -t tradenet-web:local -f Dockerfile .
	docker build -t tradenet-api:local -f services/api/Dockerfile .

plan:
	cd infrastructure/environments/$(ENV) && terraform init && terraform plan -var="aws_region=$(AWS_REGION)"

deploy:
	bash scripts/deploy.sh $(ENV)

verify:
	bash scripts/verify.sh $(ENV)

load-test:
	bash scripts/load-test.sh $(ENV)

chaos-test:
	bash scripts/chaos-test.sh $(SCENARIO)

plan-destroy:
	cd infrastructure/environments/$(ENV) && terraform init && terraform plan -destroy -var="aws_region=$(AWS_REGION)"

destroy:
	bash scripts/destroy.sh $(ENV)

verify-clean:
	bash scripts/verify-clean.sh $(ENV)
