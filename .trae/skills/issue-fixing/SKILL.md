---
name: "issue-fixing"
description: "Manages issue diagnosis and fixing workflow. Invoke when tests fail, errors occur, or user reports a bug. Always log issues to /issue before fixing."
---

# Issue Fixing

This skill manages the issue diagnosis and resolution workflow for large-scale projects with many bugs.

## When to Use

- Tests fail during development
- User reports a bug or unexpected behavior
- Any error that requires investigation
- Fixing one issue reveals another issue
- Reviewing or updating bug fix priority

## Core Principles

1. **Documentation First**: Keeping issue files, bug lists, and this skill up to date is the #1 priority — higher than fixing code. Stale or inaccurate documentation causes wasted effort, duplicate fixes, and missed bugs. Every phase of the workflow has a documentation step; skipping it is not optional.
2. **Atomic Fixes**: One commit per logical fix. Never bundle unrelated changes.
3. **Regression Protection**: Full test baseline before and after every fix.
4. **No Guessing on Standards**: If the target standard's behavior is unclear, stop and ask the user.
5. **Side Issue Quarantine**: New problems discovered during a fix are logged but NOT fixed in the same commit unless they are the direct root cause.
6. **Fail Fast**: The system MUST reject invalid input explicitly. Silent acceptance or fallback to default behavior is a bug, not a feature.

---

## Priority Matrix (Fix in this order)

| Priority | Category | Examples | Action |
|----------|----------|----------|--------|
| **D0** | Documentation | Issue file stale; bug list out of date; skill needs update | Fix BEFORE any code work |
| **P0** | Test code errors | Test uses invalid syntax; helper bug | Fix immediately, same commit allowed if trivial |
| **P0** | Silent Bug | System accepts garbage input; type resolver falls back to default | Fix before any other code work — these hide real bugs |
| **P1** | Crash / Panic | Parser throws on valid input; unhandled exception | High priority; blocks everything else |
| **P2** | Regression | Previously passing tests now fail | Fix before touching new features |
| **P3** | Core feature missing | Key language feature broken | Medium priority; fix after P0-P2 |
| **P4** | Standard compliance | Non-standard feature implemented by default | Low priority; clean up after core features work |
| **P5** | Refactor / Performance | Code cleanup; optimization | Only when user explicitly requests |

---

## Documentation-First Rules

### What must always be up to date

1. **Issue files** (`/issue/ISSUE-NNN-[Status]*.md`): Status, root cause, fix plan, and verification must reflect current reality.
2. **Bug list** (`/issue/INTERPRETER-BUGS.md` or equivalent): Priority, status, and ordering must match actual state.
3. **This skill**: If you discover a new pattern of problem not covered by the skill, update the skill.

### When to update documentation

| Trigger | Action |
|---------|--------|
| Before starting any fix | Verify the issue file exists and is accurate; create if missing |
| During root cause analysis | Update `Root Cause Analysis` and `Fix Plan` sections |
| After implementing fix | Update `Fix`, `Verification`, and `Status` fields |
| When discovering a side issue | Create a new issue file immediately |
| When a fix breaks other tests | Update the issue file with `Status: Blocked` and explain |
| When priority changes | Reorder the bug list and document why |
| When a new problem pattern emerges | Update this skill |

### Documentation quality checklist

- [ ] Can a new contributor read the bug list and know what to work on next?
- [ ] Does each issue file have enough detail to reproduce the problem?
- [ ] Are `Status` fields accurate? (No "Open" for fixed issues, no "Fixed" without verification)
- [ ] Is the priority ordering still correct given recent changes?

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

1. Read the user's instruction or the issue file.
2. Write a single sentence describing the **exact boundary** of this fix:
   > "Fix: [specific behavior]"
   > "Not in scope: [explicitly excluded]"
3. If the boundary is unclear, ask the user before proceeding.
4. **Update the issue file** with the locked target.

### Phase 2: Root Cause Analysis

1. Reproduce the failure with the minimal test case.
2. Trace the code path through the system.
3. Identify the **smallest code change** that would fix the symptom.
4. **Update the issue file** with `Root Cause Analysis` section.

**Silent Bug Check**: If the issue is "silent acceptance" (system accepts invalid input without error), mark it as P0 and fix immediately.

### Phase 3: Side-Effect Scan

Before typing any fix, search for all references to the code you plan to change.

Ask yourself:
- Does this function appear in many places?
- Will changing the return type break callers?
- Does any existing passing test rely on the buggy behavior?

If yes, the fix needs a safer approach or must be split into multiple issues.

### Phase 4: Quarantine Side Issues

If during analysis you discover an unrelated bug:

1. **Do NOT fix it now.**
2. Create a new issue file: `/issue/ISSUE-NNN-[Open]short-desc.md`
3. **Update the bug list** with the new issue and its priority.
4. Return to the original target.

Exception: If the side issue is the **direct root cause** of your target issue, fixing it IS the fix.

### Phase 5: Design the Fix

