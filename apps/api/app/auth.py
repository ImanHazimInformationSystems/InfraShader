from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.errors import APIError, unavailable

bearer = HTTPBearer(auto_error=False)


class TokenVerifier:
    """Trusted JWKS only; no shared-secret or unsigned-token fallback."""

    def __init__(self, settings: Settings) -> None:
        self.issuer = settings.issuer
        self.audience = settings.supabase_jwt_audience
        self.jwks = (
            jwt.PyJWKClient(
                f"{self.issuer}/.well-known/jwks.json",
                cache_keys=False,
                cache_jwk_set=True,
                lifespan=300,
                timeout=5,
            )
            if self.issuer
            else None
        )

    def verify(self, token: str) -> UUID:
        if not self.jwks:
            raise unavailable("Authentication is not configured. Set SUPABASE_URL on the API.")
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") not in {"RS256", "ES256"} or not header.get("kid"):
                raise jwt.InvalidTokenError("Unsupported signing algorithm")
            key = self.jwks.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                key.key,
                algorithms=["RS256", "ES256"],
                audience=self.audience,
                issuer=self.issuer,
                options={"require": ["sub", "exp", "iss", "aud", "iat"]},
                leeway=0,
            )
            return UUID(payload["sub"])
        except jwt.PyJWKClientConnectionError as exc:
            raise unavailable("The identity provider is unavailable. Retry shortly.") from exc
        except (jwt.PyJWTError, ValueError, TypeError, KeyError) as exc:
            raise APIError(401, "invalid_session", "Sign in again to continue.") from exc


@lru_cache
def get_verifier() -> TokenVerifier:
    return TokenVerifier(get_settings())


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    verifier: Annotated[TokenVerifier, Depends(get_verifier)],
) -> UUID:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise APIError(401, "authentication_required", "Sign in to continue.")
    return verifier.verify(credentials.credentials)
