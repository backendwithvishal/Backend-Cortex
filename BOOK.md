# Master Engineering Roadmap (BOOK.md)

> **Last Updated**: July 2026
> This document is the authoritative engineering reference for the Cortex AI backend.
> It records architecture decisions, audit findings, improvement status, and future roadmap.

---

## 1. Current Architecture

### Overview

The Cortex AI platform is a **Node.js microservices architecture** backed by MongoDB (via Mongoose), Redis (session store + conversation memory cache), and an API Gateway layer using Express.

### Service Topology

```
Clients
   │
   ▼
API Gateway :5000   ← Helmet, CORS, Redis rate limiter, session validation
   │
   ├──► Auth Service    :5001  Firebase token validation + session management
   ├──► Chat Service    :5002  Conversation & message persistence (MongoDB)
   ├──► Agent Service   :5003  LangGraph orchestration (chat/coding/search/pdf/ppt/image)
   └──► Billing Service :5004  Razorpay order creation and payment verification

Shared Infrastructure:
  - MongoDB Atlas (all services)
  - Redis (gateway sessions + agent conversation memory)
```

### Service-to-Service Authentication

All `/internal/*` endpoints require an `x-internal-key` header verified against the `INTERNAL_API_KEY` environment variable. This prevents unauthorized access from outside the service mesh.

### Strengths
- Decoupled service domains enabling independent scaling
- Redis session store avoids DB queries on every authenticated request
- API Gateway centralizes auth, rate limiting, and security headers
- LangGraph provides structured, observable agent state machine routing

### Weaknesses (Technical Debt — Partially Resolved)
- ~~CORS hardcoded to `localhost:5173`~~ → Now environment-driven via `ALLOWED_ORIGINS`
- ~~No Redis rate limiting~~ → Implemented with `express-rate-limit` + `rate-limit-redis`
- ~~No health checks~~ → All services expose `/health` endpoint
- ~~No graceful shutdown~~ → `SIGTERM`/`SIGINT` handlers implemented across all services
- ~~Inconsistent error responses~~ → Standardized shape via shared `response.js` helpers
- ~~No service-to-service auth~~ → `x-internal-key` middleware on all `/internal/*` routes
- ~~No pagination~~ → `getMessages` supports `?page` and `?limit` query params
- Synchronous inter-service communication (billing → auth) — should become event-driven in a future phase

---

## 2. Backend Module Review

### API Gateway (`/backend/gateway`)
| | |
|---|---|
| **Current State** | Fully refactored |
| **Changes Made** | Redis-backed rate limiter, dynamic CORS, request IDs in headers, structured Morgan logging, centralized error handler, health check endpoint |
| **Remaining** | None for this phase |
| **Priority** | ✅ Complete |

### Auth Service (`/backend/services/auth`)
| | |
|---|---|
| **Current State** | Fully refactored |
| **Changes Made** | Extracted `buildSessionPayload()` and `refreshSession()` helpers eliminating 3× code duplication, removed `console.log(decoded)`, cookie security tied to `NODE_ENV`, field validation on all endpoints, `protectInternal` middleware on `/internal/*` routes |
| **Remaining** | None for this phase |
| **Priority** | ✅ Complete |

### Chat Service (`/backend/services/chat`)
| | |
|---|---|
| **Current State** | Fully refactored |
| **Changes Made** | Paginated `getMessages` (`?page&limit`), ObjectId validation, all imports moved to top, soft-delete filter on `getConversations`, standardized responses, compound indexes on schema |
| **Remaining** | None for this phase |
| **Priority** | ✅ Complete |

### Agent Service (`/backend/services/agent`)
| | |
|---|---|
| **Current State** | Partially refactored |
| **Changes Made** | Health check, graceful shutdown, standardized error handler, `x-internal-key` forwarded to auth service |
| **Remaining** | File uploads still use local disk (Multer → local `./temp`). Should migrate to S3 for multi-instance support. |
| **Priority** | Medium |

