import { configureStore } from "@reduxjs/toolkit";
import { runtimeKeysReducer } from "@site/src/state/runtimeKeysSlice";

export const store = configureStore({
  reducer: {
    runtimeKeys: runtimeKeysReducer,
  },
});
