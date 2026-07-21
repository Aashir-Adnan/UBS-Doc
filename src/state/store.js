import { configureStore } from "@reduxjs/toolkit";
import { runtimeKeysReducer } from "./runtimeKeysSlice";
import { orgReducer } from "./orgSlice";

export const store = configureStore({
  reducer: {
    runtimeKeys: runtimeKeysReducer,
    org: orgReducer,
  },
});
