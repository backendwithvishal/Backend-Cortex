# Master Engineering Roadmap (BOOK.md)

This document is the master engineering roadmap for the Cortex AI backend. It contains a complete architectural audit, module-by-module analysis, database designs, API specifications, security reviews, performance enhancements, and future roadmap.

---

## 1. Current Architecture

The Cortex AI platform is currently implemented as a **Node.js microservices architecture** orchestrated via Docker Compose (though the compose setup is minimal and incomplete). It consists of an API Gateway and four core microservices.

### Current High-Level Architecture
- **API Gateway**: Entry point for all HTTP requests. Responsible for CORS, basic security headers (Helmet), session token extraction from cookies, session validation via Redis, and reverse-proxy routing (using `express-http-proxy`) to downstream microservices.
- **Authentication Service**: Handled via Firebase Admin SDK. Receives Firebase ID Tokens, validates them, creates/manages user documents in MongoDB, and stores user sessions in Redis.
- **Chat Service**: Manages conversation history, message histories, and user artifacts (code, PDFs, slide documents). Uses MongoDB.
- **Agent Service**: Coordinates multiple specialized agents (chat, coding, search, pdf, ppt, image, vision, pdf_rag) using a LangGraph-based state machine.
- **Billing Service**: Manages payments, packages, and plan subscriptions via Razorpay. Communicates synchronously with the Auth service to update user credits and plans upon payment confirmation.

### Architectural Strengths
- **Decoupled domains**: Auth, Chat, Billing, and Agents are isolated, allowing independent scaling.
- **Fast Session Store**: Using Redis for session storage avoids querying the primary database on every API request.
- **Centralized Routing**: API Gateway protects internal services from direct public access and forwards sanitized headers (`x-user-id`, `x-user-email`).

