# Design Document

## Overview

This design outlines a systematic approach to analyze, test, and consolidate three GitHub branches for the svelte-video-shaders project. The project appears to be a SvelteKit application that uses three.js, WebCodecs, and mp4box.js for video processing with shader effects. The consolidation process will identify working functionality across branches and merge them into a clean main branch.

## Architecture

The branch consolidation system follows a three-phase approach:

1. **Discovery & Analysis Phase**: Identify and analyze the three target branches
2. **Testing & Validation Phase**: Test functionality in each branch to determine what works
3. **Consolidation & Cleanup Phase**: Merge working code and clean up the repository

## Components and Interfaces

### Branch Discovery Component
- **Purpose**: Identify the three branches to be analyzed
- **Interface**: Git commands to list and fetch remote branches
- **Output**: List of branch names and their last commit information

### Diff Analysis Component  
- **Purpose**: Compare file differences between branches
- **Interface**: Git diff commands between branches
- **Key Files to Analyze**:
  - `src/lib/ShaderPlayer.svelte` (main video processing component)
  - `src/routes/+page.svelte` (main application page)
  - `package.json` (dependency changes)
  - Shader files in `src/lib/` directory
  - Configuration files (vite.config.js, svelte.config.js)

### Functionality Testing Component
- **Purpose**: Test build and runtime functionality for each branch
- **Interface**: 
  - Build testing: `pnpm install && pnpm run build`
  - Development testing: `pnpm run dev`
  - Unit testing: `pnpm run test`
- **Success Criteria**:
  - Build completes without errors
  - Application loads in browser
  - Video playback functionality works
  - Shader controls respond correctly

### Merge Strategy Component
- **Purpose**: Intelligently merge working code from multiple branches
- **Strategy**:
  - Create a new consolidation branch from main
  - Cherry-pick working commits from each branch
  - Resolve conflicts by prioritizing working implementations
  - Test after each merge to ensure functionality remains intact

## Data Models

### Branch Analysis Report
```typescript
interface BranchAnalysis {
  branchName: string;
  lastCommit: {
    hash: string;
    message: string;
    date: string;
  };
  keyChanges: FileChange[];
  buildStatus: 'success' | 'failure' | 'not_tested';
  functionalityStatus: {
    videoPlayback: boolean;
    shaderControls: boolean;
    uiComponents: boolean;
  };
}

interface FileChange {
  filePath: string;
  changeType: 'added' | 'modified' | 'deleted';
  linesChanged: number;
  description: string;
}
```

### Consolidation Plan
```typescript
interface ConsolidationPlan {
  targetBranch: string;
  sourceBranches: string[];
  mergeStrategy: 'cherry-pick' | 'merge' | 'manual';
  conflictResolution: ConflictResolution[];
  testingCheckpoints: string[];
}

interface ConflictResolution {
  filePath: string;
  strategy: 'keep_working' | 'manual_merge' | 'prefer_branch';
  preferredBranch?: string;
}
```

## Error Handling

### Build Failures
- **Detection**: Monitor exit codes from build commands
- **Response**: Document specific error messages and affected files
- **Recovery**: Attempt to identify and fix common issues (import errors, missing dependencies)

### Merge Conflicts
- **Detection**: Git merge conflict markers in files
- **Response**: Analyze conflicting code sections to determine which version works
- **Resolution**: Prioritize working implementations over broken ones

### Functionality Regressions
- **Detection**: Compare functionality before and after merges
- **Response**: Rollback problematic merges and try alternative approaches
- **Prevention**: Test after each significant merge operation

## Testing Strategy

### Branch Testing Protocol
1. **Clean Environment**: Start with fresh node_modules for each branch
2. **Dependency Installation**: Run `pnpm install` and check for errors
3. **Build Testing**: Execute `pnpm run build` and verify success
4. **Development Server**: Start `pnpm run dev` and test in browser
5. **Functionality Testing**: 
   - Load a video file
   - Test shader selection and controls
   - Verify real-time video processing
   - Check for console errors

### Integration Testing
1. **Post-Merge Validation**: After each merge, run full test suite
2. **Regression Testing**: Ensure previously working features still function
3. **Performance Testing**: Verify video playback performance is maintained
4. **Cross-Browser Testing**: Test in multiple browsers if critical functionality differs

### Automated Testing
- Leverage existing Vitest setup for unit tests
- Use Playwright for end-to-end testing of video functionality
- Implement build verification tests for CI/CD pipeline

## Implementation Considerations

### Git Workflow Safety
- Always work on feature branches, never directly on main
- Create backup branches before destructive operations
- Use `git reflog` to track and potentially recover from mistakes

### Dependency Management
- Check for package.json differences between branches
- Ensure all dependencies are compatible in the final merge
- Update lock files (pnpm-lock.yaml) after consolidation

### Code Quality
- Run linting and formatting after merges
- Ensure TypeScript types are consistent
- Maintain existing code style and patterns

### Documentation
- Document the consolidation process for future reference
- Update README.md with any new functionality discovered
- Preserve commit history that explains feature development