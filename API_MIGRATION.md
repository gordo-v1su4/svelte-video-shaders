# API Migration Notes

## Migration to External Essentia API

This project now uses the external Essentia API deployed at **https://essentia.v1su4.com** instead of the local API.

### What Changed

1. **API Endpoint Updated**: Client now uses `/analyze/rhythm` endpoint from the official API
2. **Local API Deprecated**: The `api/` directory is no longer needed for this project
3. **Configuration**: Environment variable `VITE_ESSENTIA_API_URL=https://essentia.v1su4.com` set in `.env`

### API Documentation

See `ESSENTIA_API.md` for complete API reference including:
- All available endpoints (`/analyze/rhythm`, `/analyze/structure`, `/analyze/classification`, `/analyze/full`)
- Request/response schemas
- Interactive docs at https://essentia.v1su4.com/docs

### Local API Directory

The `api/` directory can be removed or kept as reference:

**To Remove:**
```bash
# Backup first if needed
# Then remove the directory
rm -rf api
rm -rf "api - Copy"
```

**What was in the local API:**
- Custom `/analyze` endpoint with additional features (energy curves, structure detection, transcription)
- The external API provides similar functionality through dedicated endpoints

### Migration Checklist

- [x] Updated `src/lib/essentia-service.js` to use `/analyze/rhythm` endpoint
- [x] Created `ESSENTIA_API.md` documentation with schema reference
- [x] Confirmed `.env` points to https://essentia.v1su4.com
- [ ] Test the application with the external API
- [ ] Optional: Remove `api/` directory if no longer needed
- [ ] Optional: Update to use `/analyze/full` for complete analysis features

### Response Schema Differences

**Local API (`/analyze`):**
```typescript
{
  bpm, beats, confidence, duration, onsets,
  energy: { mean, std, curve },
  spectral_centroid,
  structure: { sections, boundaries },
  mood, genre, transcription
}
```

**External API (`/analyze/rhythm`):**
```typescript
{
  bpm, beats, confidence, onsets, duration
}
```

**External API (`/analyze/full`):**
```typescript
{
  bpm, beats, confidence, onsets, duration,
  structure: { sections, boundaries },
  classification: { genres, moods, tags },
  tonal: { key, scale, strength }
}
```

### Next Steps

If you need the additional features (energy curves, structure, classification), update the client to use `/analyze/full` instead of `/analyze/rhythm`.
