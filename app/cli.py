import asyncio
import sys
from app.core.database import AsyncSessionLocal
from app.modules.auth.models import User
from app.modules.auth.security import get_password_hash
from sqlalchemy import select

async def create_admin(username: str, password: str, full_name: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == username))
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print(f"User {username} already exists.")
            return

        new_user = User(
            username=username,
            password_hash=get_password_hash(password),
            full_name=full_name,
            role="Admin"
        )
        session.add(new_user)
        await session.commit()
        print(f"Admin user {username} created successfully.")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python -m app.cli <username> <password> <full_name>")
        sys.exit(1)
        
    username = sys.argv[1]
    password = sys.argv[2]
    full_name = sys.argv[3]
    
    asyncio.run(create_admin(username, password, full_name))
