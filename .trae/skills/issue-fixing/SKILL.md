---
name: "issue-fixing"
description: "Manages bug diagnosis and fixing workflow. Invoke when tests fail, errors occur, or user reports a bug. Emphasizes atomic fixes, regression protection, and no silent acceptance."
---

# Issue Fixing

This skill manages the bug diagnosis and resolution workflow for pascal-ts.

## When to Use

- Tests fail during development
- User reports a bug or unexpected behavior
- Any error that requires investigation
- Fixing one issue reveals another issue

## Core Principles

1. **Atomic Fixes**: One commit per logical fix. Never bundle unrelated changes.
2. **Regression Protection**: Full test baseline before and after every fix.
3. **No Guessing on Standards**: If Pascal82 behavior is unclear, stop and ask the user.
4. **Side Issue Quarantine**: New problems discovered during a fix are logged but NOT fixed in the same commit unless they are the direct root cause.
5. **Fail Fast**: The system MUST reject invalid input explicitly. Silent acceptance or fallback to default behavior is a bug, not a feature.

---

## Priority Matrix (Fix in this order)

| Priority | Category | Examples | Action |
|----------|----------|----------|--------|
| **P0** | Test code errors | Test uses invalid syntax; helper bug | Fix immediately, same commit allowed if trivial |
| **P0** | Silent Bug | System accepts garbage input; type resolver falls back to default | Fix before any other code work — these hide real bugs |
| **P1** | Crash / Panic | Parser throws on valid input; unhandled exception | High priority; blocks everything else |
| **P2** | Regression | Previously passing tests now fail | Fix before touching new features |
| **P3** | Core feature missing | Key language feature broken | Medium priority; fix after P0-P2 |
| **P4** | Standard compliance | Non-standard feature implemented by default | Low priority; clean up after core features work |
| **P5** | Refactor / Performance | Code cleanup; optimization | Only when user explicitly requests |

---

## Workflow

### Phase 0: Establish Baseline (MANDATORY)

Run the full test suite and record the results:

- Test Suites: X passed, Y failed
- Tests: A passed, B failed
- Any new crash vs. expected failure

**QUICK FAIL CHECKLIST** (Must verify before starting):
- [ ] Does the system reject trailing garbage after a valid program?
- [ ] Does the system reject unknown/undefined types (not silently fall back)?
- [ ] Does the system reject invalid syntax with clear error messages?
- [ ] Does the system reject undefined variables/functions at runtime?

If any of these fail, they become P0 Silent Bug issues — fix FIRST.

### Phase 1: Lock the Target

1. Read the user's instruction or bug report.
2. Write a single sentence describing the **exact boundary** of this fix:
   > "Fix: [specific behavior]"
   > "Not in scope: [explicitly excluded]"
3. If the boundary is unclear, ask the user before proceeding.

### Phase 2: Root Cause Analysis

1. Reproduce the failure with the minimal test case.
2. Trace the code path through the system.
3. Identify the **smallest code change** that would fix the symptom.

**Silent Bug Check**: If the issue is "silent acceptance" (system accepts invalid input without error), mark it as P0 and fix immediately.

### Phase 3: Side-Effect Scan

Before typing any fix, search for all references to the code you plan to change.

Ask yourself:
- Does this function appear in many places?
- Will changing the return type break callers?
- Does any existing passing test rely on the buggy behavior?

If yes, the fix needs a safer approach or must be split into multiple commits.

### Phase 4: Quarantine Side Issues

If during analysis you discover an unrelated bug:

1. **Do NOT fix it now.**
2. Log it to `docs/refactoring-decisions.md` (under "Discovered Issues" section) or report to user.
3. Return to the original target.

Exception: If the side issue is the **direct root cause** of your target issue, fixing it IS the fix.

### Phase 5: Design the Fix

Write a brief plan (can be in commit message body):

```
Fix scope:
- File: path/to/file.ts
- Change: What will change, in one or two sentences
- Risk: Low/Medium/High — what could break
```

If the plan involves deleting code, list all files that reference it.

### Phase 6: Implement

- Make the smallest possible change.
- Do NOT add comments explaining the change (the commit message does that).
- Do NOT refactor nearby code.
- Do NOT add type annotations to unchanged code.

### Phase 7: Verify

1. Run the **specific failing test** first.
2. Run the **full suite** (`npx jest tests/m5 --no-coverage`).
3. Compare with Phase 0 baseline:
   - Pass count went up or stayed same: **Proceed**
   - Pass count went down: **STOP. Do not commit.**
     - Analyze new failures. Are they P0 (test was wrong)? Or is your fix wrong?
     - If test was wrong, fix test in the same commit only if trivial.
     - If your fix is wrong, revert and return to Phase 2.

### Phase 8: Commit

Commit message format (Conventional Commits):

```
fix(scope): brief description

- What changed
- Why
```

If the fix relates to a previously logged decision in `docs/refactoring-decisions.md`, reference it.

---

## Meta-Problems: How to Handle

### Discovered Another Bug During Fix

**Rule**: If you can fix it in < 5 minutes AND it's on the exact same line or direct cause, include it. Otherwise, log it and move on.

**Why**: "While I'm here..." is the #1 cause of regressions in large projects.

**Logging**: Add the side bug to `docs/refactoring-decisions.md` under "Discovered Issues" or tell the user.

### Fix Breaks Previously Passing Tests

**Rule**: NEVER commit a fix that reduces the total pass count.

**Procedure**:
1. Halt. Do not commit.
2. List the newly failing tests.
3. For each new failure:
   - Is the test itself wrong (invalid syntax, non-standard feature)? → Fix the test (P0), include in same commit.
   - Is the test correct and your change broke it? → Your fix design is wrong. Revert and redesign.
   - Is the failure unrelated (flakey)? → Re-run. If persistent, treat as P1 regression.

### Previous Implementation Was Fundamentally Wrong

**Examples**: An entire subsystem is broken; a core function silently returns wrong values.

**Procedure**:
1. Assess blast radius. Does it touch 50% of tests?
2. If small (< 5 files): Fix it as a single commit.
3. If large: Create a **migration plan** and break it into phases:
   - Phase 1: Add correct behavior alongside old behavior.
   - Phase 2: Migrate callers one by one.
   - Phase 3: Remove old behavior.
4. Tell the user the scope before starting.
5. **Document the migration plan** in `docs/refactoring-decisions.md`.

### Ambiguous / Unclear Behavior

**Procedure**:
1. Check the Pascal82 standard specification.
2. Check reference implementation files for precedent.
3. If still unclear, STOP.
4. Ask the user. Do not guess.

### Silent Bug Detection

**Silent Bug** = The system accepts invalid input without any error or feedback.

**Common Silent Bugs to Watch For**:
- Parser accepts trailing tokens after program end
- Type resolver falls back to a default type for unknown types
- Runtime silently uses undefined variables (returns 0/null)
- Missing type checking for parameters
- Missing bounds checking for array indices

**Procedure**:
1. Write a test that expects an error for invalid input.
2. If the test passes (no error thrown), you've found a silent bug.
3. Mark as **P0** — these MUST be fixed first.

---

## Note on Issue Tracking

The old `/issue/` directory workflow (ISSUE-NNN files) was **removed in M5 Phase 5**.
Issues are now tracked via:
- `docs/refactoring-decisions.md` — for refactoring decisions and discovered problems
- Commit messages — for bug fix context
- Test failures — for regression tracking

If a complex bug requires detailed analysis, create a doc in `docs/` (e.g., `docs/bug-XXX-analysis.md`) and reference it in the commit.
