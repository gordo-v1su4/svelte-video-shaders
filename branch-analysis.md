# Branch Analysis Report

## Discovered Branches

Based on the git repository analysis, I've identified the following branches for consolidation:

### 1. main (6d023f4)
- **Last Commit Date**: Mon Jul 7 16:49:17 2025 -0400
- **Status**: Current HEAD branch
- **Description**: Main production branch

### 2. webcodecs-webgl (local) (f6d38ca)
- **Last Commit Date**: Fri Jul 18 21:29:45 2025 -0400
- **Status**: Local development branch
- **Description**: Local version of webcodecs-webgl with recent changes

### 3. origin/webcodecs-webgl (remote) (8d52a87)
- **Last Commit Date**: Wed Jul 9 17:35:08 2025 -0400
- **Status**: Remote branch
- **Description**: Remote version of webcodecs-webgl branch

## Branch Relationship Analysis

From the git show-branch output, I can see:
- The local `webcodecs-webgl` branch has commits: "changes", "addtl", "video player and webcodecs"
- The remote `origin/webcodecs-webgl` has different commits with messages like "feat: Enhance video playback controls and UI in ShaderPlayer"
- Both branches appear to be working on similar video processing functionality but have diverged

## Next Steps

The three target branches for consolidation are:
1. `main` - baseline branch
2. `webcodecs-webgl` (local) - recent local development
3. `origin/webcodecs-webgl` - remote development branch

These branches need to be analyzed for functionality differences and working features before consolidation.