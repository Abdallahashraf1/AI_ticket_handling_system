# System Overview — The Complete Journey of a Ticket

> This document traces the full lifecycle of a support ticket from the moment a customer of the payment services platform submits it to the final resolution and beyond. Every step, every decision, every agent interaction is documented here.

---

## Visual Journey Map

```
 ┌─────────────┐
 │  Customer   │
 │  submits    │
 │  ticket     │
 └──────┬──────┘
        │
        ▼
 ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
 │ ① INTAKE    │────▶│ ② EMBEDDING │────▶│ ③ QUEUE         │
 │ Validate &  │     │ Generate    │     │ Redis enqueue   │
 │ persist     │     │ vector      │     │ for processing  │
 └─────────────┘     └─────────────┘     └────────┬────────┘
                                                   │
        ┌──────────────────────────────────────────┘
        ▼
 ┌─────────────────┐
 │ ④ TRIAGE AGENT  │
 │ Classify        │
 │ Score urgency   │
 │ Detect dupes    │
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │ ⑤ ROUTER AGENT  │
 │ Auto-resolve    │
 │ or escalate?    │
 └───────┬─────────┘
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
 ┌──────┐  ┌──────────┐
 │  ⑥A  │  │   ⑥B     │
 │RESOLVE│  │ESCALATE  │
 │ RAG   │  │ Brief    │
 │ Draft │  │ SLA      │
 └───┬───┘  │ Notify   │
     │      └────┬─────┘
     │           │
     │           ▼
     │      ┌──────────┐
     │      │ ⑦ HUMAN  │
     │      │ REVIEW   │◀─── reject ───┐
     │      │ Approve  │               │
     │      │ Edit     │───────────────┘
     │      │ Reject   │
     │      └────┬─────┘
     │           │ approve/edit
     │           │
     ▼           ▼
 ┌─────────────────┐
 │ ⑧ FEEDBACK LOOP │
 │ Log outcome     │
 │ Update RAG KB   │
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │ ⑨ RESOLUTION    │
 │ Notify customer │
 │ Close ticket    │
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │ ⑩ OBSERVABILITY │
 │ LangSmith trace │
 │ Audit log       │
 │ Analytics       │
 └─────────────────┘
```

---

## Step ① — Intake: The Ticket Enters the System

### What Happens

A customer encounters an issue with their payment service and submits a ticket through one of three channels:

| Channel | How It Works |
|---------|-------------|
| **Web Form** | Customer fills out a form on the Next.js frontend at `/tickets/new` — enters a subject, description, selects a category, and optionally attaches screenshots or receipts |
| **Email** | Customer sends an email to `support@paymentco.com`. A background worker (IMAP poller) checks the inbox every 60 seconds, parses new emails, and converts them into tickets |
| **Slack Bot** | Customer mentions `@support-bot` in a shared Slack channel. The Slack webhook receives the event and creates a ticket from the message content |

### What Gets Stored

Regardless of the channel, the system creates a record in the `tickets` table with:

```
{
  subject:      "Payment declined but amount deducted from account"
  body:         "I tried to pay for an order on MerchantXYZ and the payment was declined, but $150 was still deducted from my bank account..."
  source:       "web" | "email" | "slack"
  submitter_id: "uuid-of-the-customer"
  status:       "new"
  attachments:  ["storage/path/transaction_screenshot.png"]  (if any)
  created_at:   "2026-04-13T10:30:00Z"
}
```

### What the Customer Sees

The customer is immediately redirected to their ticket detail page showing:
- **Status badge**: `🔵 New`
- **Confirmation message**: "Your ticket has been submitted. Our AI system is processing it now."
- **Real-time timeline**: Shows "Ticket submitted" as the first event

### Technical Flow

