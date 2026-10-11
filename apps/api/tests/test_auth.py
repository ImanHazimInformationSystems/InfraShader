import json
from datetime import UTC, datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.auth import TokenVerifier
from app.config import Settings
from app.errors import APIError


@pytest.fixture
def keys():
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def verifier(keys):
    verifier = TokenVerifier(Settings(supabase_url="https://example.supabase.co", _env_file=None))
    verifier.jwks = SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=keys.public_key())
    )
    return verifier


def claims(**overrides):
    now = datetime.now(UTC)
    return {
        "sub": str(uuid4()),
        "iss": "https://example.supabase.co/auth/v1",
        "aud": "authenticated",
        "iat": now,
        "exp": now + timedelta(minutes=5),
        **overrides,
    }


def signed(keys, payload):
    return jwt.encode(payload, keys, algorithm="ES256", headers={"kid": "fixture-public-key"})


def test_valid_asymmetric_token_returns_uuid(verifier, keys):
    payload = claims()
    assert str(verifier.verify(signed(keys, payload))) == payload["sub"]


@pytest.mark.parametrize(
    "override",
    [
        {"exp": datetime.now(UTC) - timedelta(seconds=10)},
        {"iss": "https://foreign.supabase.co/auth/v1"},
        {"aud": "service_role"},
        {"sub": "not-a-user-uuid"},
        {"iat": datetime.now(UTC) + timedelta(hours=1)},
    ],
)
def test_invalid_identity_claims_denied(verifier, keys, override):
    with pytest.raises(APIError) as error:
        verifier.verify(signed(keys, claims(**override)))
    assert error.value.status_code == 401


@pytest.mark.parametrize("missing", ["sub", "exp", "iss", "aud", "iat"])
def test_required_claims_not_optional(verifier, keys, missing):
    payload = claims()
    del payload[missing]
    with pytest.raises(APIError) as error:
        verifier.verify(signed(keys, payload))
    assert error.value.status_code == 401


def test_tampered_signature_denied(verifier):
    other_key = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(APIError) as error:
        verifier.verify(signed(other_key, claims()))
    assert error.value.code == "invalid_session"


@pytest.mark.parametrize("algorithm", ["HS256", "none"])
def test_symmetric_and_unsigned_tokens_rejected(verifier, algorithm):
    key = "fixture-only-shared-secret-over-32-bytes" if algorithm == "HS256" else None
    token = jwt.encode(claims(), key, algorithm=algorithm, headers={"kid": "fixture"})
    with pytest.raises(APIError) as error:
        verifier.verify(token)
    assert error.value.status_code == 401


def test_missing_signing_key_id_denied(verifier, keys):
    with pytest.raises(APIError):
        verifier.verify(jwt.encode(claims(), keys, algorithm="ES256"))


def test_missing_provider_fails_closed():
    verifier = TokenVerifier(Settings(supabase_url=None, _env_file=None))
    with pytest.raises(APIError) as error:
        verifier.verify("arbitrary-token")
    assert error.value.status_code == 503


def test_provider_outage_is_not_false_invalid_session(verifier, keys):
    def unavailable(token):
        raise jwt.PyJWKClientConnectionError("fixture outage")

    verifier.jwks.get_signing_key_from_jwt = unavailable
    with pytest.raises(APIError) as error:
        verifier.verify(signed(keys, claims()))
    assert error.value.status_code == 503


def test_removed_signing_key_is_rejected_after_bounded_jwks_cache(monkeypatch, keys):
    """Exercise real key lookup/cache with mocked HTTP and clock, not a verifier stub."""
    clock = SimpleNamespace(value=1000.0)
    fake_time = SimpleNamespace(monotonic=lambda: clock.value)
    for module in ("jwt.jwks_client.time", "jwt.jwk_set_cache.time", "jwt.api_jwk.time"):
        monkeypatch.setattr(module, fake_time)
    original = jwt.algorithms.ECAlgorithm.to_jwk(keys.public_key(), as_dict=True)
    original.update(kid="fixture-public-key", use="sig", alg="ES256")
    replacement_key = ec.generate_private_key(ec.SECP256R1())
    replacement = jwt.algorithms.ECAlgorithm.to_jwk(replacement_key.public_key(), as_dict=True)
    replacement.update(kid="replacement-key", use="sig", alg="ES256")
    provider = {"keys": [original]}
    requests = []

    def open_jwks(request, timeout):
        requests.append(request.full_url)
        return BytesIO(json.dumps(provider).encode())

    monkeypatch.setattr(
        "jwt.jwks_client.urllib.request.build_opener",
        lambda *handlers: SimpleNamespace(open=open_jwks),
    )
    verifier = TokenVerifier(Settings(supabase_url="https://example.supabase.co", _env_file=None))
    token = signed(keys, claims())
    verifier.verify(token)
    assert len(requests) == 1
    provider["keys"] = [replacement]
    clock.value += 299
    verifier.verify(token)  # documented cache window, bounded to five minutes
    assert len(requests) == 1
    clock.value += 2
    with pytest.raises(APIError) as error:
        verifier.verify(token)
    assert error.value.status_code == 401
    assert len(requests) >= 2
