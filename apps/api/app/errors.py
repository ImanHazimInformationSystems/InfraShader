from typing import Any


class APIError(Exception):
    def __init__(
        self, status_code: int, code: str, message: str, details: list[Any] | None = None
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


def unavailable(message: str) -> APIError:
    return APIError(503, "service_unavailable", message)


def not_found() -> APIError:
    return APIError(404, "not_found", "The requested record is unavailable to this account.")
