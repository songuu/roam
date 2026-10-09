---
type: sprint
status: completed
phase: compound
route: architectural-like
---

# 旅游 Agent Web 应用

用户请求：自动推进，完整实现依据诉求规划吃穿住行与路线的旅游 Agent，考虑季节、天气、人数和拥挤程度；记录旅途图文并生成小红书/朋友圈分享；依据画像和反馈持续个性化，提供可供 App/Web 复用的接口。

## Think 验收

- route: architectural-like。空项目、新系统、前后端接口及外部数据适配器需要统一设计。
- 默认假设：中文、人民币、国内自由行优先；本地个人工作空间；支持单城与多城路线；App 使用同一 REST API。未提供模型/地图凭证，配置后启用真实服务。
- 用户价值：少做重复攻略，能理解路线取舍，旅行中持续记录，旅行后分享真实经历，反馈能影响后续规划。
- WHEN 用户提交目的地、日期、人数、预算及偏好 THE SYSTEM SHALL 生成按天有序的吃穿住行、地点、路线、交通耗时、预算、备选及来源标签，并保存可再次打开的行程。
- WHEN 天气、节奏、人员限制或反馈变化 THE SYSTEM SHALL 重新评分与编排行程，说明使用的画像及变更原因，提供雨天/拥挤备选；不会把估计当实时客流、票价或开放状态。
- WHEN 用户保存、编辑或删除文字照片记录 THE SYSTEM SHALL 持久化变更且不泄露到其他工作空间。
- WHEN 用户生成小红书或朋友圈内容 THE SYSTEM SHALL 仅依据已记录经历生成可编辑预览，提供复制、文本/图片导出；空记录不能编造已完成经历。
- WHEN 用户明确保存偏好或评价活动 THE SYSTEM SHALL 显示可纠正、可删除的画像与反馈证据，并让下一次规划使用有效偏好。
- WHEN 外部服务失败或未配置 THE SYSTEM SHALL 返回明确降级信息、来源和时间，保持本地可运行。
- 范围边界：不自动发帖、预订付款或宣称全国实时票价/余票/客流；首版画像更新为可解释偏好权重，不声称训练模型。生产多人账号、支付和部署需要后续环境接入。

Think 与 Plan 已完成；架构、API 契约、任务依赖和测试边界已冻结。

<!-- design-authority:start -->
## Design Authority（shadow）

- 问题与用户价值：以可解释的约束规划替代拼接式攻略，旅途记录作为分享事实来源，显式反馈作为个性化依据。
- 范围：中文响应式 Web、REST API、SQLite 持久化、分工作空间行程/记录/画像、图文上传与导出、单城/最多三城路线、规划修订、天气适应与反馈学习。
- 非目标：自动社交发布、付款预订、无依据的实时客流/票价、多租户生产账号系统、模型训练。
- 备选：纯前端不利于持久存储和隐藏密钥；全模型规划不保证约束；选择 React/Vite + Express + SQLite、共享 TypeScript/Zod 契约、确定性约束引擎 + 可选模型增强。当前 Node 22.22 已验证支持 node:sqlite。
- 组件：client 展示与编辑；server/app 负责校验与隔离；server/store 负责 SQLite；server/planner 负责排序、路程和预算；server/providers 负责目录/天气/模型/高德检索；shared 是客户端与服务端唯一类型边界。
- 状态：行程请求与不可变修订结果持久化；旅途记录和照片关联行程；画像仅来自明确保存与活动反馈；删除后不残留对应文件；服务降级附来源与时间。
- 接口：GET /api/health、/api/config、/api/destinations、/api/profile、/api/trips；PUT /api/profile；POST /api/trips；GET/DELETE /api/trips/:id；POST /api/trips/:id/replan、/feedback、/share；GET/POST /api/trips/:id/journal；PATCH/DELETE /api/journal/:id；POST /api/uploads；DELETE /api/photos/:id；GET /api/trips/:id/export?format=markdown|json|ics；DELETE /api/profile/memory。修改和读取均有工作空间隔离，App 可通过工作空间 bearer token 访问；Web 使用 HttpOnly SameSite cookie。
- 错误：输入无效 400，缺记录 404，无真实地点的未知目的地 422，上传格式/体积受限，服务超时降级并清楚展示；不把自由文本或外部内容视为系统指令。
- Acceptance Criteria：
  - AC-1: WHEN 用户提交有效旅游需求 THE SYSTEM SHALL 保存并返回覆盖吃穿住行、逐日路线、通勤估计、预算拆分、备选、来源和推理步骤的完整行程。
  - AC-2: WHEN 日期天气、人数、节奏或明确偏好变化 THE SYSTEM SHALL 重排相关安排和费用，说明取舍，保留原始请求并增加修订版本。
  - AC-3: WHEN 用户新增编辑删除图文记录 THE SYSTEM SHALL 持久保存且隔离工作空间，限制安全图片格式与体积。
  - AC-4: WHEN 用户从旅途记录生成分享 THE SYSTEM SHALL 提供小红书和朋友圈两种可编辑文案与图文导出，空记录时拒绝编造已发生经历。
  - AC-5: WHEN 用户显式保存偏好或活动反馈 THE SYSTEM SHALL 显示可解释、可纠正、可清除的画像，并使下一次规划使用有效偏好。
  - AC-6: WHEN 外部数据或模型缺失失败 THE SYSTEM SHALL 清楚区分本地目录、季节参考、估计和实时来源，提供有上下文的失败说明，不暴露密钥。
  - AC-7: WHEN 在桌面或移动端运行 Web THE SYSTEM SHALL 提供完整可用的规划、行程、记录、分享和画像导航，并通过构建、类型、核心领域测试、API 隔离测试和浏览器流程检查。
