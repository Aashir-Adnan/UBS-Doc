import React from 'react';
import { Provider } from 'react-redux';
import { store } from '@site/src/state/store';

export default function Root({ children }) {
  return <Provider store={store}>{children}</Provider>;
}
