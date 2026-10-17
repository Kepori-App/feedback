import { connectionFile, readConnectionFile } from "./vault.js?v=20261017-17";

export function canExportConnection(url) {
  const page = new URL(url);
  return page.origin === "https://kepori-app.github.io" &&
    ["/feedback/admin/", "/feedback/admin/index.html"].includes(page.pathname);
}

export function connectionFiles({ vault, imported, message, isBusy }) {
  const input = document.getElementById("connection-file");
  document.getElementById("import-connection").addEventListener("click", () => {
    if (!isBusy()) input.click();
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0]; input.value = "";
    if (!file || isBusy()) return;
    try {
      if (file.size > 8192) throw new Error("请选择从管理页导出的登录文件。");
      const value = readConnectionFile(await file.text());
      if (!isBusy()) imported(value);
    } catch (error) { message(error.message, true); }
  });
  const exportButton = document.getElementById("export-connection");
  exportButton.addEventListener("click", () => {
    try {
      if (!canExportConnection(location.href)) throw new Error("请在正式管理页下载登录文件；本地预览和测试页不能导出。");
      const blob = new Blob([connectionFile(vault())], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "Kepori-正式管理登录.kepori-login.json";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      document.getElementById("device-menu").open = false;
    } catch (error) { message(error.message, true); }
  });
  return { refresh() { exportButton.disabled = !vault() || !canExportConnection(location.href); } };
}
