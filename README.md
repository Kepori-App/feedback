# Kepori 公开反馈站

纯静态 HTML/CSS/JavaScript，通过 GitHub Pages 发布。用户通过 Tally 表单提交，不需要 GitHub 或网站账号。

- `data/feedback.json`：只含公开反馈，由私有管理仓库自动生成。
- 不存联系邮箱、联系人哈希、兑换码、API 密钥或 Tally 原始数据。
- 本地预览：`python3 -m http.server 8765 --bind 127.0.0.1`。
- 处理状态与活动计数独立；重复反馈公开保留并关联原建议。
- 反馈数据延迟更新；`admin/` 是直连 GitHub API 的静态管理页，无后端或云函数。

## 管理

打开 [反馈管理](https://kepori-app.github.io/feedback/admin/)，首次粘贴仅授权私有 `Kepori-App/feedback-admin` 仓库 Issues 读写、Metadata 只读的细粒度 GitHub 密钥。

- **处理反馈**：点选反馈，标记有效 / 不计数 / 重复，选择采纳等处理状态并保存；可填写公开回复。
- **用户与发码**：自动按同一联系邮箱跨月累计；在待发码列表查看达标用户，手动发码后点“我已发码，标记完成”。
- **同步新反馈**：请求既有 GitHub Actions 立即读取 Tally；默认仍每小时自动同步。
- 按钮提交后先显示同步中，私有元数据确认后才更新统计；公开页随后由 Actions / Pages 更新。
- 密钥默认仅存当前页面内存，刷新后需重新输入。可由管理员自行设置至少 10 位本机密码，以 PBKDF2（600000 次 SHA-256）+ AES-GCM 加密保存在当前浏览器；密码不上传。退出清除内存，忘记设备清除密文，不会撤销 GitHub 密钥。
- 私有数据不写入公开文件。管理页不加载第三方脚本；CSP 限制联网到 GitHub API。密码遗失可重新配置，密钥过期需去 GitHub 续建。

不要将现有 `SITE_TOKEN`、Tally 密钥或广泛权限的 CLI/OAuth 凭据输入管理页。

品牌图标来自 Kepori 现有官方资源。网站源码与 App 源码独立。

## 图片与视频

Tally 上传项选填，每条最多 3 个，单文件不超过 10MB；支持 JPG/JPEG、PNG、GIF、WebP、MP4、MOV、WebM。图片和视频会随反馈公开，用户提交前应自行遮挡隐私。视频建议 MP4，其他格式是否能直接播放取决于浏览器，始终提供原文件入口。

附件经既有 GitHub Actions 下载并验证实际文件格式，保存到 `assets/uploads/<sha256>.<extension>`，公开 JSON 只包含同站路径、类型、大小。Tally 私有下载 URL、原始文件名和上传者邮箱不发布。附件失败时保留文字反馈，后续自动重试；页面显示附件同步中。附件公开后会进入 Git 历史。
