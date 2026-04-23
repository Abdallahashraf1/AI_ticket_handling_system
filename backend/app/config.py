from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Ticket Handling System"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_KEY: str
    
    REDIS_URL: str = "redis://redis:6379"
    CELERY_BROKER_URL: str = "redis://redis:6379"
    READONLY_DATABASE_URL: str | None = None
    ANALYTICS_CACHE_TTL_SECONDS: int = 300
    SLA_CHECK_INTERVAL_SECONDS: int = 60
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 100
    RATE_LIMIT_TICKET_SUBMISSIONS_PER_HOUR: int = 10
    LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 3
    LLM_CIRCUIT_BREAKER_RECOVERY_SECONDS: int = 60
    
    # AI & Tracing
    GEMINI_API_KEY: str | None = None
    LANGCHAIN_TRACING_V2: str = "false"
    LANGCHAIN_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGCHAIN_API_KEY: str | None = None
    LANGCHAIN_PROJECT: str = "tickets-project"
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