```
Customer Browser
     │
     │  POST /api/v1/tickets
     │  { subject, body, attachments }
     │
     ▼
FastAPI Endpoint (tickets.py)
     │
     ├─ 1. Validate request body (Pydantic schema)
     ├─ 2. Verify JWT token (Supabase Auth middleware)
     ├─ 3. Upload attachments to Supabase Storage (if any)
     ├─ 4. Call TicketService.create_ticket()
     │      ├─ Generate embedding (Step ②)
     │      ├─ INSERT into tickets table
     │      ├─ INSERT into ticket_events (event: "created")
     │      └─ Enqueue to Redis (Step ③)
     │
     └─ Return ticket JSON to frontend
```

---

## Step ② — Embedding Generation: Making the Ticket Searchable

### What Happens

Before the ticket is saved, the system generates a **vector embedding** of the ticket's content. This is a mathematical representation (an array of 1,536 floating-point numbers) that captures the semantic meaning of the text.

### Why This Matters

The embedding is used for two critical purposes:

1. **Duplicate Detection** (Step ④) — Finding existing tickets that describe the same problem
2. **RAG Retrieval** (Step ⑥A) — Searching the knowledge base for relevant solutions

### Technical Detail

```python
# The ticket text is combined and sent to OpenAI's embedding model
text = f"{ticket.subject} {ticket.body}"

response = await openai.embeddings.create(
    model="text-embedding-3-small",
    input=text
)

# Returns a vector like [0.0123, -0.0456, 0.0789, ...]  (1,536 dimensions)
embedding = response.data[0].embedding

# Stored directly in the ticket row using pgvector
INSERT INTO tickets (..., embedding) VALUES (..., '[0.0123, -0.0456, ...]')
```

### Time Cost

- ~200ms for embedding generation
- This happens synchronously during ticket creation — the user waits for this

---

## Step ③ — Queue: The Ticket Waits for Processing

### What Happens

After the ticket is persisted in the database, a message is pushed to a **Redis queue** that tells the background worker: "Process this ticket through the AI pipeline."

```python
await redis.lpush("ticket:process", json.dumps({
    "ticket_id": "abc-123-def",
    "action": "full_pipeline",
    "enqueued_at": "2026-04-13T10:30:01Z"
}))
```

### Why a Queue?

- **Decoupling**: The API returns immediately to the user. The AI processing (which can take 5–15 seconds) happens asynchronously.
- **Resilience**: If the AI pipeline fails, the message stays in the queue and can be retried.
- **Backpressure**: If 100 tickets arrive simultaneously, they queue up rather than overwhelming the LLM API.

### What the Customer Sees

Nothing changes visually yet. Their ticket still shows `🔵 New`. But within 1–2 seconds, the background worker picks up the message and begins processing.

### Background Worker

```
Redis Queue "ticket:process"
     │
     │  BRPOP (blocking pop — waits for new messages)
     │
     ▼
Ticket Processor Worker
     │
     ├─ Fetch ticket data from Supabase
     ├─ Build initial LangGraph state
     ├─ Invoke the ticket_pipeline graph
     └─ Handle errors → push to retry queue
```

---

## Step ④ — Triage Agent: Understanding the Ticket

### What Happens

The **Triage Agent** is the first AI agent in the pipeline. Its job is to understand what the ticket is about and how urgent it is. It performs three analyses simultaneously:

#### 4a. Classification

The agent reads the ticket and assigns a **category** and **subcategory**:

```
Input:  "Payment declined but amount deducted from account"
Output: category = "payments"
        subcategory = "failed_transaction"
```

Categories might include: `payments`, `transactions`, `account`, `disputes`, `refunds`, `compliance`, `integration`, `payouts`, etc.

#### 4b. Priority & Urgency Scoring

The agent scores how urgent the ticket is on two scales:

```
priority:      "high"           (critical / high / medium / low)
urgency_score: 0.82             (0.0 = not urgent, 1.0 = extremely urgent)
sentiment:     "frustrated"     (positive / neutral / negative / frustrated)
```

