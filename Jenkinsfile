pipeline {
  agent any

  environment {
    NODE_VERSION = '26'
    IMAGE_REGISTRY = 'local'
    WEB_IMAGE = 'tradenet-web'
    API_IMAGE = 'tradenet-api'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Quality Gates') {
      steps {
        sh 'npm run lint'
        sh 'npm test'
        sh 'npm run build'
      }
    }

    stage('Docker Images') {
      steps {
        sh 'docker build -t $IMAGE_REGISTRY/$WEB_IMAGE:${BUILD_NUMBER} .'
        sh 'docker build -t $IMAGE_REGISTRY/$API_IMAGE:${BUILD_NUMBER} services/api'
      }
    }

    stage('Terraform Validate') {
      steps {
        sh 'terraform -chdir=infrastructure/environments/demo init -backend=false'
        sh 'terraform -chdir=infrastructure/environments/demo validate'
      }
    }

    stage('Kubernetes Template') {
      steps {
        sh 'mkdir -p deploy-artifacts'
        sh 'helm lint deploy/helm/tradenet-api'
        sh 'helm template tradenet deploy/helm/tradenet-api --namespace tradenet-apps > deploy-artifacts/tradenet-api.rendered.yaml'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'deploy-artifacts/**/*.yaml,dist/**', allowEmptyArchive: true
    }
  }
}
