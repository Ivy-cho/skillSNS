from cryptography.fernet import Fernet

from app.core.config import settings

# 사용자가 등록한 LLM 키를 DB에 평문으로 두지 않기 위한 대칭키 암호화.
# SECRET_ENCRYPTION_KEY가 새어나가면 이 암호화도 무력화되니, JWT_SECRET_KEY와
# 마찬가지로 .env에만 두고 절대 커밋하지 않는다.
_fernet = Fernet(settings.SECRET_ENCRYPTION_KEY.encode())


def encrypt_secret(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()
