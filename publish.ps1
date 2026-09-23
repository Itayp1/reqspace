# ==============================================================================
# Script to build and publish the reqSpace to Docker Hub
# ==============================================================================

# Replace this with your actual Docker Hub username and repo name!
$DOCKER_USERNAME = "your_dockerhub_username"
$IMAGE_NAME = "reqspace"
$TAG = "latest"

$FULL_IMAGE_NAME = "$DOCKER_USERNAME/$IMAGE_NAME:$TAG"

Write-Host "Building Docker image: $FULL_IMAGE_NAME" -ForegroundColor Cyan
docker build -t $FULL_IMAGE_NAME .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Pushing image to Docker Hub..." -ForegroundColor Cyan
docker push $FULL_IMAGE_NAME

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker push failed! Make sure you are logged in (docker login)." -ForegroundColor Red
    exit 1
}

Write-Host "Successfully published $FULL_IMAGE_NAME to Docker Hub!" -ForegroundColor Green
