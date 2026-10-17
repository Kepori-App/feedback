import { GitHubAPI } from "./github.js?v=20261017-17";
import { savedVault, saveVault, forgetVault, seal, unseal } from "./vault.js?v=20261017-17";
import { notice } from "./views.js?v=20261017-17";
import { createDashboard } from "./dashboard.js?v=20261017-19";
import { connectionFiles } from "./connection-file.js?v=20261017-17";
import { TabSession } from "./tab-session.js?v=20261017-19";

export function startLogin() {
  const byId = id => document.getElementById(id);
  let api = null, dashboard = null, generation = 0, busy = false, importedVault = null, expiresAt = 0, expiryTimer;
  const tabSession = new TabSession();
  const message = (text, error = false) => notice(byId(api ? "workspace-message" : "login-message"), text, error);
  const files = connectionFiles({ vault: savedVault, isBusy: () => busy || Boolean(api),
    message, imported(value) {
      importedVault = value; clearInputs(); loginMode();
      message("登录文件已读取，请输入原设备的解锁密码。"); byId("unlock-password").focus();
    } });
  function loginMode() {
    const saved = Boolean(importedVault || savedVault());
    byId("connect-form").hidden = saved; byId("unlock-form").hidden = !saved;
    byId("first-setup").hidden = saved;
    byId("import-connection").className = saved ? "text-button login-import" : "button connect-button";
    byId("cancel-import").hidden = !importedVault;
    byId("unlock-password").autocomplete = importedVault ? "off" : "current-password";
  }
  function clearInputs() { for (const id of ["token", "save-password", "confirm-password", "unlock-password"]) byId(id).value = ""; }
  function lock(clearSession = true, reason = "") {
    clearTimeout(expiryTimer); expiresAt = 0;
    let error = false;
    if (clearSession) {
      try { tabSession.clear(); }
      catch (failure) { reason = failure.message; error = true; }
    }
    generation++; dashboard?.destroy(); dashboard = null; api?.close(); api = null;
    importedVault = null; clearInputs(); byId("workspace").hidden = true; byId("login-panel").hidden = false; byId("lock").hidden = true;
    byId("device-menu").hidden = true; byId("device-menu").open = false;
    byId("account-info").textContent = ""; loginMode(); notice(byId("login-message"), reason, error);
    if (clearSession) { byId("keep-unlocked").checked = false; byId("keep-connected").checked = false; }
  }
  function checkExpiry() {
    if (expiresAt && Date.now() >= expiresAt) lock(true, "本次保持解锁已到期，请输入密码。");
  }
  function activate(candidate, deadline = 0) {
    api = candidate; importedVault = null; expiresAt = deadline; clearInputs(); notice(byId("login-message"));
    byId("login-panel").hidden = true; byId("workspace").hidden = false; byId("lock").hidden = false;
    byId("device-menu").hidden = false; files.refresh();
    dashboard = createDashboard(api);
    clearTimeout(expiryTimer);
    if (expiresAt) expiryTimer = setTimeout(checkExpiry, Math.max(0, expiresAt - Date.now()));
    byId("workspace-title").setAttribute("tabindex", "-1"); byId("workspace-title").focus();
  }
  async function restoreConnection() {
    if (busy || api) return;
    let saved;
    try { saved = tabSession.read(); }
    catch (error) { message(error.message, true); return; }
    if (!saved) return;
    busy = true; const ticket = ++generation;
    const buttons = document.querySelectorAll('#login-panel button[type="submit"]'); buttons.forEach(button => button.disabled = true);
    message("正在恢复管理连接…");
    let candidate;
    try {
      candidate = new GitHubAPI(saved.token); await candidate.connect();
      if (ticket !== generation) { candidate.close(); return; }
      if (Date.now() >= saved.expiresAt) throw new Error("本次保持解锁已到期，请输入密码。");
      activate(candidate, saved.expiresAt);
    } catch (error) {
      candidate?.close();
      if (ticket === generation) {
        try { tabSession.clear(); }
        catch (failure) { message(failure.message, true); return; }
        message(error.message, true);
      }
    } finally { busy = false; buttons.forEach(button => button.disabled = false); }
  }
  async function connect(event, unlock) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const ticket = ++generation;
    const submit = event.currentTarget.querySelector("button[type=submit]"); submit.disabled = true;
    notice(byId("login-message"), "正在连接 GitHub 私有反馈记录…");
    let candidate;
    try {
      let token;
      if (unlock) token = await unseal(importedVault || savedVault(), byId("unlock-password").value);
      else {
        token = byId("token").value.trim();
        if (byId("remember").checked && (byId("save-password").value.length < 10 || byId("save-password").value !== byId("confirm-password").value)) {
          throw new Error("请设置至少 10 位本机密码，并确认两次输入一致。");
        }
      }
      candidate = new GitHubAPI(token);
      await candidate.connect();
      if (ticket !== generation) { candidate.close(); return; }
      const encrypted = unlock ? importedVault : byId("remember").checked ? await seal(token, byId("save-password").value) : null;
      if (ticket !== generation) { candidate.close(); return; }
      if (encrypted) saveVault(encrypted);
      const keep = byId(unlock ? "keep-unlocked" : "keep-connected").checked;
      activate(candidate, keep ? tabSession.save(token) : 0);
    } catch (error) { candidate?.close(); if (ticket === generation) notice(byId("login-message"), error.message, true); }
    finally { busy = false; submit.disabled = false; }
  }
  byId("connect-form").addEventListener("submit", event => connect(event, false));
  byId("unlock-form").addEventListener("submit", event => connect(event, true));
  byId("remember").addEventListener("change", () => {
    const remember = byId("remember").checked;
    byId("save-password-fields").hidden = !remember;
    byId("save-password").required = remember; byId("confirm-password").required = remember;
  });
  byId("forget-device").addEventListener("click", () => {
    if (busy) return;
    try { forgetVault(); tabSession.clear(); importedVault = null; clearInputs(); loginMode(); notice(byId("login-message"), "已清除此设备的登录配置。"); }
    catch (error) { notice(byId("login-message"), error.message, true); }
  });
  byId("cancel-import").addEventListener("click", () => {
    if (busy) return;
    importedVault = null; clearInputs(); loginMode(); message();
  });
  byId("lock").addEventListener("click", () => lock());
  window.addEventListener("pagehide", () => lock(false));
  window.addEventListener("pageshow", event => { if (event.persisted) restoreConnection(); });
  window.addEventListener("focus", checkExpiry);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkExpiry(); });
  loginMode(); restoreConnection();
}
