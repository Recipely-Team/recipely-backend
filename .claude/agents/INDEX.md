# Agent Team - Recipely Backend

This directory defines the agent team for the Recipely backend project.

## Agents

### 1. Review Agent (`.claude/agents/review_agent.md`)
- **Purpose**: Code quality, architecture review, security audit
- **Triggers**: PR reviews, pre-commit hooks, manual invocation
- **Output**: Review comments with actionable feedback

### 2. Developer Agent (`.claude/agents/developer_agent.md`)
- **Purpose**: Feature development, refactoring, bug fixes
- **Triggers**: New feature requests, bug reports
- **Output**: Implementation following Clean Architecture + DDD

### 3. Test Agent (`.claude/agents/test_agent.md`)
- **Purpose**: Unit tests, integration tests, TDD
- **Triggers**: Feature implementation, test coverage gaps
- **Output**: Jest tests covering use cases and domain logic

## Architecture

The project uses **Clean Architecture + DDD** with strict layer dependencies:

```
core ← domain ← application ← infrastructure
                    ↑              ↑
                    └─ presentation ┘
```

### Layer Responsibilities

| Layer | Responsibilities |
|-------|-------------------|
| `src/core/` | Result, Failure, Entity base classes |
| `src/domain/` | Entities, Value Objects, Repository interfaces |
| `src/application/` | Use Cases, DTOs, Mappers, Ports |
| `src/infrastructure/` | Prisma repositories, Security adapters |
| `src/presentation/` | Express controllers, Routes, Validators, Middlewares |

## Agent Workflow

### Adding a Feature (Developer Agent)
1. Domain: create entity + repository interface
2. Application: create use case + DTO + mapper
3. Infrastructure: create repository implementation
4. Presentation: create validator → controller → route
5. Bootstrap: wire into `buildContainer()` in `bootstrap.ts`
6. App: mount route in `createApp()` in `app.ts`

### Review Checklist (Review Agent)
- [ ] Layer dependencies respected (no inward imports)
- [ ] Entities have private constructors + static `create()`
- [ ] Use cases return `Result<T, Failure>`, never throw
- [ ] Repositories return `Result`, never throw
- [ ] Failure types mapped in `failureToHttp` switch
- [ ] Zod validation for all request inputs
- [ ] TypeScript strict mode compliance

### Test Checklist (Test Agent)
- [ ] Domain entity `create()` tests (success + failure)
- [ ] Use case tests with mocked repository
- [ ] Repository integration tests
- [ ] Controller HTTP response tests
- [ ] Result/Failure pattern tests

## Usage

Agents are invoked via Claude Code CLI:

```bash
# Review changes
/review

# Develop feature
# (Start conversation describing the feature)

# Run tests
npm test

# Add tests for specific feature
# (Start conversation with test requirements)
```

## Current Project State

- **Stack**: Node.js 20, Express, Prisma, PostgreSQL, TypeScript
- **Auth**: JWT bearer tokens
- **Testing**: Jest (unconfigured, tests directories empty)
- **Deployment**: GitHub Actions → Oracle Cloud VPS (Docker)
- **CI**: `prisma generate` + `tsc --noEmit`
