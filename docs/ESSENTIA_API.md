# Essentia API Reference

Official Essentia Audio Analysis API deployed at: **https://essentia.v1su4.com**

## Documentation URLs

- **Swagger UI**: https://essentia.v1su4.com/docs
- **OpenAPI Schema**: https://essentia.v1su4.com/openapi.json

## API Information

- **Title**: Audio Analysis API
- **Description**: High-quality music analysis using Essentia C++ core via Python
- **Version**: 2.0.0
- **OpenAPI Version**: 3.1.0

## Endpoints

### POST /analyze/rhythm
Extract BPM, beats, confidence, and high-quality onsets.

**Request**: `multipart/form-data` with `file` (binary audio file)

**Response** (`RhythmAnalysis`):
```typescript
{
  bpm: number;
  beats: number[];        // Beat positions in seconds
  confidence: number;
  onsets: number[];       // Onset positions in seconds
  duration: number;
}
```

### POST /analyze/structure
Segment audio into sections (intro, verse, chorus, etc.) using SBic.

**Request**: `multipart/form-data` with `file` (binary audio file)

**Response** (`StructureAnalysis`):
```typescript
{
  sections: Array<{
    start: number;
    end: number;
    label: string;
    duration: number;
  }>;
  boundaries: number[];
}
```

### POST /analyze/classification
Analyze Genre, Mood, and Tags using Essentia TensorFlow models.

**Request**: `multipart/form-data` with `file` (binary audio file)

**Response** (`ClassificationAnalysis`):
```typescript
{
  genres: {
    label: string;
    confidence: number;
    all_scores: Record<string, number>;
  };
  moods: {
    label: string;
    confidence: number;
    all_scores: Record<string, number>;
  };
  tags: string[];
}
```

### POST /analyze/full
Perform full rhythm, structural, and classification analysis.

**Request**: `multipart/form-data` with `file` (binary audio file)

**Response** (`FullAnalysis`):
```typescript
{
  bpm: number;
  beats: number[];
  confidence: number;
  onsets: number[];
  duration: number;
  structure: StructureAnalysis;
  classification?: ClassificationAnalysis | null;
  tonal?: {
    key: string;
    scale: string;
    strength: number;
  } | null;
}
```

### GET /health
Check API health status.

**Response**:
```typescript
{
  status: string;
}
```

## Usage in Project

The API URL is configured via environment variable:
```bash
VITE_ESSENTIA_API_URL=https://essentia.v1su4.com
```

See `src/lib/essentia-service.js` for the client implementation.

## Error Responses

All POST endpoints return `422 Validation Error` on invalid input:
```typescript
{
  detail: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
  }>;
}
```