The priority considers:
- Financial impact (small amount vs. large transaction vs. merchant-wide outage)
- Business criticality (is the customer unable to send/receive payments?)
- Time sensitivity (pending settlement deadlines, chargeback windows)
- Emotional tone (frustrated customers need faster response)

#### 4c. Duplicate Detection

The agent checks if a similar ticket already exists by querying pgvector:

```sql
SELECT id, subject, 1 - (embedding <=> query_embedding) AS similarity
FROM tickets
WHERE status NOT IN ('closed', 'resolved')
  AND created_at > now() - INTERVAL '72 hours'
  AND 1 - (embedding <=> query_embedding) > 0.92
ORDER BY embedding <=> query_embedding
LIMIT 5;
```

If a match is found with >92% similarity within the last 72 hours, the ticket is flagged as a potential duplicate:

```
is_duplicate:  true
duplicate_of:  "existing-ticket-uuid"
```

### What the Customer Sees

Their ticket status updates in real-time (via Supabase Realtime):
- **Status**: `🔵 New` → `🟡 Triaging`
- **Timeline**: New event appears: "AI triaged — Category: Payments > Failed Transaction, Priority: High"

### What Gets Updated in the Database

```sql
UPDATE tickets SET
    status = 'triaging',
    category = 'payments',
    subcategory = 'failed_transaction',
    priority = 'high',
    urgency_score = 0.82,
    sentiment = 'frustrated',
    is_duplicate = false
WHERE id = 'ticket-uuid';

INSERT INTO ticket_events (ticket_id, event_type, actor_type, actor_id, data)
VALUES ('ticket-uuid', 'triaged', 'agent_ai', 'triage_agent', '{
    "category": "payments",
    "priority": "high",
    "urgency_score": 0.82,
    "duplicate_check": "no_duplicates_found"
}');
```

### Time Cost

- ~2–4 seconds (one LLM call + one pgvector query)

---

## Step ⑤ — Router Agent: The Critical Decision

### What Happens

The **Router Agent** makes the most important decision in the pipeline: **can this ticket be automatically resolved, or does it need a human?**

It evaluates multiple factors:

| Factor | Weight | Example |
|--------|--------|---------|
| Category confidence | High | Is this a well-understood category with KB articles? |
| Priority level | Medium | Critical tickets may need human oversight regardless |
| Sentiment | Medium | Frustrated users benefit from human empathy |
| Duplicate status | High | Duplicates can reference existing resolution |
| KB coverage | High | Does the knowledge base have relevant articles? |
| Complexity | High | Multi-step issues or policy-dependent decisions |

### Decision Output

```python
{
    "route_decision": "auto_resolve",    # or "escalate"
    "confidence_score": 0.87,            # How confident the router is
    "reasoning": "Common failed transaction issue with multiple KB articles. Standard resolution applies.",
    "assigned_team_id": "uuid-of-payments-team"
}
```

### Decision Rules (Simplified)

```
IF is_duplicate AND has_existing_resolution → AUTO_RESOLVE
IF priority == "critical" → ESCALATE  (always needs human eyes)
IF confidence_score > 0.80 AND has_kb_articles → AUTO_RESOLVE
IF sentiment == "frustrated" AND priority >= "high" → ESCALATE
IF category_is_unknown OR insufficient_kb_coverage → ESCALATE
ELSE → ESCALATE  (when in doubt, involve a human)
```

### What Happens Next

The pipeline splits into two parallel paths:

- **Path A** → `auto_resolve` → Goes to the **Resolver Agent** (Step ⑥A)
- **Path B** → `escalate` → Goes to the **Escalation Agent** (Step ⑥B)

### What the Customer Sees

- **Status**: `🟡 Triaging` → `🟠 Routing`
- **Timeline**: "AI routing — determining best resolution path"

### Time Cost

- ~1–2 seconds (one LLM call)

---

## Step ⑥A — Resolver Agent: Auto-Resolution via RAG

