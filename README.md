# Cortex AI — Backend

A production-grade, microservices-based backend for the Cortex AI platform. Built with Node.js, Express, MongoDB, Redis, LangGraph, and Razorpay.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Clients                          │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   API Gateway :5000                     │
│  • Helmet, CORS, Rate Limiting (Redis), Morgan logs     │
│  • Session verification (Redis cookie store)            │
│  • Reverse proxy to downstream services                 │
└────┬──────────┬──────────┬───────────┬──────────────────┘
     │          │          │           │
     ▼          ▼          ▼           ▼
 Auth:5001  Chat:5002  Agent:5003  Billing:5004
     │          │          │           │
     └──────────┴──────────┴───────────┘
                           │
                   ┌───────┴────────┐
                   │   MongoDB      │
                   │   Redis        │
                   └────────────────┘
```

### Services

| Service   | Port | Responsibility |
|-----------|------|----------------|
| `gateway` | 5000 | Auth, rate limiting, reverse proxy |
| `auth`    | 5001 | Firebase token validation, session management, user CRUD |
| `chat`    | 5002 | Conversation and message persistence |
| `agent`   | 5003 | LangGraph agent orchestration (chat, coding, search, pdf, ppt, image) |
| `billing` | 5004 | Razorpay order creation and payment verification |

---

## Prerequisites

- Node.js >= 18
- MongoDB (local Docker Compose or Atlas instance)
- Redis 7+
- Docker & Docker Compose (for containerized setup)

---

## File Storage

The project utilizes a cloud-independent, modular local storage adapter for saving generated and uploaded assets (PDFs, presentations, and images):
- **Local Storage Path**: Configurable via `STORAGE_PATH` (defaults to `./storage/uploads`).
- **Endpoint Protection**: Served via secure backend endpoint `/api/agent/files/:filename` proxied by the gateway (enforcing session cookie auth). Add `?download=true` query parameter to force download as an attachment.
- **Validation**: Uploaded and generated files are checked for MIME type correctness and size limits (max 20MB).
- **Path Traversal Protection**: Employs strict target directory verification to prevent path traversal vulnerability.
- **Docker Persistence**: The `/storage/uploads` directory inside the agent container is bound to the `cortex-storage` Docker volume, ensuring files persist across container restarts.

---

## Environment Setup

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

All critical secrets are documented in [`.env.example`](.env.example).

> **Important**: `INTERNAL_API_KEY` must be the same value across all services. It is used to authenticate service-to-service calls (e.g., billing → auth).

---

## Running Locally (Development)

Each service is independently runnable. From the service directory:

```bash
# Example: start the gateway
cd backend/gateway
npm install
npm run dev

# Start auth service
cd backend/services/auth
npm install
npm run dev
```

Start Redis locally:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

---

## Running with Docker Compose

```bash
cd backend
docker compose up --build
```

All services start with health checks. The gateway waits for all downstream services to become healthy before accepting traffic.

To stop:
```bash
docker compose down
```

---

## API Reference

All routes go through the gateway at `http://localhost:5000`.

### Authentication

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| `POST` | `/api/auth/login` | ❌ | `{ token }` | Login with Firebase ID token |
| `GET`  | `/api/auth/logout` | ❌ | — | Invalidate session |
| `GET`  | `/api/me` | ✅ | — | Get current user from session |

### Chat

| Method | Endpoint | Auth | Body / Query | Description |
|--------|----------|------|--------------|-------------|
| `POST` | `/api/chat/create-conversation` | ✅ | — | Create a new conversation |
| `GET`  | `/api/chat/get-conversations` | ✅ | — | List user conversations |
| `POST` | `/api/chat/update-conversation` | ✅ | `{ conversationId, title }` | Rename conversation |
| `POST` | `/api/chat/save-message` | ✅ | `{ conversationId, role, content, images?, artifacts? }` | Save a message |
| `GET`  | `/api/chat/get-messages/:id` | ✅ | `?page=1&limit=30` | Paginated message history |

### Agent

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| `POST` | `/api/agent/chat` | ✅ | `{ prompt, conversationId, agent }` + optional `file` | Run an agent |
| `GET`  | `/api/agent/files/:filename` | ✅ | — | Securely fetch/download locally stored files (`?download=true` for attachment) |

**Agent types**: `chat`, `coding`, `search`, `pdf`, `ppt`, `image`, `vision`, `pdf_rag`

### Billing

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| `POST` | `/api/billing/create-order` | ✅ | `{ plan }` | Create a Razorpay order |
| `POST` | `/api/billing/verify-payment` | ✅ | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | Verify and activate plan |

### Standard Response Format

**Success:**
```json
{
  "success": true,
  "message": "OK",
  "data": { ... }
}
```

**Paginated:**
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "total": 120,
      "page": 1,
      "limit": 30,
      "totalPages": 4,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required."
  }
}
```

### Health Checks

Each service exposes `GET /health`:

```bash
curl http://localhost:5000/health   # gateway
curl http://localhost:5001/health   # auth
curl http://localhost:5002/health   # chat
curl http://localhost:5003/health   # agent
curl http://localhost:5004/health   # billing
```

---

## Running Tests

```bash
cd backend/gateway
npm install
npm test
```

Tests cover:
- Gateway health and root endpoints
- Auth guard enforcement (401 without session)
- 404 handling and error shape consistency
- `sendSuccess`, `sendError`, `sendPaginated` response helpers

---

## Folder Structure

```
backend/
├── docker-compose.yml          # Unified service orchestration
├── gateway/                    # API Gateway
│   ├── app.js                  # Testable Express app (no server.listen)
│   ├── index.js                # Entry point (binds to port)
│   ├── __tests__/              # Jest test suites
│   ├── controllers/
│   ├── middlewares/
│   └── utils/
├── services/
│   ├── auth/                   # Firebase + session management
│   ├── chat/                   # Conversation & message persistence
│   ├── agent/                  # LangGraph agent orchestration
│   └── billing/                # Razorpay payment processing
└── shared/                     # Shared modules across services
    ├── db/connectDB.js          # MongoDB connection with pooling
    ├── redis/redis.js           # ioredis singleton with retry logic
    ├── response/response.js     # Standardized response helpers
    └── shutdown/gracefulShutdown.js  # SIGTERM/SIGINT handlers
```

---

## Security

- **Session cookies** are `httpOnly`, `secure` in production, `sameSite=strict` in production.
- **Internal endpoints** (`/internal/*`) require `x-internal-key` header — never exposed through the gateway.
- **Rate limiting** is Redis-backed: 300 req / 15 min per IP by default (configurable via `RATE_LIMIT_MAX`).
- **Input validation** is applied in all controllers before DB operations.
- **MongoDB indexes** are defined on all frequently queried fields.

---

## Engineering Roadmap

See [`BOOK.md`](./BOOK.md) for the full architecture audit, database schema designs, security analysis, and future enhancement roadmap.
