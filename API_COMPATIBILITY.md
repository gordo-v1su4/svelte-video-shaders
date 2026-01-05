# API Compatibility Notes

## Feature Comparison: Local vs External API

### Current Status
The project now uses the external Essentia API at **https://essentia.v1su4.com** via the `/analyze/full` endpoint.

### Supported Features ✅

The external API `/analyze/full` provides:
- ✅ **BPM** - Tempo detection
- ✅ **Beats** - Beat positions in seconds  
- ✅ **Onsets** - Transient/onset positions in seconds
- ✅ **Confidence** - Analysis confidence score
- ✅ **Duration** - Audio duration
- ✅ **Structure** - Sections (intro, verse, chorus, etc.) and boundaries
- ✅ **Classification** - Genre, mood, and tags
- ✅ **Tonal** - Key, scale, and strength

### Limited Features ⚠️

These features from the local API are **NOT** available in the external API:

- ❌ **Energy Curve** - High-resolution RMS energy curve for speed ramping
- ❌ **Section Energy** - Energy values per section for glitch mode triggers
- ❌ **Spectral Centroid** - Brightness/timbre analysis
- ❌ **Transcription** - Deepgram speech-to-text with word timestamps

### Impact on VideoWorkbench Features

#### Speed Ramping (Disabled)
- **Code**: Lines 499-507 in `VideoWorkbench.svelte`
- **Requires**: `analysisData.energy.curve[]`
- **Status**: Will not function - `energy` field is undefined
- **Workaround**: Feature toggle will do nothing, no errors will occur

#### Glitch Mode Energy Threshold (Partial)
- **Code**: Lines 752-762 in `VideoWorkbench.svelte`
- **Requires**: `currentSection.energy`
- **Status**: Will not function correctly - `energy` property is undefined
- **Workaround**: Glitch mode will still work with beat triggers, but not energy-based

#### Working Features ✅
All other features work correctly:
- Onset/beat detection and triggering
- MIDI marker integration
- Video cycling on markers
- Jump cuts on markers
- FX triggers on markers
- Section-based video pools (fully functional)
- Classification data (genre, mood, tags)

### Options to Restore Full Functionality

**Option 1: Run Local API in Parallel** (Recommended for development)
```bash
# Keep external API for structure/classification
# Run local API on port 8001 for energy data
cd api
uvicorn main:app --reload --port 8001
```

Then update `essentia-service.js` to call both APIs and merge results.

**Option 2: Request Feature Addition**
Contact the Essentia API maintainer to add energy curve endpoint:
- POST /analyze/energy (return high-resolution RMS energy curve)
- Add `energy` field to section objects in structure analysis

**Option 3: Client-Side Energy Calculation**
Calculate energy curve in the browser using Web Audio API after loading the audio file.

### Recommended Solution

For **production use with public API**:
- Accept that speed ramping is unavailable
- Update UI to hide/disable speed ramping controls when using external API
- Document that this is a premium/local-only feature

For **development/local use**:
- Keep the `api/` directory
- Run local API alongside external API
- Use local API for energy features, external for classification
