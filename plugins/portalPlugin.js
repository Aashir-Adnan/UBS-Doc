'use strict';

const React = require('react');


module.exports = function () {
  return {
    name: 'portal-plugin',
    injectHtmlTags() {
      const env = process.env;
      const config = {
        apiKey: env.FIREBASE_API_KEY || '',
        authDomain: env.FIREBASE_AUTH_DOMAIN || '',
        projectId: env.FIREBASE_PROJECT_ID || '',
        storageBucket: env.FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId:
          env.FIREBASE_MESSAGING_SENDER_ID || '',
        appId: env.FIREBASE_APP_ID || '',
        measurementId: env.FIREBASE_MEASUREMENT_ID || '',
      };
      const apiBaseUrl =
        env.VITE_BASE_URL || env.API_BASE_URL || 'http://localhost:3000';
      const runtimeEnv = {
        VITE_SECRET_KEY: env.VITE_SECRET_KEY || env.SECRET_KEY || '',
        VITE_PLATFORM_KEY: env.VITE_PLATFORM_KEY || env.PLATFORM_KEY || '',
        VITE_PLATFORM_NAME: env.VITE_PLATFORM_NAME || env.PLATFORM_NAME || '',
        VITE_PLATFORM_VERSION:
          env.VITE_PLATFORM_VERSION || env.PLATFORM_VERSION || '',
      };
      return {
        preBodyTags: [
          {
            tagName: 'script',
            src: 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js',
          },
          {
            tagName: 'script',
            src: 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js',
          },
          {
            tagName: 'script',
            innerHTML: [
              `
window.__FIREBASE_CONFIG__=${JSON.stringify(config)};
`,
              `window.__API_BASE_URL__=${JSON.stringify(apiBaseUrl)};
window.__VITE_SECRET_KEY__=${JSON.stringify(runtimeEnv.VITE_SECRET_KEY)};
window.__VITE_PLATFORM_KEY__=${JSON.stringify(runtimeEnv.VITE_PLATFORM_KEY)};
window.__VITE_PLATFORM_NAME__=${JSON.stringify(runtimeEnv.VITE_PLATFORM_NAME)};
window.__VITE_PLATFORM_VERSION__=${JSON.stringify(runtimeEnv.VITE_PLATFORM_VERSION)};
`,
              `window.__GIT_USERNAME__=${JSON.stringify(process.env.GIT_USERNAME || '')};`,
              `window.__GIT_PAT__=${JSON.stringify(process.env.GIT_PERSONAL_ACCESS_TOKEN || '')};`,
            ].join(''),
          },
        ],
      };
    },
    wrapRootElement({ element }) {
      const AuthRoot = require('../src/components/portal/AuthRoot').default;
      return React.createElement(AuthRoot, null, element);
    },
  };
};
