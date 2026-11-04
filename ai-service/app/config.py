from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_chat_model: str = "gemini-2.5-flash"
    gemini_embed_model: str = "gemini-embedding-001"
    embed_dimensions: int = 768  # must match vector(768) in the DB schema
    ai_service_token: str = ""   # shared secret: only Express may call us
    max_message_chars: int = 4000
    max_history_messages: int = 20


settings = Settings()
