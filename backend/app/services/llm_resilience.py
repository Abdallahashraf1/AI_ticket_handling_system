from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Sequence

import structlog
from langchain_core.messages import BaseMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings

logger = structlog.get_logger()


class LLMServiceUnavailable(RuntimeError):
    pass


@dataclass
class CircuitState:
    failure_count: int = 0
    opened_until: float = 0.0

    @property
    def is_open(self) -> bool:
        return self.opened_until > time.time()


_circuit_state = CircuitState()


def _before_call() -> None:
    if _circuit_state.is_open:
        raise LLMServiceUnavailable("LLM circuit breaker is open")


def _on_success() -> None:
    _circuit_state.failure_count = 0
    _circuit_state.opened_until = 0.0


def _on_failure(error: Exception) -> None:
    _circuit_state.failure_count += 1
    if _circuit_state.failure_count >= settings.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD:
        _circuit_state.opened_until = time.time() + settings.LLM_CIRCUIT_BREAKER_RECOVERY_SECONDS
        logger.warning(
            "llm_circuit_opened",
            failures=_circuit_state.failure_count,
            recovery_seconds=settings.LLM_CIRCUIT_BREAKER_RECOVERY_SECONDS,
            error=str(error),
        )


async def invoke_json_llm(
    *,
    model: str,
    temperature: float,
    messages: Sequence[BaseMessage],
    parser: Any,
) -> Any:
    _before_call()
    llm = ChatGoogleGenerativeAI(model=model, temperature=temperature)
    chain = llm | parser
    try:
        result = await chain.ainvoke(messages)
        _on_success()
        return result
    except Exception as exc:
        _on_failure(exc)
        raise LLMServiceUnavailable(str(exc)) from exc
