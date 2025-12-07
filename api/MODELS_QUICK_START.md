# Quick Start: Which Models to Download for EDM/Electronic Music

## 🎯 Simple Answer: Start with These 3

**For EDM/electronic music analysis, you need:**

1. **effnetdiscogs** - Genre classification (400 genres including all electronic subgenres)
2. **classification_heads** - Mood/emotion models  
3. **musicnn** - General music auto-tagging (includes mood, genre, danceability)

## 📥 Where to Get Them

**Repository:** https://github.com/MTG/essentia-models

### Step-by-Step Download:

1. **Go to:** https://github.com/MTG/essentia-models

2. **Download these directories:**
   - Click on `effnetdiscogs` folder → Download all files
   - Click on `classification_heads` folder → Download all files  
   - Click on `musicnn` folder → Download all files

3. **Or clone the entire repo:**
   ```bash
   git clone https://github.com/MTG/essentia-models.git
   cd essentia-models
   ```

## 📁 Where to Put Them

```bash
# Create models directory
mkdir -p ~/essentia-models

# Copy models (if you cloned the repo)
cp -r essentia-models/effnetdiscogs ~/essentia-models/
cp -r essentia-models/classification_heads ~/essentia-models/
cp -r essentia-models/musicnn ~/essentia-models/
```

## ⚙️ Configure

Add to your `.env` file or environment:
```
ESSENTIA_MODELS_PATH=/home/gordo/essentia-models
```

## ⚠️ Important Note

The models in the GitHub repo are **TensorFlow models**, but `MusicExtractorSVM` uses **SVM models**. 

**Two options:**

1. **Use TensorFlow models** (update code to use TensorflowPredict* algorithms)
2. **Find SVM models** (check Essentia documentation for SVM model downloads)

The current code uses `MusicExtractorSVM` which expects SVM format models. You may need to:
- Check if Essentia includes SVM models in the installation
- Or switch to TensorFlow models (which are more readily available)

## 🔍 Check What You Have

Run this to see if models are already installed:
```bash
ls -la /usr/local/share/essentia/models/
# or
ls -la ~/essentia-models/
```

## 📚 More Info

- Essentia models page: https://essentia.upf.edu/models/
- GitHub repo: https://github.com/MTG/essentia-models
- Essentia docs: https://essentia.upf.edu/documentation/

