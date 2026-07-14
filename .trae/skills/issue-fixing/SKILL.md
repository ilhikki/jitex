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

## Workflow

1. **Log the issue**: Create a file in `/issue` directory describing the problem
2. **Analyze the problem**: Identify root cause
3. **Reproduce with a unit test**: Write a minimal test case that fails
4. **Fix the issue**: Implement the fix
5. **Verify the fix**: Run the test to confirm it passes
6. **Update the issue file**: Add resolution notes

## Issue File Format

```
issue/
  ISSUE-001-[Open]parser-does-not-handle-records.md
  ISSUE-002-[Fixed]lexer-fails-on-nested-comments.md
```

Each issue file should contain:
```markdown
# Issue: [Brief description]

## Date
[YYYY-MM-DD]

## Symptom
[What happens, error message, test output]

## Root Cause Analysis
[Why it happens]

## Reproduction
[Minimal test case or input that triggers the issue]

## Fix
[What was changed]

## Status
[Open / Fixed]
```

## Naming Convention

`ISSUE-NNN-short-description.md` where NNN is a zero-padded sequence number.
