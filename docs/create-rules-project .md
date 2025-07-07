This document outlines a systematic approach to creating and managing Cursor rules, focusing on automation and scalability for any codebase.

## Foundational Rules

These rules are project-agnostic and should be set up first.

### 1. The Cursor Rules Rule

This rule ensures consistency in how other Cursor rules are created and stored.

**File:** `.cursor/rules/cursor-rules.mdc`

```markdown
---
description: How to add or edit Cursor rules in our project
globs:
alwaysApply: false
---
# Cursor Rules Location

How to add new cursor rules to the project

1.  Always place rule files in PROJECT\_ROOT/.cursor/rules/:

    ```
    .cursor/rules/
    ├── your-rule-name.mdc
    ├── another-rule.mdc
    └── ...
    ```

2.  Follow the naming convention:

    -   Use kebab-case for filenames
    -   Always use .mdc extension
    -   Make names descriptive of the rule's purpose

3.  Directory structure:

    ```
    PROJECT_ROOT/
    ├── .cursor/
    │   └── rules/
    │       ├── your-rule-name.mdc
    │       └── ...
    └── ...
    ```

4.  Never place rule files:

    -   In the project root
    -   In subdirectories outside .cursor/rules
    -   In any other location

5.  Cursor rules have the following structure:

```
---
description: Short description of the rule's purpose
globs: optional/path/pattern/**/*
alwaysApply: false
---
# Rule Title

Main content explaining the rule with markdown formatting.

1.  Step-by-step instructions
2.  Code examples
3.  Guidelines

Example:

