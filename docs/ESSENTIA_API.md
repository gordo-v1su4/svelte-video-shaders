# Essentia API Reference

Official Essentia Audio Analysis API deployed at: **https://essentia.v1su4.dev**

## Documentation URLs

- **Swagger UI**: https://essentia.v1su4.dev/docs
- **OpenAPI Schema**: https://essentia.v1su4.dev/openapi.json

## API Information

- **Title**: Audio Analysis API
- **Description**: High-quality music analysis using Essentia C++ core via Python
- **Version**: 3.0.0
- **OpenAPI Version**: 3.1.0

## Authentication

All `/analyze/*` endpoints require an API key header:

- **Header**: `X-API-Key`
- **Required**: Yes

Public endpoints (no API key required):

- `GET /health`
- `GET /docs`
- `GET /redoc`
- `GET /openapi.json`

Configure in `.env`:

```bash
VITE_ESSENTIA_API_URL=https://essentia.v1su4.dev
VITE_ESSENTIA_API_KEY=your-api-key-here
```

## Endpoints

### POST /analyze/rhythm
Extract BPM, beats, confidence, onsets, duration, and energy curve.

Response (`RhythmAnalysis`):

```typescript
{
  bpm: number;
  beats: number[];
  confidence: number;
  onsets: number[];
  duration: number;
  energy: {
    mean: number;
    std: number;
    curve: number[];
  };
}
```

### POST /analyze/structure
Segment audio into labeled sections.

Response (`StructureAnalysis`):

```typescript
{
  sections: Array<{
    start: number;
    end: number;
    label: string;
    duration: number;
    energy: number;
  }>;
  boundaries: number[];
}
```

### POST /analyze/classification
Return genre/mood/tags plus additional perceptual features.

Response (`ClassificationAnalysis`):

```typescript
{
  genres?: { label: string; confidence: number; all_scores: Record<string, number> } | null;
  moods?: { label: string; confidence: number; all_scores: Record<string, number> } | null;
  tags?: string[] | null;
  danceability?: { label: string; confidence: number } | null;
  approachability?: { label: string; confidence: number } | null;
  engagement?: { label: string; confidence: number } | null;
  acoustic_electronic?: { label: string; confidence: number } | null;
  bright_dark?: { label: string; confidence: number } | null;
  tonal_atonal?: { label: string; confidence: number } | null;
  instrument?: string[] | null;
}
```

### POST /analyze/tonal
Analyze key/scale/strength with optional tempo-cnn and pitch data.

Response (`EnhancedTonalAnalysis`):

```typescript
{
  key: string;
  scale: string;
  strength: number;
  tempo_cnn?: number | null;
  pitch?: {
    confidence: number;
    frequencies: number[];
    salience: number[];
  } | null;
}
```

### POST /analyze/vocals
Detect whether the track contains vocals.

Response (`VocalAnalysis`):

```typescript
{
  is_vocal: boolean;
  confidence: number;
  label: string;
}
```

### POST /analyze/full
Run combined analysis (rhythm + structure + classification + tonal + vocals).

Response (`FullAnalysis`):

```typescript
{
  bpm: number;
  beats: number[];
  confidence: number;
  onsets: number[];
  duration: number;
  energy: { mean: number; std: number; curve: number[] };
  structure: StructureAnalysis;
  classification?: ClassificationAnalysis | null;
  tonal?: EnhancedTonalAnalysis | null;
  vocals?: VocalAnalysis | null;
}
```

### GET /health
API health check.

Response:

```typescript
{
  status: string;
  version: string;
}
```

## Error Responses

- `401`: Invalid or missing API key (`/analyze/*` endpoints)
- `422`: Validation error (invalid request body)

## Project Reference

Client implementation: `src/lib/essentia-service.js`
Live schema snapshot: `docs/openapi.json`