### Architectural Weaknesses & Technical Debt
1. **Synchronous Inter-Service Communication**: Billing service updates user credits via synchronous HTTP calls to Auth service. If the Auth service is down, payment validation succeeds but credits are not credited (lack of transactional outbox or event-driven retry mechanism).
2. **Missing Service-to-Service Security**: Downstream services (e.g., Auth's `/internal/*` routes) trust HTTP requests implicitly. Anyone inside the network—or external users if firewall/proxy routing is misconfigured—can call `/internal/update-plan` without credentials.
3. **No Database Indexing Strategy**: MongoDB collections lack explicit, documented indices. Frequently queried fields like `userId`, `firebaseUid`, `conversationId`, and `orderId` rely on full-table scans, which degrades performance as data grows.
4. **Poor Error Handling & Response Consistency**: Services return ad-hoc error shapes. Mongoose validation errors result in unhandled promise rejections or raw stack traces being sent to the client.
5. **No API Versioning**: Current routing uses `/api/auth`, `/api/chat` directly without version prefixes (e.g., `/api/v1/auth`), making future updates highly breaking.
6. **No Observability**: Lacks structured logging (morgan `dev` is only used in Gateway), request IDs, metrics, or tracing.
7. **Monolithic Local File Storage in Agent Service**: Files uploaded to Agent Service are stored locally via Multer. In a scaled environment, instances behind a load balancer will not share uploaded files, causing data loss.

---

## 2. Backend Review

### API Gateway (`/backend/gateway`)
- **Current State**: Entry point running Express on port 5000. Uses Redis session verification middleware.
- **Problems**:
  - Unused dependencies (`express-rate-limit`, `rate-limit-redis`) in `package.json` that are not actually initialized in `index.js`.
  - CORS origin is hardcoded to `http://localhost:5173`.
  - Missing global error handling middleware; unhandled errors leak HTML response structures.
  - Lacks structured logs or request ID tracking.
- **Improvements**:
  - Implement Redis-backed rate limiting.
  - Inject CORS origin via environment variables.
  - Create centralized error interception middleware returning standardized JSON formats.
  - Configure Morgan to emit structured JSON logs including Request-ID headers.
- **Priority**: High
- **Estimated Complexity**: Low

### Authentication Service (`/backend/services/auth`)
- **Current State**: Manages users and internal credit/plan modifications. Runs on port 5001.
- **Problems**:
  - `/internal/*` endpoints lack authentication/authorization.
  - Firebase token errors are returned raw to users.
  - No database indexes on `firebaseUid` or `email` collections.
- **Improvements**:
  - Secure `/internal/*` endpoints with shared secret tokens, JWTs, or mTLS.
  - Map Firebase tokens to a dedicated local database user representation with unique constraints.
  - Implement structured responses for auth successes and failures.
- **Priority**: Critical
- **Estimated Complexity**: Medium

### Chat Service (`/backend/services/chat`)
- **Current State**: Saves and loads messages, conversations, and artifacts. Runs on port 5002.
- **Problems**:
  - `/get-messages/:id` loads all messages in a conversation. An old conversation with 1,000+ messages will crash the service or response payload.
  - No validation of incoming `conversationId` parameter (causes Mongoose CastErrors when malformed).
- **Improvements**:
  - Implement offset or cursor-based pagination for messages and conversations.
  - Add request validation to verify that `conversationId` parameters are valid object IDs.
  - Create database indexes on `userId` and `conversationId`.
- **Priority**: High
- **Estimated Complexity**: Medium

### Agent Service (`/backend/services/agent`)
- **Current State**: Coordinates LangGraph state machines. Runs on port 5003.
- **Problems**:
  - Calls Chat Service synchronously via Axios in HTTP controller. If Chat Service is down, the agent fails.
  - Stores uploaded files on the local filesystem.
  - Huge memory and execution footprints; blocking event loop on long agent runs.
- **Improvements**:
  - Offload long-running agent tasks to a background worker queue (RabbitMQ / BullMQ) or stream responses over SSE.
  - Abstract file uploads to support Amazon S3 or MinIO cloud storage.
- **Priority**: Medium
- **Estimated Complexity**: High

### Billing Service (`/backend/services/billing`)
- **Current State**: Creates Razorpay orders and processes checkout webhooks. Runs on port 5004.
- **Problems**:
  - Synchronous HTTP call dependency on Auth service to update plans.
  - No database transaction support.
- **Improvements**:
  - Implement a Transactional Outbox pattern or RabbitMQ event emission for payment confirmations.
  - Validate webhook payloads using Razorpay's cryptographic verification.
- **Priority**: High
- **Estimated Complexity**: Medium

---

## 3. Database Improvements

The current application uses **MongoDB** via Mongoose instead of PostgreSQL. 

### MongoDB Audit & Schema Optimization
1. **Unique Indexing**:
   - `User` schema: Set `firebaseUid` and `email` to explicit DB-level indexes.
   - `Payment` schema: Set `orderId` to a unique index.
2. **Compound Indexing**:
   - `Message` schema: Add compound index on `{ conversationId: 1, createdAt: -1 }` to support fast, paginated message retrieval.
   - `Conversation` schema: Add compound index on `{ userId: 1, updatedAt: -1 }` for rapid rendering of a user's recent chats.
3. **Mongoose Validation**:
   - Schema validation should enforce field rules. Currently, `User` model attributes (`name`, `email`) are optional, allowing empty strings.
4. **Soft Deletes**:
   - Introduce a `deletedAt` field on the `Conversation` schema to allow users to hide/delete chats without immediately wiping history, supporting auditing and recovery.
5. **Connection Pooling**:
   - Add `maxPoolSize: 50` and `minPoolSize: 5` configurations to the MongoDB connection string or parameters in `db.js` to handle concurrent traffic.
6. **Graceful Shutdowns**:
   - Explicitly handle `SIGTERM` and `SIGINT` to call `mongoose.connection.close()` so connections are closed gracefully instead of abruptly terminating.

### Relational Mapping (PostgreSQL Schema Design)
Should the application migrate to a relational database (PostgreSQL), we propose the following schema design:

```sql
-- PostgreSQL Migration Schema
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    avatar VARCHAR(2048),
    provider VARCHAR(64),
    plan VARCHAR(64) DEFAULT 'free' NOT NULL,
    credits INTEGER DEFAULT 100 NOT NULL,
    total_credits INTEGER DEFAULT 100 NOT NULL,
    plan_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) DEFAULT 'New Chat' NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user ON conversations(user_id) WHERE deleted_at IS NULL;

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(32) CHECK (role IN ('user', 'assistant')) NOT NULL,
    content TEXT,
    images TEXT[],
    artifacts JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_id VARCHAR(255) UNIQUE NOT NULL,
    payment_id VARCHAR(255),
    amount NUMERIC(10, 2) NOT NULL,
    credits INTEGER NOT NULL,
    plan VARCHAR(64) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR' NOT NULL,
    status VARCHAR(64) DEFAULT 'created' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_order ON payments(order_id);
```

---

## 4. API Improvements

1. **REST Consistency**:
   - Clean up non-standard paths (e.g. rename `/save-message` to `POST /api/messages` or POST `/api/conversations/:id/messages`).
   - Standardize HTTP status codes: Return `201 Created` for resource creation, `400 Bad Request` for validator failures, and `404 Not Found` for missing database records.
2. **Pagination**:
   - Apply pagination query flags (`limit=20`, `page=1`) to endpoints retrieving message arrays or conversation lists.
3. **API Versioning**:
   - Rewrite the base path on API Gateway and service microservices to mount routes under `/api/v1/`.
4. **Caching**:
   - Cache user profile data (`/api/me`) in Redis for 10-15 minutes instead of querying Redis or Mongo constantly if it doesn't change, and invalidate the cache on plan updates or profile changes.
5. **Idempotency**:
   - Add `Idempotency-Key` tracking for payment and billing requests to prevent double-charging or duplicate transactions.

---

## 5. Security Improvements

1. **Service-to-Service Authorization**:
   - Implement a secret key validation middleware (`x-internal-key`) on service endpoints intended for internal use only (e.g., billing calling auth plan updates).
2. **Helmet & Security Headers**:
   - Configure Helmet with custom content-security policies in the API Gateway.
3. **Input Validation**:
   - Integrate schema validation (e.g., Joi or Zod) to filter body inputs, rejecting excessive parameters or unexpected data types before hitting service engines.
4. **Rate Limiting**:
   - Enable Redis-backed rate limiting per IP in Gateway (`100 requests per 15 minutes` for general routes, `10 requests per minute` for login/authentication endpoints).

---

## 6. Performance Improvements

1. **Database Indexes**:
   - Create compound index definitions directly inside Mongoose schemas and run script queries to check index presence in production.
2. **Redis Connection Multiplexing**:
   - Keep a single Redis connection pool shared across middleware instances in the gateway, avoiding recreation of connection objects.
3. **Response Compression**:
   - Add the `compression` middleware in the API Gateway to compress JSON payloads, improving transmission speed for large chat response histories.
4. **Database Connection Tuning**:
   - Tune connection strings with keepAlive and socket timeouts to recover from network drops.

---

## 7. Code Quality & Standards

1. **SOLID Principles**:
   - Refactor controller architectures to separate routing, business services, and database repository abstractions.
2. **Eliminate Duplicated Code**:
   - Centralize database connection libraries and error wrappers.
3. **Types & Validation**:
   - Document parameter schema formats for all major payloads.
4. **Unused Packages**:
   - Audit `package.json` configurations in every subservice and prune unused dependencies.

---

## 8. Production Readiness

1. **Docker Compose Enhancements**:
   - Build a comprehensive, unified `docker-compose.yml` including Gateway, Services, MongoDB, Redis, and health checks.
2. **Health Checks**:
   - Add a `/health` endpoint to each microservice returning DB connection health, memory usage, and status.
3. **Graceful Shutdown**:
   - Ensure servers capture OS signals (`SIGTERM`/`SIGINT`) to complete processing current requests, close DB pools, and shutdown HTTP listeners.

---

## 9. Missing Features & Priority List

| Feature | Description | Priority | Complexity |
| :--- | :--- | :--- | :--- |
| **API Versioning** | Moving endpoints under `/api/v1/` prefix | High | Low |
| **Internal Auth** | Securing internal `/internal/` endpoints | Critical | Low |
| **Pagination** | Paginating message history calls | High | Medium |
| **Redis Rate Limit** | Enabling Redis IP rate limiters on Gateway | High | Low |
| **Graceful Shutdown** | Handling OS signals in Express and Mongoose | Medium | Low |
| **Docker Compose** | Launching all services + Mongo via Docker Compose | High | Medium |
| **Health Checks** | Exposing `/health` checking DB/Redis states | Medium | Low |
| **Test Suite** | Unit and Integration tests with Jest & Supertest | High | Medium |

---

## 10. Future Enhancements & Action Plan

### Phase 1: Cleanup & Roadmap
- [ ] Remove the frontend application folder entirely.
- [ ] Create initial `BOOK.md` master document.
- [ ] Update root project metadata and configurations.

### Phase 2: Core Gateway Refactor
- [ ] Implement Redis-backed IP rate limiter in Gateway.
- [ ] Add Helmet, customized CORS, and structured JSON logs.
- [ ] Standardize gateway error handling.

### Phase 3: Service Refactoring
- [ ] Create service-to-service auth middleware (`x-internal-key`).
- [ ] Secure `auth` service internal routes.
- [ ] Add explicit indexes to Mongoose schemas.
- [ ] Add request body schema validation.
- [ ] Standardize API success/error JSON response payloads.
- [ ] Implement paginated message loading in `chat` service.

### Phase 4: Production Setup & Docker
- [ ] Construct comprehensive docker-compose configuration.
- [ ] Add `/health` endpoints check.
- [ ] Program SIGTERM/SIGINT hooks.

### Phase 5: Verification & Tests
- [ ] Add Jest & Supertest suites.
- [ ] Run verification tests.
