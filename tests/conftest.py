import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://aurum:change-me@localhost:5432/aurum_pos_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-long-enough")
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DEPLOYMENT_MODE", "self_hosted")
os.environ.setdefault("CORS_ORIGINS", '["http://localhost:5174"]')
os.environ.setdefault("AWS_REGION", "ap-southeast-1")
os.environ.setdefault("S3_INVOICE_BUCKET", "test-invoice-bucket")