Write a brief plan in the issue file under `Fix Plan`:

```markdown
## Fix Plan
- File: path/to/file.ts
- Change: What will change, in one or two sentences
- Risk: Low/Medium/High — what could break
```

If the plan involves deleting code, list all files that reference it.

### Phase 6: Implement

- Make the smallest possible change.
- Do NOT add comments explaining the change (the commit message and issue file do that).
- Do NOT refactor nearby code.
- Do NOT add type annotations to unchanged code.

### Phase 7: Verify

1. Run the **specific failing test** first.
2. Run the **full suite**.
3. Compare with Phase 0 baseline:
   - Pass count went up or stayed same: **Proceed**
   - Pass count went down: **STOP. Do not commit.**
     - Analyze new failures. Are they P0 (test was wrong)? Or is your fix wrong?
     - If test was wrong, fix test in the same commit only if trivial.
     - If your fix is wrong, revert and return to Phase 2.

### Phase 8: Commit

Commit message format:

```
fix(scope): brief description

- What changed
- Why

Closes ISSUE-XXX
```

### Phase 9: Update Documentation (MANDATORY)

**This phase is NOT optional and must happen immediately after commit.**

1. **Update the issue file**:
   - `Status: Fixed`
   - `Fix` section with files changed
   - `Verification` section with test results
2. **Rename the issue file** to reflect new status: `[Open]` → `[Fixed]`
3. **Update the bug list**: Mark the issue as Fixed, update any priority reordering
4. **Check if the skill needs updating**: Did you discover a new pattern? Did a meta-problem occur that the skill doesn't cover?

---

## Meta-Problems: How to Handle

### Discovered Another Bug During Fix

**Rule**: If you can fix it in < 5 minutes AND it's on the exact same line or direct cause, include it. Otherwise, log it and move on.

**Why**: "While I'm here..." is the #1 cause of regressions in large projects.

**Documentation**: Create an issue file for the side bug BEFORE continuing.

### Fix Breaks Previously Passing Tests

**Rule**: NEVER commit a fix that reduces the total pass count.

**Procedure**:
1. Halt. Do not commit.
2. List the newly failing tests.
3. For each new failure:
   - Is the test itself wrong (invalid syntax, non-standard feature)? → Fix the test (P0), include in same commit.
   - Is the test correct and your change broke it? → Your fix design is wrong. Revert and redesign.
   - Is the failure unrelated (flakey)? → Re-run. If persistent, treat as P1 regression.
4. **Update the issue file** with `Status: Blocked` if you cannot resolve immediately.

### Previous Implementation Was Fundamentally Wrong

**Examples**: An entire subsystem is broken; a core function silently returns wrong values.

**Procedure**:
1. Assess blast radius. Does it touch 50% of tests?
2. If small (< 5 files): Fix it as a single issue.
3. If large: Create a **migration issue** and break it into phases:
   - Phase 1: Add correct behavior alongside old behavior.
   - Phase 2: Migrate callers one by one.
   - Phase 3: Remove old behavior.
4. Tell the user the scope before starting.
5. **Document the migration plan** in the issue file.

### Ambiguous / Unclear Behavior

**Procedure**:
1. Check the target standard specification.
2. Check reference implementation files for precedent.
3. If still unclear, STOP.
4. **Update the issue file**:
   ```markdown
   ## Status
   Needs-Decision

   ## Ambiguity
   [Describe what is unclear and what you've checked]
   ```
5. Ask the user. Do not guess.

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
3. Create an issue file and mark as **P0** — these MUST be fixed first.
4. **Update the bug list** immediately.

### Documentation Drift

**Symptom**: The bug list says an issue is "Open" but it's actually fixed (or vice versa). Or the priority ordering no longer makes sense after recent changes.

**Procedure**:
1. Stop current work.
2. Audit all issue files against actual test results.
3. Update the bug list to reflect reality.
4. Re-evaluate priority ordering.
5. Resume work.

---

## Issue File Format

```
issue/
  ISSUE-001-[Fixed]short-description.md
  ISSUE-002-[Open]short-description.md
```

Each issue file should contain:
```markdown
# Issue: [Brief description]

## Date
[YYYY-MM-DD]

## Priority
[P0 / P1 / P2 / P3 / P4 / P5]

## Type
[Crash / Silent / Feature / Compliance / Test]

## Symptom
[What happens, error message, test output]

## Root Cause Analysis
[Why it happens]

## Fix Plan
[What will be changed, which files, estimated risk]

## Reproduction
[Minimal test case or input that triggers the issue]

## Fix
[What was changed - fill after fixing]

## Verification
[Test results after fix - fill after fixing]

## Status
[Open / Fixed / Needs-Decision / Blocked]
```

## Naming Convention

`ISSUE-NNN-[Status]short-description.md` where NNN is a zero-padded sequence number.
Use the next available number. Check `issue/` directory before creating.
Rename file when status changes (e.g., `[Open]` → `[Fixed]`).
