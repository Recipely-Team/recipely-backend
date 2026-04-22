# Agent Team - Recipely Backend

This directory defines the agent team for the Recipely backend project.

> **Full workflow documentation:** See `WORKFLOW.md` for the complete agent workflow,
> branch strategy, and PR process.

## Agents

| Agent | File | Purpose |
|-------|------|---------|
| **Researcher** | `researcher_agent.md` | Analyze requirements, plan implementation, identify risks |
| **Developer** | `developer_agent.md` | Feature development, bug fixes, Clean Architecture implementation |
| **Test** | `test_agent.md` | Unit tests, integration tests, TDD |
| **Review** | `review_agent.md` | Code quality, architecture review, security audit |

## Architecture

The project uses **Clean Architecture + DDD** with strict layer dependencies:

```
core ← domain ← application ← infrastructure
                    ↑              ↑
                    └─ presentation ┘
```

### Layer Responsibilities

| Layer | Path | Responsibilities |
|-------|------|-------------------|
| `core` | `src/core/` | Result, Failure, Entity base classes |
| `domain` | `src/domain/` | Entities, Value Objects, Repository interfaces |
| `application` | `src/application/` | Use Cases, DTOs, Mappers, Ports |
| `infrastructure` | `src/infrastructure/` | Prisma repositories, Security adapters |
| `presentation` | `src/presentation/` | Express controllers, Routes, Validators, Middlewares |

## Quick Reference

- **Branch strategy:** `dev` (integration) → `main` (production)
- **Feature branches:** `feat/<name>`, `fix/<name>`, `refactor/<name>`
- **Always start from `dev` branch** when creating feature branches
- **Never commit directly to `main` or `dev`**
- **All PRs require Review Agent approval before merge**

## Current Project State

- **Stack**: Node.js 20, Express, Prisma, PostgreSQL, TypeScript
- **Auth**: JWT bearer tokens
- **Testing**: Jest (unconfigured, tests directories empty)
- **Deployment**: GitHub Actions → Oracle Cloud VPS (Docker)
- **CI**: `prisma generate` + `tsc --noEmit`