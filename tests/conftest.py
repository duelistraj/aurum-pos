import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://aurum:change-me@localhost:5432/aurum_pos_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-long-enough")
os.environ.setdefault("MANAGER_PASSWORD", "manager-test-password")
os.environ.setdefault("CORS_ORIGINS", '["http://localhost:5173"]')
