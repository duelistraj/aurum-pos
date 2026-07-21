from uuid import uuid4

from app.modules.auth.security import create_access_token, decode_token, hash_token


def test_access_token_contains_identity_session_but_no_role() -> None:
    user_id = uuid4()
    session_id = uuid4()
    payload = decode_token(create_access_token(user_id, session_id))
    assert payload["sub"] == str(user_id)
    assert payload["sid"] == str(session_id)
    assert payload["type"] == "access"
    assert "role" not in payload
    assert "shop_id" not in payload


def test_opaque_tokens_are_compared_by_digest() -> None:
    assert hash_token("token-a") == hash_token("token-a")
    assert hash_token("token-a") != hash_token("token-b")
