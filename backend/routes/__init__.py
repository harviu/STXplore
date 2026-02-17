from backend.routes.health import router as health_router
from backend.routes.map import router as count_router
from backend.routes.selectionSummary import router as selection_router
routers = [
    health_router,
    count_router,
    selection_router
]