> This path is taken when the Router decides the ticket **can** be automatically resolved.

### What Happens

The **Resolver Agent** uses **Retrieval-Augmented Generation (RAG)** to find relevant knowledge and draft a resolution response.

#### Phase 1: Knowledge Retrieval

The agent searches the knowledge base using the ticket's semantic embedding:

```sql
-- pgvector similarity search
SELECT content, article_title, similarity
FROM match_knowledge_chunks(
    query_embedding := ticket_embedding,
    match_threshold := 0.70,
    match_count := 8
);
```

This might return chunks like:

```
[similarity: 0.94] "Failed Transaction — Hold vs. Charge Guide"
  → "When a payment is declined but funds are held, this is a temporary authorization hold..."

[similarity: 0.88] "Refund & Reversal Policy"
  → "Authorization holds are released automatically within 3–5 business days..."

[similarity: 0.82] "Previous Resolution: Declined but deducted"
  → "The issue was a temporary authorization hold. Customer was advised to wait 3–5 days."
```

#### Phase 2: Draft Generation

The agent uses the retrieved knowledge chunks as context to generate a personalized response:

```
INPUT TO LLM:
  System Prompt: "You are a helpful payment support agent. Draft a clear, 
                  empathetic resolution using the provided knowledge base context..."
  
  User Message:  "TICKET: Payment declined but amount deducted from account
                  CONTEXT: [3 relevant KB articles...]
                  Generate a resolution."

OUTPUT:
  "Hi there,

   I understand your concern about seeing a deduction even though your
   payment was declined. This is actually a temporary authorization hold,
   not a completed charge.
   
   Here's what's happening:
   
   1. When you attempted the payment, your bank placed a temporary hold
   2. Because the payment was declined on the merchant side, no actual
      charge was processed
   3. The hold will be automatically released within 3–5 business days
   4. You can contact your bank to request an earlier release
   
   If the hold is not released after 5 business days, please reply to
   this ticket and we'll escalate to our payments operations team.
   
   Best regards,
   Payment Support Team"
```

#### Phase 3: Auto-Resolve

The ticket is immediately resolved:

```sql
UPDATE tickets SET
    status = 'resolved',
    resolution_type = 'auto',
    ai_draft = '...',
    final_response = '...',
    resolved_at = now(),
    first_response_at = now()
WHERE id = 'ticket-uuid';
```

### What the Customer Sees

Within seconds of submitting their ticket:
- **Status**: `🟠 Routing` → `✅ Resolved`
- **Timeline** updates with all events
- **Resolution panel** appears with the AI-generated response
- **Feedback buttons**: 😊 Helpful · 😐 Somewhat · 😞 Not helpful · 🔄 Reopen
- **Email notification**: "Your ticket has been resolved — here's the solution"

### Time Cost

- ~3–5 seconds (one pgvector search + one LLM call)
- **Total time from submission to resolution: ~8–12 seconds**

---

## Step ⑥B — Escalation Agent: Preparing for Human Review

> This path is taken when the Router decides the ticket **cannot** be auto-resolved.

### What Happens

The **Escalation Agent** doesn't resolve the ticket. Instead, it prepares everything a human agent needs to handle it efficiently.

#### Phase 1: Write the Escalation Brief

The agent analyzes the ticket and writes a structured brief:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESCALATION BRIEF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUMMARY:
Customer disputing $2,400 charge from merchant "TechStore Ltd"
on March 15. Customer claims they cancelled the order before
shipment but were still charged. Receipt and cancellation
email attached.

WHY ESCALATED:
• Requires transaction log verification in payment gateway
• Merchant-side confirmation needed (cancellation status)
• Financial impact — customer is out $2,400
• High urgency — chargeback window closes in 12 days

SUGGESTED APPROACH:
1. Pull transaction ID #TXN-92847 from payment gateway logs
2. Verify cancellation status with merchant via API
3. If merchant confirms cancellation, initiate chargeback
4. Notify customer of dispute timeline (typically 7–10 days)

