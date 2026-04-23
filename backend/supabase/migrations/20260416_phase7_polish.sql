-- Phase 7 polish: ticket processing metadata and performance indexes
-- Safe to run multiple times.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'processing_attempts'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN processing_attempts INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'processing_error'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN processing_error TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'last_processing_error_at'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN last_processing_error_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_submitter_created_at ON public.tickets(submitter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_created_at ON public.tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_team_status ON public.tickets(assigned_team_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority_status ON public.tickets(priority, status);
CREATE INDEX IF NOT EXISTS idx_tickets_category_created_at ON public.tickets(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_created_at ON public.ticket_events(ticket_id, created_at DESC);
