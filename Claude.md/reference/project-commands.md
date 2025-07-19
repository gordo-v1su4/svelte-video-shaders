# Project Commands Reference

## Development Commands

### Primary Development
```bash
npm run dev          # Start development server on localhost:5173
npm run build        # Build for production
npm run preview      # Preview production build locally
```

### Code Quality
```bash
npm run format       # Format code with Prettier
npm run lint         # Check code with ESLint + Prettier
npm run prepare      # Prepare SvelteKit sync (runs automatically)
```

### Testing
```bash
npm run test:unit    # Run unit tests with Vitest
npm run test         # Run all tests (unit tests in CI mode)
```

### Storybook (Component Development)
```bash
npm run storybook         # Start Storybook dev server on localhost:6006
npm run build-storybook   # Build Storybook for production
```

## Development Workflow

### Initial Setup
```bash
# Clone repository (if needed)
git clone <repository-url>
cd svelte-video-shaders

# Install dependencies  
npm install

# Start development server
npm run dev
```

### Daily Development
```bash
# Start dev server
npm run dev

# In another terminal - run tests in watch mode
npm run test:unit

# Format code before commits
npm run format

# Check for issues
npm run lint
```

### Before Committing
```bash
# Format and lint
npm run format
npm run lint

# Run tests
npm run test

# Test production build
npm run build
npm run preview
```

## Browser Testing

### Local URLs
- **Development**: http://localhost:5173
- **Storybook**: http://localhost:6006  
- **Preview**: http://localhost:4173 (after `npm run preview`)

### Browser Dev Tools
```javascript
// WebCodecs support check
console.log('WebCodecs supported:', !!window.VideoDecoder);

// Three.js debug access (in console)
window.THREE   // Three.js library
window.scene   // Current Three.js scene (if exposed)

// Svelte debug (development mode)
$0.__svelte__  // Component instance data
```

## Git Workflow

### Current Branch Status
```bash
git status           # Check current changes
git branch          # Show current branch (webcodecs-webgl)
git log --oneline   # Recent commits
```

### Common Git Commands
```bash
# Stage changes
git add .
git add src/lib/ShaderPlayer.svelte

# Commit changes  
git commit -m "fix: replace MeshBasicMaterial with ShaderMaterial for custom shaders"

# Push to current branch
git push origin webcodecs-webgl

# Create pull request (if ready)
gh pr create --title "Fix black screen - implement ShaderMaterial" --body "Fixes shader rendering issue by replacing MeshBasicMaterial with ShaderMaterial"
```

## Debugging Commands

### Development Debugging
```bash
# Start with verbose logging
DEBUG=* npm run dev

# Start with specific port
npm run dev -- --port 3000

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Build Debugging
```bash
# Check bundle size
npm run build
ls -la dist/

# Analyze bundle (if vite-bundle-analyzer available)
npx vite-bundle-analyzer dist/
```

### Dependency Debugging  
```bash
# Check for outdated packages
npm outdated

# Check package info
npm list three
npm list mp4box
npm list svelte-tweakpane-ui

# Verify TypeScript types
npx tsc --noEmit
```

## Environment Variables

### Development
```bash
# Set specific environment
NODE_ENV=development npm run dev

# Debug mode (if configured)
DEBUG=true npm run dev
```

### Build Configuration
```bash
# Production build
NODE_ENV=production npm run build

# Build with source maps
VITE_SOURCEMAP=true npm run build
```

## Package Manager Commands

### Using npm (current setup)
```bash
npm install                    # Install all dependencies
npm install --save <package>   # Add runtime dependency
npm install --save-dev <package> # Add dev dependency
npm update                     # Update packages
```

### Alternative: Using pnpm (if preferred)
```bash
pnpm install                   # Install all dependencies
pnpm add <package>            # Add runtime dependency  
pnpm add -D <package>         # Add dev dependency
pnpm update                   # Update packages
```

## File System Commands

### Quick Navigation
```bash
# Key directories
cd src/lib/              # Component library
cd src/routes/           # SvelteKit routes  
cd src/stories/          # Storybook stories
cd docs/                 # Project documentation
cd Claude.md/            # Claude assistant documentation

# Key files
code src/lib/ShaderPlayer.svelte    # Main video component
code src/routes/+page.svelte        # Application shell
code package.json                  # Dependencies and scripts
code DEVELOPMENT_PLAN.md            # Current project status
```

### File Operations
```bash
# Find files
find src/ -name "*.svelte" -type f
find . -name "*.md" -type f

# Search content
grep -r "WebCodecs" src/
grep -r "ShaderMaterial" src/

# File permissions (if needed)
chmod +x scripts/build.sh
```

## Performance Monitoring

### Browser Performance
```javascript
// Monitor frame rate (in browser console)
let frameCount = 0;
let startTime = performance.now();
setInterval(() => {
    frameCount++;
    if (frameCount % 60 === 0) {
        const now = performance.now();
        const fps = 60000 / (now - startTime);
        console.log(`FPS: ${fps.toFixed(1)}`);
        startTime = now;
    }
}, 16.67); // ~60fps

// Monitor memory usage
setInterval(() => {
    if (performance.memory) {
        const mb = (bytes) => (bytes / 1048576).toFixed(1);
        console.log(`Memory: ${mb(performance.memory.usedJSHeapSize)}MB used / ${mb(performance.memory.totalJSHeapSize)}MB total`);
    }
}, 5000);
```

### Build Performance
```bash
# Time build process
time npm run build

# Build with analysis
npm run build -- --analyze
```

This reference covers the most commonly used commands for developing, testing, and debugging the Svelte Video Shaders project.