# Wikimedia Enterprise Implementation Plan

> For agentic workers: use executing-plans for inline implementation and one final review.

Goal: authenticated Enterprise metadata/article/snapshot access with reusable MCP and managed startup.
Architecture: focused auth/transport/client/download/MCP/evidence modules and shared local service boundary.
Tech stack: Node 24, TypeScript, Zod 4, MCP 2.4, YAML 2.9.
Spec: ../specs/2026-10-27-enterprise-design.md

## Global constraints
HTTPS official endpoints; no provider secrets in YAML/model requests/logs; port 4324; bounded requests and MCP; no invented revisions/licenses.

## Review focus
Token refresh after rotation, unexpected redirects, project/revision mismatch, oversized bodies/archives, stale MCP continuations.

## Task 1: credentials and provider reads
- [x] Write failing tests for Bearer auth, login/refresh, bounds, cancellation, fixed errors, exact title and project filters, metadata/snapshot routing.
- [x] Implement src/auth.ts, transport.ts, schemas.ts and client.ts; run full tests/typecheck.
## Task 2: downloads, evidence and agent access
- [x] Write failing tests for redirect credential separation, transfer limits/backpressure, source identity/license, real MCP pagination, and token-free model surface.
- [x] Implement downloads.ts, evidence.ts, mcp.ts and CLI/service wrappers; run full checks.
## Task 3: integration and delivery
- [x] Add orchestrator registry support and hidden vault login setup with tests.
- [ ] Update setup/inventory documentation, review complete branch, fix important findings with regression tests.
- [ ] Run Linux/Windows CI, merge verified changes to main.

Verification: 32 client tests passed with typecheck and package dry-run. Independent review found title/project identity and HEAD token reflection issues; regressions failed before fixes and passed in the full suite. Orchestrator setup uses the configured trusted source checkout so no second copy of authentication code or runtime dependency is needed.
