# CiteBase

自托管的知识库问答服务：文档灌进去，用自然语言提问，**每句答案都能点开原文核对**；文档里没有的内容会明确拒答。

- 混合检索：向量召回 + 关键词召回，RRF 融合（专有名词、合同编号也能命中）
- 引用可溯源：每块带文件名 / 页码 / 章节路径，角标可点击定位
- 双模式作答：有模型密钥走生成式，没有则走抽取式（直接引用原句），**开箱即可演示**
- 评测可复现：20 条标注题集，输出 recall@5、引用命中率、拒答准确率，结果落库

## 快速开始

前置：Docker Desktop 正在运行、已安装 [Bun](https://bun.sh) 1.3+、端口 `5440` 与 `15640` 空闲。

**Windows**：双击 `start.bat`（等价于 `powershell -NoProfile -File start.ps1`）。

**macOS / Linux**：

```bash
cp .env.example .env      # 把 CHANGE_ME_ON_FIRST_RUN 换成自己的密码（两处）
docker compose up -d
bun install
bun run build             # 构建前端到 public/
bun run seed              # 导入 evals/docs 下的样例文档（库非空时自动跳过）
bun run src/index.ts
```

打开 <http://localhost:15640>。第一次启动会创建 `.env`（随机数据库密码）、起容器、装依赖、构建前端、导入样例，然后启动服务。

## 没有 API Key 也能完整演示

`ANSWER_MODE=auto` 且 `OPENAI_API_KEY` 为空时，系统自动切到 **extractive** 模式：
按查询词重合度从检索到的块里挑原句，附上角标，完全不联网、不可能编造。
页面顶部会显示一条提示，说明当前为抽取式。

要启用生成式，在 `.env` 里填：

```ini
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=deepseek-chat
EMBED_PROVIDER=local       # DeepSeek 只提供 chat，没有 /embeddings 接口
```

**DeepSeek 说明**：它的 OpenAI 兼容接口只覆盖对话补全（chat completions），没有 embeddings 端点，
所以用 DeepSeek 作答时 `EMBED_PROVIDER` 必须保持 `local`（哈希向量）。想要真语义向量，需要另配一家
提供 `/embeddings` 的服务，并同时改 `EMBED_DIM`。

改 `EMBED_PROVIDER` / `EMBED_DIM` 后必须重算存量向量：`bun run reembed`（不同模型的向量不可比较）。

## 目录结构

```
sql/init.sql            建表、扩展、索引（幂等，服务启动时会再执行一次）
src/
  index.ts              Hono 应用、静态托管、启动自检
  config.ts             zod 校验环境变量，配置非法直接退出
  ingest/               parse（含 PDF 段落重排）→ chunk → store（去重/写入）
  retrieve/             tokenize（中文二元组）· embed · search（双路）· rrf
  answer/               generate（LLM）· extractive（离线）· guard（引用校验/拒答）
  routes/               documents · query · eval
  eval/                 questions · metrics · run · ablation · cli
  tools/                seed · reembed · make-sample-pdf
web/                    React 19 + Vite + Tailwind（文档库 / 问答 / 评测三视图）
evals/                  20 题题集 + 3 份样例文档（md / txt / 生成的 pdf）
tools/eval.ps1          通过 API 跑评测并打印指标表（纯 ASCII）
site/index.html         客户向介绍页
docs/                   system-design.html（设计）· evaluation.html（评测报告）
```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 必填 | `postgres://user:pw@localhost:5440/citebase` |
| `PORT` | `15640` | API + 前端同端口 |
| `EMBED_PROVIDER` | `local` | `local` 离线哈希向量 / `openai` 兼容接口 |
| `EMBED_DIM` | `384` | 与 `chunks.embedding` 列宽一致，改动需 `reembed` |
| `ANSWER_MODE` | `auto` | `auto` / `extractive` / `llm` |
| `TOP_K` | `30` | 每个检索臂的候选数 |
| `RRF_K` | `60` | RRF 平滑常数 |
| `CONTEXT_K` | `8` | 送入作答的块数，也是引用编号上限 |
| `MAX_UPLOAD_MB` | `20` | 单文件上限，超出返回 413 |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `700` / `120` | 分块窗口与重叠字符数 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 数据库、回答模式、向量提供方 |
| GET | `/api/documents` | 文档列表 + 统计 |
| POST | `/api/documents` | multipart，字段名 `file`；重复文件返回 `duplicate:true` |
| DELETE | `/api/documents/:id` | 删除并级联清理块 |
| GET | `/api/documents/:id/text` | 按块重建原文（纯文本） |
| POST | `/api/query` | `{ "question": "..." }` → 答案 + 引用 + 检索/引用 id |
| POST | `/api/eval/run` | 同步跑完 20 题并落库 |
| GET | `/api/eval/latest` | 最近一次评测（含逐题明细） |

示例：

```bash
curl -s -X POST http://localhost:15640/api/query \
  -H 'content-type: application/json' \
  -d '{"question":"费用发生后多少天内必须提交报销单？"}'
```

## 测试与评测

```bash
bun test                       # 31 个单测：分块 / RRF / 分词 / 引用守卫 / 指标
bunx biome check src web/src   # lint + format 检查
bunx tsc --noEmit              # 类型检查
bun run eval                   # 跑 20 题，打印指标与分臂消融
powershell -NoProfile -File tools/eval.ps1   # 同一套题，走 HTTP 接口
```

当前样例语料上的结果：

| 运行 | 模式 | recall@5 | 引用命中 | 拒答准确 | 单题耗时 |
| --- | --- | --- | --- | --- | --- |
| run #4 | extractive（无密钥） | 100% | 100% | 100% | 0–3 ms |
| run #5 | llm（deepseek-chat） | 100% | 100% | 100% | 0.6–1.1 s |

**这是 3 份样例文档 + 自建题集的上限值，不代表生产召回率**；分臂消融（向量 94.1% / 关键词 100% / 融合 100%）
与失败修复过程见 `docs/evaluation.html`。

## 已知限制

- 不支持扫描件 OCR：没有文本层的 PDF 会入库失败并在列表标红。
- 离线向量是哈希词袋，语义能力有限；真正的语义检索需要一家提供 `/embeddings` 的服务（DeepSeek 没有）。
- 无 rerank、无查询改写；多跳问题与模糊指代效果一般。
- 单进程、无鉴权，定位是内网自托管；需要鉴权时放在反向代理之后。
- 前端未使用组件库，无障碍细节（焦点顺序、屏幕阅读器文案）只做了基础覆盖。
- 用 DeepSeek 作答时回答统一为简体中文（提示词约束），英文提问也会被译成中文回答；接口报错会自动降级为抽取式并提示原因。

## 数据与隐私

所有文档、向量、问答日志都在你自己的 Postgres 里。只有在配置了 `OPENAI_*` 时，
被选中的 8 个文本块与问题才会发送到所配置的模型服务；离线模式下不出本机。

## 文档

- `docs/system-design.html` —— 架构、数据模型、检索算法、决策与代价、接口、性能、验收对照
- `docs/evaluation.html` —— 20 题明细、指标定义、分臂消融、失败分析与复现步骤
- `site/index.html` —— 客户向介绍页（可直接部署为静态站）
