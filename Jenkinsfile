
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        IMAGE_NAME = 'nddu-alumni'
        CONTAINER_NAME = 'nddu-alumni'
        APP_PORT = '4000'
        HOST_PORT = '14000'
    }

    stages {
        stage('Build Docker Image') {
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

                        # Extract only public Vite build settings.
                        export VITE_SUPABASE_URL="$(
                            sed -n 's/^VITE_SUPABASE_URL=//p' "$ENV_FILE" | head -n 1
                        )"
                        export VITE_SUPABASE_PUBLISHABLE_KEY="$(
                            sed -n 's/^VITE_SUPABASE_PUBLISHABLE_KEY=//p' "$ENV_FILE" | head -n 1
                        )"
                        export VITE_TURNSTILE_SITE_KEY="$(
                            sed -n 's/^VITE_TURNSTILE_SITE_KEY=//p' "$ENV_FILE" | head -n 1
                        )"

                        docker build \
                            --build-arg VITE_SUPABASE_URL \
                            --build-arg VITE_SUPABASE_PUBLISHABLE_KEY \
                            --build-arg VITE_TURNSTILE_SITE_KEY \
                            -t "$IMAGE_NAME:latest" .
                    '''
                }
            }
        }

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

                        docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

                        docker run -d \
                            --name "$CONTAINER_NAME" \
                            --restart unless-stopped \
                            -p "$HOST_PORT:$APP_PORT" \
                            --env-file "$ENV_FILE" \
                            "$IMAGE_NAME:latest"

                        sleep 5

                        if [ "$(docker inspect \
                            -f '{{.State.Running}}' "$CONTAINER_NAME")" \
                            != "true" ]; then
                            docker logs "$CONTAINER_NAME"
                            exit 1
                        fi

                        # Verify that the published host port reaches Express,
                        # rather than only checking the container process state.
                        if ! curl --fail --silent --show-error \
                            --retry 10 --retry-delay 2 --retry-connrefused \
                            "http://127.0.0.1:$HOST_PORT/api/status" \
                            >/dev/null; then
                            docker logs "$CONTAINER_NAME"
                            exit 1
                        fi

                        echo "Container is running and /api/status is reachable."
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'NDDU Alumni deployment succeeded.'
        }
        failure {
            echo 'Deployment failed. Review the stage logs.'
        }
    }
}
