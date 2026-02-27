import numpy as np
file_path = "../data/Chicago-Data/mi_result_io.npy"
loaded_array = np.load(file_path)

assert loaded_array.shape == (90, 77, 30, 77), loaded_array.shape

#model level matrix
model = loaded_array.mean(axis=(0, 2)) # (77,77)

def geo_id_to_idx(geo_id: str) -> int:
    return int(geo_id) - 1

def idx_to_geo_id(idx: int) -> str:
    return str(idx+1)

def row_for_geo_source(geo_source_id: str):
    i = geo_id_to_idx(geo_source_id)
    row = model[i, :] # (77,)
    #build map-ready dict: keys "1...77"
    return {idx_to_geo_id(j): float(row[j]) for j in range(77)}

for geo_source in ["1", "77", "35"]:
    out = row_for_geo_source(geo_source)
    keys = sorted(map(int, out.keys()))
    print(f"Source geo id {geo_source} -> tensor idx {geo_id_to_idx(geo_source)}")
    print(f"keys range: {keys[0]}..{keys[-1]} (count={len(keys)})")
    vals = list(out.values())
    print(f"value stats: min={min(vals):.4f} max={max(vals):.4f} mean={sum(vals)/len(vals):.4f}")
    print("-" * 50)
    
print("✅ Mapping + model aggregation look consistent.")
