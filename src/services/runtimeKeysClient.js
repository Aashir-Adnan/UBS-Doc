import { decryptObject, encryptObject } from "@site/src/utils/platformCrypto";

const getEnvValue = (...keys) => {
  if (typeof window !== "undefined") {
    for (const key of keys) {
      if (window[key]) return window[key];
    }
  }
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return "";
};

const getRuntimeConfig = () => {
  const apiBaseUrl =
    (typeof window !== "undefined" && window.__API_BASE_URL__) ||
    process.env.VITE_BASE_URL ||
    process.env.API_BASE_URL ||
    "http://localhost:3000";

  return {
    apiBaseUrl: String(apiBaseUrl).replace(/\/$/, ""),
    secretKey: getEnvValue("__VITE_SECRET_KEY__", "VITE_SECRET_KEY", "SECRET_KEY"),
    platformKey: getEnvValue("__VITE_PLATFORM_KEY__", "VITE_PLATFORM_KEY", "PLATFORM_KEY"),
    platformName: getEnvValue(
      "__VITE_PLATFORM_NAME__",
      "VITE_PLATFORM_NAME",
      "PLATFORM_NAME",
      "__PLATFORM_NAME__"
    ),
    platformVersion: getEnvValue(
      "__VITE_PLATFORM_VERSION__",
      "VITE_PLATFORM_VERSION",
      "PLATFORM_VERSION",
      "__PLATFORM_VERSION__"
    ),
  };
};

export async function fetchRuntimeClientKeys() {
  const { apiBaseUrl, secretKey, platformKey, platformName, platformVersion } =
    getRuntimeConfig();

  if (!secretKey || !platformKey || !platformName || !platformVersion) {
    throw new Error("Missing required platform encryption environment values.");
  }

  const encryptedRequest = encryptObject(
    {
      reqData: null,
      encryptionDetails: {
        PlatformName: platformName,
        PlatformVersion: platformVersion,
      },
    },
    secretKey
  );

  const response = await fetch(`${apiBaseUrl}/api/runtimekeys?version=1`, {
    method: "GET",
    headers: {
      encryptedRequest,
      "Content-Type": "application/json",
    },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message || "Unable to fetch runtime keys");
  }

  const encryptedPayload = body?.payload;
  if (!encryptedPayload || typeof encryptedPayload !== "string") {
    throw new Error("Encrypted payload missing in runtime key response.");
  }

  const decryptedPayload = decryptObject(encryptedPayload, platformKey);
  return decryptedPayload?.return?.keys || {};
}
