import { GitHubAPI } from "./github.js?v=20261017-2";
import { savedVault, saveVault, forgetVault, seal, unseal } from "./vault.js?v=20261017-14";
import { notice } from "./views.js";
import { createDashboard } from "./dashboard.js?v=20261017-15";
import { connectionFiles } from "./connection-file.js?v=20261017-14";

export function startLogin() {
  const byId = id => document.getElementById(id);
  let api = null, dashboard = null, generation = 0, busy = false, importedVault = null;
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
  function lock() {
    generation++; dashboard?.destroy(); dashboard = null; api?.close(); api = null;
    importedVault = null; clearInputs(); byId("workspace").hidden = true; byId("login-panel").hidden = false; byId("lock").hidden = true;
    byId("device-menu").hidden = true; byId("device-menu").open = false;
    byId("account-info").textContent = ""; loginMode(); notice(byId("login-message"));
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
      api = candidate; importedVault = null; clearInputs(); notice(byId("login-message"));
      byId("login-panel").hidden = true; byId("workspace").hidden = false; byId("lock").hidden = false;
      byId("device-menu").hidden = false; files.refresh();
      dashboard = createDashboard(api);
      byId("workspace-title").setAttribute("tabindex", "-1"); byId("workspace-title").focus();
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
    try { forgetVault(); importedVault = null; clearInputs(); loginMode(); notice(byId("login-message"), "已清除此设备的登录配置。"); }
    catch (error) { notice(byId("login-message"), error.message, true); }
  });
  byId("cancel-import").addEventListener("click", () => {
    if (busy) return;
    importedVault = null; clearInputs(); loginMode(); message();
  });
  byId("lock").addEventListener("click", lock);
  window.addEventListener("pagehide", lock);
  loginMode();
}
