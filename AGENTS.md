# Agent guidance — svelte-video-shaders

This file orients coding agents and humans: **local stack rules** live in [CLAUDE.md](./CLAUDE.md) and [.cursor/rules](./.cursor/rules/). For **portable procedural skills** (workflows, checklists, framework nuances), use the [Agent Skills Directory](https://skills.sh) and the **Skills CLI**.

## Skills ecosystem

- **Browse and search:** [https://skills.sh](https://skills.sh)
- **CLI:** `bunx skills find <query>` · `bunx skills add <owner/repo@skill>` · `bunx skills check` · `bunx skills update`  
  (equivalent `npx skills …` works if you prefer.)

Install skills into the location your agent expects (e.g. Cursor: under your skills path; Codex: `$CODEX_HOME/skills`). See your tool’s docs for “agent skills” or “SKILL.md”.

---

## Recommended skills for this repo (Svelte / SvelteKit)

These were gathered with `bunx skills find svelte` and `bunx skills find sveltekit` (April 2026). Install counts change over time; links stay stable on skills.sh.

### Core Svelte / Svelte 5

| Skill | Install | Directory |
| --- | --- | --- |
| **Svelte 5 best practices** | `bunx skills add ejirocodes/agent-skills@svelte5-best-practices` | [skills.sh/…/svelte5-best-practices](https://skills.sh/ejirocodes/agent-skills/svelte5-best-practices) |
| **Svelte core best practices** (official-adjacent) | `bunx skills add sveltejs/ai-tools@svelte-core-bestpractices` | [skills.sh/…/svelte-core-bestpractices](https://skills.sh/sveltejs/ai-tools/svelte-core-bestpractices) |
| **Svelte code writer** | `bunx skills add sveltejs/ai-tools@svelte-code-writer` | [skills.sh/…/svelte-code-writer](https://skills.sh/sveltejs/ai-tools/svelte-code-writer) |

### SvelteKit + runes / structure

| Skill | Install | Directory |
| --- | --- | --- |
| **SvelteKit structure** | `bunx skills add spences10/svelte-skills-kit@sveltekit-structure` | [skills.sh/…/sveltekit-structure](https://skills.sh/spences10/svelte-skills-kit/sveltekit-structure) |
| **Svelte runes** | `bunx skills add spences10/svelte-skills-kit@svelte-runes` | [skills.sh/…/svelte-runes](https://skills.sh/spences10/svelte-skills-kit/svelte-runes) |
| **SvelteKit data flow** | `bunx skills add spences10/svelte-skills-kit@sveltekit-data-flow` | [skills.sh/…/sveltekit-data-flow](https://skills.sh/spences10/svelte-skills-kit/sveltekit-data-flow) |
| **Remote functions** | `bunx skills add spences10/svelte-skills-kit@sveltekit-remote-functions` | [skills.sh/…/sveltekit-remote-functions](https://skills.sh/spences10/svelte-skills-kit/sveltekit-remote-functions) |
| **SvelteKit + Svelte 5 + Tailwind bundle** | `bunx skills add claude-skills/sveltekit-svelte5-tailwind-skill@sveltekit-svelte5-tailwind-skill` | [skills.sh/…/sveltekit-svelte5-tailwind-skill](https://skills.sh/claude-skills/sveltekit-svelte5-tailwind-skill/sveltekit-svelte5-tailwind-skill) |
| **SvelteKit (MPM pack)** | `bunx skills add bobmatnyc/claude-mpm-skills@sveltekit` | [skills.sh/…/sveltekit](https://skills.sh/bobmatnyc/claude-mpm-skills/sveltekit) |
| **Bun + SvelteKit** | `bunx skills add secondsky/claude-skills@bun-sveltekit` | [skills.sh/…/bun-sveltekit](https://skills.sh/secondsky/claude-skills/bun-sveltekit) |

### Optional: monitoring

| Skill | Install | Directory |
| --- | --- | --- |
| **Sentry Svelte SDK** | `bunx skills add getsentry/sentry-for-ai@sentry-svelte-sdk` | [skills.sh/…/sentry-svelte-sdk](https://skills.sh/getsentry/sentry-for-ai/sentry-svelte-sdk) |

---

## Stack-adjacent skills (testing / automation)

This project uses **Vitest** (including browser mode) and **Playwright** via `@vitest/browser-playwright`.

| Skill | Install | Directory |
| --- | --- | --- |
| **Playwright best practices** | `bunx skills add currents-dev/playwright-best-practices-skill@playwright-best-practices` | [skills.sh/…/playwright-best-practices](https://skills.sh/currents-dev/playwright-best-practices-skill/playwright-best-practices) |
| **Vitest** (general; verify Svelte relevance in skill body) | `bunx skills add bobmatnyc/claude-mpm-skills@vitest` | [skills.sh/…/vitest](https://skills.sh/bobmatnyc/claude-mpm-skills/vitest) |

Discover more: `bunx skills find vitest`, `bunx skills find playwright`, `bunx skills find tailwind`.

---

## Discovery skill

To search the registry interactively or by keyword:

```bash
bunx skills add vercel-labs/skills@find-skills
```

Details: [skills.sh/vercel-labs/skills/find-skills](https://skills.sh/vercel-labs/skills/find-skills).

---

## Priority suggestion for *this* codebase

1. **ejirocodes/agent-skills@svelte5-best-practices** — aligns with Svelte 5 runes and event attributes.  
2. **spences10/svelte-skills-kit@sveltekit-structure** + **@svelte-runes** — matches SvelteKit + runes usage.  
3. **sveltejs/ai-tools@svelte-core-bestpractices** — core patterns from the Svelte tooling org.  
4. **currents-dev/playwright-best-practices-skill@playwright-best-practices** — complements browser/E2E-style tests.

Always treat **installed skills** as additive: repo **CLAUDE.md** and **.cursor/rules** still win for project-specific choices (Bun-only, WebCodecs-first, Essentia API, etc.).

---

## Shared agent home

If you use a cross-machine agent config repo (e.g. `agent-home`), merge this file with any **AGENTS.md** there so global conventions and this project’s stack both apply.
