#!/bin/bash
# Entrypoint script that auto-downloads models if missing, then starts the API

set -e

MODELS_DIR="${ESSENTIA_MODELS_PATH:-/app/models}"

echo "🚀 Starting Essentia API..."
echo "📁 Models directory: $MODELS_DIR"

# Check if models directory exists and has content
if [ ! -d "$MODELS_DIR" ] || [ -z "$(ls -A $MODELS_DIR 2>/dev/null)" ]; then
    echo ""
    echo "⚠️  No models found in $MODELS_DIR"
    echo "📥 Auto-downloading models..."
    echo ""
    
    # Run the download script
    /app/download_models.sh
    
    echo ""
    echo "✅ Model download complete!"
else
    echo "✅ Models already present in $MODELS_DIR"
    echo "   (Skipping download - models found)"
fi

echo ""
echo "🎵 Starting FastAPI server..."
echo ""

# Start the API
exec uvicorn main:app --host 0.0.0.0 --port 8000

