import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getUserUrdds } from "../components/portal/tenantProjects/tenantApi";

// Fetch all URDDs for the signed-in user.
export const fetchUserUrdds = createAsyncThunk(
  "org/fetchUserUrdds",
  async (email) => {
    const res = await getUserUrdds(email);
    return res?.urdds ?? [];
  },
);

const STORAGE_KEY = "ubs-active-urdd";

function loadPersistedUrdd() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

const orgSlice = createSlice({
  name: "org",
  initialState: {
    urdds: [],
    activeUrdd: null,
    status: "idle", // idle | loading | ready | error
    error: null,
  },
  reducers: {
    setActiveUrdd(state, action) {
      const urddId = action.payload;
      const found = state.urdds.find((u) => u.urdd_id === urddId);
      if (found) {
        state.activeUrdd = urddId;
        try {
          localStorage.setItem(STORAGE_KEY, String(urddId));
        } catch {}
      }
    },
    clearOrg(state) {
      state.urdds = [];
      state.activeUrdd = null;
      state.status = "idle";
      state.error = null;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserUrdds.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchUserUrdds.fulfilled, (state, action) => {
        state.urdds = action.payload;
        state.status = "ready";

        // Restore persisted selection, or pick the default, or the first
        const persisted = loadPersistedUrdd();
        const persistedValid =
          persisted && action.payload.some((u) => u.urdd_id === persisted);
        if (persistedValid) {
          state.activeUrdd = persisted;
        } else {
          const def = action.payload.find((u) => u.is_default);
          state.activeUrdd = def?.urdd_id ?? action.payload[0]?.urdd_id ?? null;
        }
        if (state.activeUrdd) {
          try {
            localStorage.setItem(STORAGE_KEY, String(state.activeUrdd));
          } catch {}
        }
      })
      .addCase(fetchUserUrdds.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error?.message || "Failed to load organizations";
      });
  },
});

export const { setActiveUrdd, clearOrg } = orgSlice.actions;
export const orgReducer = orgSlice.reducer;
