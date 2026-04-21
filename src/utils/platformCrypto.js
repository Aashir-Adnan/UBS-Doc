import CryptoJS from "crypto-js";

const adjustKeyLength = (key, targetLength = 32) => {
  const safeKey = String(key || "");
  if (safeKey.length > targetLength) return safeKey.slice(0, targetLength);
  if (safeKey.length < targetLength) return safeKey.padEnd(targetLength, "0");
  return safeKey;
};

export const encryptObject = (object, key) => {
  const adjustedKey = adjustKeyLength(key);
  const encryptionKey = CryptoJS.enc.Utf8.parse(adjustedKey);
  return CryptoJS.AES.encrypt(JSON.stringify(object), encryptionKey, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
};

export const decryptObject = (encryptedObject, key) => {
  const adjustedKey = adjustKeyLength(key);
  const encryptionKey = CryptoJS.enc.Utf8.parse(adjustedKey);
  const decrypted = CryptoJS.AES.decrypt(encryptedObject, encryptionKey, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
};
