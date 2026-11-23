"""Turn unexpected exceptions into the JSON error contract *inside* CORS.

Starlette sends ``Exception`` handlers to ``ServerErrorMiddleware``, the outermost layer. Its
response bypasses ``CORSMiddleware``, so a cross-origin browser could not read a 500 and
reported "the API could not be reached". This middleware sits inside CORS, so the browser
receives a readable error with its request reference. Only the exception type is logged.
"""

import json
import logging
from uuid import uuid4

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("infrashader.requests")
MESSAGE = (
    "The operation failed on the server. Retry shortly; if it continues, report the reference."
)


class UnexpectedErrorMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracked(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracked)
        except Exception as exc:
            if started:
                raise
            request_id = scope.get("state", {}).get("request_id") or str(uuid4())
            logger.error("unexpected_error request_id=%s type=%s", request_id, type(exc).__name__)
            body = json.dumps(
                {
                    "error": {"code": "internal_error", "message": MESSAGE, "details": []},
                    "request_id": request_id,
                }
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                        (b"x-request-id", request_id.encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
