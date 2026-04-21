import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { fetchRuntimeClientKeys } from "@site/src/services/runtimeKeysClient";

export const loadRuntimeKeys = createAsyncThunk(
  "runtimeKeys/load",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchRuntimeClientKeys();
    } catch (error) {
      return rejectWithValue(error?.message || "Runtime key load failed");
    }
  }
);

const runtimeKeysSlice = createSlice({
  name: "runtimeKeys",
  initialState: {
    keys: {},
    status: "idle",
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadRuntimeKeys.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadRuntimeKeys.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.keys = action.payload || {};
      })
      .addCase(loadRuntimeKeys.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || "Runtime key load failed";
      });
  },
});

export const runtimeKeysReducer = runtimeKeysSlice.reducer;
