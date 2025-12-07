# Essentia Models Setup (Quick Reference)

## 🚀 Quick Start

**Just start the container - models auto-download on first run!**

```bash
docker-compose up -d
```

The entrypoint script will:
- ✅ Check if models exist
- 📥 Auto-download if missing (first time only)
- 🎵 Start the API server

**That's it!** Models are saved to `api/models/` (persistent storage)

## Manual Download (Optional)

If you want to manually trigger a download:

```bash
docker-compose exec essentia-api /app/download_models.sh
```

## 📁 Storage

- **Host:** `api/models/` (persistent, survives container restarts)
- **Container:** `/app/models/` (mounted volume)

## 🔄 Workflow

```
1. docker-compose up -d          # Start container
2. docker-compose exec ...        # Download models
3. Models saved to api/models/    # Persistent storage
4. API uses models automatically  # No restart needed
```

## 📦 What Gets Downloaded

- `effnetdiscogs/` - Genre classification (400 genres)
- `classification_heads/` - Mood/emotion models
- `musicnn/` - General music auto-tagging

## ⚠️ Important Notes

- Models are **large files** (several GB total)
- Models persist in `api/models/` even if you rebuild the container
- First download may take 10-20 minutes depending on connection
- Models are **TensorFlow format** (not SVM - code may need updates)

## 🛠️ Troubleshooting

See `DOCKER_MODELS.md` for detailed troubleshooting guide.