### Billing Service (`/backend/services/billing`)
| | |
|---|---|
| **Current State** | Fully refactored |
| **Changes Made** | Standardized responses, added idempotency guard (`payment.status === "paid"` check prevents double-credit), field validation, health check, graceful shutdown |
| **Remaining** | Consider transactional outbox / event queue if auth service down during payment verification |
| **Priority** | ✅ Complete for this phase |

---

## 3. Database Improvements

### MongoDB Optimization Status

| Collection | Index Added | Validation Added | Soft Delete |
|---|---|---|---|
| `users` | ✅ `firebaseUid`, `email` | ✅ required, enum, min | ❌ not needed |
| `conversations` | ✅ `{ userId, updatedAt }` compound | ✅ required, trim | ✅ `deletedAt` field |
| `messages` | ✅ `{ conversationId, createdAt }` compound | ✅ required, enum | ❌ |
| `payments` | ✅ `orderId` unique, `userId` | ✅ required, min, enum | ❌ |

### MongoDB Connection Configuration
All services now use the shared `connectDB.js` module:
- `maxPoolSize: 50` — handles concurrent connections under load
- `minPoolSize: 5` — keeps warm connections pre-allocated
- `serverSelectionTimeoutMS: 5000` — fast fail on unreachable Atlas
- Lifecycle events: `error`, `disconnected` logged
- Graceful `mongoose.connection.close()` on shutdown signals

### PostgreSQL Equivalent Schema (Migration Reference)

Should the platform migrate to PostgreSQL in a future phase:

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    avatar VARCHAR(2048) DEFAULT '',
    provider VARCHAR(64) DEFAULT 'password',
    plan VARCHAR(64) NOT NULL DEFAULT 'free' CHECK (plan IN ('free','basic','premium','pro')),
    credits INTEGER NOT NULL DEFAULT 100 CHECK (credits >= 0),
    total_credits INTEGER NOT NULL DEFAULT 100 CHECK (total_credits >= 0),
    plan_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    images TEXT[] DEFAULT '{}',
    artifacts JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_id VARCHAR(255) UNIQUE NOT NULL,
    payment_id VARCHAR(255),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    credits INTEGER NOT NULL CHECK (credits >= 0),
    plan VARCHAR(64) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_user ON payments(user_id);
