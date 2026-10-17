import { GitHubAPI } from "./github.js";
import { savedVault, saveVault, forgetVault, seal, unseal } from "./vault.js";
import { notice } from "./views.js";
import { createDashboard } from "./dashboard.js";

export function startLogin() {
  const byId = id => document.getElementById(id);
  let api = null, dashboard = null, generation = 0, busy = false;
  function loginMode() {
    const saved = Boolean(savedVault());
    byId("connect-form").hidden = saved; byId("unlock-form").hidden = !saved;
  }
  function clearInputs() { for (const id of ["token", "save-password", "confirm-password", "unlock-password"]) byId(id).value = ""; }
  function lock() {
    generation++; dashboard?.destroy(); dashboard = null; api?.close(); api = null;
    clearInputs(); byId("workspace").hidden = true; byId("login-panel").hidden = false; byId("lock").hidden = true;
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
      if (unlock) token = await unseal(savedVault(), byId("unlock-password").value);
      else {
        token = byId("token").value.trim();
        if (byId("remember").checked && (byId("save-password").value.length < 10 || byId("save-password").value !== byId("confirm-password").value)) {
          throw new Error("请设置至少 10 位本机密码，并确认两次输入一致。");
        }
      }
      candidate = new GitHubAPI(token);
      await candidate.connect();
      if (ticket !== generation) { candidate.close(); return; }
      const encrypted = !unlock && byId("remember").checked ? await seal(token, byId("save-password").value) : null;
      if (ticket !== generation) { candidate.close(); return; }
      if (encrypted) saveVault(encrypted);
      api = candidate; clearInputs(); notice(byId("login-message"));
      byId("login-panel").hidden = true; byId("workspace").hidden = false; byId("lock").hidden = false;
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
    try { forgetVault(); clearInputs(); loginMode(); notice(byId("login-message"), "本机加密配置已清除。GitHub 上的管理密钥仍保留，可再次使用或自行撤销。"); }
    catch (error) { notice(byId("login-message"), error.message, true); }
  });
  byId("lock").addEventListener("click", lock);
  window.addEventListener("pagehide", lock);
  loginMode();
}
