from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ANTHROPIC_API_KEY: str
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"

    # 사용자가 등록한 Anthropic 키를 DB에 암호화해서 저장할 때 쓰는 대칭키
    # (Fernet.generate_key() 결과, url-safe base64 32바이트). JWT_SECRET_KEY와
    # 동급으로 다뤄야 한다 — 새어나가면 저장된 모든 사용자 키가 복호화 가능해진다.
    SECRET_ENCRYPTION_KEY: str

    # 프론트 오리진(CORS). 배포 환경에선 쉼표로 여러 개 넘길 수 있다
    # (예: "https://skillsns.vercel.app,https://skillsns-frontend.onrender.com").
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def CHECKPOINTER_URL(self) -> str:
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
