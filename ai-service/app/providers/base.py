from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Common interface so Gemini / OpenAI / Ollama are interchangeable."""

    @abstractmethod
    async def generate(self, system: str, history: list[dict], message: str, json_mode: bool = False) -> str:
        """history items: {"role": "user"|"assistant", "content": str}.
        json_mode=True asks the model to reply with JSON only (used for classification)."""

    @abstractmethod
    async def embed(self, texts: list[str], task: str = "document") -> list[list[float]]:
        """task: 'document' when indexing text, 'query' when embedding a user question."""
