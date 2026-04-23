# Deployment Guide

## Required services

- Supabase project
- Redis instance
- Backend container runtime
- Frontend hosting for Next.js

## Environment variables

Backend:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `READONLY_DATABASE_URL`
- `REDIS_URL`
- `GEMINI_API_KEY`
- `FRONTEND_ORIGIN`

Frontend:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

## Deploy order

1. Apply Supabase migrations
2. Deploy backend API
3. Deploy Celery worker
4. Deploy SLA checker worker
5. Deploy frontend
6. Verify health endpoint and role-based login redirects
