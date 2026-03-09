import numpy as np
from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter(tags=["data4d"])
loadedArray = np.load("data/Chicago-Data/mi_result_io.npy")

#This allows us to slice the 4d tensor on any combination of dimensions
@router.get("/data4d")
def get_data4d(
    d1: Optional[int] = Query(None),
    b1: bool = Query(False),
    d2: Optional[int] = Query(None),
    d3: Optional[int] = Query(None),
    b3: bool = Query(False),
    d4: Optional[int] = Query(None)
):
    #Check for dimensions else take slice
    s1 = d1 if d1 is not None else slice(None)
    s2 = d2 if d2 is not None else slice(None)
    s3 = d3 if d3 is not None else slice(None)
    s4 = d4 if d4 is not None else slice(None)

    if b1 and b3:
        sliced = loadedArray[:s1, s2, :s3, s4]
    elif b1:
        sliced = loadedArray[:s1, s2, s3, s4]
    elif b3:
        sliced = loadedArray[s1, s2, :s3, s4]
    else:
        sliced = loadedArray[s1, s2, s3, s4]

    return sliced.tolist()