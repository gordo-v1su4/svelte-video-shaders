# Essentia Classifier Models Setup Guide

## Quick Start - Recommended Models for EDM/Electronic Music

### ⭐ START HERE: Top 3 Models for EDM

**For EDM/electronic music analysis, download these first:**

1. **effnetdiscogs** - Genre classifier (400 genres from Discogs, includes all electronic subgenres)
   - Location: `https://github.com/MTG/essentia-models/tree/main/effnetdiscogs`
   - This covers: house, techno, trance, drum-and-bass, dubstep, ambient, and 394 more genres

2. **classification_heads** - Contains mood/emotion models
   - Location: `https://github.com/MTG/essentia-models/tree/main/classification_heads`
   - Look for models like: `emomusic-msd-musicnn-1.pb` (emotion/mood classification)

3. **musicnn** - Music auto-tagging (includes mood, genre, instrumentation)
   - Location: `https://github.com/MTG/essentia-models/tree/main/musicnn`
   - Can detect: mood, genre, danceability, and more

### What Each Model Does

1. **effnetdiscogs** (Genre Classification):
   - Classifies into 400 genres including:
     - Electronic: house, techno, trance, drum-and-bass, dubstep, ambient, electro, hardcore, hardstyle, progressive-house, etc.
     - Other: rock, pop, jazz, classical, hip-hop, etc.

2. **classification_heads** (Mood/Emotion):
   - Emotion classification models
   - Mood detection (party, happy, sad, relaxed, aggressive, etc.)

3. **musicnn** (Multi-purpose):
   - Genre, mood, and instrumentation tags
   - Good general-purpose classifier

## Where to Download

### Option 1: Essentia Models Repository (Recommended)

**Main repository:**
- GitHub: https://github.com/MTG/essentia-models
- Or check: https://essentia.upf.edu/models/

**Direct download links** (if available):
- Mood models: Look for `mood_*` directories
- Genre models: Look for `genre_*` directories or `genre_discogs_400`

### Option 2: Using Essentia's Model Downloader

Some Essentia installations include a download script. Check if you have:
```bash
essentia_download_models
# or
python -m essentia.models.download
```

## Recommended Download List for EDM Analysis

**Minimum (start here):**
- `mood_party` - Party detection
- `danceability` - Danceability score
- `genre_discogs_400` - All genres (includes electronic subgenres)

**Extended (for more detail):**
- `mood_happy` - Happy/upbeat detection
- `mood_relaxed` - Relaxed/chill detection
- `mood_aggressive` - Aggressive/hard music
- Individual genre models if you want specific subgenres

## Overview

Essentia's MusicExtractorSVM can classify music by mood, emotion, and genre (including EDM/electronic music genres) using pre-trained models. These models need to be downloaded separately.

## Available Models

### Mood/Emotion Models
- **mood_party**: Party vs non-party classification ⭐ (Great for EDM!)
- **mood_relaxed**: Relaxed vs not relaxed
- **mood_sad**: Sad vs not sad
- **mood_aggressive**: Aggressive vs not aggressive
- **mood_happy**: Happy vs not happy ⭐ (Good for EDM)
- **danceability**: How danceable the track is ⭐ (Essential for EDM!)
- **mood_electronic**: Electronic vs non-electronic (if available)

### Genre Models (Including Electronic Music)
- **genre_discogs_400**: 400 genres from Discogs taxonomy (includes all electronic subgenres) ⭐ (Best option!)
- **Individual genre models**: 87 genres from MTG-Jamendo dataset
  - **Electronic genres**: ambient, drum-and-bass, house, techno, trance, dubstep, electro, hardcore, hardstyle, progressive-house, etc.

## Downloading Models - Step by Step

### ⭐ RECOMMENDED: Start with These 3 Models

For EDM/electronic music, download these first:

1. **mood_party** - Detects party/dance music
2. **danceability** - Measures danceability (essential for EDM!)
3. **genre_discogs_400** - Classifies into 400 genres (includes all electronic subgenres)

### How to Download

**Option 1: GitHub Repository (Recommended)**

1. **Visit the repository:**
   ```
   https://github.com/MTG/essentia-models
   ```

2. **Browse the repository** to find model directories:
   - Look for folders like `mood_party/`, `danceability/`, `genre_discogs_400/`
   - Each folder contains the model files you need

3. **Download the model files:**
   - Click into each model directory
   - Download all files in that directory (usually `.model` files and config files)
   - Or use Git LFS if the repo uses it: `git lfs pull`

**Option 2: Essentia Models Website**

1. Visit: https://essentia.upf.edu/models/
2. Browse available models
3. Download the ones you need

**Option 3: Use the helper script**

```bash
cd api
./download_models.sh
```

This will show you exactly which models to download and where to put them.

### Installation Steps

1. **Create models directory:**
   ```bash
   mkdir -p ~/essentia-models
   # Or use system directory:
   sudo mkdir -p /usr/local/share/essentia/models
   ```

2. **Download and extract models:**
   - Download model files from GitHub
   - Extract each model to its own directory:
   ```
   ~/essentia-models/
     ├── mood_party/
     │   └── (model files here)
     ├── danceability/
     │   └── (model files here)
     └── genre_discogs_400/
         └── (model files here)
   ```

3. **Set environment variable:**
   ```bash
   export ESSENTIA_MODELS_PATH=~/essentia-models
   ```
   Or add to your `.env` file:
   ```
   ESSENTIA_MODELS_PATH=/home/gordo/essentia-models
   ```

## Configuration

### Set Models Path

The API will look for models in:
1. `ESSENTIA_MODELS_PATH` environment variable (if set)
2. Default: `/usr/local/share/essentia/models`

**To set a custom path:**
```bash
export ESSENTIA_MODELS_PATH=/path/to/your/models
```

**Or in your `.env` file:**
```
ESSENTIA_MODELS_PATH=/path/to/your/models
```

## Model Structure

Models should be organized like:
```
models/
├── mood_party/
│   └── model files...
├── mood_relaxed/
│   └── model files...
├── genre_ambient/
│   └── model files...
├── genre_house/
│   └── model files...
└── ...
```

## API Response

When models are available, the API will return:

```json
{
  "mood": {
    "party": 0.85,
    "relaxed": 0.12,
    "sad": 0.05,
    "aggressive": 0.78,
    "happy": 0.82,
    "danceability": 0.91
  },
  "genre": {
    "house": 0.92,
    "techno": 0.15,
    "ambient": 0.03,
    ...
  }
}
```

## Testing

1. Download at least one mood model (e.g., `mood_party`)
2. Place it in the models directory
3. Set `ESSENTIA_MODELS_PATH` if using custom path
4. Restart your API server
5. Upload an audio file - you should see mood/genre data in the response

## Notes

- Models are optional - the API works without them (just won't return mood/genre)
- The warning "no classifier models were configured" is normal if models aren't installed
- Models can be large (several MB each)
- You can download only the models you need

## Electronic Music Specific

For EDM/electronic music analysis, recommended models:
- `mood_party` - Great for dance music
- `mood_happy` - EDM is often upbeat
- `danceability` - Essential for electronic music
- Genre models: `genre_house`, `genre_techno`, `genre_trance`, `genre_drum-and-bass`, etc.

