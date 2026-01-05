# Essentia API Integration

This document explains how the project integrates with the Essentia audio analysis API.

## Quick Start

The project is configured to use the external Essentia API at **https://essentia.v1su4.com**.

1. **Environment Configuration**: The API URL is set in `.env`:
   ```bash
   VITE_ESSENTIA_API_URL=https://essentia.v1su4.com
   ```

2. **Client Integration**: The `src/lib/essentia-service.js` handles all API communication

3. **Usage**: Upload an audio file in the VideoWorkbench UI - analysis happens automatically

## Documentation

- **[ESSENTIA_API.md](./ESSENTIA_API.md)** - Complete API reference with all endpoints and schemas
- **[API_COMPATIBILITY.md](./API_COMPATIBILITY.md)** - Feature comparison and compatibility notes
- **[API_MIGRATION.md](./API_MIGRATION.md)** - Migration guide from local to external API

## Interactive Documentation

- **Swagger UI**: https://essentia.v1su4.com/docs
- **OpenAPI Schema**: https://essentia.v1su4.com/openapi.json

## API Endpoints Used

### Primary Endpoint: `/analyze/full`
The app uses the full analysis endpoint which provides:
- **Rhythm**: BPM, beats, onsets, confidence, duration
- **Structure**: Sections (intro, verse, chorus, etc.) and boundaries
- **Classification**: Genre, mood, and tags (if available)
- **Tonal**: Key, scale, and strength (if available)

### Request Format
```typescript
POST /analyze/full
Content-Type: multipart/form-data
Body: { file: <binary audio file> }
```

### Response Format
```typescript
{
  bpm: number;
  beats: number[];          // seconds
  confidence: number;
  onsets: number[];         // seconds
  duration: number;
  structure: {
    sections: Array<{
      start: number;
      end: number;
      label: string;
      duration: number;
    }>;
    boundaries: number[];
  };
  classification?: {
    genres: { label: string; confidence: number; all_scores: {} };
    moods: { label: string; confidence: number; all_scores: {} };
    tags: string[];
  };
  tonal?: {
    key: string;
    scale: string;
    strength: number;
  };
}
```

## Features Supported

### ✅ Fully Supported
- Beat and onset detection
- BPM calculation
- Song structure segmentation (intro/verse/chorus/outro)
- Section-based video pools
- Genre, mood, and tag classification
- Key and scale detection
- All marker-based triggers (jump cuts, FX, video cycling)

### ⚠️ Partially Supported
- **Glitch Mode**: Works with beat triggers, but energy-based thresholding is unavailable

### ❌ Not Supported (External API Limitation)
- **Speed Ramping**: Requires high-resolution energy curve (not provided by external API)
- **Section Energy Values**: Energy per section not available
- **Transcription**: No speech-to-text in external API

## Local API Alternative

If you need the unsupported features (speed ramping, energy curves), you can run the local API:

```bash
cd api
uvicorn main:app --reload --port 8000
```

Then update `.env`:
```bash
VITE_ESSENTIA_API_URL=http://localhost:8000
```

**Note**: The local API uses `/analyze` endpoint (different schema from external API).

## Troubleshooting

### API Not Responding
Check the browser console for connection errors. Verify the API is accessible:
```bash
curl https://essentia.v1su4.com/health
```

Expected response:
```json
{"status":"ok"}
```

### Analysis Returns Empty Results
- Check that the audio file format is supported (MP3, WAV, FLAC, etc.)
- Check browser network tab for 422 validation errors
- Large files may take longer to analyze

### Features Not Working
- **Speed Ramping**: This feature is disabled when using the external API (see API_COMPATIBILITY.md)
- **Section Video Pools**: Requires structure analysis - wait for analysis to complete

## Development

### Client Code
The Essentia service client is in `src/lib/essentia-service.js`:
```javascript
import { EssentiaService } from '$lib/essentia-service.js';

const service = new EssentiaService();
await service.initialize();
const result = await service.analyzeFile(audioFile);
```

### Adding New Endpoints
To use other endpoints like `/analyze/rhythm` or `/analyze/structure`:
1. Modify `essentia-service.js` to change the endpoint URL
2. Update the response type handling in `VideoWorkbench.svelte`
3. Refer to `ESSENTIA_API.md` for endpoint schemas

## Production Deployment

When deploying to production:
1. Ensure `.env` contains the correct API URL
2. Consider rate limiting and API quotas (if applicable)
3. Implement error handling for API downtime
4. Cache analysis results for the same audio files

## Credits

- **Essentia**: https://essentia.upf.edu/ - Open-source audio analysis library
- **External API**: Deployed at v1su4.com
