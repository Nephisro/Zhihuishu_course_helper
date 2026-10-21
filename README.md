# 智慧树课程助手

适用于智慧树新版课程学习页面的 Chrome Manifest V3 扩展，当前版本 **1.4.0**。

支持视频课节连播、自动展开章节和滚动目录、随堂练习检测、本地题库及可选的 OpenAI 兼容 API 答题。项目处于验证阶段，网站更新后可能需要重新适配。

## 安装

需要 Chrome 118 或更高版本。扩展运行不需要 Node.js；开发、测试和打包需要 Node.js 22 或更高版本。

**从源码安装：**下载或克隆仓库，在 `chrome://extensions/` 打开开发者模式，选择“加载已解压的扩展程序”，加载仓库中的 **`extension/`** 文件夹。

**从安装包安装：**解压 `zhihuishu-course-helper-v1.4.0.zip`，加载其中包含 `manifest.json` 的 `zhihuishu-course-helper/` 文件夹。

安装后刷新课程页。升级已有版本时替换原扩展文件并重新加载，再刷新课程页。不要同时启用多个版本。

## 功能与使用

1. 打开 `https://wisdom-mooc.zhihuishu.com/study/` 下的课程学习页面，右下角出现助手面板。
2. 按需开启本地题库或 API 答题。
3. 需要连播时，勾选“浏览器输入连播（跳过章节测试）”。默认关闭，首次升级浏览器输入模式后也需要重新开启。
4. 点击“启动助手”。“停止助手”会停止后续操作，已经发出的输入无法撤回。

视频播放结束后，助手等待 15 秒，再按左侧目录顺序查找下一视频，跳过章节测试、考试和非课节条目。目标所在章节折叠时会点击章节标题展开；目标不在可见区域时只滚动左侧目录。每步操作后重新读取位置，待展开动画结束后再继续。

切课通过 Chrome 浏览器输入接口执行，不调用网页元素的 `.click()` 来切课。只有目标课节、播放器就绪状态和新视频源均得到确认，才视为成功。目录被遮挡、展开失败、滚动没有进展、切课超时或返回首页时停止，不重复点击，也不自动拉回首页。

随堂练习出现后优先使用已启用的本地题库；未匹配时可请求已配置的 API。整组题目匹配后选择并提交一次。未知题、已有手工选择、无效响应或未知弹窗等待人工处理。章节测试的“跳过”仅表示不点击该目录条目，不修改其完成记录。

## API 设置

在面板中打开“API 设置”，填写服务地址、模型 ID 和 API Key：

| 项目 | 填写方式 |
| --- | --- |
| DeepSeek Base URL | `https://api.deepseek.com` |
| OpenAI Base URL | `https://api.openai.com/v1` |
| 其他兼容服务 | HTTPS Base URL 或完整 `/chat/completions` 地址 |
| 模型 | 服务商实际支持的模型 ID |

保存时自动补齐接口路径。点击“授权域名并保存”，再点击“测试 API 答题”。测试通过后回到课程页勾选“新题调用 API”，它可以独立于本地题库开关工作。

API Key、地址和模型保存在扩展会话存储中，关闭浏览器或重新加载、更新扩展后需重新填写。API 默认每次浏览器会话最多调用 30 次，包含测试和失败请求，可调整为 1–500 次；请求间隔至少 5 秒，25 秒超时，失败不自动重试。API 仅支持含文字选项的单选、多选题；模型答案不保证正确。

## 本地题库

在“本地题库与诊断”中填入 JSON 并保存。答案填写正确选项的完整文字，不填 A/B。保存会替换整份题库，追加题目时保留原有条目。

```json
[
  {
    "question": "完整题干",
    "answers": ["正确选项的完整文字"]
  }
]
```

弹题时可使用“提取当前题目模板”。本地题库默认为空，不内置课程答案。

## 权限与数据

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存本地题库、偏好、会话 API 配置与切课日志 |
| `debugger` | 在当前课程标签页读取状态，并发送目录点击和滚轮输入；Chrome 会显示调试提示 |
| 可选 HTTPS 域名权限 | 仅在保存 API 设置时请求访问所填写的服务域名 |

`debugger` 是较强的浏览器控制权限，安装或升级时应核对 Chrome 的权限说明。实现只接受本扩展课程页发起的、经重新校验的下一视频请求，不接受任意网址或点击坐标，不自动连接其他标签页。

启用 API 时仅发送题干、题型和选项至所配置的服务，不发送账号、姓名或 Cookie。不使用外部统计服务。最近 200 条切课日志仅保存在当前浏览器，日志不包含 API Key；提交问题前请自行检查日志内容。

## 故障与限制

- API 设置页 → “切课诊断日志” → “读取切课日志”，可查看最近的切课、展开、滚动和跳转错误。
- 若提示浏览器连接被占用，请关闭该标签页的开发者工具或结束其他正在控制它的浏览器任务。
- 建议保持课程标签页选中、Chrome 不最小化；长期后台运行尚未验证，浏览器节流可能导致延迟。
- 不修改学习时长、完成记录或平台校验脚本；登录、验证及未知弹窗需要人工处理。
- 已按真实页面 DOM 结构适配，并包含 50 项离线自动测试；测试模拟 Chrome 协议和 HTTP 响应，不代表真实环境长期连播已通过验证。
- 仅针对当前适配的课程页面，不保证全部课程、浏览器和网站后续版本都兼容。


## 目录

```text
extension/       Chrome 扩展运行文件
tests/           离线自动测试
scripts/         检查与可重复打包脚本
docs/            使用与发布说明
.github/         自动检查工作流和问题反馈模板
```

## 许可证

当前未指定开源许可证。

## 参考

[Chrome debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) · [Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage) · [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) · [DeepSeek API](https://api-docs.deepseek.com/api/create-chat-completion/) · [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
