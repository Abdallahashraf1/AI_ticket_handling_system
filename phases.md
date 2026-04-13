# Implementation Phases — AI Ticket System for Payment Services

> This document breaks the entire project into **7 sequential phases** across **10 weeks**. Each phase lists exactly what to build, what files to create, what to test, and what the deliverable looks like at the end.

---

## Phase Overview

```
Week   1     2     3     4     5     6     7     8     9     10
       ├─────┤     ├─────┤     │     │     │     │     ├─────┤
       Phase 1     Phase 2     P3    P4    P5    P6    Phase 7
       Foundation  Agent       KB    Dash  Analyt Intake Polish
                   Pipeline               -ics
```

| Phase | Name | Duration | Key Outcome |
|-------|------|----------|-------------|
| **1** | Foundation & Infrastructure | Week 1–2 | Monorepo scaffold, DB schema, auth, basic CRUD |
| **2** | Agent Pipeline (LangGraph) | Week 3–4 | Full 5-node AI pipeline processing tickets end-to-end |
| **3** | Knowledge Base & RAG | Week 5 | Document ingestion, chunking, embedding, similarity search |
| **4** | Human Dashboard & Customer Portal | Week 6 | Agent review UI, customer ticket submission & tracking |
| **5** | Analytics & SLA Engine | Week 7 | NL→SQL analytics, SLA deadlines, breach detection |
| **6** | Intake Channels | Week 8 | Email parser, Slack bot, multi-channel ticket creation |
| **7** | Polish & Production | Week 9–10 | Error handling, security, deployment, load testing |

---

## Phase 1: Foundation & Infrastructure

**Duration**: Week 1–2  
**Goal**: Scaffold the entire monorepo, set up the database schema, implement authentication, and build basic ticket CRUD operations. By the end of this phase, a customer can sign up, log in, create a ticket, and see their tickets — but no AI processing yet.

---

### 1.1 — Backend Scaffold (FastAPI)

**What to build:**
- FastAPI project structure with all directories
- Pydantic settings (config.py) loading environment variables
- Supabase client singleton
- Redis client singleton
- Health check endpoints
- CORS middleware configured for the frontend
- Request/response logging middleware

**Files to create:**

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app, lifespan, CORS, router mounting
│   ├── config.py                  # Pydantic BaseSettings for all env vars
│   ├── dependencies.py            # Dependency injection (DB, Redis, current_user)
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── supabase.py            # Supabase client init + singleton
│   │   └── redis.py               # Redis client init + queue helpers
│   │
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── auth.py                # JWT verification via Supabase Auth
│   │   ├── rate_limit.py          # Redis-backed rate limiter (stub for now)
│   │   └── logging.py             # Structured request logging
│   │
│   └── api/
│       ├── __init__.py
│       ├── router.py              # Aggregate v1 router
│       └── v1/
│           ├── __init__.py
│           └── health.py          # /health and /health/ready endpoints
│
├── pyproject.toml                 # Dependencies: fastapi, uvicorn, supabase, redis, etc.
├── requirements.txt               # Pinned deps
├── Dockerfile                     # Python 3.12 slim image
└── .env.example                   # Documented env var template
```

**Key decisions:**
- Use `supabase-py` (official Python client) for DB operations
- Use `redis[asyncio]` for async Redis
- All endpoints require JWT auth by default (opt-out for health checks)

**Verification:**
- `uvicorn app.main:app --reload` starts without errors
- `GET /api/v1/health` returns `{"status": "healthy"}`
- `GET /api/v1/health/ready` checks Supabase and Redis connectivity

---

### 1.2 — Database Schema (Supabase)

**What to build:**
- All core tables with proper indexes
- pgvector extension enabled
- Row-Level Security policies
- Database functions for similarity search
- Seed data for SLA policies and a test team

**Migration files to create:**

```
supabase/
├── migrations/
│   ├── 001_extensions.sql          # Enable vector, pg_trgm, uuid-ossp
│   ├── 002_core_tables.sql         # profiles, teams, tickets, ticket_events,
│   │                                # ticket_comments, notifications
│   ├── 003_knowledge_tables.sql    # knowledge_articles, knowledge_chunks, agent_runs
│   ├── 004_sla_policies.sql        # sla_policies table + seed data
│   ├── 005_rls_policies.sql        # Row-Level Security for all tables
│   ├── 006_functions.sql           # match_knowledge_chunks(), find_duplicate_tickets()
│   └── 007_indexes.sql             # pgvector IVFFlat indexes, composite indexes
├── seed.sql                        # Dev seed: test users, teams, sample tickets
└── config.toml                     # Supabase local config
```

**Tables created in this phase:**

| Table | Purpose | Row count at end of phase |
|-------|---------|--------------------------|
| `profiles` | User profiles (extends auth.users) | 5 seed users (1 customer, 2 agents, 1 manager, 1 admin) |
| `teams` | Support teams | 4 teams: Payments, Disputes, Account Ops, Compliance |
| `tickets` | Core ticket data | 10 seed tickets for testing |
| `ticket_events` | Audit trail / timeline | 1 "created" event per seed ticket |
| `ticket_comments` | Comments / replies | Empty |
| `knowledge_articles` | KB articles (empty for now) | Empty (populated in Phase 3) |
| `knowledge_chunks` | RAG chunks (empty for now) | Empty (populated in Phase 3) |
| `agent_runs` | LangGraph execution log | Empty (populated in Phase 2) |
| `sla_policies` | SLA rules | 4 default policies |
| `notifications` | In-app notifications | Empty |

**Verification:**
- Run all migrations via Supabase CLI: `supabase db push`
- Verify tables exist: `supabase db dump`
- RLS test: Authenticate as customer → can only see own tickets

---

### 1.3 — Authentication (Supabase Auth)

**What to build:**
- Supabase Auth configured with email/password
- Sign up flow that creates a `profiles` row via DB trigger
- FastAPI middleware that verifies Supabase JWTs
- Role-based access control helpers: `require_role('agent', 'manager')`
- Next.js auth pages: login, register
- Next.js middleware for session refresh and route protection

**Backend files:**

```
backend/app/middleware/auth.py      # get_current_user(), require_role()
```

**Frontend files:**

```
frontend/src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          # Email + password login form
│   │   └── register/page.tsx       # Registration form (name, email, password)
│   └── api/
│       └── auth/
│           └── callback/route.ts   # OAuth callback handler (if needed)
├── lib/
│   └── supabase/
│       ├── client.ts               # Browser-side Supabase client
│       ├── server.ts               # Server-side Supabase client (SSR)
│       └── middleware.ts           # Session refresh middleware
├── hooks/
│   └── useAuth.ts                  # Auth state hook
└── middleware.ts                    # Next.js route-level auth guard
```

**Supabase trigger (in migrations):**

```sql
-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

