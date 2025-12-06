# API Deployment Guide

## Quick Start

### Local Development
```bash
cd api
uv venv
uv pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Docker (Recommended for Production)

```bash
cd api
docker-compose up -d
```

## Environment Variables

Create a `.env` file in the `api/` directory:

```bash
# API Configuration
API_HOST=0.0.0.0
API_PORT=8000

# CORS - Set to your frontend domain(s) in production
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Frontend Configuration

In your project root, create a `.env` file:

```bash
# Essentia API URL
# Local: http://localhost:8000
# Remote: https://api.yourdomain.com or http://your-server-ip:8000
VITE_ESSENTIA_API_URL=http://localhost:8000
```

**Important:** After changing `VITE_ESSENTIA_API_URL`, restart your Vite dev server.

## Deployment Options

### Option 1: Docker on Remote Server

1. **Copy files to server:**
   ```bash
   scp -r api/ user@server:/opt/essentia-api/
   ```

2. **SSH and deploy:**
   ```bash
   ssh user@server
   cd /opt/essentia-api
   docker-compose up -d
   ```

3. **Update frontend `.env`:**
   ```bash
   VITE_ESSENTIA_API_URL=http://your-server-ip:8000
   ```

### Option 2: Cloud Platforms

- **AWS ECS/Fargate**: Use the Dockerfile with ECS task definitions
- **Google Cloud Run**: Deploy directly from Dockerfile
- **Azure Container Instances**: Use docker-compose or Azure CLI
- **DigitalOcean App Platform**: Connect GitHub repo, auto-deploy on push
- **Railway/Render**: Connect repo, uses Dockerfile automatically

### Option 3: Docker Hub

1. **Build and push:**
   ```bash
   docker build -t yourusername/essentia-api:latest ./api
   docker push yourusername/essentia-api:latest
   ```

2. **Run on any server:**
   ```bash
   docker run -d -p 8000:8000 \
     -e CORS_ORIGINS=https://yourdomain.com \
     yourusername/essentia-api:latest
   ```

## Production Checklist

- [ ] Set `CORS_ORIGINS` to your actual frontend domain(s)
- [ ] Use reverse proxy (nginx/traefik) for SSL termination
- [ ] Configure firewall to allow port 8000 (or your chosen port)
- [ ] Set up monitoring/health checks
- [ ] Configure resource limits in docker-compose.yml
- [ ] Update frontend `VITE_ESSENTIA_API_URL` environment variable
- [ ] Test API connectivity from frontend

## Troubleshooting

### Essentia Installation Issues

If Essentia fails to install in Docker, you may need to:
- Use a pre-built Essentia Docker image
- Build Essentia from source (takes longer)
- Use `essentia-streaming` package instead

### CORS Errors

- Verify `CORS_ORIGINS` includes your frontend URL
- Check that API is accessible from frontend domain
- Ensure `VITE_ESSENTIA_API_URL` matches the API server URL

### Port Conflicts

- Change `API_PORT` in `.env` file
- Update port mapping in docker-compose.yml
- Update frontend `VITE_ESSENTIA_API_URL` accordingly

