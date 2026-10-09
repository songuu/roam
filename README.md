# 途伴 Roam · 旅游 Agent

一个可本地运行的中文旅游规划 Web 应用：从旅行诉求生成行程，保存图文手记，导出小红书与朋友圈分享内容，并用明确反馈调整旅行偏好。前后端通过 REST API 分离，App 可以复用规划与记录能力。

## 本地启动

需要 Node.js 22.13+（开发环境验证版本为 22.22）。

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。Web 在 5173，API 在 3001；Vite 代理 `/api`。不配置任何密钥也能使用本地目录、规则规划、手记与分享。

本地生产构建：

```powershell
npm run build
npm start
```

打开 [http://127.0.0.1:3001](http://127.0.0.1:3001)。服务默认仅监听本机。本项目没有自动部署。

## 主要流程

1. 输入自由文本诉求，点击“识别旅行诉求”，核对识别出的目的地、日期、人数、总预算、交通和偏好；也可直接填写结构化表单。多城用逗号分隔，最多三个城市、十四天。未明确识别的字段会保留当前表单并提示，不会伪造用户意图。
2. Agent 读取偏好与地点、检查天气、对候选评分、组织顺路安排并计算预算。结果展示逐日路线、餐饮、住宿区域、交通估计、穿着清单、备选及来源。
3. 修改需求或切换雨天情景后重新规划，版本增加。景点评价可影响以后推荐；单次请求与长期画像分开保存。
4. 在“旅途手记”记录实际文字和照片。所有内容刷新后保存，照片经服务器重新编码并去除 EXIF。
5. 在“分享工作室”生成两种平台文案，编辑后复制、下载文字或图片拼贴。无真实记录时不会编造游记。应用不自动向小红书或朋友圈发布。
6. 在“旅行偏好”修改明确偏好、关闭反馈学习或清除推断权重。

## 外部服务配置

所有配置放在服务器 `.env`，密钥不会进入前端代码。

|变量|用途|未配置或失败时|
|---|---|---|
|`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`|兼容 OpenAI 的模型增强|可解释规则模式；保留核心约束规划|
|`AMAP_KEY`|高德 Web 服务地点检索|使用内置目的地目录；未知目的地明确拒绝详细攻略|
|`WEATHER_ENABLED`|Open-Meteo 天气查询开关|使用标注的季节参考|
|`HOST`、`PORT`、`APP_ORIGIN`|本地监听与允许来源|默认本机端口；自定义来源应与实际 Web 地址一致|
|`DATA_DIR`|SQLite 与照片存储位置|默认 `data/`|

天气只在预报覆盖窗口内视为实时查询；窗口外、断网或超时会显示降级来源。雨天/晴天情景是用于重排的模拟，不能视为天气预报。

高德检索返回 GCJ-02 坐标，地图组件使用的坐标转换必须维持一致。真实地点检索不代表验证营业时间、预约余票或当前价格。

## 能力与事实边界

- 本地目录包含杭州、成都、大理、北京、上海、西安；地点介绍是离线参考。实际营业、预约、菜单、无障碍设施需出行前核实。
- 交通时间与路线连线用于规划估计，地图连线是地点顺序示意。点击导航链接可在地图中核对实际路线。
- 客流等级根据日期、地点与时段估计；未接入实时客流源。门票、住宿、餐饮和交通费用是预算参考，不是实时销售报价。
- 预算按全体同行人计算；跨城与出发/返程交通缺乏真实票价时会说明假设，不进行预订或付款。
- 画像进化采用可解释的兴趣权重与明确偏好，用户可关闭或清除。没有对基础模型进行在线训练，也不保证所有约束下都有完美路线。
- 本地个人工作空间用随机 HttpOnly cookie 隔离。它不是生产账户系统；公开部署前需要正式身份认证、HTTPS、账号恢复、配额和备份策略。

## App / Web 接口

响应为 JSON；错误形如 `{ "error": { "code": "...", "message": "..." } }`。请求与响应类型定义在 `shared/types.ts`，运行时校验在 `shared/schema.ts`。

|接口|行为|
|---|---|
|`GET /api/health`、`GET /api/config`|健康和服务能力，不返回密钥|
|`GET /api/session`|当前私有工作空间的 bearer token，供本地 App 接入；请按凭证保护|
|`GET /api/destinations`|可离线使用的目的地|
|`POST /api/intent`|识别请求中自由文本，返回 `{ request, extracted, warnings, mode }` 供用户确认|
|`GET /api/profile`、`PUT /api/profile`|读取与保存明确偏好|
|`DELETE /api/profile/memory`|清除推断权重和反馈依据|
|`GET /api/trips`、`POST /api/trips`|读取保存的行程、生成新行程|
|`GET /api/trips/:id`、`DELETE /api/trips/:id`|读取或删除自己的行程|
|`POST /api/trips/:id/replan`|请求体 `{ request, revision }`；防止过期版本覆盖|
|`POST /api/trips/:id/feedback`|`{ stopId, interest, rating: 1 或 -1 }`，重复反馈去重|
|`GET/POST /api/trips/:id/journal`|读取或新增真实记录|
|`PATCH/DELETE /api/journal/:id`|编辑或删除自己的记录|
|`POST /api/uploads`|multipart `photo` 字段，单张最大 8MB|
|`GET /api/photos/:id/file`、`DELETE /api/photos/:id`|鉴权读取与删除照片|
|`POST /api/trips/:id/share`|`{ platform: "xiaohongshu" 或 "wechat", entryIds? }`|
|`GET /api/trips/:id/export?format=markdown\|json\|ics`|完整攻略、结构化行程或日历导出|

浏览器通过同源 cookie 自动认证。App 可以从自己的已认证会话获取 token，再使用 `Authorization: Bearer <token>` 访问同一工作空间；服务器不接受任意未登记 token。未来正式移动端身份接入需要保留相同所有权检查，不能传入任意 `workspaceId` 访问数据。支持的 `HOST` 仅限本机 loopback 地址。

单工作空间最多 100 个行程、500 条记录、200 张照片或 100MB 照片存储。规划请求每个工作空间 10 分钟最多 30 次、同时 2 次；全局同时最多 4 次，超限返回可操作错误。

## 存储与验证

`data/` 存储 SQLite 与照片，`.env`、数据与生成构建均在忽略列表中。备份时应停服务后复制整个数据目录；不要仅复制照片或单个数据库旁路文件。删行程/手记/照片会影响自己的存储内容，操作前可先导出。

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
npm audit
```

端到端测试会先构建，使用独立数据目录，不修改日常使用的工作空间。Windows 优先使用已安装的 Chrome，否则需要 Playwright Chromium，可运行 `npx playwright install chromium`。测试端口默认 3103，可通过 `E2E_PORT` 更改；`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 可指定浏览器路径。

实现依据：[Open-Meteo 天气 API](https://open-meteo.com/en/docs)、[高德地点检索](https://lbs.amap.com/api/webservice/guide/api-advanced/search)、[Node SQLite](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)。
