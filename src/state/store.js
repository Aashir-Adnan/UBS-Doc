import { configureStore } from "@reduxjs/toolkit";
import { runtimeKeysReducer } from "@site/src/state/runtimeKeysSlice";
import { orgReducer } from "@site/src/state/orgSlice";

export const store = configureStore({
  reducer: {
    runtimeKeys: runtimeKeysReducer,
    org: orgReducer,
  },
});
