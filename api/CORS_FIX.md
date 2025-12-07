# CORS Fix for Essentia API

## Problem
The API is returning CORS errors because when `allow_credentials=True`, you cannot use `"*"` for `allow_origins`. This is a browser security restriction.

## Solution
The code has been updated to handle this automatically. You need to:

1. **Deploy the updated `api/main.py`** to your server
2. **Set the `CORS_ORIGINS` environment variable** on your server

## Configuration Options

### Option 1: Allow all origins (no credentials)
```bash
CORS_ORIGINS=*
```
This will automatically disable `allow_credentials` when using `"*"`.

### Option 2: Allow specific origins (recommended for production)
```bash
CORS_ORIGINS=http://localhost:5173,https://your-production-domain.com
```
This allows credentials and is more secure.

## For Your Server (https://essentia.v1su4.com)

Since you're running on a server, you should set:
```bash
CORS_ORIGINS=http://localhost:5173,https://your-frontend-domain.com
```

Or if you want to allow all origins (less secure):
```bash
CORS_ORIGINS=*
```

## Deployment Steps

1. **Pull the latest code** with the CORS fix
2. **Set the environment variable** in your deployment platform (Coolify, Docker, etc.)
3. **Restart the API service**

## Testing

After deployment, test with:
```bash
curl -X POST https://essentia.v1su4.com/health
```

Should return: `{"status":"ok"}`

## Error Handling

The updated code also includes better error handling that will:
- Return proper error responses instead of crashing
- Log detailed error messages for debugging
- Clean up temp files even on errors

