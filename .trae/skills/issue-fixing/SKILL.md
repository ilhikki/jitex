---
name: "issue-fixing"
description: "Manages issue diagnosis and fixing for pascal-ts. Invoke when tests fail, parsing errors occur, or user reports a bug. Always log issues to /issue before fixing."
---

# Issue Fixing

This skill manages the issue diagnosis and resolution workflow for the pascal-ts project.

## When to Use

- Tests fail during development
- Parsing errors occur with `tangle-official.pas`
- User reports a bug or unexpected behavior
- Any error that requires investigation
- Fixing one issue reveals another issue

## Core Principles

1. **Atomic Fixes**: One commit per logical fix. Never bundle unrelated changes.
2. **Regression Protection**: Full test baseline before and after every fix.
3. **No Guessing on Standards**: If Pascal82 behavior is unclear, stop and ask the user.
4. **Side Issue Quarantine**: New problems discovered during a fix are logged but NOT fixed in the same commit unless they are the direct cause.

---

## Priority Matrix (Fix in this order)

| Priority | Category | Examples | Action |
|----------|----------|----------|--------|
| **P0** | Test code errors | Test uses non-standard Pascal syntax; helper bug | Fix immediately, same commit allowed if trivial |
| **P1** | Crash / Panic | Parser throws on valid input; interpreter unhandled exception | High priority; blocks everything else |
| **P2** | Regression | Previously passing tests now fail | Fix before touching new features |
| **P3** | Core feature missing | VAR params broken; WITH statement broken; GOTO broken | Medium priority; fix after P0-P2 |
| **P4** | Standard compliance | Non-standard `string` type; `length()` function; array init syntax | Low priority; clean up after core features work |
| **P5** | Refactor / Performance | Code cleanup; optimization | Only when user explicitly requests |

---

## Workflow

### Phase 0: Establish Baseline (MANDATORY)

```
npx jest --no-coverage 2>&1 | tail -n 20
```

Record:
- Test Suites: X passed, Y failed
- Tests: A passed, B failed
- Any new crash vs. expected failure

If you skip this step, you cannot detect regressions you introduced.

### Phase 1: Lock the Target

1. Read the user's instruction or the issue file.
2. Write a single sentence describing the **exact boundary** of this fix. Example:
   > "Fix: parseProgram must reject trailing tokens after `end.`"
   > "Not in scope: Fixing lexer EOF generation."
3. If the boundary is unclear, ask the user before proceeding.

### Phase 2: Root Cause Analysis

1. Reproduce the failure with the minimal test case.
2. Trace the code path (lexer -> parser -> AST -> interpreter).
3. Identify the **smallest code change** that would fix the symptom.
4. Document in the issue file: `Root Cause Analysis` section.

### Phase 3: Side-Effect Scan

Before typing any fix, run:

```bash
grep -r "functionName|variableName" src/
```

Ask yourself:
- Does this function appear in 10 places?
- Will changing the return type break `populateSystemProcedures`?
- Does any existing passing test rely on the buggy behavior?

If yes, the fix needs a safer approach or must be split into multiple issues.

### Phase 4: Quarantine Side Issues

If during analysis you discover an unrelated bug:

1. **Do NOT fix it now.**
2. Create a new issue file: `/issue/ISSUE-NNN-[Open]short-desc.md`
3. Add it to `INTERRUPTED.md` or the backlog if it blocks nothing.
4. Return to the original target.

Exception: If the side issue is the **direct root cause** of your target issue (e.g., "parser crashes because helper returns null"), fixing the helper IS the fix.

### Phase 5: Design the Fix

Write a brief plan in the issue file under `Fix Plan`:

```markdown
## Fix Plan
- File: src/parser/declarations.ts
- Change: After parsing DOT, check next token is EOF. If not, return fail().
- Risk: Low; only affects programs with trailing garbage.
```

If the plan involves deleting code (e.g., removing `string` support), list all files that reference it.

### Phase 6: Implement

- Make the smallest possible change.
- Do NOT add comments explaining the change (the commit message and issue file do that).
- Do NOT refactor nearby code.
- Do NOT add type annotations to unchanged code.

### Phase 7: Verify

1. Run the **specific failing test** first:
   ```bash
   npx jest path/to/test.ts --no-coverage
   ```
2. Run the **full suite**:
   ```bash
   npx jest --no-coverage 2>&1 | tail -n 20
   ```
3. Compare with Phase 0 baseline:
   - Pass count went up or stayed same: **Proceed**
   - Pass count went down: **STOP. Do not commit.**
     - Analyze new failures. Are they P0 (test was wrong)? Or is your fix wrong?
     - If test was wrong, fix test in the same commit only if trivial (< 5 min).
     - If your fix is wrong, revert and return to Phase 2.

### Phase 8: Commit

Follow the git protocol from the system instructions. Commit message format:

```
fix(parser): reject trailing tokens after program end

- parseProgram now checks EOF after DOT
- Prevents silent acceptance of garbage after `end.`

Closes ISSUE-XXX
```

### Phase 9: Update Issue File

Update the issue file with:
- `Status: Fixed`
- `Fix` section with files changed
- `Verification` section with test results

---

## Meta-Problems: How to Handle

### Discovered Another Bug During Fix

**Rule**: If you can fix it in < 5 minutes AND it's on the exact same line or direct cause, include it. Otherwise, log it and move on.

**Why**: "While I'm here..." is the #1 cause of regressions in large projects.

### Fix Breaks Previously Passing Tests

**Rule**: NEVER commit a fix that reduces the total pass count.

**Procedure**:
1. Halt. Do not commit.
2. List the newly failing tests.
3. For each new failure:
   - Is the test using non-standard Pascal? -> Fix the test (P0), include in same commit.
   - Is the test correct and your change broke it? -> Your fix design is wrong. Revert and redesign.
   - Is the failure unrelated (flakey)? -> Re-run. If persistent, treat as P1 regression.

### Previous Implementation Was Fundamentally Wrong

**Examples**: Entire VAR parameter mechanism is broken; `resolveType` silently returns INTEGER for unknown types.

**Procedure**:
1. Assess blast radius. Does it touch 50% of tests?
2. If small (< 5 files): Fix it as a single issue.
3. If large: Create a **migration issue** and break it into phases:
   - Phase 1: Add correct behavior alongside old behavior (feature flag or new function).
   - Phase 2: Migrate callers one by one.
   - Phase 3: Remove old behavior.
4. Tell the user the scope before starting.

### Ambiguous / Unclear Behavior

**Procedure**:
1. Check Pascal82 standard (ISO 7185).
2. Check `tangle-official.pas` for precedent.
3. If still unclear, STOP.
4. Update the issue file:
   ```markdown
   ## Status
   Needs-Decision

   ## Ambiguity
   Does Pascal82 allow `goto` out of a `for` loop?
   ISO 7185 section 6.8.3.9 is unclear.
   ```
5. Ask the user. Do not guess.

---

## Issue File Format

```
issue/
  ISSUE-001-[Fixed]predefined-identifiers-as-keywords.md
  ISSUE-002-[Open]parser-does-not-handle-records.md
```

Each issue file should contain:
```markdown
# Issue: [Brief description]

## Date
[YYYY-MM-DD]

## Priority
[P0 / P1 / P2 / P3 / P4 / P5]

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
