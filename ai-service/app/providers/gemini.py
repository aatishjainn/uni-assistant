from google import genai
from google.genai import types

from ..config import settings
from .base import LLMProvider


class GeminiProvider(LLMProvider):
    def __init__(self) -> None:
        self.client = genai.Client(api_key=settings.gemini_api_key)

    async def generate(self, system: str, history: list[dict], message: str) -> str:
        contents = [
            types.Content(
                role="model" if h["role"] == "assistant" else "user",
                parts=[types.Part(text=h["content"])],
            )
            for h in history
        ]
        contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
        resp = await self.client.aio.models.generate_content(
            model=settings.gemini_chat_model,
            contents=contents,
            config=types.GenerateContentConfig(system_instruction=system),
        )
        return resp.text or ""

    async def embed(self, texts: list[str]) -> list[list[float]]:
        resp = await self.client.aio.models.embed_content(
            model=settings.gemini_embed_model,
            contents=texts,
            config=types.EmbedContentConfig(output_dimensionality=settings.embed_dimensions),
        )
        return [e.values for e in resp.embeddings]
