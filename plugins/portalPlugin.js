'use strict';

const React = require('react');


module.exports = function () {
  return {
    name: 'portal-plugin',
    injectHtmlTags() {
      const config = {
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId:
          process.env.FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.FIREBASE_APP_ID || '',
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
      };
      const apiBaseUrl =
        process.env.API_BASE_URL || 'http://localhost:3000';
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
            innerHTML: `window.__FIREBASE_CONFIG__=${JSON.stringify(config)};window.__API_BASE_URL__=${JSON.stringify(apiBaseUrl)};`,
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