**Verification:**
- Customer can register → profile row created with role `customer`
- Customer can log in → receives JWT → can call protected endpoints
- Agent cannot access manager-only endpoints → 403

---

### 1.4 — Ticket CRUD (Basic)

**What to build:**
- Create ticket endpoint (no AI processing yet — just persist to DB)
- List tickets endpoint (filtered by role: customers see own, agents see team, managers see all)
- Get ticket detail endpoint (with timeline events)
- Ticket submission form on the frontend
- Ticket list page on the frontend
- Ticket detail page with timeline

**Backend files:**

```
backend/app/
├── api/v1/
│   └── tickets.py                  # POST /tickets, GET /tickets, GET /tickets/{id}
├── models/
│   └── ticket.py                   # TicketCreate, TicketResponse, TicketList
├── services/
│   └── ticket_service.py           # create_ticket(), list_tickets(), get_ticket()
└── db/repositories/
    ├── __init__.py
    └── ticket_repo.py              # DB queries for tickets table
```

**Frontend files:**

```
frontend/src/
├── app/
│   ├── (customer)/
│   │   ├── layout.tsx              # Customer layout with sidebar
│   │   ├── tickets/
│   │   │   ├── page.tsx            # My tickets list
│   │   │   ├── new/page.tsx        # Ticket submission form
│   │   │   └── [id]/page.tsx       # Ticket detail + timeline
│   │   └── profile/page.tsx        # Profile settings
│   └── layout.tsx                  # Root layout with providers
├── components/
│   ├── tickets/
│   │   ├── TicketForm.tsx           # Subject, category, description, attachments
│   │   ├── TicketCard.tsx           # Ticket list item card
│   │   ├── TicketDetail.tsx         # Full ticket view
│   │   ├── TicketTimeline.tsx       # Timeline events component
│   │   └── StatusBadge.tsx          # Color-coded status badge
│   ├── layout/
│   │   ├── Sidebar.tsx              # Navigation sidebar
│   │   ├── Header.tsx               # Top header with search + notifications
│   │   └── BreadcrumbNav.tsx        # Breadcrumb navigation
│   └── ui/                          # shadcn/ui primitives (button, input, card, etc.)
├── lib/
│   ├── api.ts                       # FastAPI HTTP client wrapper (axios/fetch)
│   ├── types.ts                     # TypeScript types mirroring backend schemas
│   └── utils.ts                     # Formatters, date helpers
└── hooks/
    └── useTickets.ts                # TanStack Query hooks for ticket CRUD
```

**Verification:**
- Customer fills out form → ticket appears in their list
- Customer clicks ticket → sees detail page with "created" event in timeline
- Agent logs in → sees tickets assigned to their team
- Manager logs in → sees all tickets

---

### 1.5 — Docker Compose & Dev Setup

**What to build:**
- Docker Compose for local dev (backend, frontend, Redis)
- README with setup instructions
- Environment variable documentation

**Files to create:**

```
docker-compose.yml                   # backend + worker + redis + frontend
.env.example                         # All required env vars documented
README.md                            # Setup guide, architecture overview
```

**Verification:**
- `docker-compose up` spins up all services
- Frontend on `localhost:3000`, backend on `localhost:8000`

---

### 📦 Phase 1 Deliverable

> A **working full-stack app** where customers can register, log in, submit tickets, and view their ticket list and details. No AI, no queue processing — just clean CRUD with proper auth and role-based access.

---

## Phase 2: Agent Pipeline (LangGraph)

**Duration**: Week 3–4  
**Goal**: Build the complete 5-node LangGraph pipeline that processes tickets through triage, routing, resolution/escalation, and feedback. By the end of this phase, submitting a ticket triggers the full AI pipeline.

---

### 2.1 — LangGraph State & Graph Definition

**What to build:**
- `TicketAgentState` TypedDict with all fields
- Compiled `StateGraph` with 5 nodes and conditional edges
- Helper functions for building initial state from ticket data

**Files to create:**

```
backend/app/agents/
├── __init__.py
├── state.py                        # TicketAgentState TypedDict
├── graph.py                        # StateGraph definition, compile, singleton
└── edges.py                        # route_decision(), should_continue()
```

**Key implementation details:**

```python
# Graph structure:
# triage → router → [resolver OR escalation]
#                      ↓                ↓
#                   feedback           END
#                      ↓
#                     END

# Conditional edges:
# router → "auto_resolve" → resolver
# router → "escalate" → escalation
```

**Verification:**
- Graph compiles without errors
- Graph visualization (via `graph.get_graph().draw_mermaid()`) matches expected topology

---

### 2.2 — Agent Prompts

**What to build:**
- Structured system prompts for each agent
- Each prompt enforces JSON output format for structured parsing
- Prompts are specific to the payment services domain

**Files to create:**

