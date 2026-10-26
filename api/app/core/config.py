import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "NeuroCare API"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Security
    APP_SECRET_KEY: str = "neurocare_dev_insecure_secret_key_change_in_production_min32chars!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "capacitor://localhost",
        "http://localhost"
    ]
    
    # Database
    DATABASE_URL: str = "sqlite:///./neurocare_dev.db"
    USE_SQLITE: bool = True
    
    # Config Paths
    CLINICAL_CONFIG_PATH: str = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../config/clinical_thresholds.json")
    )
    SCORING_RULES_PATH: str = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../config/scoring_rules.json")
    )
    
    # Emergency protocol
    EMERGENCY_HELPLINE: str = "911"
    EMERGENCY_ADVISORY_MESSAGE: str = (
        "IMMEDIATE EMERGENCY ATTENTION REQUIRED: Observed acute facial drooping, "
        "limb weakness, or speech impairment triggers the FAST protocol. Seek emergency care immediately."
    )

settings = Settings()
