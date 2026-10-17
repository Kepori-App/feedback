const KEY = "kepori-feedback-admin-vault-v1";
const encoder = new TextEncoder();
const base64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const bytes = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
const REPOSITORY = "Kepori-App/feedback-admin";
// Retire the accidentally downloaded local integration fixture, never a real credential.
const RETIRED_TEST = {"salt": "CKWoZ+e2EIjSWLB960UWww==", "iv": "AITnAPOCSUpq6HmE"};

export function validateVault(vault) {
  if (!vault || typeof vault !== "object" || Array.isArray(vault) ||
      Object.keys(vault).sort().join(",") !== "ciphertext,iv,salt,version" || vault.version !== 1) throw new Error("登录文件格式不正确。");
  try {
    for (const key of ["salt", "iv", "ciphertext"]) {
      if (typeof vault[key] !== "string" || vault[key].length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(vault[key])) throw new Error("format");
    }
    if (bytes(vault.salt).length !== 16 || bytes(vault.iv).length !== 12 ||
        bytes(vault.ciphertext).length < 64 || bytes(vault.ciphertext).length > 2048) throw new Error("size");
  } catch { throw new Error("登录文件已损坏，请从原设备重新导出。"); }
  if (vault.salt === RETIRED_TEST.salt && vault.iv === RETIRED_TEST.iv) throw new Error("这是一份联调测试登录文件。请回电脑上的正式管理页重新下载登录文件。");
  return { version: 1, salt: vault.salt, iv: vault.iv, ciphertext: vault.ciphertext };
}

export function connectionFile(vault) {
  return JSON.stringify({ format: "kepori-feedback-login", version: 1, repository: REPOSITORY,
    vault: validateVault(vault) }, null, 2) + "\n";
}
export function readConnectionFile(text) {
  if (typeof text !== "string" || text.length > 8192) throw new Error("请选择从管理页导出的登录文件。");
  let file;
  try { file = JSON.parse(text); } catch { throw new Error("无法读取登录文件，请重新选择。"); }
  if (file?.format !== "kepori-feedback-login" || file.version !== 1 || file.repository !== REPOSITORY ||
      Object.keys(file).sort().join(",") !== "format,repository,vault,version") throw new Error("这不是 Kepori 反馈管理的登录文件。");
  return validateVault(file.vault);
}

async function derive(password, salt, usages) {
  if (!globalThis.crypto?.subtle || globalThis.isSecureContext === false) {
    throw new Error("当前页面无法使用安全解密。请在 Safari 中打开 https://kepori-app.github.io/feedback/admin/ 后重试。");
  }
  const material = await globalThis.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, usages);
}
export async function seal(token, password) {
  if (password.length < 10) throw new Error("本机解锁密码至少需要 10 位。");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(token));
  return { version: 1, salt: base64(salt), iv: base64(iv), ciphertext: base64(ciphertext) };
}
export async function unseal(vault, password) {
  validateVault(vault);
  let key;
  try { key = await derive(password, bytes(vault.salt), ["decrypt"]); }
  catch (error) {
    if (error.name === "NotSupportedError") throw new Error("此浏览器未支持所需解密方式，请更新系统后使用 Safari，或换用其他现代浏览器。");
    throw error;
  }
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(vault.iv) }, key, bytes(vault.ciphertext));
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error.name === "NotSupportedError") throw new Error("此浏览器未支持所需解密方式，请更新系统后使用 Safari 重试。");
    throw new Error("密码与这份登录文件不匹配，或文件已损坏。请确认使用原设备的解锁密码和从正式管理页下载的文件。");
  }
}
export function savedVault() {
  try { return JSON.parse(localStorage.getItem(KEY)); }
  catch { return null; }
}
export function saveVault(vault) {
  try { localStorage.setItem(KEY, JSON.stringify(vault)); }
  catch { throw new Error("浏览器未允许保存本机配置。取消加密保存后，可仅在本次页面中使用。"); }
}
export function forgetVault() {
  try { localStorage.removeItem(KEY); }
  catch { throw new Error("无法清除本机配置，请在浏览器设置中清除此站点数据。"); }
}
