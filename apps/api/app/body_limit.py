from starlette.exceptions import HTTPException


class BodyLimit:
    """Count streamed bytes before multipart parsing can spool an unbounded upload."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = 12 * 1024 * 1024 if scope.get("path", "").endswith("/evidence") else 2 * 1024 * 1024
        total = 0

        async def bounded_receive():
            nonlocal total
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > limit:
                    raise HTTPException(413, "Request exceeds the permitted size.")
            return message

        return await self.app(scope, bounded_receive, send)