RELEVANT KB CONTEXT:
• "Dispute & Chargeback Policy" — 60-day window, evidence required
• "Merchant Cancellation Verification" — API endpoint + process

SENTIMENT: Frustrated (customer mentioned this is the 2nd time)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Phase 2: Calculate SLA Deadline

Based on the ticket's priority, the system computes when the ticket **must** be resolved:

```
Priority: HIGH
SLA Policy: "High SLA" → 4h first response, 24h resolution
Business hours only: Yes (9 AM – 5 PM, Mon–Fri)

Ticket created: Monday 4:00 PM
First response due: Monday 5:00 PM + Tuesday 9:00 AM–12:00 PM = Tuesday 12:00 PM
Resolution due: Tuesday 4:00 PM → extended through business hours → Wednesday 4:00 PM
```

#### Phase 3: Assign to Best Available Agent

The system finds the right human agent:

```python
# 1. Find agents on the assigned team
# 2. Filter by who's currently online (Redis: agent:availability)
# 3. Sort by current ticket load (fewest assigned tickets first)
# 4. Assign the best match

assigned_agent = find_available_agent(team_id="disputes-team-uuid")
# → Agent: "Sarah M." (currently handling 3 tickets, online)
```

#### Phase 4: Send Notifications

```
📱 In-app notification → Sarah M.'s notification bell lights up
📧 Email notification → "New escalated ticket assigned to you"
💬 Slack notification → #disputes-support channel: "🔴 HIGH: Customer dispute $2,400 assigned to @sarah"
```

### What the Customer Sees

- **Status**: `🟠 Routing` → `🔴 Escalated`
- **Timeline**: "Ticket escalated to Disputes team — Agent Sarah M. assigned"
- **Message**: "A support agent is reviewing your ticket. Expected response by Tuesday 12:00 PM."

### What the Agent Sees (Dashboard)

The ticket appears at the top of their queue (sorted by SLA urgency):

```
🔴 HIGH  ·  ⏰ SLA: 3h 45min left
"Customer disputing $2,400 charge — TechStore Ltd"
Escalated → Disputes  ·  [View Brief]  [Start Review]
```

### Time Cost

- ~2–3 seconds (one LLM call for brief + SLA calculation + agent assignment)

---

## Step ⑦ — Human Review: Agent Takes Over

> This step only happens for escalated tickets (Path B).

### What Happens

The assigned human agent opens the ticket and sees:

1. **The original ticket** — customer's subject, description, attachments
2. **The AI brief** — summary, why escalated, suggested approach, relevant KB context
3. **An editable AI draft** — a pre-generated response they can modify
4. **The full timeline** — every automated step that occurred

### Agent Actions

The agent has three choices:

#### Option A: ✅ Approve AI Draft

The agent reads the draft, agrees with it, and clicks "Approve & Send."
- The draft becomes the final response
- The ticket status changes to `resolved`
- The customer receives the response

#### Option B: ✏️ Edit & Send

The agent modifies the AI draft (corrects facts, adds details, changes tone) and sends the edited version.
- The edited response becomes the final response
- The ticket is marked as `resolution_type: "hybrid"` (AI + human)
- **The edited version is fed back into the knowledge base** (Step ⑧)

#### Option C: ❌ Reject Draft

The agent decides the AI draft is wrong or unhelpful and writes their own response from scratch.
- The rejection reason is logged
- The agent writes a new response manually
- The ticket is marked as `resolution_type: "human"`
- **The agent's response is captured for future learning** (Step ⑧)

### The Reject → Retry Cycle

When an agent rejects a draft, they can optionally **send it back to the Resolver Agent** with feedback:

```
Agent feedback: "The charge is actually from a recurring subscription the 
customer forgot about. The KB doesn't cover subscription dispute flows yet."
```

