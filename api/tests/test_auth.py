from app.models.user import User
from app.core.security import get_password_hash

def test_login_doctor(client, db_session):
    # Ensure doctor exists in the active test session
    doc = db_session.query(User).filter(User.email == "doctor@neurocare.org").first()
    if not doc:
        doc = User(
            email="doctor@neurocare.org",
            hashed_password=get_password_hash("Doctor123!"),
            full_name="Dr. Elena Vance, MD",
            role="doctor"
        )
        db_session.add(doc)
        db_session.commit()

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "doctor@neurocare.org", "password": "Doctor123!"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "doctor"
    assert "Elena Vance" in data["full_name"]

def test_login_invalid_password(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "doctor@neurocare.org", "password": "WrongPassword!"}
    )
    assert response.status_code == 401

def test_register_and_login_patient(client):
    # Register new patient user
    reg_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "sarah.connor@neurocare.org",
            "password": "Password123!",
            "full_name": "Sarah Connor",
            "role": "patient"
        }
    )
    assert reg_response.status_code == 200
    user_data = reg_response.json()
    assert user_data["email"] == "sarah.connor@neurocare.org"
    assert user_data["role"] == "patient"

    # Login
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah.connor@neurocare.org", "password": "Password123!"}
    )
    assert login_response.status_code == 200
    login_data = login_response.json()
    assert "access_token" in login_data
