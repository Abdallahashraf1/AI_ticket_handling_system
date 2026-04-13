from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Ticket Handling System"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_KEY: str
    
    REDIS_URL: str = "redis://localhost:6379"
    CELERY_BROKER_URL: str = "redis://localhost:6379"
    
    # AI & Tracing
    GEMINI_API_KEY: str | None = None
    LANGCHAIN_TRACING_V2: str = "false"
    LANGCHAIN_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGCHAIN_API_KEY: str | None = None
    LANGCHAIN_PROJECT: str = "tickets-project"
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
