from supabase import create_client, Client
from app.config import settings

_supabase_admin_client: Client | None = None

def get_admin_client() -> Client:
    global _supabase_admin_client
    if _supabase_admin_client is None:
        _supabase_admin_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY
        )
    return _supabase_admin_client

def get_supabase() -> Client:
    # Service role client for agents/workers
    return get_admin_client()

def get_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
