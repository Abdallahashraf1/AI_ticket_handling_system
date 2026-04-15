-- Phase 5 migration: SLA policies and SLA-related ticket fields/indexes
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.sla_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    first_response_hours INTEGER NOT NULL,
    resolution_hours INTEGER NOT NULL,
    business_hours_only BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- If table already existed from earlier phases with a different shape,
-- ensure required columns exist before seeding.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sla_policies' AND column_name = 'name'
    ) THEN
        ALTER TABLE public.sla_policies ADD COLUMN name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sla_policies' AND column_name = 'priority'
    ) THEN
        ALTER TABLE public.sla_policies ADD COLUMN priority TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sla_policies' AND column_name = 'first_response_hours'
    ) THEN
        ALTER TABLE public.sla_policies ADD COLUMN first_response_hours INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sla_policies' AND column_name = 'resolution_hours'
    ) THEN
        ALTER TABLE public.sla_policies ADD COLUMN resolution_hours INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sla_policies' AND column_name = 'business_hours_only'
    ) THEN
        ALTER TABLE public.sla_policies ADD COLUMN business_hours_only BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sla_policies' AND column_name = 'is_default'
    ) THEN
        ALTER TABLE public.sla_policies ADD COLUMN is_default BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sla_policies' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.sla_policies ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- Backfill required values for older rows.
UPDATE public.sla_policies
SET
    name = COALESCE(
        name,
        CASE priority
            WHEN 'critical' THEN 'Critical SLA'
            WHEN 'high' THEN 'High SLA'
            WHEN 'medium' THEN 'Medium SLA'
            WHEN 'low' THEN 'Low SLA'
            ELSE 'SLA Policy'
        END
    ),
    first_response_hours = COALESCE(first_response_hours, 8),
    resolution_hours = COALESCE(resolution_hours, 48),
    business_hours_only = COALESCE(business_hours_only, TRUE),
    is_default = COALESCE(is_default, FALSE),
    created_at = COALESCE(created_at, now());

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.sla_policies WHERE priority = 'critical') THEN
        INSERT INTO public.sla_policies (name, priority, first_response_hours, resolution_hours, is_default)
        VALUES ('Critical SLA', 'critical', 1, 4, TRUE);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sla_policies WHERE priority = 'high') THEN
        INSERT INTO public.sla_policies (name, priority, first_response_hours, resolution_hours, is_default)
        VALUES ('High SLA', 'high', 4, 24, TRUE);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sla_policies WHERE priority = 'medium') THEN
        INSERT INTO public.sla_policies (name, priority, first_response_hours, resolution_hours, is_default)
        VALUES ('Medium SLA', 'medium', 8, 48, TRUE);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sla_policies WHERE priority = 'low') THEN
        INSERT INTO public.sla_policies (name, priority, first_response_hours, resolution_hours, is_default)
        VALUES ('Low SLA', 'low', 24, 120, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'sla_breached'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN sla_breached BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'sla_deadline'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN sla_deadline TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_sla_breached ON public.tickets(sla_breached);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline_phase5 ON public.tickets(sla_deadline) WHERE sla_deadline IS NOT NULL;
