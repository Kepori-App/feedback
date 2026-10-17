export const REPOSITORY = "Kepori-App/feedback-admin";
const BASE = `https://api.github.com/repos/${REPOSITORY}`;

export class GitHubAPI {
  #token;
  #requests = new Set();
  constructor(token, transport = fetch) {
    if (!/^github_pat_[A-Za-z0-9_]{40,}$/.test(token)) throw new Error("请使用仅授权反馈管理仓库的 GitHub 细粒度密钥（github_pat_ 开头）。");
    this.#token = token;
    this.transport = transport;
  }
  close() {
    this.#token = "";
    for (const controller of this.#requests) controller.abort();
    this.#requests.clear();
  }
  async request(path = "", method = "GET", data) {
    if (!this.#token) throw new Error("管理连接已退出，请重新解锁。");
    if (path && !/^\/issues(?:[/?]|$)/.test(path)) throw new Error("请求地址不在反馈管理范围内。");
    const controller = new AbortController();
    this.#requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await this.transport(BASE + path, {
        method, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.#token}`,
          "X-GitHub-Api-Version": "2022-11-28", ...(data ? { "Content-Type": "application/json" } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {})
      });
      if (!response.ok) {
        const messages = { 401: "管理密钥无效或已过期，请重新配置。", 403: "GitHub 拒绝访问，请检查 Issues 读写权限、组织批准状态或请求限额。", 404: "无法访问私有反馈仓库，请确认密钥仅选中了 Kepori-App/feedback-admin。", 422: "GitHub 未接受本次操作，请刷新后检查输入。" };
        throw new Error(messages[response.status] || `GitHub 暂时无法处理请求（${response.status}），请稍后刷新。`);
      }
      return await response.json();
    } catch (error) {
      if (error.name === "AbortError" || error instanceof TypeError) {
        throw new Error(method === "GET" ? "读取失败，请检查网络后刷新。" : "未能确认提交结果；请先刷新列表，避免重复操作。");
      }
      throw error;
    } finally { clearTimeout(timer); this.#requests.delete(controller); }
  }
  async connect() {
    const repo = await this.request();
    if (repo.full_name !== REPOSITORY || repo.private !== true || !repo.permissions?.push) {
      throw new Error("当前密钥对应账号没有该私有仓库的管理员写入权限。");
    }
    return repo;
  }
  async pages(path) {
    const items = [];
    for (let page = 1; ; page++) {
      const batch = await this.request(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error("GitHub 返回格式异常，请稍后刷新。");
      items.push(...batch);
      if (batch.length < 100) return items;
    }
  }
  issues() { return this.pages("/issues?state=all&sort=updated&direction=desc"); }
  comments(number) { return this.pages(`/issues/${this.number(number)}/comments`); }
  comment(number, body) { return this.request(`/issues/${this.number(number)}/comments`, "POST", { body }); }
  number(value) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("反馈记录编号无效。");
    return value;
  }
}
