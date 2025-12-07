# Docker Models Setup Guide

## Overview

The Essentia models are stored in persistent storage mounted as a Docker volume. This ensures models persist across container restarts and can be downloaded/managed independently.

## Quick Start

### 1. Start the Docker container (models auto-download!)

```bash
cd api
docker-compose up -d
```

**The entrypoint script automatically:**
- Checks if models exist in `/app/models`
- Downloads models if missing (first time only)
- Starts the API server

### 2. Verify models are downloaded

```bash
# Check models directory on host
ls -la api/models/

# Or check inside container
docker exec -it essentia-audio-api ls -la /app/models/

# Check container logs to see download progress
docker-compose logs essentia-api
```

### 3. Manual download (if needed)

```bash
# Option A: Run the download script inside the container
docker-compose exec essentia-api /app/download_models.sh

# Option B: Run it manually
docker exec -it essentia-audio-api /app/download_models.sh
```

## Persistent Storage

Models are stored in `api/models/` on your host machine and mounted to `/app/models` inside the container.

**Volume mount configuration:**
```yaml
volumes:
  - ./models:/app/models
```

This means:
- Models downloaded inside the container are saved to `api/models/` on your host
- Models persist even if you rebuild or restart the container
- You can manually add/remove models by editing files in `api/models/`

## Environment Variable

The container uses `ESSENTIA_MODELS_PATH=/app/models` (set in docker-compose.yml).

The API will automatically look for models in this directory.

## Manual Model Management

### Download models manually

1. **Clone the repository on your host:**
   ```bash
   cd ~
   git clone https://github.com/MTG/essentia-models.git
   ```

2. **Copy models to the mounted directory:**
   ```bash
   mkdir -p api/models
   cp -r essentia-models/effnetdiscogs api/models/
   cp -r essentia-models/classification_heads api/models/
   cp -r essentia-models/musicnn api/models/
   ```

3. **Restart the container to pick up new models:**
   ```bash
   docker-compose restart essentia-api
   ```

### Remove models

```bash
# Remove specific model
rm -rf api/models/effnetdiscogs

# Remove all models
rm -rf api/models/*
```

## Troubleshooting

### Models not found

1. **Check if models directory exists:**
   ```bash
   ls -la api/models/
   ```

2. **Check container logs:**
   ```bash
   docker-compose logs essentia-api | grep -i model
   ```

3. **Verify environment variable:**
   ```bash
   docker exec -it essentia-audio-api env | grep ESSENTIA_MODELS_PATH
   ```

### Download script fails

1. **Check internet connection inside container:**
   ```bash
   docker exec -it essentia-audio-api ping -c 3 github.com
   ```

2. **Check git is installed:**
   ```bash
   docker exec -it essentia-audio-api git --version
   ```

3. **Run script with verbose output:**
   ```bash
   docker exec -it essentia-audio-api bash -x /app/download_models.sh
   ```

### Models are TensorFlow but code expects SVM

The current code uses `MusicExtractorSVM` which expects SVM models, but the GitHub repository has TensorFlow models. You have two options:

1. **Update code to use TensorFlow models** (recommended - easier to get)
2. **Find and download SVM models** from https://essentia.upf.edu/models/

## Recommended Models for EDM/Electronic Music

1. **effnetdiscogs** - Genre classification (400 genres)
2. **classification_heads** - Mood/emotion models
3. **musicnn** - General music auto-tagging

These are automatically downloaded by the `download_models.sh` script.