<!-- design-authority:end -->

<!-- acceptance-contract:start -->
- [x] AC-1: WHEN 用户提交有效旅游需求 THE SYSTEM SHALL 保存并返回覆盖吃穿住行、逐日路线、通勤估计、预算拆分、备选、来源和推理步骤的完整行程。
- [x] AC-2: WHEN 日期天气、人数、节奏或明确偏好变化 THE SYSTEM SHALL 重排相关安排和费用，说明取舍，保留原始请求并增加修订版本。
- [x] AC-3: WHEN 用户新增编辑删除图文记录 THE SYSTEM SHALL 持久保存且隔离工作空间，限制安全图片格式与体积。
- [x] AC-4: WHEN 用户从旅途记录生成分享 THE SYSTEM SHALL 提供小红书和朋友圈两种可编辑文案与图文导出，空记录时拒绝编造已发生经历。
- [x] AC-5: WHEN 用户显式保存偏好或活动反馈 THE SYSTEM SHALL 显示可解释、可纠正、可清除的画像，并使下一次规划使用有效偏好。
- [x] AC-6: WHEN 外部数据或模型缺失失败 THE SYSTEM SHALL 清楚区分本地目录、季节参考、估计和实时来源，提供有上下文的失败说明，不暴露密钥。
- [x] AC-7: WHEN 在桌面或移动端运行 Web THE SYSTEM SHALL 提供完整可用的规划、行程、记录、分享和画像导航，并通过构建、类型、核心领域测试、API 隔离测试和浏览器流程检查。
<!-- acceptance-contract:end -->

## 实施任务（revision 1，已冻结）

