# 沉浸式翻译 · 墨识 OCR

基于 [linux.do @haleclipse](https://linux.do/u/haleclipse/summary) 的 **1.29.3** 版本修改的沉浸式翻译浏览器扩展。

两大核心改动：

1. **解除会员限制** —— 移除订阅校验，全量功能直接可用
2. **接入墨识 OCR** —— 本地 OCR 接口接管图片/漫画翻译，支持 NPU 加速

---

## 主要功能

### 一、解除会员限制

扩展启动时接管官方 API 网关（`background.js` 中的 `__gw`），以本地数据替代服务端校验：

| 项目 | 处理方式 |
|---|---|
| 用户信息 | 返回本地构造的账号数据（`isPro` / `isMax` / `accountType: premium`），订阅状态置为长期有效 |
| 配额 | AI 翻译、PDF、ASR、MathPix 配额全部置为充足 |
| 官网接口 | `v1/user`、`v1/user/settings`、术语库、新手任务等路由返回本地模拟数据 |
| 会员服务项 | 官方托管的 `pro` / `max` 分组服务及其 `.add_v.` 变体置为隐藏，避免走不通的后端接口报错 |
| 定制服务 | 为 `custom`、`extends` 及 `openai` / `claude` / `gemini` / `deepseek` 补上划词翻译能力 |
| 未匹配请求 | 拦截返回空数据，不再向后端发起校验 |
| 统计上报 | `google-analytics.com`、`openfpcdn.io`、`analytics.immersivetranslate` 静默丢弃 |

因此 PDF 翻译、视频字幕、AI 翻译、术语库等原本需要订阅的功能可直接使用，无需登录。

### 二、墨识 OCR 图片翻译

接入本地墨识 OCR 服务（默认 `http://127.0.0.1:18765`），替代云端 OCR 处理图片与漫画：

- **框选翻译** —— 图片右键 →「框选翻译 · 墨识」，自由框选区域后识别并回填译文
- **图片翻译** —— 页面图片翻译可切换为墨识服务，识别结果直接排版回原图
- **漫画修复** —— 回填时可选「漫画修复」或「纯色覆盖」，并按横排/竖排自动排版
- **本地处理** —— 图片数据只发送到本机接口，API 令牌不出扩展进程（内容脚本无法读取）

可选识别引擎：

| 引擎 | 说明 |
|---|---|
| 均衡 · RepSVTR | NPU 检测 + CPU FP32 识别（默认） |
| NPU 优先 · PP-OCR | NPU 核心计算 + CPU 辅助 |
| 多视图识别 · PP-OCR | NPU 多视图识别，精度更高、耗时更长 |
| 微信 OCR | 由微信运行时选择计算设备 |
| Manga OCR | 日文漫画专用 |

---

## 安装

1. 下载本仓库（`Code` → `Download ZIP`）并解压
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择解压出的目录

## 配置墨识 OCR

1. 启动本地墨识浏览器 OCR 服务（`scripts/start-browser-api.ps1 -Background`）
2. 扩展选项页 →「漫画/图片」→「墨识 OCR · 本地接口」
3. 填写接口地址（默认 `http://127.0.0.1:18765`）与 API 令牌（墨识软件「设置 → 接口」中复制，或在 `browser-api.settings.json` 的 `token` 字段）
4. 点击「检查连接」，成功后可上传测试图片验证识别效果
5. 「图片翻译使用墨识已配置的 AI 翻译服务」：勾选则用墨识的翻译服务，取消则用扩展自身的翻译服务；识别失败时不会自动切换到其他 OCR

本地接口调用 `/v1/engines`、`/v1/ocr/jobs`、`/v1/translate`、`/v1/images/repair`，识别为异步任务，NPU 首次编译模型时耗时较长，界面会持续显示进度。

---

## 其他改动

- 修复若干运行时报错

## 目录说明

```
ink/                 墨识 OCR 集成（设置页、桥接、框选编辑器、排版渲染）
background.js        后台服务；末尾包含网关接管与墨识消息处理
content_main.js      内容脚本；图片翻译分发处接入 ink-ocr 服务
offscreen.js         离屏文档；承载 OCR 识别与图片合成的 Worker 环境
tesseract/  wasm/    内置 OCR 与 WASM 运行时
_locales/            多语言文案
```

## 已知限制

- 仅支持 Chromium 内核浏览器（Manifest V3），不支持 Firefox
- 墨识 OCR 依赖本机运行的服务，服务未启动时相关功能会明确报错而不会降级到云端 OCR
- 单张图片上限 24 MiB
- 上游版本更新不会自动合并，需手动同步

## 许可

本项目基于沉浸式翻译（Immersive Translate）的发行包修改，遵循 [MIT License](https://github.com/immersive-translate/immersive-translate)。仅供学习交流，请勿用于商业用途；使用产生的后果由使用者自行承担。

## 致谢

- [沉浸式翻译](https://immersivetranslate.com/) —— 上游项目
- [linux.do @haleclipse](https://linux.do/u/haleclipse/summary) —— 1.29.3 修改版本作者
