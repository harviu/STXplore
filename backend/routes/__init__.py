from backend.routes.health import router as health_router
from backend.routes.map import router as count_router
from backend.routes.selectionSummary import router as selection_router
from backend.routes.dateRange import router as date_range_router
from backend.routes.heatMap import router as heatMap_router
from backend.routes.selectionDaily import router as tooltipMap_router
from backend.routes.modelLevelRelation import router as model_level_router
from backend.routes.selectionAllDaily import router as selectionAllDaily_router
from backend.routes.instanceLevelRelation import router as instance_level_router
from backend.routes.data4d import router as data4d_router
from backend.routes.predictions import router as predictions_router
from backend.routes.sageLevelRelation import router as sage_level_router
from backend.routes.valueBounds import router as valueBounds_router
from backend.routes.selectionDailyCsv import router as selectionDailyCsv_router
routers = [
    health_router,
    count_router,
    selection_router,
    selectionAllDaily_router,
    date_range_router,
    heatMap_router,
    tooltipMap_router,
    model_level_router,
    instance_level_router,
    data4d_router,
    predictions_router,
    sage_level_router,
    valueBounds_router,
    selectionDailyCsv_router,
]
