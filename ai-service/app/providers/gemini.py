import logging

from google import genai
from google.genai import errors, types

from ..config import settings
from .base import LLMProvider

log = logging.getLogger('ai-service')


class GeminiProvider(LLMProvider):
    def __init__(self) -> None:
        self.client = genai.Client(api_key=settings.gemini_api_key)

    async def generate(self, system: str, history: list[dict], message: str, json_mode: bool = False) -> str:
        contents = [
            types.Content(
                role="model" if h["role"] == "assistant" else "user",
                parts=[types.Part(text=h["content"])],
            )
            for h in history
        ]
        contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
        # Classification can use a cheaper/faster model (its own free-tier quota) if configured
        primary = (settings.gemini_classify_model or settings.gemini_chat_model) if json_mode else settings.gemini_chat_model
        fallbacks = [m.strip() for m in settings.gemini_fallback_models.split(",") if m.strip()]
        models = list(dict.fromkeys([primary, *fallbacks]))   # in order, no duplicates

        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json" if json_mode else None,
        )
        last_error: Exception | None = None
        for model in models:
            try:
                resp = await self.client.aio.models.generate_content(model=model, contents=contents, config=config)
                return resp.text or ""
            except errors.ClientError as e:
                # 429 = this model's free quota is used up, 404 = model name unknown/retired.
                # Try the next model; anything else (bad key, bad request) is a real error.
                if e.code in (404, 429):
                    log.warning("Gemini model %s unavailable (%s); trying next model", model, e.code)
                    last_error = e
                    continue
                raise
        raise last_error  # every model was unavailable

    async def embed(self, texts: list[str]) -> list[list[float]]:
        resp = await self.client.aio.models.embed_content(
            model=settings.gemini_embed_model,
            contents=texts,
            config=types.EmbedContentConfig(output_dimensionality=settings.embed_dimensions),
        )
        return [e.values for e in resp.embeddings]