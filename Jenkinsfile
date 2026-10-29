pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'alumni-production-env',
                        variable: 'ENV_FILE'
                    )
                ]) {
                    sh '''
                        set +x
                        set -eu

                        docker rm -f nddu-alumni 2>/dev/null || true

                        docker run -d \
                            --name nddu-alumni \
                            --restart unless-stopped \
                            -p 14000:4000 \
                            --env-file "$ENV_FILE" \
                            nddu-alumni:latest
                    '''
                }
            }
        }
    }
}