```
backend/app/agents/prompts/
├── __init__.py
├── triage.py                       # TRIAGE_SYSTEM_PROMPT
├── router.py                       # ROUTER_SYSTEM_PROMPT
├── resolver.py                     # RESOLVER_SYSTEM_PROMPT
├── escalation.py                   # ESCALATION_SYSTEM_PROMPT
└── analytics.py                    # ANALYTICS_SYSTEM_PROMPT (for Phase 5)
```

**Example prompt structure (triage):**

```python
TRIAGE_SYSTEM_PROMPT = """
You are a ticket triage agent for a payment services company.

Your job is to classify incoming customer support tickets.

CATEGORIES (pick one):
- payments: Failed transactions, declined payments, holds, refunds
- transactions: Transaction history, receipts, statements, exports
- account: Account setup, verification, KYC, profile changes
- disputes: Chargebacks, unauthorized charges, fraud claims
- payouts: Merchant payouts, settlement delays, payout schedules
- compliance: Regulatory queries, AML/KYC requirements, documentation
- integration: API issues, webhook failures, SDK problems
- general: General inquiries, feedback, feature requests

PRIORITY RULES:
- critical: Complete service outage, security breach, fraud in progress
- high: Failed payments with funds deducted, account locked, large disputes
- medium: Delayed payouts, integration errors, verification pending
- low: General inquiries, feature requests, documentation questions

OUTPUT FORMAT (strict JSON):
{
    "category": "...",
    "subcategory": "...",
    "priority": "critical|high|medium|low",
    "urgency_score": 0.0-1.0,
    "sentiment": "positive|neutral|negative|frustrated",
    "reasoning": "..."
}
"""
```

**Verification:**
- Each prompt is tested with 3 sample tickets manually
- JSON output parses correctly

---

### 2.3 — Agent Nodes

**What to build:**
- Triage node: Classify, score urgency, check for duplicates
- Router node: Decide auto-resolve vs. escalate
- Resolver node: RAG search + draft generation (RAG search will be basic until Phase 3)
- Escalation node: Write brief, calculate SLA, assign agent, send notification
- Feedback node: Log outcome, optionally create KB article

**Files to create:**

```
backend/app/agents/nodes/
├── __init__.py
├── triage.py                       # Classification + priority + duplicate detection
├── router.py                       # Auto-resolve vs. escalate decision
├── resolver.py                     # RAG search + draft response generation
├── escalation.py                   # Brief + SLA + assign + notify
└── feedback.py                     # Outcome logging + KB update
```

**Dependencies for each node:**

| Node | LLM Calls | DB Writes | External Tools |
|------|-----------|-----------|----------------|
| Triage | 1 (classification) | UPDATE tickets, INSERT ticket_events | pgvector duplicate search |
| Router | 1 (routing decision) | UPDATE tickets, INSERT ticket_events | None |
| Resolver | 1 (draft generation) | UPDATE tickets, INSERT ticket_events | pgvector RAG search |
| Escalation | 1 (brief writing) | UPDATE tickets, INSERT ticket_events, INSERT notifications | SLA calculator, agent finder |
| Feedback | 0 | INSERT ticket_events, optionally INSERT knowledge_articles | None |

**Verification:**
- Unit tests for each node with mocked LLM responses
- Integration test: Full pipeline execution on a test ticket

---

### 2.4 — Agent Tools

**What to build:**
- RAG search tool (basic version — full implementation in Phase 3)
- Duplicate detection tool (pgvector cosine similarity)
- SLA calculation tool
- Notification sender

**Files to create:**

```
backend/app/agents/tools/
├── __init__.py
├── rag_search.py                   # search_knowledge_base() — pgvector
├── duplicate_detector.py           # find_duplicates() — pgvector
├── sla_calculator.py               # calculate_sla_deadline()
└── notifier.py                     # send_notification() — DB insert
```

**Verification:**
- Duplicate detector finds >92% similar tickets correctly
- SLA calculator respects business hours

---

### 2.5 — Redis Queue & Worker

**What to build:**
- Redis queue helpers (enqueue, dequeue, retry)
- Background worker that consumes from `ticket:process` queue
- Worker invokes the LangGraph pipeline
- Retry logic with exponential backoff
- Agent run logging (records each pipeline execution)

**Files to create:**

```
backend/app/
├── db/redis.py                     # Add queue helpers: enqueue(), dequeue()
├── workers/
│   ├── __init__.py
│   └── ticket_processor.py         # Main queue consumer + process_ticket()
└── db/repositories/
    └── audit_repo.py               # log_event(), log_agent_run()
```

**Flow after this phase:**

```
Customer submits ticket
  → POST /api/v1/tickets
    → TicketService.create_ticket()
      → Generate embedding
      → INSERT tickets
      → INSERT ticket_events (created)
      → Redis LPUSH "ticket:process"
    → Return ticket to customer immediately

Worker picks up message
  → BRPOP "ticket:process"
  → Fetch ticket from DB
  → Build TicketAgentState
  → Invoke ticket_pipeline.ainvoke(state)
  → Log agent_run to DB
```

**Verification:**
- Submit a ticket → appears in Redis queue → worker processes it → ticket status updates to `resolved` or `escalated`
- Check `ticket_events` table → all pipeline events logged
- Check `agent_runs` table → pipeline execution recorded

---

### 2.6 — LangSmith Integration

**What to build:**
- LangSmith tracing enabled via environment variables
- Each pipeline run is traceable with ticket_id as metadata
- Custom metadata tags for category, priority, resolution_type

**Files to modify:**

```
backend/app/config.py               # Add LANGSMITH env vars
backend/app/workers/ticket_processor.py  # Add tracing config to pipeline invocation
```

**Verification:**
- Process a ticket → trace appears in LangSmith dashboard
- Trace shows all 3–4 nodes with LLM calls, token usage, latency

---

### 2.7 — Update Frontend for Real-Time Processing

**What to build:**
- Supabase Realtime subscription on ticket detail page
- Status badge updates live as pipeline processes
- Timeline populates in real-time with each agent event

