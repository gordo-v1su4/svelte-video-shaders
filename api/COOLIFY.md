# Coolify Deployment Guide

Coolify can deploy this API in multiple ways. **GitHub deployment is recommended** for automatic updates and version control.

## Option 1: GitHub Repository (Recommended ⭐)

**Best for:** Automatic deployments, version control, easy updates

### Steps:

1. **Push your code to GitHub** (if not already)
2. **In Coolify**, select "Public Repository" or "Private Repository (with GitHub App)"
3. **Connect your repository**
4. **Set build context** to `api/` directory
5. **Coolify will auto-detect** the Dockerfile
6. **Set environment variables** in Coolify dashboard:
   ```
   CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
   API_HOST=0.0.0.0
   API_PORT=8000
   ```
7. **Deploy!** Coolify will build and deploy automatically

### Benefits:
- ✅ **Auto-deploy on push** - Every git push triggers a new deployment
- ✅ **Version control** - Easy rollback to previous versions
- ✅ **Branch deployments** - Test features on separate branches
- ✅ **Build logs** - Full visibility into build process
- ✅ **No manual uploads** - Everything automated

### Build Context Configuration:
When setting up in Coolify, make sure to:
- **Root Directory**: Leave empty or set to `/`
- **Dockerfile Path**: `api/Dockerfile`
- **Build Context**: `api/` (this is important!)
- **Branch**: Select your branch (defaults to `main`, but you can choose any branch)

### Branch Deployments

**Deploying from a non-main branch:**

1. **During setup**: In Coolify, you can select which branch to deploy from
2. **After setup**: You can change the branch in Coolify settings
3. **Multiple environments**: You can create separate Coolify resources for different branches:
   - `main` → Production deployment
   - `develop` → Staging deployment
   - `feature/xyz` → Feature testing

**Example workflow:**
```bash
# Work on feature branch
git checkout -b feature/new-shader
# Make changes to api/main.py
git push origin feature/new-shader

# In Coolify:
# - Create a new resource pointing to 'feature/new-shader' branch
# - Or update existing resource to use this branch
# - Test your changes before merging to main
```

**Branch Selection in Coolify:**
- When connecting a repository, Coolify will show available branches
- You can change the branch later in the resource settings
- Each branch can have its own environment variables
- Perfect for testing API changes before merging to main

## Option 2: Dockerfile (Manual Upload)

**Best for:** Quick testing, one-off deployments

### Steps:

1. **In Coolify**, select "Dockerfile"
2. **Upload** your `api/Dockerfile` and `api/requirements.txt`
3. **Set environment variables** as above
4. **Deploy**

### Limitations:
- ❌ No automatic updates
- ❌ Manual re-upload needed for changes
- ❌ No version control integration

## Option 3: Docker Compose (Manual Upload)

**Best for:** Complex multi-service setups (not needed for this API)

If you prefer using docker-compose.yml:

1. **In Coolify**, select "Docker Compose Empty"
2. **Upload** `api/docker-compose.yml` and related files
3. **Set environment variables** as above

**Note:** For a single-service API, GitHub + Dockerfile is simpler and recommended.

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

