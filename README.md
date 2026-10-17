# Kepori 公开反馈站

纯静态 HTML/CSS/JavaScript，通过 GitHub Pages 发布。用户通过 Tally 表单提交，不需要 GitHub 或网站账号。

- `data/feedback.json`：只含公开反馈，由私有管理仓库自动生成。
- 不存联系邮箱、联系人哈希、兑换码、API 密钥或 Tally 原始数据。
- 本地预览：`python3 -m http.server 8765 --bind 127.0.0.1`。
- 处理状态与活动计数独立；重复反馈公开保留并关联原建议。
- 反馈数据延迟更新，静态网站没有管理员密码或实时提交接口。

品牌图标来自 Kepori 现有官方资源。网站源码与 App 源码独立。
