# Coolify Deployment Guide

Coolify can deploy this API in two ways: using the Dockerfile directly or using docker-compose.yml.

## Option 1: Dockerfile (Recommended for Coolify)

Coolify can automatically detect and use the Dockerfile. This is the simplest approach.

### Steps:

1. **Connect your repository** to Coolify
2. **Select the `api/` directory** as the build context
3. **Coolify will auto-detect** the Dockerfile
4. **Set environment variables** in Coolify dashboard:
   ```
   CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
   API_HOST=0.0.0.0
   API_PORT=8000
   ```
5. **Port mapping**: Coolify will handle this automatically (usually maps to port 80/443 via reverse proxy)

### Environment Variables for Coolify:

| Variable | Value | Notes |
|----------|-------|-------|
| `CORS_ORIGINS` | `https://yourdomain.com` | Your frontend domain(s), comma-separated |
| `API_HOST` | `0.0.0.0` | Required for Docker containers |
| `API_PORT` | `8000` | Internal container port (Coolify handles external mapping) |

## Option 2: Docker Compose

If you prefer using docker-compose.yml:

1. **In Coolify**, select "Docker Compose" as the deployment type
2. **Point to** `api/docker-compose.yml`
3. **Set environment variables** as above

**Note:** You may need to remove the `version:` line from docker-compose.yml (which you've already done ✅) as newer Docker Compose versions don't require it.

## Coolify-Specific Configuration

### Health Check

Coolify will automatically use the `HEALTHCHECK` defined in the Dockerfile. The current health check:
- Endpoint: `/health`
- Interval: 30s
- Timeout: 10s
- Retries: 3

### Resource Limits

The docker-compose.yml includes resource limits. Coolify may override these based on your server configuration. You can adjust in Coolify's dashboard under "Resources".

### Reverse Proxy

Coolify automatically sets up a reverse proxy (Traefik) that:
- Handles SSL certificates (Let's Encrypt)
- Maps your domain to the container
- Routes traffic to port 8000 inside the container

**Important:** You don't need to expose port 8000 publicly - Coolify handles this through the reverse proxy.

## Frontend Configuration

After deployment, update your frontend `.env`:

```bash
# If Coolify assigns a domain like: https://essentia-api.yourdomain.com
VITE_ESSENTIA_API_URL=https://essentia-api.yourdomain.com

# Or if using IP with port (less common with Coolify)
VITE_ESSENTIA_API_URL=http://your-server-ip:8000
```

## Build Time Considerations

**Essentia takes 10-20 minutes to build** from source. Coolify will show build progress. To speed up:

1. **Enable Docker layer caching** in Coolify settings
2. **Use a pre-built Essentia image** (if available)
3. **Consider building once** and pushing to a registry, then pulling in Coolify

## Troubleshooting

### Build Fails

- Check Coolify build logs for Essentia installation errors
- Ensure sufficient disk space (Essentia build requires ~2GB)
- Verify all dependencies in requirements.txt are available

### CORS Errors

- Verify `CORS_ORIGINS` includes your frontend domain
- Check that the API domain is accessible from your frontend
- Ensure `VITE_ESSENTIA_API_URL` matches the Coolify-assigned domain

### Health Check Fails

- Verify the container is running: `docker ps` (if you have SSH access)
- Check container logs in Coolify dashboard
- Ensure `/health` endpoint is responding

## Quick Deploy Checklist

- [ ] Repository connected to Coolify
- [ ] Build context set to `api/` directory
- [ ] Environment variables configured (`CORS_ORIGINS`, `API_HOST`, `API_PORT`)
- [ ] Domain assigned (or using IP)
- [ ] Frontend `.env` updated with API URL
- [ ] Health check passing
- [ ] Test `/health` endpoint from browser

## Example Coolify Environment Variables

```bash
CORS_ORIGINS=https://your-frontend-domain.com,https://www.your-frontend-domain.com
API_HOST=0.0.0.0
API_PORT=8000
```

**Note:** Coolify may automatically set some variables. Check the "Environment" tab in Coolify dashboard to see what's available.