**Files to create/modify:**

```
frontend/src/
├── hooks/
│   └── useRealtimeTicket.ts         # Supabase Realtime subscription
└── components/tickets/
    └── TicketTimeline.tsx            # Updates live with new events
```

**Verification:**
- Submit ticket → watch ticket detail page → status changes from New → Triaging → Routing → Resolved (live, no refresh)

---

### 📦 Phase 2 Deliverable

> **Full AI pipeline working end-to-end.** Customer submits ticket → AI triages, routes, and resolves (or escalates) within ~10 seconds. All events are visible in the timeline. Traces appear in LangSmith.

---

## Phase 3: Knowledge Base & RAG

**Duration**: Week 5  
**Goal**: Build the complete knowledge base system — article management, document ingestion, chunking, embedding, and similarity search. The Resolver Agent's RAG capabilities become fully functional.

---

### 3.1 — KB Article CRUD

**What to build:**
- KB article creation, listing, editing, archiving
- Rich text editor for articles (Tiptap)
- Category tagging and search
- Article status management (draft → active → archived)

**Backend files:**

```
backend/app/
├── api/v1/
│   └── knowledge.py                # GET /knowledge, POST /knowledge, PUT /knowledge/{id}
├── models/
│   └── knowledge.py                # ArticleCreate, ArticleResponse, ArticleList
├── services/
│   └── knowledge_service.py        # create_article(), update_article(), list_articles()
└── db/repositories/
    └── knowledge_repo.py           # DB queries for knowledge tables
```

**Frontend files:**

```
frontend/src/
├── app/(agent)/
│   └── knowledge/
│       ├── page.tsx                 # KB article list with search/filter
│       └── [id]/page.tsx            # Article editor (Tiptap rich text)
└── components/knowledge/
    ├── ArticleEditor.tsx            # Tiptap-based rich text editor
    ├── ArticleList.tsx              # Filterable article list
    └── DocumentUpload.tsx           # File upload component
```

**Verification:**
- Agent can create, edit, and archive KB articles
- Articles are searchable by title, category, and tags

---

### 3.2 — Document Ingestion Pipeline

**What to build:**
- File upload endpoint (PDF, DOCX, TXT, Markdown)
- File parser that extracts text from each format
- Upload files to Supabase Storage
- Queue document for processing

**Backend files:**

```
backend/app/
├── api/v1/knowledge.py             # POST /knowledge/upload (file upload endpoint)
├── services/
│   └── knowledge_service.py        # Add: process_document_upload()
└── workers/
    └── embedding_worker.py          # Document → chunks → embeddings worker
```

**Supported formats:**

| Format | Parser | Library |
|--------|--------|---------|
| PDF | Text extraction | `pypdf` or `pdfplumber` |
| DOCX | Paragraph extraction | `python-docx` |
| TXT | Direct read | Built-in |
| Markdown | Parse to text | `markdown` |

**Verification:**
- Upload a PDF → text extracted → article created → chunks generated

---

### 3.3 — Chunking Pipeline

**What to build:**
- Split article content into chunks (512 tokens, 50-token overlap)
- Each chunk stored in `knowledge_chunks` with article reference
- Token counting via `tiktoken`

**Implementation detail:**

```python
# Chunking strategy:
# 1. Split by paragraphs (double newline)
# 2. If paragraph > 512 tokens, split by sentences
# 3. Merge small consecutive chunks to reach ~512 tokens
# 4. Add 50-token overlap between consecutive chunks
# 5. Store chunk_index for ordering

def chunk_article(content: str, max_tokens: int = 512, overlap: int = 50) -> list[str]:
    ...
```

**Verification:**
- A 2,000-word article → ~8 chunks of ~512 tokens each
- Chunks overlap correctly (last 50 tokens of chunk N = first 50 tokens of chunk N+1)

---

### 3.4 — Embedding Generation

**What to build:**
- Background worker that processes the embedding queue
- Generates embeddings via OpenAI `text-embedding-3-small`
- Batch processing (up to 100 chunks per API call)
- Stores embeddings in pgvector column

**Files to create/modify:**

```
backend/app/workers/
└── embedding_worker.py              # Queue consumer for embedding generation
```

**Verification:**
- Create an article → chunks generated → embeddings stored → pgvector index updated
- `SELECT COUNT(*) FROM knowledge_chunks WHERE embedding IS NOT NULL` increases

---

### 3.5 — RAG Search (Full Implementation)

**What to build:**
- Upgrade the basic RAG search from Phase 2 to use real embeddings
- Similarity search with configurable threshold
- Article metadata enrichment (title, category, tags)
- Relevance scoring and ranking

**Files to modify:**

```
backend/app/agents/tools/rag_search.py   # Full implementation with real pgvector queries
```

**Verification:**
- Add KB article: "When a payment is declined but funds are held, this is a temporary authorization hold..."
- Submit ticket: "My payment was declined but money was taken"
- RAG search returns the article with >0.85 similarity
- Resolver Agent generates a response referencing the article content

---

### 3.6 — Feedback-Driven KB Growth

**What to build:**
- Feedback node creates KB articles from high-confidence auto-resolutions
- Human-edited resolutions are saved as "human_corrected" articles
- Customer feedback (helpful/not helpful) updates article scores

**Files to modify:**

```
backend/app/agents/nodes/feedback.py     # Auto-create KB articles from resolutions
backend/app/api/v1/tickets.py            # Add: POST /tickets/{id}/feedback
```

**Verification:**
- Auto-resolve a ticket (confidence >0.85) → new KB article created automatically
- Agent edits a draft → corrected version saved as KB article with `human_corrected` tag
- Customer rates "not helpful" → source article's helpfulness_score decreases

---

### 📦 Phase 3 Deliverable

> **Full RAG system operational.** KB articles can be created manually or uploaded as documents. All articles are chunked and embedded. The Resolver Agent uses semantic search to find relevant knowledge and generate accurate responses. The system learns from every resolution.

