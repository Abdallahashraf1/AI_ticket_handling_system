-- Phase 4 migration: notifications, ticket fields, storage, realtime
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'assigned_agent_id'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN assigned_agent_id UUID REFERENCES public.profiles(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'sla_deadline'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN sla_deadline TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'final_response'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN final_response TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'customer_feedback'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN customer_feedback TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'feedback_score'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN feedback_score INTEGER;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent ON public.tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline ON public.tickets(sla_deadline);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'ticket_assigned', 'ticket_escalated', 'sla_warning',
        'sla_breach', 'draft_ready', 'ticket_resolved',
        'ticket_reopened', 'mention', 'system'
    )),
    title TEXT NOT NULL,
    body TEXT,
    ticket_id UUID REFERENCES public.tickets(id),
    is_read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'own_notifications'
    ) THEN
        CREATE POLICY own_notifications ON public.notifications
            FOR ALL USING (user_id = auth.uid());
    END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
SELECT 'ticket-attachments', 'ticket-attachments', false
WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'ticket-attachments'
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ticket_attachments_select'
    ) THEN
        CREATE POLICY ticket_attachments_select ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'ticket-attachments'
                AND (
                    owner = auth.uid()
                    OR EXISTS (
                        SELECT 1
                        FROM public.profiles p
                        WHERE p.id = auth.uid() AND p.role IN ('agent', 'manager', 'admin')
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ticket_attachments_insert'
    ) THEN
        CREATE POLICY ticket_attachments_insert ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'ticket-attachments'
                AND owner = auth.uid()
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tickets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;
