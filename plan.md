# AI Ticket Handling System — Detailed Architecture Plan

> **Tech Stack**: FastAPI · Supabase (PostgreSQL + pgvector + Auth + Realtime + Storage) · LangGraph · Next.js 14 (App Router) · Redis · LangSmith

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Repository Structure](#3-repository-structure)
4. [Database Schema (Supabase)](#4-database-schema-supabase)
5. [Backend — FastAPI](#5-backend--fastapi)
6. [Agent Processing Layer — LangGraph](#6-agent-processing-layer--langgraph)
7. [Frontend — Next.js](#7-frontend--nextjs)
8. [Intake Channels](#8-intake-channels)
9. [RAG Knowledge Base](#9-rag-knowledge-base)
10. [Queue & Background Processing](#10-queue--background-processing)
11. [Authentication & Authorization](#11-authentication--authorization)
12. [Real-Time Updates](#12-real-time-updates)
13. [Observability & Monitoring](#13-observability--monitoring)
14. [SLA Engine](#14-sla-engine)
15. [API Contract](#15-api-contract)
16. [Deployment Architecture](#16-deployment-architecture)
17. [Environment Variables](#17-environment-variables)
18. [Development Phases](#18-development-phases)

---

## 1. System Overview

This system is an **AI-powered customer support ticket handling platform** for a payment services company. It automatically triages, routes, and resolves customer support tickets using a multi-agent pipeline. When the AI cannot confidently resolve a ticket, it escalates to a human support agent with a pre-written brief. All outcomes feed back into a RAG knowledge base, making the system progressively smarter over time.

### Core Principles

| Principle | Description |
|---|---|
| **AI-first, human-supervised** | Agents handle the heavy lifting; humans approve, correct, or override |
| **Cyclic graph processing** | Agents loop until a ticket is conclusively resolved or escalated |
| **Continuous learning** | Every resolved ticket enriches the knowledge base via feedback loops |
| **Observable by default** | Every agent decision is traced via LangSmith with full audit logging |
| **SLA-aware** | Escalated tickets carry SLA timers; dashboards surface breaches |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      INTAKE CHANNELS                            │
│          Web Form  ·  Email Parser  ·  Slack Bot                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP / Webhook
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI  (Backend API)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Ticket   │  │ Auth     │  │ Analytics│  │ Webhook       │   │
│  │ Router   │  │ Middleware│  │ Endpoints│  │ Handlers      │   │
│  └────┬─────┘  └──────────┘  └──────────┘  └───────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          LangGraph  —  Multi-Agent Pipeline               │   │
│  │                                                           │   │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────────────┐  │   │
│  │  │  Triage   │───▶│  Router   │───▶│  Resolver (RAG)   │  │   │
│  │  │  Agent    │    │  Agent    │    │  OR                │  │   │
│  │  └───────────┘    └───────────┘    │  Escalation Agent  │  │   │
│  │                                    └───────────────────┘  │   │
│  │                                           │               │   │
│  │  ┌───────────────┐         ┌──────────────┘               │   │
│  │  │  Analytics    │         │                              │   │
│  │  │  Agent        │         ▼                              │   │
│  │  │  (NL → SQL)   │    Feedback Loop → RAG Update          │   │
│  │  └───────────────┘                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼ Persist                                                 │
└───────┬─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PERSISTENCE LAYER  (Supabase)                  │
│                                                                 │
│  PostgreSQL  ·  pgvector  ·  Supabase Auth  ·  Supabase Storage │
│  Redis (Queue + Cache + SLA Timers)                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Supabase Realtime
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FRONTEND  (Next.js 14)                         │
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────────────┐     │
│  │  Human Agent        │    │  Manager Analytics          │     │
│  │  Dashboard          │    │  Dashboard                  │     │
│  │  · Ticket queue     │    │  · Natural language queries │     │
│  │  · AI draft review  │    │  · SLA reports              │     │
│  │  · Approve/Edit     │    │  · Trend charts             │     │
│  └─────────────────────┘    └─────────────────────────────┘     │
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────────────┐     │
│  │  Customer Portal    │    │  Knowledge Base             │     │
│  │  · Submit ticket    │    │  · Article management       │     │
│  │  · Track status     │    │  · Document upload          │     │
│  │  · View resolution  │    │  · Embedding status         │     │
│  └─────────────────────┘    └─────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Repository Structure

```
tickets_project/
├── backend/                          # FastAPI application
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app entry, CORS, lifespan
│   │   ├── config.py                 # Pydantic settings (env vars)
│   │   ├── dependencies.py           # Dependency injection (DB, Redis, etc.)
│   │   │
│   │   ├── api/                      # API route modules
│   │   │   ├── __init__.py
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── tickets.py        # CRUD + submission + status
│   │   │   │   ├── agents.py         # Manual agent triggers, retries
│   │   │   │   ├── analytics.py      # NL query endpoint
│   │   │   │   ├── knowledge.py      # KB article CRUD, doc upload
│   │   │   │   ├── webhooks.py       # Email / Slack intake
│   │   │   │   ├── users.py          # User profile, team management
│   │   │   │   └── health.py         # Health + readiness probes
│   │   │   └── router.py             # Aggregate v1 router
│   │   │
│   │   ├── models/                   # Pydantic schemas (request/response)
│   │   │   ├── __init__.py
│   │   │   ├── ticket.py
│   │   │   ├── agent.py
│   │   │   ├── analytics.py
│   │   │   ├── knowledge.py
│   │   │   ├── user.py
│   │   │   └── webhook.py
│   │   │
│   │   ├── services/                 # Business logic layer
│   │   │   ├── __init__.py
│   │   │   ├── ticket_service.py     # Ticket lifecycle management
│   │   │   ├── knowledge_service.py  # KB article + embedding pipeline
│   │   │   ├── sla_service.py        # SLA calculation + breach detection
│   │   │   ├── notification_service.py  # Email/Slack/in-app notifications
│   │   │   └── analytics_service.py  # Query execution + caching
│   │   │
│   │   ├── agents/                   # LangGraph agent definitions
│   │   │   ├── __init__.py
│   │   │   ├── graph.py              # Main StateGraph definition
│   │   │   ├── state.py              # TypedDict agent state schema
│   │   │   ├── nodes/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── triage.py         # Triage agent node
│   │   │   │   ├── router.py         # Router agent node
│   │   │   │   ├── resolver.py       # Resolver agent node (RAG)
│   │   │   │   ├── escalation.py     # Escalation agent node
│   │   │   │   ├── analytics.py      # Analytics agent node (NL→SQL)
│   │   │   │   └── feedback.py       # Feedback loop node
│   │   │   ├── edges.py              # Conditional edge functions
│   │   │   ├── tools/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── rag_search.py     # pgvector similarity search
│   │   │   │   ├── sql_query.py      # Controlled SQL execution
│   │   │   │   ├── duplicate_detector.py  # Embedding cosine similarity
│   │   │   │   ├── sla_calculator.py # SLA time computation
│   │   │   │   └── notifier.py       # Send notifications
│   │   │   └── prompts/
│   │   │       ├── triage.py         # System prompts for triage
│   │   │       ├── router.py         # Prompts for routing decisions
│   │   │       ├── resolver.py       # Prompts for resolution drafts
│   │   │       ├── escalation.py     # Prompts for escalation briefs
│   │   │       └── analytics.py      # Prompts for NL→SQL
│   │   │
│   │   ├── db/                       # Database layer
│   │   │   ├── __init__.py
│   │   │   ├── supabase.py           # Supabase client singleton
│   │   │   ├── redis.py              # Redis client + queue helpers
│   │   │   └── repositories/
│   │   │       ├── __init__.py
│   │   │       ├── ticket_repo.py
│   │   │       ├── knowledge_repo.py
│   │   │       ├── user_repo.py
│   │   │       ├── audit_repo.py
│   │   │       └── analytics_repo.py
│   │   │
│   │   ├── workers/                  # Background task workers
│   │   │   ├── __init__.py
│   │   │   ├── ticket_processor.py   # Redis queue consumer
│   │   │   ├── embedding_worker.py   # Document → embedding pipeline
│   │   │   ├── sla_checker.py        # Periodic SLA breach scanner
│   │   │   └── email_poller.py       # IMAP email intake polling
│   │   │
│   │   └── middleware/
│   │       ├── __init__.py
│   │       ├── auth.py               # Supabase JWT verification
│   │       ├── rate_limit.py         # Redis-backed rate limiting
│   │       └── logging.py            # Request/response logging
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_agents/
│   │   ├── test_api/
│   │   └── test_services/
│   │
│   ├── alembic/                      # DB migrations (optional, Supabase handles these)
│   ├── pyproject.toml
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                         # Next.js 14 application
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout + providers
│   │   │   ├── page.tsx              # Landing / redirect
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (customer)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── tickets/
│   │   │   │   │   ├── page.tsx      # My tickets list
│   │   │   │   │   ├── new/page.tsx  # Submit new ticket
│   │   │   │   │   └── [id]/page.tsx # Ticket detail + status
│   │   │   │   └── profile/page.tsx
│   │   │   ├── (agent)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── dashboard/page.tsx      # Agent queue dashboard
│   │   │   │   ├── tickets/
│   │   │   │   │   └── [id]/page.tsx       # Review + approve/edit/reject
│   │   │   │   └── knowledge/
│   │   │   │       ├── page.tsx            # KB article list
│   │   │   │       └── [id]/page.tsx       # Article editor
│   │   │   ├── (manager)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── analytics/page.tsx      # NL query analytics
│   │   │   │   ├── sla/page.tsx            # SLA dashboard
│   │   │   │   ├── teams/page.tsx          # Team management
│   │   │   │   └── reports/page.tsx        # Generated reports
│   │   │   └── api/                        # Next.js API routes (BFF)
│   │   │       └── auth/
│   │   │           └── callback/route.ts   # OAuth callback handler
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                   # Shared primitives (shadcn/ui)
│   │   │   ├── tickets/
│   │   │   │   ├── TicketForm.tsx
│   │   │   │   ├── TicketCard.tsx
│   │   │   │   ├── TicketDetail.tsx
│   │   │   │   ├── TicketQueue.tsx
│   │   │   │   ├── TicketTimeline.tsx
│   │   │   │   ├── AIDraftReview.tsx
│   │   │   │   └── StatusBadge.tsx
│   │   │   ├── analytics/
│   │   │   │   ├── NLQueryInput.tsx
│   │   │   │   ├── QueryResult.tsx
│   │   │   │   ├── SLAChart.tsx
│   │   │   │   ├── TrendChart.tsx
│   │   │   │   └── KPICards.tsx
│   │   │   ├── knowledge/
│   │   │   │   ├── ArticleEditor.tsx
│   │   │   │   ├── ArticleList.tsx
│   │   │   │   └── DocumentUpload.tsx
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── NotificationBell.tsx
│   │   │   │   └── BreadcrumbNav.tsx
│   │   │   └── shared/
│   │   │       ├── LoadingSpinner.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       └── ErrorBoundary.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts         # Browser Supabase client
│   │   │   │   ├── server.ts         # Server-side Supabase client
│   │   │   │   └── middleware.ts     # Auth session refresh
│   │   │   ├── api.ts                # FastAPI HTTP client wrapper
│   │   │   ├── types.ts              # Shared TypeScript types
│   │   │   └── utils.ts              # Formatters, helpers
│   │   │
│   │   ├── hooks/
│   │   │   ├── useTickets.ts
│   │   │   ├── useRealtimeTicket.ts  # Supabase Realtime subscription
│   │   │   ├── useAnalytics.ts
│   │   │   ├── useAuth.ts
│   │   │   └── useNotifications.ts
│   │   │
│   │   └── stores/
│   │       ├── authStore.ts          # Zustand auth state
│   │       └── ticketStore.ts        # Zustand ticket filters/pagination
│   │
│   ├── public/
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── supabase/                         # Supabase project config
│   ├── migrations/                   # SQL migration files
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   ├── 003_functions.sql
│   │   └── 004_pgvector_setup.sql
│   ├── seed.sql                      # Development seed data
│   └── config.toml
│
├── docker-compose.yml                # Local dev orchestration
├── .env.example
├── README.md
└── plan.md                           # This file
```

---

## 4. Database Schema (Supabase)

### 4.1 Extensions Required

```sql
CREATE EXTENSION IF NOT EXISTS vector;          -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;         -- Trigram for fuzzy text search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID generation
```

### 4.2 Core Tables

#### `users` (extends Supabase auth.users)

```sql
CREATE TABLE public.profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    avatar_url      TEXT,
    role            TEXT NOT NULL CHECK (role IN ('customer', 'agent', 'manager', 'admin')),
    company_name    TEXT,                   -- customer's business name (if applicable)
    team_id         UUID REFERENCES public.teams(id),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `teams`

```sql
CREATE TABLE public.teams (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    specialization  TEXT[],             -- e.g. ['payments', 'disputes', 'account', 'compliance']
    sla_config      JSONB DEFAULT '{}', -- per-team SLA overrides
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `tickets`

```sql
CREATE TABLE public.tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Submitter info
    submitter_id    UUID NOT NULL REFERENCES public.profiles(id),
    source          TEXT NOT NULL CHECK (source IN ('web', 'email', 'slack')),
    
    -- Content
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    attachments     TEXT[] DEFAULT '{}',       -- Supabase Storage paths
    
    -- AI-enriched fields (set by triage agent)
    category        TEXT,                       -- e.g. 'payments', 'transactions', 'account', 'disputes', 'compliance'
    subcategory     TEXT,
    priority        TEXT CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    urgency_score   FLOAT,                     -- 0.0–1.0 (AI confidence)
    sentiment       TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'frustrated')),
    
    -- Routing
    status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                        'new', 'triaging', 'routing', 'resolving',
                        'escalated', 'pending_review', 'approved',
                        'rejected', 'resolved', 'closed', 'reopened'
                    )),
    resolution_type TEXT CHECK (resolution_type IN ('auto', 'human', 'hybrid')),
    assigned_team_id UUID REFERENCES public.teams(id),
    assigned_agent_id UUID REFERENCES public.profiles(id),
    
    -- Duplicate detection
    is_duplicate    BOOLEAN DEFAULT false,
    duplicate_of    UUID REFERENCES public.tickets(id),
    
    -- SLA
    sla_deadline    TIMESTAMPTZ,
    sla_breached    BOOLEAN DEFAULT false,
    
    -- Resolution
    ai_draft        TEXT,                       -- AI-generated resolution draft
    final_response  TEXT,                       -- Approved / human-written response
    resolution_notes TEXT,
    
    -- Metadata
    tags            TEXT[] DEFAULT '{}',
    metadata        JSONB DEFAULT '{}',         -- Flexible extra data
    
    -- Embedding for duplicate detection
    embedding       vector(1536),               -- OpenAI text-embedding-3-small
    
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_priority ON public.tickets(priority);
CREATE INDEX idx_tickets_submitter ON public.tickets(submitter_id);
CREATE INDEX idx_tickets_assigned_agent ON public.tickets(assigned_agent_id);
CREATE INDEX idx_tickets_assigned_team ON public.tickets(assigned_team_id);
CREATE INDEX idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX idx_tickets_sla_deadline ON public.tickets(sla_deadline) WHERE sla_breached = false;
CREATE INDEX idx_tickets_embedding ON public.tickets USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### `ticket_events` (audit trail / timeline)

```sql
CREATE TABLE public.ticket_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL CHECK (event_type IN (
                        'created', 'triaged', 'routed', 'auto_resolved',
                        'escalated', 'draft_generated', 'draft_approved',
                        'draft_rejected', 'draft_edited', 'human_resolved',
                        'reopened', 'closed', 'sla_warning', 'sla_breached',
                        'assigned', 'reassigned', 'comment_added',
                        'status_changed', 'priority_changed', 'feedback_logged'
                    )),
    actor_type      TEXT NOT NULL CHECK (actor_type IN ('system', 'agent_ai', 'user')),
    actor_id        TEXT,                    -- User UUID or agent name
    data            JSONB DEFAULT '{}',      -- Event-specific payload
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_ticket ON public.ticket_events(ticket_id, created_at DESC);
```

#### `ticket_comments`

```sql
CREATE TABLE public.ticket_comments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_id       UUID REFERENCES public.profiles(id),
    author_type     TEXT NOT NULL CHECK (author_type IN ('customer', 'agent', 'system', 'ai')),
    body            TEXT NOT NULL,
    is_internal     BOOLEAN DEFAULT false,   -- Internal agent notes vs. customer-visible
    attachments     TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `knowledge_articles`

```sql
CREATE TABLE public.knowledge_articles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    category        TEXT NOT NULL,
    tags            TEXT[] DEFAULT '{}',
    source_type     TEXT CHECK (source_type IN ('manual', 'ticket_resolution', 'document', 'policy')),
    source_ticket_id UUID REFERENCES public.tickets(id),
    status          TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
    author_id       UUID REFERENCES public.profiles(id),
    view_count      INTEGER DEFAULT 0,
    helpfulness_score FLOAT DEFAULT 0.0,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `knowledge_chunks` (for RAG)

```sql
CREATE TABLE public.knowledge_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id      UUID NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    embedding       vector(1536),
    token_count     INTEGER,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_embedding ON public.knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_article ON public.knowledge_chunks(article_id);
```

#### `agent_runs` (LangGraph execution log)

```sql
CREATE TABLE public.agent_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    run_id          TEXT NOT NULL,             -- LangGraph run ID
    langsmith_url   TEXT,                      -- Direct link to trace
    graph_name      TEXT NOT NULL,             -- 'ticket_pipeline'
    status          TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    input_state     JSONB,
    output_state    JSONB,
    nodes_executed  TEXT[] DEFAULT '{}',       -- Ordered list of nodes hit
    total_tokens    INTEGER DEFAULT 0,
    total_cost      FLOAT DEFAULT 0.0,
    error_message   TEXT,
    duration_ms     INTEGER,
    started_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_agent_runs_ticket ON public.agent_runs(ticket_id);
```

#### `sla_policies`

```sql
CREATE TABLE public.sla_policies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    priority        TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    first_response_hours INTEGER NOT NULL,     -- Hours until first response due
    resolution_hours INTEGER NOT NULL,         -- Hours until resolution due
    business_hours_only BOOLEAN DEFAULT true,
    is_default      BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed default SLA policies
INSERT INTO public.sla_policies (name, priority, first_response_hours, resolution_hours, is_default) VALUES
    ('Critical SLA', 'critical', 1, 4, true),
    ('High SLA', 'high', 4, 24, true),
    ('Medium SLA', 'medium', 8, 48, true),
    ('Low SLA', 'low', 24, 120, true);
```

#### `notifications`

```sql
CREATE TABLE public.notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN (
                        'ticket_assigned', 'ticket_escalated', 'sla_warning',
                        'sla_breach', 'draft_ready', 'ticket_resolved',
                        'ticket_reopened', 'mention', 'system'
                    )),
    title           TEXT NOT NULL,
    body            TEXT,
    ticket_id       UUID REFERENCES public.tickets(id),
    is_read         BOOLEAN DEFAULT false,
    action_url      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
```

### 4.3 Row-Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Customers can only see their own tickets
CREATE POLICY "customers_own_tickets" ON public.tickets
    FOR SELECT USING (
        submitter_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('agent', 'manager', 'admin')
        )
    );

-- Agents can see tickets assigned to them or their team
CREATE POLICY "agents_team_tickets" ON public.tickets
    FOR SELECT USING (
        assigned_agent_id = auth.uid()
        OR assigned_team_id IN (
            SELECT team_id FROM public.profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('manager', 'admin')
        )
    );

-- Notifications: users can only see their own
CREATE POLICY "own_notifications" ON public.notifications
    FOR ALL USING (user_id = auth.uid());
```

### 4.4 Database Functions

```sql
-- Similarity search for RAG
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    article_id UUID,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id,
        kc.article_id,
        kc.content,
        1 - (kc.embedding <=> query_embedding) AS similarity
    FROM public.knowledge_chunks kc
    JOIN public.knowledge_articles ka ON ka.id = kc.article_id
    WHERE ka.status = 'active'
        AND 1 - (kc.embedding <=> query_embedding) > match_threshold
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Duplicate ticket detection
CREATE OR REPLACE FUNCTION find_duplicate_tickets(
    query_embedding vector(1536),
    similarity_threshold FLOAT DEFAULT 0.92,
    time_window_hours INT DEFAULT 72
)
RETURNS TABLE (
    id UUID,
    subject TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.subject,
        1 - (t.embedding <=> query_embedding) AS similarity
    FROM public.tickets t
    WHERE t.status NOT IN ('closed', 'resolved')
        AND t.created_at > now() - (time_window_hours || ' hours')::INTERVAL
        AND 1 - (t.embedding <=> query_embedding) > similarity_threshold
    ORDER BY t.embedding <=> query_embedding
    LIMIT 5;
END;
$$;
```

---

## 5. Backend — FastAPI

### 5.1 Application Entry Point

```python
# backend/app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router
from app.config import settings
from app.db.supabase import init_supabase
from app.db.redis import init_redis
from app.workers.ticket_processor import start_worker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_supabase()
    await init_redis()
    worker_task = asyncio.create_task(start_worker())
    yield
    # Shutdown
    worker_task.cancel()

app = FastAPI(
    title="AI Ticket System API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
```

### 5.2 Configuration

```python
# backend/app/config.py

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str       # Service role key (backend only)
    SUPABASE_ANON_KEY: str
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # LLM
    OPENAI_API_KEY: str
    LLM_MODEL: str = "gpt-4o"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    
    # LangSmith
    LANGSMITH_API_KEY: str
    LANGSMITH_PROJECT: str = "ticket-system"
    LANGCHAIN_TRACING_V2: str = "true"
    
    # App
    FRONTEND_URL: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"
    
    # Email intake
    IMAP_HOST: str = ""
    IMAP_USER: str = ""
    IMAP_PASSWORD: str = ""
    
    # Slack
    SLACK_BOT_TOKEN: str = ""
    SLACK_SIGNING_SECRET: str = ""

    class Config:
        env_file = ".env"
```

### 5.3 Key API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/v1/tickets` | Submit new ticket | Customer+ |
| `GET` | `/api/v1/tickets` | List tickets (filtered by role) | All |
| `GET` | `/api/v1/tickets/{id}` | Get ticket detail + timeline | Owner/Agent/Manager |
| `PATCH` | `/api/v1/tickets/{id}` | Update ticket fields | Agent/Manager |
| `POST` | `/api/v1/tickets/{id}/approve` | Approve AI draft | Agent |
| `POST` | `/api/v1/tickets/{id}/reject` | Reject AI draft (sends back to agent pipeline) | Agent |
| `POST` | `/api/v1/tickets/{id}/edit-resolve` | Edit draft + resolve | Agent |
| `POST` | `/api/v1/tickets/{id}/reopen` | Reopen a resolved ticket | Customer/Agent |
| `POST` | `/api/v1/tickets/{id}/comment` | Add comment to ticket | All |
| `POST` | `/api/v1/tickets/{id}/retry` | Re-run agent pipeline | Agent/Manager |
| `GET` | `/api/v1/tickets/queue` | Agent queue (escalated tickets) | Agent+ |
| `POST` | `/api/v1/analytics/query` | Natural language analytics query | Manager |
| `GET` | `/api/v1/analytics/dashboard` | Pre-computed dashboard metrics | Manager |
| `GET` | `/api/v1/analytics/sla` | SLA compliance report | Manager |
| `GET` | `/api/v1/knowledge` | List KB articles | Agent+ |
| `POST` | `/api/v1/knowledge` | Create KB article | Agent+ |
| `PUT` | `/api/v1/knowledge/{id}` | Update KB article | Agent+ |
| `POST` | `/api/v1/knowledge/upload` | Upload document for embedding | Agent+ |
| `POST` | `/api/v1/webhooks/email` | Email intake webhook | Webhook secret |
| `POST` | `/api/v1/webhooks/slack` | Slack events webhook | Slack signing |
| `GET` | `/api/v1/notifications` | Get user notifications | All |
| `PATCH` | `/api/v1/notifications/{id}/read` | Mark notification read | Owner |

### 5.4 Ticket Submission Flow (Example Service)

```python
# backend/app/services/ticket_service.py

class TicketService:
    async def create_ticket(self, data: TicketCreate, user_id: str) -> Ticket:
        # 1. Generate embedding for duplicate detection
        embedding = await self.embed(data.subject + " " + data.body)
        
        # 2. Insert ticket into Supabase
        ticket = await self.ticket_repo.create({
            "submitter_id": user_id,
            "subject": data.subject,
            "body": data.body,
            "source": data.source,
            "status": "new",
            "attachments": data.attachment_urls,
            "embedding": embedding,
        })
        
        # 3. Log creation event
        await self.audit_repo.log_event(ticket.id, "created", "user", user_id)
        
        # 4. Push to Redis queue for agent processing
        await self.redis.enqueue("ticket:process", {
            "ticket_id": str(ticket.id),
            "action": "full_pipeline",
        })
        
        # 5. Notify via Supabase Realtime (automatic via DB trigger)
        return ticket
```

---

## 6. Agent Processing Layer — LangGraph

### 6.1 Agent State Schema

```python
# backend/app/agents/state.py

from typing import TypedDict, Optional, Literal
from langgraph.graph import MessagesState

class TicketAgentState(TypedDict):
    # Input
    ticket_id: str
    subject: str
    body: str
    source: str
    submitter_id: str
    attachments: list[str]
    
    # Triage outputs
    category: Optional[str]
    subcategory: Optional[str]
    priority: Optional[Literal["critical", "high", "medium", "low"]]
    urgency_score: Optional[float]
    sentiment: Optional[str]
    is_duplicate: Optional[bool]
    duplicate_of: Optional[str]
    
    # Router outputs
    route_decision: Optional[Literal["auto_resolve", "escalate"]]
    confidence_score: Optional[float]
    assigned_team_id: Optional[str]
    
    # Resolver outputs
    rag_context: Optional[list[dict]]       # Retrieved knowledge chunks
    ai_draft: Optional[str]                  # Draft resolution response
    resolution_confidence: Optional[float]
    
    # Escalation outputs
    escalation_brief: Optional[str]
    sla_deadline: Optional[str]
    assigned_agent_id: Optional[str]
    
    # Feedback
    human_feedback: Optional[str]
    feedback_type: Optional[Literal["approved", "rejected", "edited"]]
    
    # Control flow
    iteration_count: int
    max_iterations: int
    error: Optional[str]
    messages: list                           # LangGraph message history
```

### 6.2 Graph Definition

```python
# backend/app/agents/graph.py

from langgraph.graph import StateGraph, END
from app.agents.state import TicketAgentState
from app.agents.nodes import triage, router, resolver, escalation, feedback
from app.agents.edges import route_decision, should_continue

def build_ticket_pipeline() -> StateGraph:
    graph = StateGraph(TicketAgentState)
    
    # Add nodes
    graph.add_node("triage", triage.run)
    graph.add_node("router", router.run)
    graph.add_node("resolver", resolver.run)
    graph.add_node("escalation", escalation.run)
    graph.add_node("feedback", feedback.run)
    
    # Edges: linear triage → router
    graph.add_edge("triage", "router")
    
    # Conditional: router decides path
    graph.add_conditional_edges(
        "router",
        route_decision,
        {
            "auto_resolve": "resolver",
            "escalate": "escalation",
        }
    )
    
    # Resolver → feedback (log + update RAG)
    graph.add_edge("resolver", "feedback")
    
    # Escalation → END (waits for human; re-entry handled externally)
    graph.add_edge("escalation", END)
    
    # Feedback → END
    graph.add_edge("feedback", END)
    
    # Entry point
    graph.set_entry_point("triage")
    
    return graph.compile()

# Singleton compiled graph
ticket_pipeline = build_ticket_pipeline()
```

### 6.3 Agent Node Implementations

#### Triage Agent

```python
# backend/app/agents/nodes/triage.py

from langchain_openai import ChatOpenAI
from app.agents.state import TicketAgentState
from app.agents.prompts.triage import TRIAGE_SYSTEM_PROMPT
from app.agents.tools.duplicate_detector import find_duplicates

async def run(state: TicketAgentState) -> dict:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    
    # 1. Check for duplicates via embedding similarity
    duplicates = await find_duplicates(state["ticket_id"])
    
    # 2. Classify ticket
    response = await llm.ainvoke([
        {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
        {"role": "user", "content": f"""
            Subject: {state["subject"]}
            Body: {state["body"]}
            Source: {state["source"]}
            
            Potential duplicates found: {len(duplicates)}
            {format_duplicates(duplicates) if duplicates else "None"}
        """}
    ])
    
    # 3. Parse structured output
    classification = parse_triage_output(response)
    
    # 4. Update ticket in DB
    await update_ticket(state["ticket_id"], {
        "status": "triaging",
        "category": classification.category,
        "subcategory": classification.subcategory,
        "priority": classification.priority,
        "urgency_score": classification.urgency_score,
        "sentiment": classification.sentiment,
        "is_duplicate": len(duplicates) > 0,
        "duplicate_of": duplicates[0]["id"] if duplicates else None,
    })
    
    return {
        "category": classification.category,
        "subcategory": classification.subcategory,
        "priority": classification.priority,
        "urgency_score": classification.urgency_score,
        "sentiment": classification.sentiment,
        "is_duplicate": len(duplicates) > 0,
        "duplicate_of": duplicates[0]["id"] if duplicates else None,
    }
```

#### Router Agent

```python
# backend/app/agents/nodes/router.py

async def run(state: TicketAgentState) -> dict:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    
    # Decide: can this be auto-resolved or should it be escalated?
    response = await llm.ainvoke([
        {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
        {"role": "user", "content": f"""
            Category: {state["category"]}
            Priority: {state["priority"]}
            Urgency Score: {state["urgency_score"]}
            Is Duplicate: {state["is_duplicate"]}
            Sentiment: {state["sentiment"]}
            Subject: {state["subject"]}
            Body: {state["body"]}
        """}
    ])
    
    decision = parse_router_output(response)
    
    # Assign to team
    team = await find_best_team(state["category"], state["subcategory"])
    
    await update_ticket(state["ticket_id"], {
        "status": "routing",
        "assigned_team_id": team.id if team else None,
    })
    
    return {
        "route_decision": decision.route,        # "auto_resolve" or "escalate"
        "confidence_score": decision.confidence,
        "assigned_team_id": str(team.id) if team else None,
    }
```

#### Resolver Agent (RAG-powered)

```python
# backend/app/agents/nodes/resolver.py

from app.agents.tools.rag_search import search_knowledge_base

async def run(state: TicketAgentState) -> dict:
    llm = ChatOpenAI(model="gpt-4o", temperature=0.3)
    
    # 1. Search RAG knowledge base
    query = f"{state['subject']} {state['body']}"
    rag_results = await search_knowledge_base(query, top_k=8)
    
    # 2. Build context from retrieved chunks
    context = "\n\n---\n\n".join([
        f"[Source: {r['article_title']}]\n{r['content']}"
        for r in rag_results
    ])
    
    # 3. Generate draft resolution
    response = await llm.ainvoke([
        {"role": "system", "content": RESOLVER_SYSTEM_PROMPT},
        {"role": "user", "content": f"""
            TICKET:
            Subject: {state["subject"]}
            Body: {state["body"]}
            Category: {state["category"]}
            Priority: {state["priority"]}
            
            KNOWLEDGE BASE CONTEXT:
            {context if context else "No relevant articles found."}
            
            Generate a helpful, accurate resolution response for the customer.
        """}
    ])
    
    draft = response.content
    
    # 4. Update ticket
    await update_ticket(state["ticket_id"], {
        "status": "resolved",
        "resolution_type": "auto",
        "ai_draft": draft,
        "final_response": draft,
        "resolved_at": datetime.utcnow().isoformat(),
    })
    
    return {
        "rag_context": rag_results,
        "ai_draft": draft,
        "resolution_confidence": calculate_confidence(rag_results),
    }
```

#### Escalation Agent

```python
# backend/app/agents/nodes/escalation.py

async def run(state: TicketAgentState) -> dict:
    llm = ChatOpenAI(model="gpt-4o", temperature=0.2)
    
    # 1. Generate escalation brief for human agent
    response = await llm.ainvoke([
        {"role": "system", "content": ESCALATION_SYSTEM_PROMPT},
        {"role": "user", "content": f"""
            Subject: {state["subject"]}
            Body: {state["body"]}
            Category: {state["category"]}
            Priority: {state["priority"]}
            Sentiment: {state["sentiment"]}
            Router confidence: {state["confidence_score"]}
            
            Write a concise brief for the human agent including:
            - Summary of the issue
            - Why auto-resolution was not appropriate
            - Suggested approach
            - Relevant context from knowledge base
        """}
    ])
    
    brief = response.content
    
    # 2. Calculate SLA deadline
    sla_deadline = await calculate_sla_deadline(state["priority"])
    
    # 3. Find and assign best available agent
    agent = await find_available_agent(state["assigned_team_id"])
    
    # 4. Update ticket
    await update_ticket(state["ticket_id"], {
        "status": "escalated",
        "escalation_brief": brief,
        "ai_draft": brief,      # Pre-populate draft for human edit
        "sla_deadline": sla_deadline.isoformat(),
        "assigned_agent_id": agent.id if agent else None,
    })
    
    # 5. Send notifications
    if agent:
        await send_notification(agent.id, {
            "type": "ticket_escalated",
            "title": f"Escalated: {state['subject']}",
            "body": f"Priority: {state['priority']} — needs your review",
            "ticket_id": state["ticket_id"],
        })
    
    return {
        "escalation_brief": brief,
        "sla_deadline": sla_deadline.isoformat(),
        "assigned_agent_id": str(agent.id) if agent else None,
    }
```

#### Analytics Agent (NL → SQL)

```python
# backend/app/agents/nodes/analytics.py

async def run_analytics_query(question: str, user_id: str) -> dict:
    """Standalone agent called from analytics endpoint, not part of ticket pipeline."""
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    
    # 1. Generate safe SQL from natural language
    response = await llm.ainvoke([
        {"role": "system", "content": ANALYTICS_SYSTEM_PROMPT},
        {"role": "user", "content": f"""
            User question: {question}
            
            Available tables: tickets, ticket_events, profiles, teams, sla_policies
            
            Rules:
            - Only SELECT queries allowed
            - No mutations
            - Always include reasonable LIMIT
            - Return the SQL and a natural language explanation
        """}
    ])
    
    # 2. Validate and sanitize SQL
    sql = extract_and_validate_sql(response.content)
    
    # 3. Execute against read-only connection
    results = await execute_readonly_query(sql)
    
    # 4. Generate natural language summary of results
    summary = await llm.ainvoke([
        {"role": "system", "content": "Summarize these query results in plain English."},
        {"role": "user", "content": f"Question: {question}\nResults: {results}"}
    ])
    
    return {
        "question": question,
        "sql": sql,
        "results": results,
        "summary": summary.content,
    }
```

### 6.4 Conditional Edges

```python
# backend/app/agents/edges.py

from app.agents.state import TicketAgentState

def route_decision(state: TicketAgentState) -> str:
    """Router agent decides: auto-resolve or escalate."""
    if state.get("is_duplicate"):
        return "auto_resolve"       # Duplicates auto-resolve with reference
    
    return state.get("route_decision", "escalate")

def should_continue(state: TicketAgentState) -> str:
    """After human feedback, decide whether to loop back or finish."""
    if state.get("feedback_type") == "rejected":
        if state.get("iteration_count", 0) < state.get("max_iterations", 3):
            return "resolver"       # Try again with feedback
        return "escalation"         # Max retries, escalate to human
    
    return "end"
```

### 6.5 Feedback Loop Node

```python
# backend/app/agents/nodes/feedback.py

async def run(state: TicketAgentState) -> dict:
    """Log outcome and optionally update RAG knowledge base."""
    
    # 1. Log the resolution event
    await log_event(state["ticket_id"], "feedback_logged", "agent_ai", "feedback_agent", {
        "resolution_type": state.get("resolution_type", "auto"),
        "rag_chunks_used": len(state.get("rag_context", [])),
    })
    
    # 2. If resolution was high-quality, add to knowledge base
    if state.get("resolution_confidence", 0) > 0.85:
        await create_knowledge_article({
            "title": f"Resolution: {state['subject']}",
            "content": state["ai_draft"],
            "category": state["category"],
            "source_type": "ticket_resolution",
            "source_ticket_id": state["ticket_id"],
        })
    
    # 3. If human corrected the draft, learn from correction
    if state.get("feedback_type") == "edited":
        await create_knowledge_article({
            "title": f"Corrected Resolution: {state['subject']}",
            "content": state["human_feedback"],     # Human's corrected version
            "category": state["category"],
            "source_type": "ticket_resolution",
            "source_ticket_id": state["ticket_id"],
            "tags": ["human_corrected"],
        })
    
    return {"iteration_count": state.get("iteration_count", 0) + 1}
```

---

## 7. Frontend — Next.js

### 7.1 Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | Next.js 14 (App Router) | Server components, streaming, API routes |
| Styling | Tailwind CSS + shadcn/ui | Rapid prototyping, consistent design system |
| State Management | Zustand | Lightweight, no boilerplate |
| Data Fetching | TanStack Query (React Query) | Caching, optimistic updates, pagination |
| Charts | Recharts | Composable, responsive charts |
| Rich Text | Tiptap | KB article editor |
| Real-time | Supabase Realtime JS SDK | WebSocket ticket updates |
| Auth | Supabase Auth + Next.js middleware | Session management, JWT |

### 7.2 Layout & Navigation

```
┌──────────────────────────────────────────────────────────────┐
│  Header  [Logo]  [Search tickets...]   [🔔 3]  [Avatar ▼]  │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ Sidebar  │  Main Content Area                                │
│          │                                                   │
│ 📋 Queue │  ┌─────────────────────────────────────────────┐  │
│ 🎫 All   │  │                                             │  │
│ 📊 Stats │  │  Page content rendered here                 │  │
│ 📚 KB    │  │  with breadcrumb navigation                 │  │
│ 👥 Teams │  │                                             │  │
│ ⚙️ Settng│  │                                             │  │
│          │  │                                             │  │
│          │  └─────────────────────────────────────────────┘  │
└──────────┴───────────────────────────────────────────────────┘
```

### 7.3 Key Pages

#### Customer Portal — Submit Ticket (`/tickets/new`)

```
┌─────────────────────────────────────────────────┐
│  Submit a Support Ticket                        │
│                                                 │
│  Subject:    [________________________]         │
│                                                 │
│  Category:   [Select category  ▼]               │
│                                                 │
│  Description:                                   │
│  ┌─────────────────────────────────────────┐    │
│  │ Rich text editor                        │    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Attachments: [📎 Upload files]                 │
│                                                 │
│  [Submit Ticket]                                │
└─────────────────────────────────────────────────┘
```

#### Customer Portal — Ticket Detail (`/tickets/[id]`)

```
┌──────────────────────────────────────────────────────────────┐
│  🎫 "Payment declined but amount deducted from account"      │
│  Status: ✅ Resolved  ·  Priority: 🔴 High  ·  Auto-resolved │
│                                                               │
│  ┌─── Timeline ──────────────────────────────────────────┐   │
│  │ ● 10:30 AM  Ticket submitted                          │   │
│  │ ● 10:30 AM  AI triaged: Payments > Declined > High    │   │
│  │ ● 10:31 AM  Auto-resolved with knowledge base         │   │
│  │ ● 10:31 AM  Resolution sent                           │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  Resolution:                                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ We've reviewed your transaction and can confirm the    │   │
│  │ charge is a temporary hold that will be released:      │   │
│  │ 1. Holds typically clear within 3–5 business days      │   │
│  │ 2. Your payment was not completed on the merchant side │   │
│  │ 3. Contact us if the hold remains after 5 days...      │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  [😊 Helpful] [😐 Somewhat] [😞 Not helpful] [🔄 Reopen]     │
└──────────────────────────────────────────────────────────────┘
```

#### Agent Dashboard — Queue (`/dashboard`)

```
┌──────────────────────────────────────────────────────────────┐
│  Agent Queue                      [Filter ▼] [Sort: SLA ▼]  │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 🔴 CRITICAL  ·  ⏰ SLA: 45min left                      ││
│  │ "Merchant unable to process any payments since 3am"     ││
│  │ Escalated → Payments Ops  ·  [View Brief] [Claim]       ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ 🟠 HIGH  ·  ⏰ SLA: 4h left                             ││
│  │ "Customer disputing $2,400 charge — requests refund"    ││
│  │ Escalated → Disputes  ·  [View Brief] [Claim]           ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ 🟡 MEDIUM  ·  ⏰ SLA: 12h left                          ││
│  │ "Unable to link bank account for payouts"               ││
│  │ Escalated → Account Ops  ·  [View Brief] [Claim]        ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  Showing 3 of 12 escalated tickets  ·  [Load more]          │
└──────────────────────────────────────────────────────────────┘
```

#### Agent — Review AI Draft (`/tickets/[id]`)

```
┌──────────────────────────────────────────────────────────────┐
│  Review Escalated Ticket                                      │
│                                                               │
│  ┌── AI Brief ───────────────────────────────────────────┐   │
│  │ SUMMARY: Customer disputing $2,400 charge from        │   │
│  │ merchant "TechStore Ltd" on March 15. Customer claims  │   │
│  │ they cancelled the order but were still charged.       │   │
│  │                                                        │   │
│  │ WHY ESCALATED: Requires transaction log verification   │   │
│  │ and merchant-side confirmation — not in knowledge base  │   │
│  │                                                        │   │
│  │ SUGGESTED APPROACH:                                    │   │
│  │ 1. Pull transaction ID from payment gateway logs       │   │
│  │ 2. Verify cancellation status with merchant API        │   │
│  │ 3. Initiate chargeback if merchant confirms cancel     │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌── Draft Response (editable) ──────────────────────────┐   │
│  │ Hi [Customer Name],                                    │   │
│  │                                                        │   │
│  │ I've reviewed your dispute and can confirm...          │   │
│  │ [editable rich text area]                              │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  [✅ Approve & Send]  [✏️ Edit & Send]  [❌ Reject Draft]     │
└──────────────────────────────────────────────────────────────┘
```

#### Manager — Analytics Dashboard (`/analytics`)

```
┌──────────────────────────────────────────────────────────────┐
│  Analytics Dashboard                                          │
│                                                               │
│  ┌── KPI Cards ──────────────────────────────────────────┐   │
│  │ 📊 Total: 1,247  │ ✅ Resolved: 89%  │ ⏰ Avg: 2.3h   │   │
│  │ 🤖 Auto: 72%     │ 🔴 SLA Breach: 3% │ 😊 CSAT: 4.2  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌── Natural Language Query ─────────────────────────────┐   │
│  │ Ask anything: ["Show me ticket trends by category     │   │
│  │                  for the last 30 days"           🔍]   │   │
│  │                                                        │   │
│  │ [Chart/Table response renders here]                    │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌── Trend Charts ───────────────────────────────────────┐   │
│  │ [Ticket volume over time chart]                        │   │
│  │ [Resolution type breakdown pie chart]                  │   │
│  │ [SLA compliance line chart]                            │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 7.4 Real-Time Subscriptions

```typescript
// frontend/src/hooks/useRealtimeTicket.ts

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useRealtimeTicket(ticketId: string, onUpdate: (ticket: any) => void) {
  useEffect(() => {
    const supabase = createClient()
    
    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${ticketId}`,
        },
        (payload) => {
          onUpdate(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_events',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          // New event added to timeline
          onUpdate(payload.new)
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [ticketId])
}
```

### 7.5 Supabase Auth Integration

```typescript
// frontend/src/lib/supabase/middleware.ts

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}
```

---

## 8. Intake Channels

### 8.1 Web Form (Primary)

- Built into the Next.js frontend at `/tickets/new`
- Direct API call to `POST /api/v1/tickets`
- File uploads go to Supabase Storage, URLs attached to ticket

### 8.2 Email Parser

```python
# backend/app/workers/email_poller.py

import asyncio
import imaplib
import email
from app.services.ticket_service import TicketService

class EmailPoller:
    """Polls IMAP inbox for new support emails and creates tickets."""
    
    POLL_INTERVAL = 60  # seconds
    
    async def poll_loop(self):
        while True:
            try:
                new_emails = await self.fetch_unread_emails()
                for mail in new_emails:
                    parsed = self.parse_email(mail)
                    await self.ticket_service.create_ticket_from_email(parsed)
                    await self.mark_as_read(mail.uid)
            except Exception as e:
                logger.error(f"Email poll error: {e}")
            
            await asyncio.sleep(self.POLL_INTERVAL)
    
    def parse_email(self, raw_email) -> dict:
        return {
            "subject": raw_email.subject,
            "body": raw_email.text_body or raw_email.html_body,
            "sender_email": raw_email.from_address,
            "attachments": raw_email.attachments,
            "source": "email",
            "metadata": {
                "message_id": raw_email.message_id,
                "in_reply_to": raw_email.in_reply_to,
            }
        }
```

### 8.3 Slack Bot

```python
# backend/app/api/v1/webhooks.py

from fastapi import APIRouter, Request, HTTPException
from app.services.ticket_service import TicketService

router = APIRouter()

@router.post("/webhooks/slack")
async def slack_webhook(request: Request):
    body = await request.json()
    
    # Verify Slack signature
    if not verify_slack_signature(request):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # URL verification challenge
    if body.get("type") == "url_verification":
        return {"challenge": body["challenge"]}
    
    # Handle app_mention events
    if body.get("event", {}).get("type") == "app_mention":
        event = body["event"]
        ticket = await TicketService().create_ticket({
            "subject": f"Slack request from #{event.get('channel', 'unknown')}",
            "body": event["text"],
            "source": "slack",
            "metadata": {
                "slack_channel": event["channel"],
                "slack_user": event["user"],
                "slack_ts": event["ts"],
            }
        }, user_id=await resolve_slack_user(event["user"]))
        
        # Reply in thread with ticket link
        await post_slack_message(
            channel=event["channel"],
            thread_ts=event["ts"],
            text=f"🎫 Ticket created: #{ticket.id[:8]} — I'll process this now!"
        )
    
    return {"ok": True}
```

---

## 9. RAG Knowledge Base

### 9.1 Document Ingestion Pipeline

```
Document Upload                     Manual Article Creation
      │                                      │
      ▼                                      ▼
┌───────────────┐                  ┌───────────────────┐
│ File Parser   │                  │ Direct DB Insert  │
│ (PDF, DOCX,   │                  │ + Chunking        │
│  TXT, MD)     │                  └─────────┬─────────┘
└───────┬───────┘                            │
        │                                    │
        ▼                                    ▼
┌───────────────────────────────────────────────────────┐
│              Chunking Pipeline                         │
│  Split by paragraphs → 512 token chunks               │
│  with 50-token overlap                                │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│           Embedding Generation                         │
│  OpenAI text-embedding-3-small (1536 dims)            │
│  Batch processing via background worker               │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│         Supabase pgvector Storage                      │
│  knowledge_chunks table with IVFFlat index             │
└───────────────────────────────────────────────────────┘
```

### 9.2 RAG Search Tool

```python
# backend/app/agents/tools/rag_search.py

from openai import AsyncOpenAI
from app.db.supabase import get_client

openai_client = AsyncOpenAI()

async def search_knowledge_base(query: str, top_k: int = 8, threshold: float = 0.7) -> list[dict]:
    """
    Perform semantic similarity search against the knowledge base.
    Returns ranked list of relevant knowledge chunks.
    """
    # 1. Embed the query
    response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=query
    )
    query_embedding = response.data[0].embedding
    
    # 2. Call Supabase pgvector similarity function
    supabase = get_client()
    result = supabase.rpc("match_knowledge_chunks", {
        "query_embedding": query_embedding,
        "match_threshold": threshold,
        "match_count": top_k,
    }).execute()
    
    # 3. Enrich with article metadata
    chunks = []
    for row in result.data:
        article = supabase.table("knowledge_articles") \
            .select("title, category, tags") \
            .eq("id", row["article_id"]) \
            .single() \
            .execute()
        
        chunks.append({
            "chunk_id": row["id"],
            "article_id": row["article_id"],
            "article_title": article.data["title"],
            "content": row["content"],
            "similarity": row["similarity"],
            "category": article.data["category"],
            "tags": article.data["tags"],
        })
    
    return chunks
```

### 9.3 Feedback-Driven KB Growth

When tickets are resolved (either auto or human), the feedback node:

1. **Auto-resolved with high confidence (>0.85)**: Adds to KB automatically
2. **Human-edited resolution**: Adds the corrected version with `human_corrected` tag (weighted higher in future searches)
3. **Human-written resolution**: Records as new knowledge article
4. **Resolution rated "not helpful"**: Marks the source KB articles for review

---

## 10. Queue & Background Processing

### 10.1 Redis Queue Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Redis Queues                         │
│                                                        │
│  ticket:process     → Main pipeline queue              │
│  ticket:retry       → Failed tickets retry queue       │
│  embedding:generate → Document embedding queue         │
│  notification:send  → Notification delivery queue      │
│  sla:check          → Periodic SLA breach scan         │
│                                                        │
│  Cache:                                                │
│  analytics:cache:{hash}  → Cached NL query results     │
│  rate:limit:{user_id}    → API rate limit counters     │
│  agent:availability      → Agent online status         │
│                                                        │
│  SLA Timers:                                           │
│  sla:timer:{ticket_id}   → Sorted set with deadlines  │
└────────────────────────────────────────────────────────┘
```

### 10.2 Queue Consumer (Worker)

```python
# backend/app/workers/ticket_processor.py

import asyncio
import json
from app.db.redis import get_redis
from app.agents.graph import ticket_pipeline
from app.agents.state import TicketAgentState

async def start_worker():
    redis = await get_redis()
    
    while True:
        # Block until a ticket is available (BRPOP)
        result = await redis.brpop("ticket:process", timeout=5)
        
        if result is None:
            continue
        
        _, raw_message = result
        message = json.loads(raw_message)
        
        try:
            ticket_id = message["ticket_id"]
            action = message.get("action", "full_pipeline")
            
            if action == "full_pipeline":
                await process_ticket(ticket_id)
            elif action == "retry_resolve":
                await retry_resolve(ticket_id, message.get("feedback"))
                
        except Exception as e:
            logger.error(f"Worker error for ticket {ticket_id}: {e}")
            # Push to retry queue with exponential backoff
            await redis.lpush("ticket:retry", json.dumps({
                **message,
                "retry_count": message.get("retry_count", 0) + 1,
                "error": str(e),
            }))

async def process_ticket(ticket_id: str):
    """Run the full LangGraph pipeline for a ticket."""
    # Fetch ticket data from Supabase
    ticket = await fetch_ticket(ticket_id)
    
    # Build initial state
    initial_state: TicketAgentState = {
        "ticket_id": ticket_id,
        "subject": ticket["subject"],
        "body": ticket["body"],
        "source": ticket["source"],
        "submitter_id": ticket["submitter_id"],
        "attachments": ticket.get("attachments", []),
        "iteration_count": 0,
        "max_iterations": 3,
        "messages": [],
    }
    
    # Run the pipeline with LangSmith tracing
    config = {
        "configurable": {"thread_id": ticket_id},
        "metadata": {"ticket_id": ticket_id},
    }
    
    result = await ticket_pipeline.ainvoke(initial_state, config=config)
    
    # Log the agent run record
    await log_agent_run(ticket_id, result)
```

---

## 11. Authentication & Authorization

### 11.1 Auth Flow

```
                 Supabase Auth
                      │
         ┌────────────┼────────────┐
         │            │            │
   Email/Password   OAuth      Magic Link
         │            │            │
         └────────────┼────────────┘
                      │
                      ▼
               JWT (Supabase)
                      │
          ┌───────────┼───────────┐
          │                       │
     Next.js (frontend)     FastAPI (backend)
     Supabase SSR client    JWT verification
     cookie-based session   middleware
```

### 11.2 Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| **Customer** | Submit tickets, view own tickets, comment on own tickets, rate resolutions |
| **Agent** | All customer perms + view assigned queue, approve/reject/edit AI drafts, manage KB articles, view team tickets |
| **Manager** | All agent perms + view all tickets, NL analytics queries, SLA reports, team management |
| **Admin** | All manager perms + user management, system configuration, SLA policy management |

### 11.3 FastAPI Auth Middleware

```python
# backend/app/middleware/auth.py

from fastapi import Request, HTTPException, Depends
from supabase import Client

async def get_current_user(request: Request) -> dict:
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(401, "Missing authorization token")
    
    supabase: Client = request.app.state.supabase
    user = supabase.auth.get_user(token)
    
    if not user:
        raise HTTPException(401, "Invalid token")
    
    # Fetch profile with role
    profile = supabase.table("profiles") \
        .select("*") \
        .eq("id", user.user.id) \
        .single() \
        .execute()
    
    return profile.data

def require_role(*roles: str):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"Requires role: {', '.join(roles)}")
        return user
    return role_checker
```

---

## 12. Real-Time Updates

### 12.1 Supabase Realtime Channels

| Channel | Event Type | Use Case |
|---------|------------|----------|
| `ticket:{id}` | UPDATE on `tickets` | Live status updates for ticket detail page |
| `ticket:{id}` | INSERT on `ticket_events` | New timeline events appear instantly |
| `queue:{team_id}` | INSERT on `tickets` (where status=escalated) | New ticket appears in agent queue |
| `notifications:{user_id}` | INSERT on `notifications` | Bell icon badge updates |
| `analytics:live` | UPDATE on computed views | Dashboard metric updates |

### 12.2 Implementation Pattern

The frontend subscribes to Supabase Realtime Postgres Changes. When the backend updates a ticket (e.g., status changes from `triaging` → `resolved`), the change propagates in real-time to all subscribed clients without polling.

---

## 13. Observability & Monitoring

### 13.1 LangSmith Integration

Every LangGraph execution is traced with:
- Full input/output state at each node
- Token usage and cost per LLM call
- Latency per node
- RAG retrieval results and similarity scores
- Human feedback data

```python
# Environment variables for LangSmith
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<langsmith_api_key>
LANGCHAIN_PROJECT=ticket-system-production
```

### 13.2 Audit Log

All ticket events are recorded in `ticket_events` with:
- Who performed the action (user, AI agent, system)
- What changed (event type + JSONB payload)
- When it happened (timestamp)

### 13.3 Application Logging

```python
# Structured logging with correlation IDs
import structlog

logger = structlog.get_logger()

# Every request gets a correlation ID
logger.info("ticket.processed", 
    ticket_id=ticket_id,
    agent="triage",
    category="technical",
    duration_ms=elapsed,
)
```

### 13.4 Health Checks

```python
@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "supabase": await check_supabase(),
        "redis": await check_redis(),
        "version": settings.APP_VERSION,
    }

@router.get("/health/ready")
async def readiness():
    """Kubernetes readiness probe."""
    checks = {
        "database": await check_supabase(),
        "redis": await check_redis(),
        "openai": await check_openai_api(),
    }
    all_healthy = all(checks.values())
    return {"ready": all_healthy, "checks": checks}
```

---

## 14. SLA Engine

### 14.1 SLA Calculation

```python
# backend/app/services/sla_service.py

from datetime import datetime, timedelta

class SLAService:
    BUSINESS_HOURS = (9, 17)         # 9 AM - 5 PM
    BUSINESS_DAYS = [0, 1, 2, 3, 4]  # Monday - Friday
    
    async def calculate_deadline(self, priority: str, created_at: datetime) -> datetime:
        policy = await self.get_policy(priority)
        
        if policy.business_hours_only:
            return self.add_business_hours(created_at, policy.resolution_hours)
        else:
            return created_at + timedelta(hours=policy.resolution_hours)
    
    async def check_breaches(self):
        """Periodic job: scan for SLA breaches and send warnings."""
        now = datetime.utcnow()
        
        # Find tickets approaching SLA deadline (warning: 75% of time elapsed)
        warning_tickets = await self.ticket_repo.find_sla_warnings(now)
        for ticket in warning_tickets:
            await self.send_sla_warning(ticket)
        
        # Find tickets that have breached
        breached_tickets = await self.ticket_repo.find_sla_breaches(now)
        for ticket in breached_tickets:
            await self.mark_breached(ticket)
            await self.send_sla_breach_alert(ticket)
```

### 14.2 SLA Checker Worker

```python
# backend/app/workers/sla_checker.py

async def sla_checker_loop():
    """Runs every 60 seconds to check SLA compliance."""
    sla_service = SLAService()
    while True:
        await sla_service.check_breaches()
        await asyncio.sleep(60)
```

---

## 15. API Contract

### 15.1 Core Response Schemas

```python
# Ticket response
{
    "id": "uuid",
    "subject": "string",
    "body": "string",
    "status": "new|triaging|routing|resolving|escalated|pending_review|resolved|closed",
    "priority": "critical|high|medium|low",
    "category": "string",
    "source": "web|email|slack",
    "resolution_type": "auto|human|hybrid|null",
    "ai_draft": "string|null",
    "final_response": "string|null",
    "sla_deadline": "ISO8601|null",
    "sla_breached": false,
    "submitter": { "id": "uuid", "full_name": "string", "email": "string" },
    "assigned_agent": { "id": "uuid", "full_name": "string" } | null,
    "assigned_team": { "id": "uuid", "name": "string" } | null,
    "events": [...],
    "comments": [...],
    "created_at": "ISO8601",
    "updated_at": "ISO8601",
    "resolved_at": "ISO8601|null"
}

# Analytics query response
{
    "question": "string",
    "sql": "string",
    "results": [...],
    "summary": "string",
    "chart_type": "table|bar|line|pie|null",
    "cached": false
}
```

---

## 16. Deployment Architecture

### 16.1 Infrastructure

```
┌─────────────────────────────────────────────────────────┐
│                     Vercel / Cloud                       │
│  ┌──────────────────────┐                                │
│  │  Next.js Frontend    │  ← Vercel (edge + serverless)  │
│  │  (Static + SSR)      │                                │
│  └──────────┬───────────┘                                │
│             │ HTTPS                                      │
│             ▼                                            │
│  ┌──────────────────────┐                                │
│  │  FastAPI Backend     │  ← Railway / Render / Fly.io   │
│  │  + LangGraph Workers │     (containerized)            │
│  └──────────┬───────────┘                                │
│             │                                            │
│     ┌───────┼───────┐                                    │
│     │       │       │                                    │
│     ▼       ▼       ▼                                    │
│  Supabase  Redis   OpenAI                                │
│  (managed) (Upstash)(API)                                │
│                                                          │
│  + LangSmith (observability)                             │
└─────────────────────────────────────────────────────────┘
```

### 16.2 Docker Compose (Local Development)

```yaml
# docker-compose.yml

version: "3.9"
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - redis
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  worker:
    build: ./backend
    env_file: .env
    depends_on:
      - redis
    volumes:
      - ./backend:/app
    command: python -m app.workers.ticket_processor

  sla-checker:
    build: ./backend
    env_file: .env
    depends_on:
      - redis
    volumes:
      - ./backend:/app
    command: python -m app.workers.sla_checker

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    env_file: .env
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev

volumes:
  redis_data:
```

---

## 17. Environment Variables

```bash
# .env.example

# ── Supabase ──
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# ── Redis ──
REDIS_URL=redis://localhost:6379

# ── OpenAI ──
OPENAI_API_KEY=sk-...

# ── LangSmith ──
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=ticket-system

# ── Frontend ──
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://localhost:8000

# ── Email Intake ──
IMAP_HOST=imap.gmail.com
IMAP_USER=support@company.com
IMAP_PASSWORD=app-password

# ── Slack ──
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# ── General ──
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
```

---

## 18. Development Phases

### Phase 1: Foundation (Week 1–2)

- [ ] Initialize monorepo structure (backend + frontend + supabase)
- [ ] Set up Supabase project: schema, RLS, pgvector extension
- [ ] FastAPI project scaffold with config, auth middleware, health checks
- [ ] Next.js project with Supabase Auth (login/register)
- [ ] Basic CRUD: create ticket, list tickets, ticket detail
- [ ] Docker Compose for local development
- [ ] CI/CD pipeline (GitHub Actions)

### Phase 2: Agent Pipeline (Week 3–4)

- [ ] LangGraph graph definition with all 5 agent nodes
- [ ] Triage agent: classification, priority scoring, duplicate detection
- [ ] Router agent: auto-resolve vs. escalate decision
- [ ] Resolver agent: RAG search + draft generation
- [ ] Escalation agent: brief writing + SLA calculation + notification
- [ ] Feedback loop node: outcome logging + KB update
- [ ] Redis queue + worker for async pipeline execution
- [ ] LangSmith tracing integration
- [ ] Agent run logging to `agent_runs` table

### Phase 3: Knowledge Base (Week 5)

- [ ] KB article CRUD + rich text editor (Tiptap)
- [ ] Document upload + parsing (PDF, DOCX)
- [ ] Chunking pipeline (512 tokens, 50-token overlap)
- [ ] Embedding generation worker
- [ ] pgvector similarity search function
- [ ] Feedback-driven KB growth (auto-create articles from resolutions)

### Phase 4: Human Dashboard (Week 6)

- [ ] Agent queue page (filtered, sorted by SLA urgency)
- [ ] AI draft review page (approve/edit/reject)
- [ ] Ticket timeline visualization
- [ ] Real-time updates via Supabase Realtime
- [ ] Notification system (in-app + email)
- [ ] Customer ticket submission form
- [ ] Customer ticket tracking + status page

### Phase 5: Analytics & SLA (Week 7)

- [ ] Analytics agent: NL → SQL with validation
- [ ] Manager dashboard: KPI cards, trend charts
- [ ] SLA policy management
- [ ] SLA deadline calculation engine
- [ ] SLA breach detection worker (periodic scan)
- [ ] SLA dashboard with breach tracking

### Phase 6: Intake Channels (Week 8)

- [ ] Email intake: IMAP poller + email parser
- [ ] Slack bot: event webhooks + thread responses
- [ ] Intake source tracking and deduplication

### Phase 7: Polish & Production (Week 9–10)

- [ ] Error handling + retry logic with exponential backoff
- [ ] Rate limiting (Redis-backed)
- [ ] Performance optimization (query analysis, N+1 prevention)
- [ ] Security audit (RLS review, input sanitization, SQL injection prevention)
- [ ] Load testing with realistic ticket volumes
- [ ] Production deployment (Vercel + Railway/Fly.io + Supabase Cloud)
- [ ] Monitoring dashboards (application health, agent performance)
- [ ] User acceptance testing
- [ ] Documentation (API docs, runbook, ops guide)

---

> **Total estimated timeline: 10 weeks** for a production-ready MVP with all core features.
> Phases can be parallelized (e.g., frontend team on Phase 4 while backend works on Phase 3).