The Resolver Agent receives this feedback, incorporates it, and generates a new draft. This cycle can repeat up to 3 times before the system gives up and lets the human handle it entirely.

```
Reject + feedback → Resolver (with feedback context) → New draft → Human review
     ↑                                                                    │
     └────────────────── reject again ────────────────────────────────────┘
                         (max 3 iterations)
```

### What Gets Logged

Every human action creates a `ticket_event`:

```sql
-- Agent approves the draft
INSERT INTO ticket_events (ticket_id, event_type, actor_type, actor_id, data)
VALUES ('ticket-uuid', 'draft_approved', 'user', 'sarah-uuid', '{
    "original_draft": "...",
    "time_spent_seconds": 45
}');

-- Agent edits and sends
INSERT INTO ticket_events (ticket_id, event_type, actor_type, actor_id, data)
VALUES ('ticket-uuid', 'draft_edited', 'user', 'sarah-uuid', '{
    "original_draft": "...",
    "edited_response": "...",
    "edit_diff_percentage": 0.35
}');
```

---

## Step ⑧ — Feedback Loop: The System Gets Smarter

### What Happens

After every ticket resolution (whether auto or human), the **Feedback Node** runs. Its purpose is to make the AI system progressively better over time.

### Feedback Actions by Resolution Type

#### Auto-Resolved (High Confidence ≥ 0.85)

```
Ticket resolved automatically with high confidence.
→ Action: Create a new knowledge article from the resolution.

New KB Article:
  title:       "Resolution: VPN connectivity from home office"
  content:     [the AI-generated resolution]
  category:    "technical"
  source_type: "ticket_resolution"
  source_ticket_id: "ticket-uuid"
  status:      "active"
  
→ The article is chunked and embedded into pgvector
→ Future similar tickets benefit from this resolution
```

#### Human-Edited Resolution

```
Agent edited the AI draft before sending.
→ Action: Create a KB article from the CORRECTED version (not the AI draft).
→ Tag: "human_corrected" (weighted higher in future searches)

This is the most valuable feedback signal — it tells the system:
"The AI was close, but here's what was actually correct."
```

#### Human-Written Resolution (Draft Rejected)

```
Agent rejected the AI draft and wrote their own response.
→ Action: Create a KB article from the human's response.
→ Flag the original AI draft for analysis.
→ Analyze: What did the AI get wrong? What knowledge was missing?
```

#### Customer Feedback (Post-Resolution)

```
Customer rates the resolution:
  😊 Helpful     → Boost the source KB articles' helpfulness_score
  😐 Somewhat    → No change
  😞 Not helpful → Mark source KB articles for review
  🔄 Reopen      → Re-enter the pipeline from Step ④
```

### The Virtuous Cycle

```
More tickets resolved
       │
       ▼
More knowledge articles created
       │
       ▼
Better RAG retrieval for future tickets
       │
       ▼
Higher auto-resolution rate
       │
       ▼
Fewer tickets need human intervention
       │
       ▼
Agents focus on truly complex problems
       │
       ▼
Their corrections further improve the KB
       │
       └──────────── cycle continues ───────────┘
```

---

## Step ⑨ — Resolution: Closing the Loop with the Customer

### What Happens

The customer is notified that their ticket has been resolved, through the same channel they submitted it on:

| Original Channel | Notification Method |
|-------------------|---------------------|
| **Web form** | In-app notification + email + ticket status update (real-time via Supabase Realtime) |
| **Email** | Reply to the original email thread with the resolution |
| **Slack** | Reply in the original Slack thread with the resolution |

### What the Customer Sees (Final State)

