import numpy as np
file_path = "../data/Chicago-Data/mi_result_io.npy"
loaded_array = np.load(file_path)
print(loaded_array)
print(f"Shape of the array: {loaded_array.shape}")
print(f"Data type of the array: {loaded_array.dtype}")
