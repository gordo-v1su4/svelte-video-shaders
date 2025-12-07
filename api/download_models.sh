#!/bin/bash
# Script to download recommended Essentia models for EDM/electronic music analysis

# Set models directory (default or from env var)
MODELS_DIR="${ESSENTIA_MODELS_PATH:-/app/models}"
mkdir -p "$MODELS_DIR"

echo "📥 Downloading Essentia models to: $MODELS_DIR"
echo ""

# Check if git is available
if ! command -v git &> /dev/null; then
    echo "⚠️  Git not found. Installing git..."
    apt-get update && apt-get install -y git || {
        echo "❌ Failed to install git. Please install manually."
        exit 1
    }
fi

# GitHub repository
REPO_URL="https://github.com/MTG/essentia-models.git"
TEMP_DIR="/tmp/essentia-models"

echo "📦 Cloning Essentia models repository..."
if [ -d "$TEMP_DIR" ]; then
    echo "   Removing existing temp directory..."
    rm -rf "$TEMP_DIR"
fi

# Clone the repository
git clone --depth 1 "$REPO_URL" "$TEMP_DIR" || {
    echo "❌ Failed to clone repository. Trying with full history..."
    rm -rf "$TEMP_DIR"
    git clone "$REPO_URL" "$TEMP_DIR" || {
        echo "❌ Failed to clone repository. Please check your internet connection."
        exit 1
    }
}

echo ""
echo "📋 Available models:"
ls -1 "$TEMP_DIR" | head -10
echo ""

# Copy recommended models for EDM/electronic music
echo "🎵 Copying recommended models for EDM/electronic music..."

# Copy effnetdiscogs (genre classification - 400 genres)
if [ -d "$TEMP_DIR/effnetdiscogs" ]; then
    echo "   ✓ Copying effnetdiscogs (genre classification)..."
    cp -r "$TEMP_DIR/effnetdiscogs" "$MODELS_DIR/" || echo "   ⚠️  Failed to copy effnetdiscogs"
else
    echo "   ⚠️  effnetdiscogs not found in repository"
fi

# Copy classification_heads (mood/emotion models)
if [ -d "$TEMP_DIR/classification_heads" ]; then
    echo "   ✓ Copying classification_heads (mood/emotion)..."
    cp -r "$TEMP_DIR/classification_heads" "$MODELS_DIR/" || echo "   ⚠️  Failed to copy classification_heads"
else
    echo "   ⚠️  classification_heads not found in repository"
fi

# Copy musicnn (general music auto-tagging)
if [ -d "$TEMP_DIR/musicnn" ]; then
    echo "   ✓ Copying musicnn (auto-tagging)..."
    cp -r "$TEMP_DIR/musicnn" "$MODELS_DIR/" || echo "   ⚠️  Failed to copy musicnn"
else
    echo "   ⚠️  musicnn not found in repository"
fi

# Clean up temp directory
echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Models download complete!"
echo ""
echo "📁 Models location: $MODELS_DIR"
echo "📊 Installed models:"
ls -1 "$MODELS_DIR" 2>/dev/null || echo "   (no models found)"
echo ""
echo "💡 Note: These are TensorFlow models. If you need SVM models for MusicExtractorSVM,"
echo "   you may need to download them separately from https://essentia.upf.edu/models/"