|任务|目标/文件集合|前置依赖|风险|完成证据|
|---|---|---|---|---|
|T1|项目脚本、配置、shared/types.ts、shared/schema.ts、client/api.ts|无|L2|依赖安装与类型契约读回|
|T2 [P]|规划引擎、目录、外部适配器、server/planner*、server/providers*、server/catalog* 与领域测试，AC-1/2/5/6|T1|L2|先失败的约束测试，再通过|
|T3|server/app.ts、server/store.ts、server/index.ts、server/share.ts、API/隔离/上传测试，AC-1/2/3/4/5/6|T1；规划接口先约定|L3|API 集成测试与工作空间隔离；上传验证；仅本地运行|
|T4 [P]|client/App.tsx、client/components/*、client/styles.css，AC-1～7|T1|L2|前端构建、浏览器主流程和移动布局|
|T5|集成、README、环境示例、导出工具、回归与独立代码/安全审查，AC-1～7|T2/T3/T4|L3|测试、类型、生产构建、截图、发现修复记录|

T1～T5 实施完成。独立审查的有效问题均已修复，Work 验证证据见下。

T3 含隔离/文件删除风险，先定义本地边界与负例测试后实施，不标并行标签；其写入范围与 T2/T4 分离。外部调用只读，不部署或写外部状态。

## 风险与恢复

- 天气只在真实预报窗口内查询，其余用季节参考；目录地点与通勤费用不是实时供应。跨城交通和总预算不足必须显式提示。
- 本地 SQLite 存放 data/，不提交；用户可导出 JSON/Markdown/ICS。上传使用随机文件名、实际解码重编码、大小限制和所有权检查。
- API 默认监听 127.0.0.1。网络部署需要 HTTPS、正式账号认证和运维，不把本地匿名工作空间当生产安全。
- 未知目的地：有凭证可检索真实地点；无可靠地点拒绝详细规划并给出可操作错误，不编造景点。
- 回滚：新项目无既有数据迁移；代码与运行数据分开，修改不清空 data；避免自动删除用户工作空间。
- 测试：Vitest 领域负例/预算/天气/反馈，Supertest API 持久化/隔离/上传/分享；TypeScript 与生产 build；Playwright/浏览器完成一次规划→记录→分享→画像以及窄屏检查。
- Plan inline 检查：无未完成占位任务；契约与组件一致；范围受首版接口限定；价格/客流/外部凭证假设明确。

## 证据

- Work 验证（2026-10-09）：7 个测试文件、58 条 Vitest 用例全部通过；TypeScript 检查与生产构建通过；依赖审计 0 个漏洞。
- AC-1/2：领域测试覆盖日期/多城输入、同行人数、预算汇总、负向偏好、显式诉求优先、雨天重排、不可伪造预报、转场餐食与返程结束时间；API 验证修订 CAS 与已有记录日期保护。上海→成都四日三人低预算实例会明确报告预算不足。
- AC-3：API 验证工作空间及 App bearer 隔离、实际图片解码重编码、私有照片读取、隐藏数据目录、删除与关联保护；浏览器验证编辑中的临时图片删除、保存成功但响应中断后的草稿恢复与已存照片保留。
- AC-4：真实记录生成两平台可编辑文案、分享内容不被后来改写的目的地污染；浏览器实际下载 JSON、1080×1440 PNG 与朋友圈文本；ICS 导出对换行注入与 UTF-8 折行有回归测试。
- AC-5：反馈去重、有效标签与地点验证、清除权重/关闭学习；浏览器验证画像刷新持久化。动态审查验证首次 Cookie 单飞建立工作空间、延迟反馈不覆盖刚保存的画像、解释请求与分享响应不会串到另一行程。
- AC-6：Open-Meteo 真实联网读取杭州 2026-10-09/10 预报，2 日均标记 live，degraded=false；未配置模型/高德凭证，已验证规则降级和外部返回校验，真实模型及高德集成仍需用户密钥验证。
- AC-7：最新生产构建的 4 条 Playwright 场景全部通过（19.7s）；同四场景另重复三轮 12/12 通过（58.4s）。包括规划→雨天→反馈→导出→照片记录→两平台分享→画像更新/清除→刷新，以及 390px 移动布局和未知目的地错误。
- 浏览器产物：playwright-report/index.html、test-results/junit.xml，以及 test-results 中 desktop-home.png、mobile-home.png、itinerary.png、share-studio.png、share-card.png。截图已检查布局、内容及导出尺寸。
- 修复证据：输入/规划/API/ICS/服务启动问题均先补负例再修复；前端竞态通过动态延迟响应验证；一般代码、TypeScript 和安全审查已独立复验。占用或不可绑定端口会非零退出并携带上下文，不虚报启动成功。
- 最后配图修正：成都摄影 URL 失效，替换为 Unsplash 官方页面标注成都都江堰的摄影源 https://unsplash.com/photos/ornate-traditional-chinese-temple-roof-under-blue-sky-y0Z1iAqsnd4；图片 CDN 不可用时保留明确 fallback。
- Review 验收：独立最终 code-reviewer 对私有照片访问/清理、隐藏目录、监听失败、ICS、首次 config 单飞和反馈画像版本守卫进行有界复验，未发现可操作问题；独立复跑 4 个测试文件 18/18 通过，并核对浏览器报告。TypeScript reviewer 最后配图 URL 变更审查通过。未绑定 Harness，由当前宿主按照冻结 AC 核对证据；无未解决阻断项。

- Plan revision 2：在原 AC-1 的“用户提交诉求”范围内增加 POST /api/intent 与显式“识别旅行诉求”按钮，防止自由文本中的目的地/天数/人数/预算被默认表单吞掉。识别结果需用户核对后提交，结构化规划契约保持优先；root 独立拥有 server/intent.ts、测试与 shared/client API 增补。AC statement 未改动。

- 环境：空项目，无已有仓库或本地 AGENTS.md；Node v22.22.0/npm 10.9.4；SQLite 内存读写冒烟通过。
- 已查官方文档：Vite https://vite.dev/guide/；Express https://expressjs.com/en/advanced/best-practice-security/；Open-Meteo https://open-meteo.com/en/docs；高德 https://lbs.amap.com/api/webservice/guide/api-advanced/search；OpenAI Responses https://developers.openai.com/api/reference/resources/responses/methods/create。

授权边界：允许项目实现与本地运行验证；不自动提交、推送、部署、发布社交内容或写入长期学习库。外部 API 密钥缺失必须如实标注，并提供可运行的本地模式。

## Compound 与收尾

- 已验证事实：本地 Web 的规划、修订、图文记录、分享导出及画像反馈闭环通过领域/API/浏览器验证；REST 的 cookie 与已登记 bearer 工作空间访问已测；真实天气取数及有效日期解析已测。具体命令为 `npm test`、`npm run typecheck`、`npm run build`、`npm run test:e2e`、`npm audit`，结果见证据段及浏览器报告。
- 推断：移动 App 可复用共享契约和 REST API；当前未创建原生 App，不能把接口可复用视为原生端已验收。画像权重会响应显式反馈，不代表所有用户都得到全局最优路线。
- 未知项：用户的真实模型/高德凭证、线上账号/部署环境、实时供应与客流数据尚未提供；没有宣称这些已验证。估算来源和本地账号边界已写入 README 与界面。
- 知识筛选：本次根因和预防措施已落在针对性的回归测试与项目验收记录中；在当前禁止自动长期学习的边界内，额外 solution 或行为候选不产生必要的新交付价值，选择 no-op。仅搜索当前项目 `docs/`，未扫描历史或共享知识库。
- 本阶段新增知识文件 0、更新知识库 0、no-op 1；未创建 solution index 或 Claude projection（项目未配置这些文件与同步脚本）。未调用 propose/evaluate/approve/promote 或共享 runtime writer。

Solution index: unchanged 0 entries -> docs/solutions/index.jsonl; Claude projection: unchanged; AGENTS projection: disabled

Learning candidates: proposed 0; needs-review 0; evaluated 0; shadow 0; approve/promote: not run

- 未新增 solution/candidate，因此不需要索引或 schema 同步测试；当前宿主按未绑定 Harness 的验收协议完成核对。最终交付包含代码、环境示例、README、冻结验收记录与测试/截图产物。
- 最终静态产物：最后单行配图修正后再次生产构建通过（index-Ch4AREZO.js）；独立 Chrome 主页检查退出 0，成都图片 naturalWidth=650，主图及 6 城图片全部加载成功。最终桌面截图为 `test-results/desktop-home-final.png`，诊断为 `test-results/desktop-home-final-images.json`；完整 4/4 HTML/JUnit 报告保留。所有本次自建预览与验证服务已停止，运行数据与用户文件保留。
- 完成核对：AC-1～7 均勾选；T1～T5 完成；无未解决 Review finding；外部凭证/实时供应与生产账号边界已明确。Sprint 阶段与 Goal 通过各自权威工具收尾，不以文档状态替代工具读回。