---

## Phase 4: Human Dashboard & Customer Portal

**Duration**: Week 6  
**Goal**: Build the agent dashboard for reviewing escalated tickets and the polished customer portal for submitting and tracking tickets.

---

### 4.1 — Agent Queue Dashboard

**What to build:**
- Queue page showing escalated tickets assigned to the agent or their team
- Sortable by SLA urgency (closest deadline first)
- Filterable by priority, category, status
- Real-time updates — new tickets appear without refresh
- Claim functionality — agent claims an unassigned ticket

**Frontend files:**

```
frontend/src/
├── app/(agent)/
│   ├── layout.tsx                   # Agent layout with sidebar nav
│   ├── dashboard/page.tsx           # Agent queue dashboard
│   └── tickets/
│       └── [id]/page.tsx            # Agent ticket review page
└── components/tickets/
    └── TicketQueue.tsx              # Queue component with sorting/filtering
```

**Verification:**
- Agent logs in → sees their escalated tickets sorted by SLA
- New escalated ticket appears in queue via Realtime
- Agent clicks "Claim" → ticket assigned to them

---

### 4.2 — AI Draft Review Page

**What to build:**
- Split-panel view: original ticket on left, AI analysis on right
- AI brief display (summary, why escalated, suggested approach)
- Editable draft response (rich text editor)
- Three action buttons: Approve & Send, Edit & Send, Reject Draft
- Reject with feedback field (sends back to Resolver for retry)

**Frontend files:**

```
frontend/src/
├── app/(agent)/tickets/[id]/page.tsx    # Agent review page
└── components/tickets/
    └── AIDraftReview.tsx                # Draft review + approval component
```

**Backend files:**

```
backend/app/api/v1/tickets.py            # Add endpoints:
                                          #   POST /tickets/{id}/approve
                                          #   POST /tickets/{id}/reject
                                          #   POST /tickets/{id}/edit-resolve
```

**Verification:**
- Agent opens escalated ticket → sees AI brief + draft response
- Agent clicks "Approve & Send" → ticket resolved → customer notified
- Agent clicks "Reject Draft" with feedback → Resolver re-generates draft → new draft appears

---

### 4.3 — Customer Ticket Portal (Polish)

**What to build:**
- Clean, modern ticket submission form with category selector
- File upload to Supabase Storage
- My Tickets list with search, filter, pagination
- Ticket detail with real-time timeline, resolution display, feedback buttons
- Ticket reopening functionality

**Frontend files to modify/create:**

```
frontend/src/
├── app/(customer)/
│   ├── tickets/
│   │   ├── page.tsx                 # Polish: pagination, search, filters
│   │   ├── new/page.tsx             # Polish: category dropdown, file upload
│   │   └── [id]/page.tsx            # Polish: resolution display, feedback, reopen
└── components/tickets/
    ├── TicketForm.tsx                # Polish: file upload, category selector
    └── TicketFeedback.tsx            # NEW: Helpful/Not helpful/Reopen buttons
```

**Backend files:**

```
backend/app/api/v1/tickets.py            # Add endpoints:
                                          #   POST /tickets/{id}/reopen
                                          #   POST /tickets/{id}/feedback
```

**Verification:**
- Customer submits ticket → sees real-time processing → sees resolution
- Customer clicks "Not helpful" → ticket_event logged → article score updated
- Customer clicks "Reopen" → ticket re-enters pipeline

---

### 4.4 — Notification System

**What to build:**
- In-app notification bell with unread count
- Real-time notification updates via Supabase Realtime
- Mark as read functionality
- Notification types: ticket_assigned, ticket_resolved, sla_warning, etc.

**Frontend files:**

```
frontend/src/
├── components/layout/
│   └── NotificationBell.tsx         # Bell icon with badge + dropdown
└── hooks/
    └── useNotifications.ts          # Supabase Realtime subscription for notifications
```

**Backend files:**

```
backend/app/
├── api/v1/notifications.py          # GET /notifications, PATCH /notifications/{id}/read
├── services/
│   └── notification_service.py      # create_notification(), mark_read()
└── db/repositories/
    └── notification_repo.py         # queries
```

**Verification:**
- Ticket escalated → agent's notification bell shows badge
- Agent clicks notification → navigates to ticket
- Agent marks as read → badge count decreases

---

### 4.5 — Manager View (Basic)

**What to build:**
- Manager can see ALL tickets across all teams
- Basic stats cards: total tickets, resolution rate, open count
- Team management page (view teams, see team members)

**Frontend files:**

```
frontend/src/app/(manager)/
├── layout.tsx                       # Manager sidebar layout
├── overview/page.tsx                # Basic stats dashboard
└── teams/page.tsx                   # Team list with members
```

**Verification:**
- Manager logs in → sees aggregate ticket stats
- Manager can view any ticket regardless of team assignment

---

### 📦 Phase 4 Deliverable

> **Complete UI for all user roles.** Customers can submit, track, and provide feedback on tickets. Agents can review AI briefs, approve/edit/reject drafts, and manage their queue. Managers can see all tickets and basic stats.

---

## Phase 5: Analytics & SLA Engine

**Duration**: Week 7  
**Goal**: Build the natural language analytics system and the SLA engine with deadline calculation, breach detection, and alerting.

---

### 5.1 — Analytics Agent (NL → SQL)

**What to build:**
- Standalone analytics agent (not part of ticket pipeline)
- Converts natural language questions to safe SQL queries
- Validates SQL (SELECT only, no mutations, with LIMIT)
- Executes against read-only connection
- Summarizes results in natural language
- Optional chart type suggestion (bar, line, pie, table)

**Backend files:**

