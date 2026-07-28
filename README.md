# Cortex AI — Modular AI Agent Platform Backend

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5-blue.svg)](https://expressjs.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agent_Orchestration-orange.svg)](https://js.langchain.com/docs/langgraph)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas/Local-brightgreen.svg)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-Sessions_%26_Cache-red.svg)](https://redis.io/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

A production-grade, modular backend platform built with Node.js, Express, LangGraph, and MongoDB. **Cortex AI** powers multi-agent AI workflows (Chat, Coding, Multimodal Vision, PDF RAG, Image Generation, Real-Time Web Search) with built-in user authentication (Firebase + Redis session control), credit-based rate metering, and Razorpay subscription billing.

---

## 🚀 Key Features & Highlights

- **🤖 LangGraph Agent Supervisor Engine**: State-graph router dynamically routing prompts across specialized AI agents.
- **⚡ Modular Monolith Architecture**: Clean domain module separation (`auth`, `chat`, `agent`, `billing`) in a unified high-performance process.
- **🔑 Auth & Session Control**: Firebase ID Token verification paired with ultra-fast Redis sliding window session storage.
- **📚 PDF RAG Search**: Vector similarity search over user uploaded PDFs using LangChain and Qdrant.
- **💳 Razorpay Billing System**: End-to-end plan upgrades, webhook signature validation, and atomic credit allocation.
- **📊 Observability & Security**: Request tracing with `AsyncLocalStorage`, Prometheus `/metrics` exporter, Winston structured logging, and Zod payload validation.

---

## 📐 System Architecture

```
                               ┌───────────────────────────────────┐
                               │       Client / Web / Mobile       │
                               └─────────────────┬─────────────────┘
                                                 │ HTTP / SSE
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              CORTEX UNIFIED BACKEND                                     │
│                                                                                         │
│  ┌────────────────────────┐    ┌──────────────────────┐    ┌─────────────────────────┐  │
│  │   Request Tracker      │    │    Redis Limiter     │    │   AsyncLocalStorage     │  │
│  │  & Security Middleware │    │  & Auth Guard        │    │   Tracing Context       │  │
│  └───────────┬────────────┘    └───────────┬──────────┘    └────────────┬────────────┘  │
│              │                             │                            │               │
│              ├─────────────────────────────┴────────────────────────────┤               │
│              ▼                                                          ▼               │
│  ┌────────────────────────┐    ┌──────────────────────┐    ┌─────────────────────────┐  │
│  │     Auth Module        │    │     Chat Module      │    │     Billing Module      │  │
│  │ (Firebase/User Models) │    │(Conversations/Msgs)  │    │  (Razorpay Orders)      │  │
│  └────────────────────────┘    └──────────────────────┘    └─────────────────────────┘  │
│                                            │                                            │
│                                            ▼                                            │
│                                ┌──────────────────────┐                                 │
│                                │     Agent Module     │                                 │
│                                └───────────┬──────────┘                                 │
│                                            │                                            │
│                                            ▼                                            │
│                                ┌──────────────────────┐                                 │
│                                │ LangGraph Supervisor │                                 │
│                                └───────────┬──────────┘                                 │
│                                            │                                            │
│            ┌──────────────┬────────────────┼────────────────┬──────────────┐            │
│            ▼              ▼                ▼                ▼              ▼            │
│       ┌─────────┐   ┌──────────┐    ┌─────────────┐   ┌───────────┐   ┌─────────┐       │
│       │  Chat   │   │  Coding  │    │   Vision    │   │  PDF RAG  │   │ Search  │       │
│       │ Agent   │   │  Agent   │    │   Agent     │   │  Agent    │   │ Agent   │       │
│       └─────────┘   └──────────┘    └─────────────┘   └───────────┘   └─────────┘       │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │
                       ┌─────────────────────┼─────────────────────┐
                       ▼                     ▼                     ▼
               ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
               │    MongoDB     │     │     Redis     │     │ Qdrant Vector │
               └───────────────┘     └───────────────┘     └───────────────┘
```

---

## 🛠️ Technology Stack

- **Runtime**: Node.js v20+ (ES Modules)
- **Framework**: Express v5
- **AI Orchestration**: LangChain, LangGraph
- **Database**: MongoDB (Mongoose v8)
- **Caching & Sessions**: Redis (ioredis)
- **Vector DB**: Qdrant
- **Logging**: Winston + AsyncLocalStorage correlation tracing
- **Validation**: Zod
- **API Documentation**: Swagger / OpenAPI 3.0

---

## 🚦 API Endpoints Overview

### Auth Module (`/api/v1/auth`)
- `POST /login` — Verify Firebase token & create Redis session.
- `GET /logout` — Invalidate user session.
- `POST /refresh` — Refresh active session TTL.
- `GET /profile` — Fetch current user profile.
- `PATCH /profile` — Update user name or avatar.

### Chat Module (`/api/v1/chat`)
- `POST /create-conversation` — Start a new chat thread.
- `GET /get-conversations` — List paginated user conversations with text search.
- `POST /update-conversation` — Rename conversation title.
- `DELETE /conversations/:id` — Soft-delete conversation.
- `GET /get-messages/:id` — Fetch message history for a thread.

### Agent Module (`/api/v1/agent`)
- `POST /chat` — Execute multi-agent graph workflow.
- `POST /stream` — Stream agent responses via SSE (Server-Sent Events).
- `GET /files/:filename` — Download generated agent files.

### Billing Module (`/api/v1/billing`)
- `POST /create-order` — Create Razorpay order for plan upgrade.
- `POST /verify-payment` — Verify payment signature & credit allocation.

---

## ⚡ Quickstart Guide

### 1. Environment Setup
Copy the example configuration:
```bash
cp .env.example .env
```

Fill in your provider keys in `.env` (`GOOGLE_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `TAVILY_API_KEY`, `MONGODB_URL`, `REDIS_URL`).

### 2. Local Infrastructure (Docker Compose)
Start MongoDB, Redis, and RabbitMQ:
```bash
docker-compose up -d redis mongodb rabbitmq
```

### 3. Install & Run Application
```bash
cd backend
npm install
npm run dev
```

The application will start on **`http://localhost:5000`**.  
Interactive Swagger API documentation is available at **`http://localhost:5000/api/v1/docs`**.

---

## 🧪 Testing

Run the test suite using Jest:
```bash
cd backend
npm test
```

---

## 📄 License
This project is licensed under the ISC License.
