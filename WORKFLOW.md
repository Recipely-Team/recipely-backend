# Recipely Backend - Agent Team Workflow

This document defines the agent team workflow for the Recipely backend project.

## Branches

- **`dev`** — integration branch, all feature branches target this
- **`main`** — production branch, only merges from dev after all checks pass

## Agent Team

| Agent | Role | Trigger |
|-------|------|---------|
| **Researcher** | Analyze requirements, plan implementation | New task from user |
| **Developer** | Implement features, fix bugs | Task assigned after research |
| **Test** | Write unit and integration tests | After developer completes implementation |
| **Review** | Code quality and architecture review | Before merge to dev |

## Workflow Stages

```
User Request
     │
     ▼
┌─────────────┐
│  RESEARCHER  │── Research report with implementation plan
└──────┬──────┘
       │ (approved by user)
       ▼
┌─────────────┐
│  DEVELOPER   │── Opens feature branch from dev
└──────┬──────┘
       │ (implementation complete)
       ▼
┌─────────────┐
│    TEST      │── Writes tests (if failing → back to developer)
└──────┬──────┘
       │ (tests passing)
       ▼
┌─────────────┐
│   REVIEW     │── Reviews code (issues found → back to developer)
└──────┬──────┘
       │ (approved)
       ▼
     dev ──────────────────► main (after dev is stable)
```

## Detailed Workflow

### 1. Researcher Agent

**Trigger:** User describes a new feature or task.

**Steps:**
1. Read `CLAUDE.md` and relevant agent files
2. Explore existing codebase for related patterns
3. Identify affected layers (domain → application → infrastructure → presentation)
4. Check git history for similar implementations
5. Produce a research report

**Output:** Research report with:
- Context: existing code, patterns, dependencies
- Implementation plan: step-by-step with file paths
- Risks: potential issues and blockers
- Related patterns: example files to follow

---

### 2. Developer Agent

**Trigger:** Research report approved by user.

**Steps:**
1. Create a new branch from `dev`: `feat/<feature-name>` or `fix/<issue-name>`
2. Follow the implementation plan from the research report
3. Work layer by layer (domain → application → infrastructure → presentation)
4. Follow Clean Architecture + DDD patterns
5. Use existing code as reference for patterns
6. Commit frequently with descriptive messages
7. Push branch when implementation is complete

**Branch Naming:**
- `feat/<feature-name>` — new features
- `fix/<issue-name>` — bug fixes
- `refactor/<name>` — refactoring
- `chore/<name>` — tooling, dependencies

**Commit Style:**
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`

---

### 3. Test Agent

**Trigger:** Developer signals implementation is ready for tests.

**Steps:**
1. Read the implemented files
2. Write unit tests for:
   - Domain entities: `create()` success/failure cases
   - Use cases: business logic with mocked repositories
3. Write integration tests for:
   - Repositories: database operations
   - Controllers: HTTP response codes
4. Follow Arrange-Act-Assert pattern
5. Test both success and failure paths
6. If tests fail → assign back to Developer Agent

**Test Location:**
- `tests/unit/domain/<entity>.test.ts`
- `tests/unit/application/<use-case>.test.ts`
- `tests/integration/repositories/<repo>.test.ts`
- `tests/integration/controllers/<controller>.test.ts`

---

### 4. Review Agent

**Trigger:** All tests pass.

**Steps:**
1. Analyze changed files
2. Check Clean Architecture layer dependencies
3. Verify TypeScript strict mode compliance
4. Identify security issues, bugs, performance problems
5. Check `failureToHttp` mapping for new failure types
6. Provide actionable feedback

**Review Checklist:**
- [ ] Layer dependencies respected (no inward imports)
- [ ] Entities have private constructors + static `create()`
- [ ] Use cases return `Result<T, Failure>`, never throw
- [ ] Repositories return `Result`, never throw
- [ ] New failure types added to `failureToHttp`
- [ ] Zod validation for all request inputs
- [ ] TypeScript `exactOptionalPropertyTypes` compliance
- [ ] No hardcoded secrets or sensitive data

**If issues found:** Assign back to Developer Agent with specific feedback.
**If approved:** Merge to `dev`.

---

## Pull Request Flow

### Feature Branch → dev

1. Developer opens PR from `feat/<name>` → `dev`
2. CI runs: `prisma generate` + `tsc --noEmit`
3. Review Agent reviews and approves
4. Merge to `dev`
5. Delete feature branch

### dev → main

1. When `dev` is stable and tested, open PR `dev` → `main`
2. CI runs full build (including admin panel)
3. All checks pass → merge to `main`
4. Deploy triggers automatically

## Agent Communication

Agents communicate through:
- **Files:** Implementation in correct layer paths
- **PR comments:** Review feedback, test results
- **Research reports:** Plan documentation

## Important Notes

- **Always start from `dev` branch** when creating feature branches
- **Never commit directly to `main`** or `dev`
- **All PRs require at least one Review Agent approval**
- **Tests must pass before Review Agent reviews**
- **Research report must be approved before Developer starts**

## Quick Reference

```bash
# Create feature branch from dev
git checkout dev && git pull && git checkout -b feat/my-feature

# After completing work
git push -u origin feat/my-feature
# Then open PR to dev via GitHub UI

# After PR approved and merged
git checkout dev && git pull && git branch -d feat/my-feature
```