```
backend/app/
├── api/v1/analytics.py              # POST /analytics/query, GET /analytics/dashboard
├── agents/nodes/analytics.py        # run_analytics_query() function
├── services/analytics_service.py    # Query execution, caching, validation
└── db/repositories/analytics_repo.py  # Read-only query execution
```

**Verification:**
- Manager asks: "How many tickets were auto-resolved this week?" → correct SQL → correct answer
- Manager asks: "DELETE FROM tickets" → rejected (mutation detected)
- Results are cached in Redis for 5 minutes

---

### 5.2 — Analytics Dashboard

**What to build:**
- KPI cards: total tickets, auto-resolution rate, avg resolution time, CSAT, SLA compliance
- Natural language query input
- Trend charts (ticket volume over time, resolution types, categories)
- Pre-computed metrics refreshed periodically

**Frontend files:**

```
frontend/src/
├── app/(manager)/
│   ├── analytics/page.tsx           # NL query analytics page
│   └── reports/page.tsx             # Pre-built reports
├── components/analytics/
│   ├── NLQueryInput.tsx             # Natural language query input
│   ├── QueryResult.tsx              # Results table/chart display
│   ├── KPICards.tsx                  # Metric cards row
│   ├── TrendChart.tsx               # Line/bar charts (Recharts)
│   └── SLAChart.tsx                 # SLA compliance chart
└── hooks/
    └── useAnalytics.ts              # TanStack Query hooks for analytics
```

**Verification:**
- Manager sees KPI cards updating with real data
- Manager types a question → gets a chart or table with results
- Charts show meaningful trends

---

### 5.3 — SLA Engine

**What to build:**
- SLA deadline calculation (respects business hours)
- SLA policy management (CRUD for SLA policies)
- Periodic SLA breach scanner (runs every 60 seconds)
- SLA warning notifications (at 75% of time elapsed)
- SLA breach notifications and ticket flagging
- SLA dashboard showing compliance metrics

**Backend files:**

```
backend/app/
├── services/sla_service.py          # calculate_deadline(), check_breaches()
├── workers/sla_checker.py           # Periodic scanner (every 60s)
└── api/v1/sla.py                    # SLA policy CRUD, SLA dashboard data
```

**Frontend files:**

```
frontend/src/app/(manager)/
└── sla/page.tsx                     # SLA compliance dashboard
```

**Verification:**
- High priority ticket created at 4 PM → SLA deadline = next business day 4 PM
- Ticket at 75% of SLA time → warning notification sent to assigned agent
- Ticket past SLA deadline → marked as breached → alert to manager

---

### 📦 Phase 5 Deliverable

> **Full analytics and SLA system.** Managers can ask questions in natural language and get data-driven answers. SLA deadlines are automatically calculated and enforced. Breach alerts ensure no ticket falls through the cracks.

---

## Phase 6: Intake Channels

**Duration**: Week 8  
**Goal**: Add email and Slack as additional intake channels. Tickets from any channel enter the same AI pipeline.

---

### 6.1 — Email Parser (IMAP)

**What to build:**
- IMAP email poller (checks inbox every 60 seconds)
- Email parser (extract subject, body, attachments, sender)
- Sender → customer lookup (match by email or create new profile)
- Thread tracking (reply to resolution emails creates a comment, not a new ticket)
- Attachment upload to Supabase Storage

**Backend files:**

```
backend/app/workers/
└── email_poller.py                  # IMAP polling loop + email parser
```

**Configuration:**

```bash
IMAP_HOST=imap.gmail.com
IMAP_USER=support@paymentco.com
IMAP_PASSWORD=app-specific-password
```

**Verification:**
- Send email to support@paymentco.com → ticket created → AI pipeline processes it
- Reply to a resolution email → comment added to existing ticket (not new ticket)
- Attachment in email → uploaded to Supabase Storage → linked to ticket

---

### 6.2 — Slack Bot

**What to build:**
- Slack app with event subscriptions (app_mention)
- Webhook endpoint for Slack events
- Slack signature verification
- Ticket creation from Slack messages
- Thread replies with ticket status and resolution

**Backend files:**

```
backend/app/api/v1/webhooks.py       # POST /webhooks/slack
```

**Slack App Configuration:**
- Create Slack app with Bot Token Scopes: `app_mentions:read`, `chat:write`
- Subscribe to Events: `app_mention`
- Set Request URL to: `https://api.yourdomain.com/api/v1/webhooks/slack`

**Verification:**
- Mention @support-bot in Slack with a message → ticket created → bot replies in thread with ticket ID
- Ticket resolved → bot posts resolution in the original Slack thread

---

### 6.3 — Unified Intake Layer

**What to build:**
- Normalize all intake channels into the same `TicketCreate` schema
- Source tracking (web, email, slack) persisted on ticket
- Channel-specific metadata stored in `metadata` JSONB field
- Resolution notifications sent back through the original channel

**Verification:**
- Create tickets from all 3 channels → all process through the same pipeline
- Resolutions delivered back through the original channel

---

### 📦 Phase 6 Deliverable

> **Multi-channel intake operational.** Customers can submit tickets via web form, email, or Slack. All channels feed into the same AI pipeline. Resolutions are delivered back through the original channel.

---

## Phase 7: Polish & Production

**Duration**: Week 9–10  
**Goal**: Harden the system for production — error handling, security, performance optimization, deployment, load testing, and documentation.

---

### 7.1 — Error Handling & Resilience

**What to build:**
- Comprehensive try/catch in all API endpoints
- Structured error responses with error codes
- Queue retry logic with exponential backoff (max 5 retries)
- Dead letter queue for permanently failed tickets
- Circuit breaker for OpenAI API calls
- Graceful degradation when LLM is down (queue tickets, process later)

**Files to modify:**

```
backend/app/
├── middleware/error_handler.py      # NEW: Global exception handler
├── workers/ticket_processor.py      # Add: retry logic, dead letter queue
└── services/ticket_service.py       # Add: error status handling
```