```
┌──────────────────────────────────────────────────────────────┐
│  🎫 "Payment declined but amount deducted from account"      │
│  Status: ✅ Resolved  ·  Priority: 🔴 High  ·  Auto-resolved │
│  Resolved in: 11 seconds                                     │
│                                                               │
│  ┌─── Timeline ──────────────────────────────────────────┐   │
│  │ ⚪ 10:30:00  Ticket submitted via web form             │   │
│  │ 🟡 10:30:01  AI triage: Payments > Failed Txn > High   │   │
│  │ 🟠 10:30:03  AI routing: Auto-resolvable (87% conf)    │   │
│  │ 🟢 10:30:06  AI resolver: 3 KB articles found          │   │
│  │ ✅ 10:30:11  Auto-resolved — response sent              │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─── Resolution ────────────────────────────────────────┐   │
│  │ Hi there,                                              │   │
│  │                                                        │   │
│  │ I understand your concern about the deduction. This    │   │
│  │ is a temporary authorization hold, not a charge.       │   │
│  │                                                        │   │
│  │ 1. The hold will auto-release in 3–5 business days     │   │
│  │ 2. No actual charge was processed on the merchant side │   │
│  │ 3. Contact your bank to request an earlier release     │   │
│  │ 4. Reply here if the hold remains after 5 days         │   │
│  │                                                        │   │
│  │ If the hold persists, we'll escalate to our payments   │   │
│  │ operations team for further investigation.             │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  Was this helpful?                                            │
│  [😊 Helpful]  [😐 Somewhat]  [😞 Not helpful]  [🔄 Reopen]  │
│                                                               │
│  💬 Add a comment...                                          │
└──────────────────────────────────────────────────────────────┘
```

### Ticket Reopening

If the customer clicks **🔄 Reopen**, the ticket re-enters the pipeline:
- Status reverts to `reopened`
- A new event is logged: "Ticket reopened by customer"
- The pipeline runs again from Step ④ (Triage), but with additional context: "This ticket was previously auto-resolved but the customer marked it unhelpful"
- This time, the Router is more likely to escalate to a human

---

## Step ⑩ — Observability: Everything is Traced

### LangSmith Tracing

Every LangGraph execution is fully traced in LangSmith:

```
Trace: ticket-abc-123
├── Node: triage_agent          (2.1s, 342 tokens, $0.0034)
│   ├── LLM Call: gpt-4o       (classification)
│   └── Tool Call: find_duplicates (pgvector query)
├── Node: router_agent          (1.4s, 218 tokens, $0.0022)
│   └── LLM Call: gpt-4o       (routing decision)
├── Node: resolver_agent        (4.2s, 1,847 tokens, $0.0185)
│   ├── Tool Call: search_knowledge_base (8 chunks retrieved)
│   └── LLM Call: gpt-4o       (draft generation)
└── Node: feedback              (0.3s, no LLM calls)
    └── DB Write: new KB article created

Total: 8.0s | 2,407 tokens | $0.0241
```

### Audit Log (ticket_events)

Every action is permanently recorded:

```
Time        Event              Actor        Details
10:30:00    created            user         source: web
10:30:01    triaged            triage_ai    category: technical, priority: high
10:30:03    routed             router_ai    decision: auto_resolve, confidence: 0.87
10:30:06    draft_generated    resolver_ai  3 KB articles used, confidence: 0.91
10:30:11    auto_resolved      resolver_ai  resolution_type: auto
10:30:15    feedback_logged    feedback_ai  new KB article created
```

### Agent Run Record

```sql
INSERT INTO agent_runs (ticket_id, run_id, status, nodes_executed, total_tokens, total_cost, duration_ms)
VALUES (
    'ticket-uuid',
    'langgraph-run-xyz',
    'completed',
    ARRAY['triage', 'router', 'resolver', 'feedback'],
    2407,
    0.0241,
    8000
);
```

### Analytics (Available to Managers)

Managers can query the system in natural language:

```
Manager: "What's our auto-resolution rate for payment dispute tickets this month?"

Analytics Agent → SQL:
  SELECT 
    COUNT(*) FILTER (WHERE resolution_type = 'auto') * 100.0 / COUNT(*) AS auto_rate
  FROM tickets 
  WHERE category = 'disputes' 
    AND created_at >= date_trunc('month', now());

Result: "78% of dispute tickets were auto-resolved this month (156 of 200 total)."
```

