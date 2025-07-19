# Testing & Validation Checklist

## Pre-Fix Baseline Testing

### ✅ Current Working Features
- [ ] File upload button opens dialog
- [ ] Video file selection triggers processing  
- [ ] MP4Box parsing completes without errors
- [ ] WebCodecs VideoDecoder configures successfully
- [ ] Video frames decode and log reception
- [ ] Texture updates occur (needsUpdate triggers)
- [ ] Three.js render loop executes
- [ ] Tweakpane UI controls respond
- [ ] Multiple video uploads work
- [ ] Video selection switches active video

### ❌ Current Issues to Fix
- [ ] Video displays as black screen
- [ ] Fragment shaders have no visual effect
- [ ] Uniform parameter changes don't affect rendering

## Post-Fix Validation

### Basic Video Display
- [ ] Video displays without any shader effects (pass-through)
- [ ] Video maintains correct aspect ratio
- [ ] Video resolution matches expected dimensions
- [ ] No WebGL errors in console
- [ ] Frame rate is smooth (30/60 fps)

### Shader System
- [ ] Grayscale shader applies correctly
- [ ] Grayscale strength slider affects intensity (0-100%)
- [ ] Vignette shader applies correctly  
- [ ] Vignette strength slider works (0-100%)
- [ ] Vignette falloff slider works (0-100%)
- [ ] Shader switching works without artifacts
- [ ] Multiple parameter changes work simultaneously

### Video Management
- [ ] Multiple videos can be uploaded
- [ ] Video thumbnails generate correctly
- [ ] Switching between videos works
- [ ] Each video maintains its own shader state
- [ ] Video library persists during session

### Playback Controls
- [ ] Play button starts video processing
- [ ] Pause button stops processing  
- [ ] Frame forward advances single frame
- [ ] Frame backward goes to previous frame
- [ ] Controls are disabled/enabled appropriately

## Browser Compatibility Testing

### WebCodecs API Support
- [ ] **Chrome 94+**: Full functionality
- [ ] **Edge 94+**: Full functionality  
- [ ] **Firefox**: Graceful degradation message
- [ ] **Safari**: Graceful degradation message

### WebGL Support
- [ ] **Desktop**: All features work
- [ ] **Mobile Chrome**: Performance acceptable
- [ ] **Mobile Safari**: WebGL features work
- [ ] **Older devices**: Fallback handling

## Performance Testing

### Video Processing Performance
- [ ] 1080p H.264 video: Smooth playback
- [ ] 4K H.264 video: Acceptable performance
- [ ] High bitrate video: No dropped frames
- [ ] Multiple videos: Memory usage reasonable

### Shader Performance  
- [ ] Simple shaders (grayscale): 60fps
- [ ] Complex shaders (vignette): 30fps+
- [ ] Shader switching: No frame drops
- [ ] Parameter updates: Real-time response

### Memory Management
- [ ] Video memory released on upload
- [ ] WebCodecs resources cleaned up properly
- [ ] Three.js objects disposed correctly
- [ ] No memory leaks during extended use

## Error Handling Testing

### File Upload Errors
- [ ] Non-video files: Appropriate error message
- [ ] Corrupted video: Graceful failure
- [ ] Unsupported codec: Clear error message
- [ ] Large files: Progress indication or timeout

### WebCodecs Errors  
- [ ] Decoder configuration failure: Error message
- [ ] Frame decode errors: Recovery or fallback
- [ ] Browser compatibility: Feature detection

### WebGL Errors
- [ ] Shader compilation errors: Debug info
- [ ] Texture upload errors: Fallback behavior
- [ ] Context loss: Recovery mechanism

## Development Testing Commands

### Local Development
```bash
npm run dev          # Start dev server on localhost:5173
npm run build        # Test production build
npm run preview      # Test built application
```

### Code Quality
```bash
npm run lint         # ESLint checks
npm run format       # Prettier formatting  
npm run test         # Unit tests
```

### Debug Testing
```bash
# Open browser dev tools and check:
# - Console for [Tracer] logs
# - Network tab for video file loading
# - Performance tab for frame rate
# - Memory tab for leak detection
```

## Test Video Files

### Required Test Assets
- [ ] **Small H.264 MP4** (720p, <10MB) - Quick testing
- [ ] **Standard H.264 MP4** (1080p, ~50MB) - Normal use case
- [ ] **High resolution** (4K, >100MB) - Performance testing
- [ ] **Different aspect ratios** (16:9, 4:3, 21:9) - Layout testing
- [ ] **Variable frame rates** (24fps, 30fps, 60fps) - Playback testing

### Edge Case Files
- [ ] **Very short video** (<1 second) - Boundary testing
- [ ] **Long video** (>10 minutes) - Memory testing  
- [ ] **Different codecs** (if supported) - Compatibility testing

## Manual Testing Workflow

### 1. Fresh Browser Session
1. Clear browser cache and localStorage
2. Open application in new incognito window
3. Test complete upload → shader → playback workflow

### 2. Multi-Video Testing
1. Upload 3 different videos
2. Switch between videos rapidly
3. Apply different shaders to each
4. Verify no cross-contamination

### 3. Parameter Stress Testing
1. Rapidly adjust shader parameters
2. Switch shaders while adjusting parameters
3. Test parameter extremes (0%, 100%)
4. Test parameter precision (fine adjustments)

## Success Criteria

### Minimum Viable Fix
- [ ] Videos display correctly (no black screen)
- [ ] Basic shader effects work (grayscale)
- [ ] No console errors during normal operation

### Complete Success
- [ ] All shaders work as designed
- [ ] Real-time parameter adjustment
- [ ] Smooth performance on target devices
- [ ] Robust error handling
- [ ] Multiple video management works