```typescript
// Good example
function goodExample() {
  // Implementation following guidelines
}

// Bad example
function badExample() {
  // Implementation not following guidelines
}
```
```

### 2. The Self-Improvement Rule

This rule teaches Cursor to identify patterns and generate new rules autonomously.

**File:** `.cursor/rules/self-improvement.mdc`

```markdown
---
description: Guidelines for continuously improving Cursor rules based on emerging code patterns and best practices.
globs: **/*
alwaysApply: true
---
## Rule Improvement Triggers

-   New code patterns not covered by existing rules
-   Repeated similar implementations across files
-   Common error patterns that could be prevented
-   New libraries or tools being used consistently
-   Emerging best practices in the codebase

# Analysis Process:

-   Compare new code with existing rules
-   Identify patterns that should be standardized
-   Look for references to external documentation
-   Check for consistent error handling patterns
-   Monitor test patterns and coverage

# Rule Updates:

-   **Add New Rules When:**
    -   A new technology/pattern is used in 3+ files
    -   Common bugs could be prevented by a rule
    -   Code reviews repeatedly mention the same feedback
    -   New security or performance patterns emerge

-   **Modify Existing Rules When:**
    -   Better examples exist in the codebase
    -   Additional edge cases are discovered
    -   Related rules have been updated
    -   Implementation details have changed

-   **Example Pattern Recognition:**

    ```typescript
    // If you see repeated patterns like:
    const data = await prisma.user.findMany({
      select: { id: true, email: true },
      where: { status: 'ACTIVE' }
    });

    // Consider adding to [prisma.mdc](mdc:shipixen/.cursor/rules/prisma.mdc):
    // - Standard select fields
    // - Common where conditions
    // - Performance optimization patterns
    ```

-   **Rule Quality Checks:**
    -   Rules should be actionable and specific
    -   Examples should come from actual code
    -   References should be up to date
    -   Patterns should be consistently enforced

## Continuous Improvement:

-   Monitor code review comments
-   Track common development questions
-   Update rules after major refactors
-   Add links to relevant documentation
-   Cross-reference related rules

## Rule Deprecation

-   Mark outdated patterns as deprecated
-   Remove rules that no longer apply
-   Update references to deprecated rules
-   Document migration paths for old patterns

## Documentation Updates:

-   Keep examples synchronized with code
-   Update references to external docs
-   Maintain links between related rules
-   Document breaking changes

Follow [cursor-rules.mdc](mdc:.cursor/rules/cursor-rules.mdc) for proper rule formatting and structure.
```

## Automated Rule Generation

### 3. Directory Structure Rule

This rule outlines the project's directory structure and important files/folders, helping Cursor understand the project context.

**How to Generate:**

1.  Open a new Cursor chat.
2.  Type: `@cursor-rules.mdc List all source files and folders in the project, and create a new cursor rule outlining the directory structure and important files and folders.`
3.  **Important:** Do not copy-paste the example output. Generate this rule within your own project.
4.  Review the generated rule to ensure:
    -   All relevant directories are expanded (no `[+20 more]`).
    -   Irrelevant files/folders like `.git` are excluded.
    -   Utilities, shared components, and conventions are captured.

### 4. Tech Stack Rule

This rule documents your project's technology stack and dependencies, including versions and best practices. This is crucial for preventing AI from using outdated patterns.

**How to Generate:**

1.  Open a new Cursor chat.
2.  Type: `@cursor-rules.mdc @package.json Analyze all major dependencies and create a cursor rule outlining the stack of the application and the versions I'm using, and any remarks on best practices on those versions.`
3.  **Important:** Do not copy-paste the example output. Generate this rule within your own project.
4.  This rule also works for other languages and dependency managers.

**To Update the Tech Stack Rule:**

1.  Open a new Cursor chat.
2.  Type: `@cursor-rules.mdc @package.json Analyze all major dependencies and update the @tech-stack.mdc rule with the latest versions of the dependencies, outlining the best practices for those versions.`

### 5. Generating Generic Rules for Any File Type

This is the core technique for creating project-specific rules based on your existing codebase patterns.

**How to Generate:**

1.  Open a new Cursor chat.
2.  Attach one or more good example files from your codebase (e.g., `@components/ui/button.tsx`).
3.  Type the `/Generate Cursor Rules` command.
4.  Prompt Cursor to analyze the attached file(s) and outline conventions.
    -   Example Prompt for a React component: `@cursor-rules.mdc @components/ui/button.tsx /Generate Cursor Rules I want to generate a cursor rule for this React component. Please analyze it carefully and outline all of the conventions found. Output as one rule file only.`
    -   Example Prompt for a Utility Function: `@cursor-rules.mdc @utils/base64ToBlob.ts /Generate Cursor Rules I want to generate a cursor rule for this utility function. Analyze it carefully and outline all of the conventions found. Output as one rule file only.`

**Key Principles:**

-   **Input:** Always attach your *best, most well-written files* as examples. If you don't have one, find a good open-source example.
-   **Specificity:** Be specific in your prompt (e.g., "Focus on error handling patterns," "Extract TypeScript conventions").
-   **Versatility:** This approach works for any file type (API routes, database models, CSS, config files, tests, etc.).

## Bonus Tips for Better Cursor Rules

-   **Agent-requested Rules:** For rules generated from specific files, consider setting them as "Agent-requested" instead of "Always attached" to avoid over-attachment.
-   **Reference Other Rules:** You can link rules to each other using the format `[rule-name.mdc](mdc:.cursor/rules/rule-name.mdc)`. You may need to add these manually outside of Cursor.
-   **Scaling to Large Codebases:**
    -   Group rules into domain-specific directories (e.g., `frontend-components/`, `backend-services/`).
    -   Use `globs` in your rule metadata to "Auto-attach" rules only to relevant files.
-   **Team Collaboration:** Commit Cursor rules to Git. They serve as living documentation of your team's coding standards.

## Common Mistakes to Avoid

-   **Over-generating Rules:** Focus on patterns that repeat, common bugs, framework best practices, and team standards, not every single file.
-   **Rules That Are Too Specific:** Rules should be general enough to apply to multiple similar situations.

## FAQ about Cursor rules

-   **Best way to generate rules?** The `/Generate Cursor Rules` command.
-   **How many rules?** Start with 5-10 core rules. Quality over quantity.
-   **Use with other AI tools?** The generated content can be copied; the command is Cursor-specific.
-   **Commit to Git?** Absolutely, treat them like project infrastructure.

By following this approach, you can efficiently create and manage a robust set of Cursor rules, significantly enhancing your AI coding experience and maintaining codebase consistency.