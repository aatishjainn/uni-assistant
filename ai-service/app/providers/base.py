from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Common interface so Gemini / OpenAI / Ollama are interchangeable."""

    @abstractmethod
    async def generate(self, system: str, history: list[dict], message: str) -> str:
        """history items: {"role": "user"|"assistant", "content": str}"""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        ...
