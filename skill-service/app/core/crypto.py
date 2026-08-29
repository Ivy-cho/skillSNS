import logging
from typing import Optional

from cryptography.fernet import Fernet

from app.core.config import settings

logger = logging.getLogger(__name__)

# 사용자가 등록한 LLM 키를 DB에 평문으로 두지 않기 위한 대칭키 암호화.
# SECRET_ENCRYPTION_KEY가 새어나가면 이 암호화도 무력화되니, JWT_SECRET_KEY와
# 마찬가지로 .env에만 두고 절대 커밋하지 않는다.
_fernet = Fernet(settings.SECRET_ENCRYPTION_KEY.encode())


def encrypt_secret(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> Optional[str]:
    """복호화에 실패하면(암호키 불일치·손상 등) 예외를 던지지 않고 None을 반환한다 — 저장된
    키 하나가 깨졌다는 이유로 대화·생성 요청 전체가 500으로 죽으면 안 되기 때문이다.
    호출부는 None을 '쓸 수 있는 키가 없음'으로 처리한다."""
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except Exception:
        logger.warning("저장된 LLM 키 복호화 실패 — 키 없음으로 처리")
        return None
