# Cleanup: Remove Local API Directory

The local `api/` directory is **no longer needed** since we now use the external Essentia API at `https://essentia.v1su4.com`.

## What's Happening

### Before (Old Architecture)
```
svelte-video-shaders/
├── api/                    ← Local Python API
│   ├── main.py            ← Custom endpoints
│   ├── requirements.txt
│   └── ...
└── src/
    └── lib/
        └── essentia-service.js  ← Calls local API
```

### After (New Architecture)
```
svelte-video-shaders/
└── src/
    └── lib/
        └── essentia-service.js  ← Calls external API (https://essentia.v1su4.com)

essentia-endpoint/          ← Master API (separate repo)
├── services/
│   └── analysis.py        ← Energy curve added here
├── api/
│   └── models.py
└── main.py
```

## Safe Removal Steps

### Option 1: Move to Archive (Recommended)

Keep a backup just in case:

```powershell
# Create archive directory
New-Item -ItemType Directory -Path "C:\Users\Gordo\Documents\Github\svelte-video-shaders-archive" -Force

# Move old API
Move-Item -Path "C:\Users\Gordo\Documents\Github\svelte-video-shaders\api" `
          -Destination "C:\Users\Gordo\Documents\Github\svelte-video-shaders-archive\api-backup-$(Get-Date -Format 'yyyy-MM-dd')"
```

### Option 2: Delete (If you're confident)

```powershell
# Remove the directory
Remove-Item -Path "C:\Users\Gordo\Documents\Github\svelte-video-shaders\api" -Recurse -Force
```

### Option 3: Git Remove (Clean commit history)

```bash
# Remove from git but keep local copy
git rm -r --cached api/

# Or remove completely
git rm -r api/

# Commit the change
git add .
git commit -m "Remove local API - now using external essentia-endpoint"
```

## Files That Reference the External API

These files are **correctly configured** and should NOT be removed:

- ✅ `.env` - Contains `VITE_ESSENTIA_API_URL=https://essentia.v1su4.com`
- ✅ `src/lib/essentia-service.js` - Client that calls external API
- ✅ `ESSENTIA_API.md` - API documentation
- ✅ `API_COMPATIBILITY.md` - Feature comparison
- ✅ `README_ESSENTIA.md` - Integration guide

## What to Keep in `api/` Directory

If you want to keep **only the OpenAPI schema** for reference:

```powershell
# Keep only the schema file
Move-Item -Path "C:\Users\Gordo\Documents\Github\svelte-video-shaders\api\essentia-openapi-schema.json" `
          -Destination "C:\Users\Gordo\Documents\Github\svelte-video-shaders\essentia-openapi-schema.json"

# Then remove the rest
Remove-Item -Path "C:\Users\Gordo\Documents\Github\svelte-video-shaders\api" -Recurse -Force
```

## Verification After Cleanup

1. **Check environment variable**:
   ```powershell
   cat .env | Select-String "ESSENTIA_API_URL"
   # Should show: VITE_ESSENTIA_API_URL=https://essentia.v1su4.com
   ```

2. **Test the app**:
   - Start dev server: `bun run dev`
   - Upload audio file
   - Verify analysis works from external API

3. **Check console logs**:
   - Should see: `[EssentiaService] ✅ API connected successfully at https://essentia.v1su4.com`
   - Should NOT see: `localhost:8000`

## If Something Goes Wrong

If you removed the files and need them back:

### From Git History
```bash
# Restore from last commit
git checkout HEAD -- api/

# Or from specific commit
git checkout <commit-hash> -- api/
```

### From Archive
```powershell
# Copy back from archive
Copy-Item -Path "C:\Users\Gordo\Documents\Github\svelte-video-shaders-archive\api-backup-*\*" `
          -Destination "C:\Users\Gordo\Documents\Github\svelte-video-shaders\api" -Recurse
```

## Summary

- ❌ **Remove**: `api/` directory (local Python API)
- ✅ **Keep**: All documentation files about external API
- ✅ **Keep**: `src/lib/essentia-service.js` (calls external API)
- ✅ **Keep**: `.env` (points to external API)

The external API at `https://essentia.v1su4.com` now provides all features including the new energy curve support!