**Verification:**
- Simulate OpenAI API failure → tickets queue → process when API recovers
- After 5 failures → ticket moved to dead letter queue → alert sent

---

### 7.2 — Security Hardening

**What to do:**
- Review all RLS policies (verify customers can't see other customers' tickets)
- Input sanitization on all text fields (prevent XSS)
- SQL injection prevention in analytics agent (parameterized queries only)
- Rate limiting on all endpoints (Redis-backed)
- CORS configured for production domain only
- Secrets management (no secrets in code)
- Content Security Policy headers on frontend

**Checklist:**

```
[ ] RLS test: customer A cannot read customer B's tickets
[ ] RLS test: customer cannot update tickets they don't own
[ ] RLS test: agent can only see tickets assigned to their team
[ ] Analytics SQL: all queries are read-only (SELECT only)
[ ] Analytics SQL: all queries have LIMIT clause
[ ] Rate limit: 100 requests/minute per user
[ ] Rate limit: 10 ticket submissions/hour per customer
[ ] CORS: only production frontend URL allowed
[ ] CSP: Content-Security-Policy header set
[ ] Supabase service key: only used in backend (never exposed to frontend)
```

---

### 7.3 — Performance Optimization

**What to do:**
- Database query analysis (identify and fix N+1 queries)
- Add database indexes for common query patterns
- Redis caching for frequently accessed data (agent availability, SLA policies)
- Frontend: React.lazy for code splitting
- Frontend: Image optimization
- pgvector: Tune IVFFlat list count based on data volume

**Key optimizations:**

| Area | Before | After |
|------|--------|-------|
| Ticket list query | N+1 for submitter info | JOIN with profiles |
| Analytics dashboard | 6 separate queries | Single materialized view |
| KB search | Query all chunks | IVFFlat index with tuned `lists` |
| Agent queue | Poll every 5s | Supabase Realtime (zero polling) |

---

### 7.4 — Production Deployment

**What to build:**

```
Deployment Architecture:
├── Frontend: Vercel (Next.js)
├── Backend: Railway / Render / Fly.io (Docker container)
│   ├── API server (uvicorn, 2+ workers)
│   ├── Ticket processor worker
│   ├── SLA checker worker
│   └── Email poller worker
├── Database: Supabase Cloud (managed Postgres + pgvector)
├── Cache/Queue: Upstash Redis (serverless)
├── LLM: OpenAI API
└── Observability: LangSmith
```

**Files to create:**

```
.github/workflows/
├── deploy-backend.yml               # Build + push Docker → deploy to Railway
├── deploy-frontend.yml              # Auto-deploy to Vercel on merge
└── test.yml                         # Run tests on PR

backend/Dockerfile.prod              # Production Dockerfile (multi-stage)
frontend/vercel.json                 # Vercel configuration
```

**Environment setup:**
- Supabase Cloud project with production credentials
- Upstash Redis instance
- Railway/Render app with Docker deployment
- Vercel project linked to GitHub
- Environment variables configured in each platform

---

### 7.5 — Load Testing

**What to test:**

| Scenario | Target | Tool |
|----------|--------|------|
| Concurrent ticket submissions | 50 tickets/second | `locust` |
| Pipeline processing throughput | 20 tickets/minute | Custom test script |
| API response times | p95 < 200ms (non-pipeline) | `locust` |
| Realtime subscriptions | 100 concurrent connections | WebSocket load test |
| KB search latency | p95 < 500ms | Custom benchmark |

**Files to create:**

```
backend/tests/
└── load/
    ├── locustfile.py                # Load test scenarios
    └── README.md                    # How to run load tests
```

---

### 7.6 — Documentation

**What to write:**

```
docs/
├── api-reference.md                 # Full API endpoint reference
├── deployment-guide.md              # Step-by-step deployment instructions
├── runbook.md                       # Ops runbook (incident response, common issues)
├── architecture.md                  # → Link to plan.md
└── system-overview.md               # → Link to system_overview.md
```

**Also update:**
- `README.md` — Full project overview, setup, deployment
- API endpoints → interactive Swagger docs (auto-generated by FastAPI)

---

### 7.7 — User Acceptance Testing

**What to test:**

| Test Case | User Role | Expected Outcome |
|-----------|-----------|-------------------|
| Submit a ticket about a failed payment | Customer | Ticket auto-resolved within 15s with correct guidance |
| Submit a complex dispute ticket | Customer | Ticket escalated, AI brief generated, agent notified |
| Approve an AI draft | Agent | Customer receives resolution via original channel |
| Reject and provide feedback | Agent | New draft generated incorporating feedback |
| Ask "What's our resolution rate this month?" | Manager | Correct percentage with chart |
| Verify SLA breach detection | Manager | Overdue ticket flagged, alert sent |
| Submit ticket via email | Customer | Ticket created, processed, resolution emailed back |
| Submit ticket via Slack | Customer | Ticket created, resolution posted in thread |

---

### 📦 Phase 7 Deliverable

> **Production-ready system.** Fully hardened with error handling, security, and performance optimization. Deployed to cloud infrastructure. Load tested. Documented.

---

## Summary: What You Have at Each Phase End

| Phase | What Works |
|-------|------------|
| **After Phase 1** | Full-stack app with auth, ticket CRUD, roles. No AI. |
| **After Phase 2** | AI pipeline processes tickets end-to-end. Auto-resolve or escalate. |
| **After Phase 3** | RAG knowledge base with document ingestion. System learns from resolutions. |
| **After Phase 4** | Polished UI for all roles — customer portal, agent dashboard, manager view. |
| **After Phase 5** | NL analytics + SLA engine. Managers get data-driven insights. |
| **After Phase 6** | Multi-channel intake. Email and Slack join web as ticket sources. |
| **After Phase 7** | Production-ready. Deployed, tested, documented, hardened. |

---

## Quick Reference: All Files by Phase