```

---

## 4. API Improvements

| Improvement | Status |
|---|---|
| Standardized success/error response shape | ✅ Implemented |
| Pagination on `getMessages` (`?page&limit`) | ✅ Implemented |
| ObjectId validation before DB queries | ✅ Implemented |
| Field validation on all controller inputs | ✅ Implemented |
| HTTP `201 Created` for resource creation | ✅ Implemented |
| `404 Not Found` for missing records | ✅ Implemented |
| API versioning (`/api/v1/`) | ⏳ Planned — Phase 2 |
| OpenAPI / Swagger spec | ⏳ Planned — Phase 2 |
| Filtering and sorting parameters | ⏳ Planned — Phase 2 |

---

## 5. Security Improvements

| Improvement | Status |
|---|---|
| Redis-backed rate limiting (IP-level, 300 req/15min) | ✅ |
| `x-internal-key` service-to-service auth | ✅ |
| `httpOnly` cookies | ✅ |
| `secure` cookie flag in production | ✅ (tied to `NODE_ENV`) |
| `sameSite=strict` in production | ✅ |
| Input validation before DB operations | ✅ |
| Helmet security headers on gateway | ✅ |
| Dynamic CORS from env variable | ✅ |
| OWASP Top 10: SQL Injection | N/A (MongoDB + Mongoose) |
| OWASP Top 10: XSS | ✅ Helmet CSP headers |
| OWASP Top 10: Broken Auth | ✅ Redis session + Firebase |
| Rate limit for `/auth/login` specifically | ⏳ Planned — Phase 2 |
| CSRF protection for cookie-based auth | ⏳ Planned — Phase 2 |

---

## 6. Performance Improvements

| Improvement | Status |
|---|---|
| MongoDB connection pooling (`maxPoolSize=50`) | ✅ |
| Redis connection retryStrategy + reconnectOnError | ✅ |
| Compound DB indexes for hot queries | ✅ |
| Paginated message loading (max 100 per page) | ✅ |
| Redis conversation memory cache (24h TTL) | ✅ (existing) |
| Response compression middleware | ⏳ Planned |
| S3 for agent file uploads (multi-instance safe) | ⏳ Planned |

---

## 7. Code Quality

| Concern | Status |
|---|---|
| Shared `connectDB.js` replaces 4× duplicated db.js | ✅ |
| Shared `response.js` eliminates ad-hoc JSON shapes | ✅ |
| Shared `gracefulShutdown.js` eliminates 4× signal handlers | ✅ |
| Shared `redis.js` singleton with retry logic | ✅ |
| `buildSessionPayload()` helper removes 3× duplication | ✅ |
| `refreshSession()` helper removes 2× duplication | ✅ |
| Removed all `console.log(error)` debug statements | ✅ |
| Removed all `console.log(decoded)` debug statements | ✅ |
| All controller imports moved to top of file | ✅ |
| Idiomatic modern JS throughout | ✅ |

---

## 8. Production Readiness

| Feature | Status |
|---|---|
| Health check `/health` on all 5 services | ✅ |
| Graceful shutdown (`SIGTERM`/`SIGINT`) on all services | ✅ |
| Docker Compose with `condition: service_healthy` | ✅ |
| Named Docker network isolation (`cortex-net`) | ✅ |
| Environment variable documentation (`.env.example`) | ✅ |
| Jest + Supertest test suite (gateway) | ✅ |
| Request ID in all HTTP responses (`x-request-id`) | ✅ |
| Structured logs (Morgan + prefix tags) | ✅ |
| `nodemon` for dev, `node` for production | ✅ |
| Prometheus metrics | ⏳ Phase 3 |
| OpenTelemetry tracing | ⏳ Phase 3 |
| CI/CD pipeline (GitHub Actions) | ⏳ Phase 3 |

---

## 9. Missing Features (Future Phases)

### Phase 2 — API Maturity
| Feature | Priority | Complexity |
|---|---|---|
| API versioning (`/api/v1/`) | High | Low |
| OpenAPI / Swagger UI | High | Medium |
| Auth-specific rate limiter (login endpoint) | High | Low |
| CSRF protection | Medium | Medium |
| Filtering + sorting on list endpoints | Medium | Low |
| `DELETE /conversations/:id` (soft delete) | Medium | Low |

### Phase 3 — Observability & Operations
| Feature | Priority | Complexity |
|---|---|---|
| OpenTelemetry distributed tracing | High | High |
| Prometheus metrics + Grafana dashboard | High | Medium |
| Structured JSON logging (pino/winston) | Medium | Low |
| GitHub Actions CI/CD pipeline | High | Medium |
| Automated DB backup strategy | Medium | Medium |

### Phase 4 — Advanced Features
| Feature | Priority | Complexity |
|---|---|---|
| RabbitMQ / BullMQ for async billing events | High | High |
| S3 file storage in agent service | Medium | Medium |
| WebSocket / SSE for streaming agent responses | Medium | High |
| Refresh token rotation | Medium | Medium |
| RBAC (role-based access control) | Low | High |
| Feature flags | Low | Medium |
| Audit log table | Low | Medium |

---

## 10. Decisions & Rationale

| Decision | Rationale |
|---|---|
| Keep MongoDB (not migrate to PostgreSQL) | Existing LangGraph artifact schemas and agent context objects are document-native. MongoDB compound indexes and Mongoose validation provide adequate production-grade guarantees without a full migration cost. |
| `x-internal-key` over mTLS | Simple, auditable, sufficient for a single-cluster deployment. mTLS is the right upgrade path when services span multiple clusters. |
| Shared modules in `backend/shared/` | Eliminates drift between 4 identical `db.js` copies and ensures all services emit consistent logs and responses. |
| `cookie-parser` + Redis sessions over JWTs | Stateful sessions allow instant invalidation on plan change or logout. JWTs are stateless and would require a denylist to achieve the same, adding similar complexity. |
