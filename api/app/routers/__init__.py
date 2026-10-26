from app.routers.health import router as health_router
from app.routers.auth import router as auth_router
from app.routers.patients import router as patients_router
from app.routers.assessments import router as assessments_router
from app.routers.features import router as features_router
from app.routers.baselines import router as baselines_router
from app.routers.findings import router as findings_router
from app.routers.reports import router as reports_router
from app.routers.monitoring import router as monitoring_router
from app.routers.ai_services import router as ai_router
from app.routers.audit_logs import router as audit_router
from app.routers.enrollment import router as enrollment_router
from app.routers.monitoring_plans import router as monitoring_plans_router
from app.routers.checkins import router as checkins_router
from app.routers.longitudinal import router as longitudinal_router

__all__ = [
    "health_router",
    "auth_router",
    "patients_router",
    "assessments_router",
    "features_router",
    "baselines_router",
    "findings_router",
    "reports_router",
    "monitoring_router",
    "ai_router",
    "audit_router",
    "enrollment_router",
    "monitoring_plans_router",
    "checkins_router",
    "longitudinal_router"
]
