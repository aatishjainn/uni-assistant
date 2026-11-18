# University Smart Assistant (Uni-Assistant) — Architecture & Technical Reference

This document provides a technical walkthrough of the architecture, subsystems, security mechanisms, and workflows in the University Smart Assistant codebase.

---

## 1. Directory Structure

- **[`frontend/`](file:///d:/DOwnloads/uni-assistant%20main/uni-assistant/frontend)**: React 18 single-page application built with Vite and Tailwind CSS.
  - `pages/Chat.jsx`: Chat dashboard with dual Simple/Detailed modes, Agent Mode toggle, conversation history, and interactive widgets.
  - `pages/Campus.jsx`: Interactive Leaflet map and dynamic SVG floor plan renderer with step-free accessibility routing.
  - `pages/Admin.jsx`: Knowledge base document manager, admission info editor, notices publisher, and system analytics.
  - `pages/Login.jsx`: Authentication interface for existing accounts or new applicant registrations.
  - `components/MessageBubble.jsx`: Markdown bubble renderer with GFM support, source citation tags, and the ReAct `<AgentTrace>` execution breakdown.
- **[`backend/`](file:///d:/DOwnloads/uni-assistant%20main/uni-assistant/backend)**: Node.js Express server handling business logic, authentication, RBAC, campus graph algorithms, and tool execution.
  - `src/services/orchestrator.js`: Request routing, intent classification dispatch, and privacy guardrails.
  - `src/services/agent.js`: ReAct autonomous agent loop with Zod validation, timeouts, step limits, and numeric hallucination detector.
  - `src/services/campus.js`: In-memory campus graph, Dijkstra shortest path with binary MinHeap, and natural language direction generation.
  - `src/services/retrieval.js`: Hybrid RAG retriever combining PostgreSQL `tsvector` keyword search and `pgvector` cosine similarity with Reciprocal Rank Fusion (RRF).
  - `src/services/records.js`: Strictly user-scoped database access for personal academic records.
  - `src/tools/index.js`: Registry of operational tools exposed to the AI model with strict role permissions.
- **[`ai-service/`](file:///d:/DOwnloads/uni-assistant%20main/uni-assistant/ai-service)**: Python FastAPI microservice interfacing with Google Gemini.
  - `app/main.py`: Endpoints for chat, classification, grounding answer synthesis, document chunking & embedding, and agent step planning.
  - `app/ingest.py`: PDF and DOCX parsing with sentence-aware chunking preserving exact page numbers.
  - `app/providers/gemini.py`: Gemini client implementation with automatic fallback model failover for quota exhaustion (HTTP 429).
  - `app/prompts.py`: Prompt templates, system instructions, and JSON schemas for LLM classification and planning.
- **[`db/migrations/`](file:///d:/DOwnloads/uni-assistant%20main/uni-assistant/db/migrations)**: Postgres schema scripts configuring pgvector, core tables, knowledge chunks, and campus graph nodes/edges.

---

## 2. Core Workflows

### A. Dual Chat Modes: Standard vs. Agent Mode
1. **Standard Mode (Intent Router + Single Tool / RAG)**:
   - User prompt is checked against the deterministic privacy guard.
   - If university-related, classified into one of 13+ tools or RAG documents.
   - DB query executes strictly using the authenticated user's ID.
   - Facts are wrapped in `<data>` tags and sent to `/ai/answer` to generate a grounded, conversational response.
2. **Autonomous Agent Mode (Multi-Step ReAct Loop)**:
   - Triggered via UI toggle or complex multi-step questions (e.g. "What is my attendance and where is my next class?").
   - Uses `/ai/agent/step` to iteratively formulate a `thought` and call permitted tools.
   - Tool observations are fed back into subsequent steps (up to 5 steps / 6 calls).
   - Once a final draft is produced, an ungrounded number check verifies all numerical figures against observations.
   - If hallucinated figures are detected, the agent triggers a self-correction repair step before rendering.

### B. Campus Spatial Navigation
- Models campus nodes (classrooms, labs, offices, stairs, elevators, gates) and walking edges with distance metrics.
- Uses Dijkstra's algorithm to compute shortest paths.
- Step-free mode excludes stairs (`is_accessible = false`) in favor of elevators.
- Generates turn-by-turn walking steps and renders paths onto both a global Leaflet map and SVG floor plan.
- QR codes (e.g., `QR-GATE`) allow instant origin positioning when scanned.

### C. Hybrid Document Ingestion & RAG
- Documents (PDF/DOCX) uploaded by Admins are inspected via magic bytes (`%PDF-` / PK zip headers).
- Split into 1,000-character chunks with 150-character overlap while preserving page boundaries.
- Stored with 768-dimensional Gemini embeddings and PostgreSQL `tsvector` columns.
- Queries run hybrid vector + full-text search, fused using Reciprocal Rank Fusion (RRF), ensuring robust retrieval even if embedding quotas are depleted.

---

## 3. Security Highlights

1. **Zero Client Trust**: User identity is derived exclusively from verified JWTs and direct DB lookups.
2. **Deterministic Privacy Guard**: Rejects prompts mentioning names or IDs of other students or faculty before reaching any AI model or data query.
3. **Constant-Time Auth**: Password hashing timing attacks are mitigated by executing dummy bcrypt comparisons for non-existent users.
4. **Service Isolation**: FastAPI AI microservice accepts requests only from Express via a verified `X-Service-Token`.
5. **Strict Data Grounding**: System prompts instruct models to answer solely from supplied data and explicitly disallow inventing dates, fees, or university policies.
