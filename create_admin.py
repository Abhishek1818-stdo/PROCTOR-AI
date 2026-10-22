
from getpass import getpass

from sqlalchemy import select

from app.database.dependencies import get_db
from app.models.user import User
from app.services.auth_service import hash_password


def main():
    full_name = input("Enter admin full name: ").strip()
    email = input("Enter admin email: ").strip().lower()
    password = getpass("Enter admin password: ")
    confirm_password = getpass("Confirm admin password: ")

    if not full_name or not email or not password:
        print("All fields are required.")
        return

    if password != confirm_password:
        print("Passwords do not match.")
        return

    db = next(get_db())

    try:
        existing_user = db.scalar(
            select(User).where(User.email == email)
        )

        if existing_user:
            print(
                f"An account already exists for {email}. "
                "No changes were made."
            )
            return

        admin = User(
            full_name=full_name,
            email=email,
            hashed_password=hash_password(password),
            role="ADMIN",
            is_active=True,
        )

        db.add(admin)
        db.commit()
        db.refresh(admin)

        print(f"Admin account created successfully. User ID: {admin.id}")
        print("Log in with this email and password to get a new access token.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()