<details>
<summary><strong>Phase 1 — 35+ files</strong></summary>

```
backend/app/__init__.py
backend/app/main.py
backend/app/config.py
backend/app/dependencies.py
backend/app/db/__init__.py
backend/app/db/supabase.py
backend/app/db/redis.py
backend/app/middleware/__init__.py
backend/app/middleware/auth.py
backend/app/middleware/rate_limit.py
backend/app/middleware/logging.py
backend/app/api/__init__.py
backend/app/api/router.py
backend/app/api/v1/__init__.py
backend/app/api/v1/health.py
backend/app/api/v1/tickets.py
backend/app/models/__init__.py
backend/app/models/ticket.py
backend/app/services/__init__.py
backend/app/services/ticket_service.py
backend/app/db/repositories/__init__.py
backend/app/db/repositories/ticket_repo.py
backend/pyproject.toml
backend/requirements.txt
backend/Dockerfile
frontend/src/app/layout.tsx
frontend/src/app/(auth)/login/page.tsx
frontend/src/app/(auth)/register/page.tsx
frontend/src/app/(customer)/layout.tsx
frontend/src/app/(customer)/tickets/page.tsx
frontend/src/app/(customer)/tickets/new/page.tsx
frontend/src/app/(customer)/tickets/[id]/page.tsx
frontend/src/lib/supabase/client.ts
frontend/src/lib/supabase/server.ts
frontend/src/lib/supabase/middleware.ts
frontend/src/lib/api.ts
frontend/src/lib/types.ts
frontend/src/hooks/useAuth.ts
frontend/src/hooks/useTickets.ts
supabase/migrations/001-007
docker-compose.yml
.env.example
README.md
```
</details>

<details>
<summary><strong>Phase 2 — 20+ files</strong></summary>

```
backend/app/agents/__init__.py
backend/app/agents/state.py
backend/app/agents/graph.py
backend/app/agents/edges.py
backend/app/agents/prompts/__init__.py
backend/app/agents/prompts/triage.py
backend/app/agents/prompts/router.py
backend/app/agents/prompts/resolver.py
backend/app/agents/prompts/escalation.py
backend/app/agents/nodes/__init__.py
backend/app/agents/nodes/triage.py
backend/app/agents/nodes/router.py
backend/app/agents/nodes/resolver.py
backend/app/agents/nodes/escalation.py
backend/app/agents/nodes/feedback.py
backend/app/agents/tools/__init__.py
backend/app/agents/tools/rag_search.py
backend/app/agents/tools/duplicate_detector.py
backend/app/agents/tools/sla_calculator.py
backend/app/agents/tools/notifier.py
backend/app/workers/__init__.py
backend/app/workers/ticket_processor.py
backend/app/db/repositories/audit_repo.py
frontend/src/hooks/useRealtimeTicket.ts
```
</details>

<details>
<summary><strong>Phase 3 — 10+ files</strong></summary>

```
backend/app/api/v1/knowledge.py
backend/app/models/knowledge.py
backend/app/services/knowledge_service.py
backend/app/db/repositories/knowledge_repo.py
backend/app/workers/embedding_worker.py
frontend/src/app/(agent)/knowledge/page.tsx
frontend/src/app/(agent)/knowledge/[id]/page.tsx
frontend/src/components/knowledge/ArticleEditor.tsx
frontend/src/components/knowledge/ArticleList.tsx
frontend/src/components/knowledge/DocumentUpload.tsx
```
</details>

<details>
<summary><strong>Phase 4 — 15+ files</strong></summary>

```
frontend/src/app/(agent)/layout.tsx
frontend/src/app/(agent)/dashboard/page.tsx
frontend/src/app/(agent)/tickets/[id]/page.tsx
frontend/src/components/tickets/TicketQueue.tsx
frontend/src/components/tickets/AIDraftReview.tsx
frontend/src/components/tickets/TicketFeedback.tsx
frontend/src/components/layout/NotificationBell.tsx
frontend/src/hooks/useNotifications.ts
frontend/src/app/(manager)/layout.tsx
frontend/src/app/(manager)/overview/page.tsx
frontend/src/app/(manager)/teams/page.tsx
backend/app/api/v1/notifications.py
backend/app/services/notification_service.py
backend/app/db/repositories/notification_repo.py
```
</details>

<details>
<summary><strong>Phase 5 — 10+ files</strong></summary>

```
backend/app/api/v1/analytics.py
backend/app/api/v1/sla.py
backend/app/agents/nodes/analytics.py
backend/app/agents/prompts/analytics.py
backend/app/services/analytics_service.py
backend/app/services/sla_service.py
backend/app/workers/sla_checker.py
backend/app/db/repositories/analytics_repo.py
frontend/src/app/(manager)/analytics/page.tsx
frontend/src/app/(manager)/sla/page.tsx
frontend/src/app/(manager)/reports/page.tsx
frontend/src/components/analytics/NLQueryInput.tsx
frontend/src/components/analytics/QueryResult.tsx
frontend/src/components/analytics/KPICards.tsx
frontend/src/components/analytics/TrendChart.tsx
frontend/src/components/analytics/SLAChart.tsx
frontend/src/hooks/useAnalytics.ts
```
</details>

<details>
<summary><strong>Phase 6 — 3 files</strong></summary>

```
backend/app/workers/email_poller.py
backend/app/api/v1/webhooks.py
```
</details>

<details>
<summary><strong>Phase 7 — 10+ files</strong></summary>

```
backend/app/middleware/error_handler.py
backend/Dockerfile.prod
backend/tests/load/locustfile.py
.github/workflows/deploy-backend.yml
.github/workflows/deploy-frontend.yml
.github/workflows/test.yml
docs/api-reference.md
docs/deployment-guide.md
docs/runbook.md
```
</details>

---

> **Total: ~100+ files across 7 phases, 10 weeks.** Each phase builds on the previous, with a working deliverable at the end of every phase.
