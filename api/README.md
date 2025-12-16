# Essentia Audio Analysis API

FastAPI server for audio beat detection and BPM extraction using Essentia.

## Quick Start

### Local Development

```bash
# Install dependencies
cd api
uv venv
uv pip install -r requirements.txt

# Run server
uvicorn main:app --reload --port 8000
```

### Docker Deployment

#### Build and Run

```bash
cd api

# Build the image
docker build -t essentia-api .

# Run the container
docker run -p 8000:8000 essentia-api
```
                                                                                                                                 
#### Using Docker Compose

```bash
cd api

# Copy environment file
cp .env.example .env

# Edit .env to set your CORS origins for production
# CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_HOST` | `0.0.0.0` | Host to bind the server to |
| `API_PORT` | `8000` | Port to run the server on |
| `CORS_ORIGINS` | `*` | Comma-separated list of allowed CORS origins |

## API Endpoints

### `POST /analyze`

Analyzes an audio file for beats and BPM.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` (audio file)

**Response:**
```json
{
  "bpm": 120.5,
  "beats": [0.0, 0.5, 1.0, 1.5, ...],
  "confidence": 0.95,
  "duration": 180.5
}
```

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

## Deployment to Remote Server

### Option 1: Docker on Remote Server

1. **Copy files to server:**
   ```bash
   scp -r api/ user@server:/path/to/deploy/
   ```

2. **SSH into server:**
   ```bash
   ssh user@server
   cd /path/to/deploy/api
   ```

3. **Build and run:**
   ```bash
   docker-compose up -d
   ```

4. **Update frontend environment:**
   - Set `VITE_ESSENTIA_API_URL=https://essentia.v1su4.com` in your frontend `.env` file

### Option 2: Docker Hub / Container Registry

1. **Build and push:**
   ```bash
   docker build -t yourusername/essentia-api:latest .
   docker push yourusername/essentia-api:latest
   ```

2. **Pull and run on server:**
   ```bash
   docker pull yourusername/essentia-api:latest
   docker run -d -p 8000:8000 \
     -e CORS_ORIGINS=https://yourdomain.com \
     yourusername/essentia-api:latest
   ```

### Option 3: Cloud Platform (AWS, GCP, Azure)

- **AWS ECS/Fargate**: Use the Dockerfile with ECS task definitions
- **Google Cloud Run**: Deploy directly from Dockerfile
- **Azure Container Instances**: Use docker-compose or Azure CLI
- **DigitalOcean App Platform**: Connect GitHub repo, auto-deploy on push

## Production Considerations

1. **CORS Configuration**: Set `CORS_ORIGINS` to your actual frontend domain(s)
2. **Reverse Proxy**: Use nginx/traefik for SSL termination and routing
3. **Resource Limits**: Adjust CPU/memory in docker-compose.yml based on load
4. **Health Checks**: Configure your orchestrator to use `/health` endpoint
5. **Logging**: Add structured logging for production monitoring

## Troubleshooting

### Essentia Installation Issues

If Essentia fails to install in Docker, you may need to:
- Use a pre-built Essentia Docker image
- Build Essentia from source in a multi-stage build
- Use a different base image with Essentia pre-installed

### CORS Errors

If you see CORS errors from the frontend:
- Check that `CORS_ORIGINS` includes your frontend URL
- Ensure the API is accessible from the frontend domain
- Verify the API URL in frontend environment variables

### Port Conflicts

If port 8000 is already in use:
- Change `API_PORT` environment variable
- Update port mapping in docker-compose.yml
- Update frontend `VITE_ESSENTIA_API_URL` accordingly