---

## Complete Timing Breakdown

### Path A: Auto-Resolved Ticket

| Step | Duration | Cumulative |
|------|----------|------------|
| ① Intake (validate + persist) | ~300ms | 0.3s |
| ② Embedding generation | ~200ms | 0.5s |
| ③ Queue wait | ~100ms | 0.6s |
| ④ Triage Agent | ~2.5s | 3.1s |
| ⑤ Router Agent | ~1.5s | 4.6s |
| ⑥A Resolver Agent (RAG + draft) | ~4.0s | 8.6s |
| ⑧ Feedback loop | ~0.5s | 9.1s |
| ⑨ Notification dispatch | ~0.3s | 9.4s |
| **Total** | | **~10 seconds** |

### Path B: Escalated Ticket

| Step | Duration | Cumulative |
|------|----------|------------|
| ① Intake | ~300ms | 0.3s |
| ② Embedding | ~200ms | 0.5s |
| ③ Queue wait | ~100ms | 0.6s |
| ④ Triage Agent | ~2.5s | 3.1s |
| ⑤ Router Agent | ~1.5s | 4.6s |
| ⑥B Escalation Agent (brief + SLA + assign) | ~3.0s | 7.6s |
| ⑦ Human review | **Minutes to hours** | depends |
| ⑧ Feedback loop | ~0.5s | — |
| ⑨ Notification dispatch | ~0.3s | — |
| **Total (AI portion)** | | **~8 seconds** |
| **Total (including human)** | | **Minutes to hours** |

---

## Edge Cases & Error Handling

### What if the LLM API is down?

```
1. The Redis queue retry mechanism kicks in
2. Failed tickets go to the "ticket:retry" queue
3. Exponential backoff: retry after 30s, 60s, 120s, 240s
4. After 5 failures, the ticket is marked as "error" status
5. An alert is sent to the on-call engineer
6. The customer sees: "Processing delayed — a team member has been notified"
```

### What if no knowledge base articles match?

```
1. The Resolver Agent detects low retrieval confidence
2. It generates a best-effort response with appropriate hedging
3. If confidence < 0.50, it adds a note: "I wasn't able to find a definitive
   answer. Would you like me to escalate this to a specialist?"
4. The Router may redirect to escalation if confidence is too low
```

### What if the ticket is a duplicate?

```
1. Triage Agent flags it as a duplicate (>92% similarity)
2. Router auto-resolves it with: "It looks like this issue has already been
   reported in ticket #XYZ. Here's the current status: [...]"
3. The customer can still reopen if they believe it's a distinct issue
```

### What if the customer reopens a ticket?

```
1. Status: resolved → reopened
2. The pipeline runs again from Step ④
3. Additional context is injected: "Previously auto-resolved, customer 
   marked unhelpful. Previous response: [...]"
4. Router is biased toward escalation (higher threshold for auto-resolve)
5. If auto-resolved again, confidence threshold is 0.95 (vs normal 0.80)
```

---

## System Health Indicators

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Auto-resolution rate | >65% | 40–65% | <40% |
| Average resolution time (auto) | <15s | 15–30s | >30s |
| SLA compliance | >95% | 85–95% | <85% |
| Customer satisfaction (CSAT) | >4.0/5 | 3.0–4.0 | <3.0 |
| Queue depth (pending tickets) | <20 | 20–50 | >50 |
| Agent pipeline error rate | <1% | 1–5% | >5% |
| KB coverage (tickets with 0 matches) | <15% | 15–30% | >30% |

---

> **Key Takeaway**: The system is designed so that the happy path (auto-resolution) takes ~10 seconds end-to-end. The escalation path prepares everything a human support agent needs so they can resolve customer tickets faster. And every resolution — whether AI or human — feeds back into the knowledge base to make future resolutions smarter.
