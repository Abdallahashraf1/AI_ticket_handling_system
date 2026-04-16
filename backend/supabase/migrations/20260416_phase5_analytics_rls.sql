-- Phase 5 analytics RLS fix
-- Grants the dedicated analytics role read access to the manager analytics tables.
-- Safe to run multiple times.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_readonly') THEN
        GRANT USAGE ON SCHEMA public TO analytics_readonly;
        GRANT SELECT ON public.tickets TO analytics_readonly;
        GRANT SELECT ON public.ticket_events TO analytics_readonly;
        GRANT SELECT ON public.profiles TO analytics_readonly;
        GRANT SELECT ON public.teams TO analytics_readonly;
        GRANT SELECT ON public.sla_policies TO analytics_readonly;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_readonly;
    END IF;
END $$;

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_readonly') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'tickets' AND policyname = 'analytics_readonly_tickets'
        ) THEN
            CREATE POLICY analytics_readonly_tickets ON public.tickets
                FOR SELECT TO analytics_readonly
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'ticket_events' AND policyname = 'analytics_readonly_ticket_events'
        ) THEN
            CREATE POLICY analytics_readonly_ticket_events ON public.ticket_events
                FOR SELECT TO analytics_readonly
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'analytics_readonly_profiles'
        ) THEN
            CREATE POLICY analytics_readonly_profiles ON public.profiles
                FOR SELECT TO analytics_readonly
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'teams' AND policyname = 'analytics_readonly_teams'
        ) THEN
            CREATE POLICY analytics_readonly_teams ON public.teams
                FOR SELECT TO analytics_readonly
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'sla_policies' AND policyname = 'analytics_readonly_sla_policies'
        ) THEN
            CREATE POLICY analytics_readonly_sla_policies ON public.sla_policies
                FOR SELECT TO analytics_readonly
                USING (true);
        END IF;
    END IF;
END $$;
