# **Delphi 文档 MCP 架构设计参考**





参考 MightyDillah 的 Apple Doc MCP 工具，可以将其架构分为以下部分：文档模型、存储缓存、索引搜索和接口设计  。Apple Doc MCP 采用 Node.js/TS 实现，针对每个“技术栈”（框架或库）进行高效缓存，一旦抓取某个框架的文档就存储到本地，下次请求可快速命中缓存 。所有文档输出为结构化的 Markdown 格式，方便 AI 解析 。该服务通过多个“工具”（MCP 接口）对外提供功能：列出技术栈（浏览可用框架）、搜索符号（支持通配符搜索）、获取文档等 。搜索部分背后依赖全文索引（如 Lunr.js）进行关键词匹配，可支持 * 通配符和模糊匹配  。文档模型通常包括符号名、声明、描述和成员列表等字段，并建立对应的倒排索引。总体而言，复用组件包括：**爬虫/解析器**（将 HTML 文档解析为内部模型）、**本地存储**（JSON/Markdown 文件或数据库）、**搜索索引**（如 Lunr 建立关键词索引）和**MCP 接口**（Node.js 提供的工具 API，如 listTechnologies、searchSymbols、getDocumentation 等 ）。这种架构对 Delphi 文档也适用，可以借鉴其按框架缓存、多级检索的设计。





## **DevExpress VCL 文档抓取与解析**





DevExpress VCL 官方文档网站（如 docs.devexpress.com/VCL）采用静态 HTML，分为产品套件和 API 参考页。每个控件类有独立页面，包含类声明、继承关系、描述和成员分类。例如，TcxGrid 类文档中声明为：

```
TcxGrid = class(
    TcxCustomGrid
)
```

。类页面通常以 ## Declaration 开头给出继承关系，然后是 ## Remarks 等描述段落。页面中还列出“主要 API 成员”（Main API Members）分类。类的全部成员（构造器、属性、方法、事件）通常在单独的子页面列出（如 *TcxGrid Members*, *Properties*, *Methods*, *Events* 页面），这些列表可用来构建结构化文档。爬取时可依次：



- 先抓取产品导航或套件页面，获取所有类链接。DevExpress 文档将“ExpressQuantumGrid Suite”等分为不同栏目，每个栏目下包含控件类链接  。
- 对于每个类链接（如 cxGrid.TcxGrid），使用工具（推荐用 Cheerio 静态解析，必要时 Puppeteer）提取 HTML 内容。首先解析类声明（类名和父类） 、简要说明（Remarks）、教程链接等。
- 然后解析成员列表：可以直接抓取该类的“Members”页面或“Properties/Methods/Events”页面，读取表格或链接列表，获取每个成员的名称、类型、描述。例如，TcxGrid 的成员页面列出了其构造函数、属性和方法等，每项条目有名称和简要说明 （该继承链为示例）。
- 将类和成员信息组织到内部模型中，如 JSON 对象。通常结构可以为：{ name, declaration, description, inheritance:[…], members:{constructors:[…], properties:[…], methods:[…], events:[…]} }。





解析后即可将这些结构化数据存储本地，并用于后续搜索和回答。DevExpress 文档静态且结构较规整，Cheerio 选择器能有效抓取。需要注意图像和示例部分可选地忽略或提取链接，但核心是 API 说明。





## **RAD Studio VCL 文档抓取与解析**





RAD Studio 官方 VCL 文档主要托管在 Embarcadero DocWiki 上。DocWiki 按版本和分类组织：**Libraries Reference** 部分的 Vcl 单元列表页面列出了所有 VCL 单元（见【36】【45】）。每个单元（如 Vcl.Forms）页面列出该单元下的所有类、例程、类型等【46】。例如 Vcl.Forms 页面中的“Classes”部分列有 TForm、TScrollBox 等类 。



抓取流程：



- 抓取 Vcl 单元列表页面（docwiki.embarcadero.com/Libraries/Sydney/en/Vcl），解析其中每个单元链接，如 Vcl.Forms、Vcl.Controls 等【36】【45】。
- 对于每个单元页面（如 Vcl.Forms），找到 “Classes” 列表，获取类名称及链接 。
- 对每个类页面（例如 Vcl.Forms.TForm，链接示例见 ），解析其声明、继承和描述：页面中包含 Delphi 和 C++ 的类声明 TForm = class(TCustomForm) ，以及“Description”段落文本 说明该类的作用。
- 类页面有跳转链接至其成员子页；继续抓取该类的 *_Methods、*_Properties、*_Events、*_Fields 页面，分别解析方法、属性、事件和字段表格，每行给出名称、可见性和说明。例如 TForm 的属性页面列出了 Caption, Color 等属性以及其说明 ，事件页面列出 OnClick, OnClose 等事件 。
- 将所有信息汇总进类文档模型，如 { unit:"Vcl.Forms", name:"TForm", inheritance:["TCustomForm",…], description:"TForm represents a standard application window (form)... [oai_citation:20‡docwiki.embarcadero.com](https://docwiki.embarcadero.com/Libraries/Sydney/en/Vcl.Forms.TForm#:~:text=TForm%20represents%20a%20standard%20application,form)", methods:[...], properties:[...], events:[...], fields:[...] }。





DocWiki 文档是官方的 F1 帮助源，结构清晰且无需登录，可直接爬取。不过注意有时单元内容较多，网络抓取时可适当设置间隔、检查反爬限制。若单元页面复杂难取，也可使用离线帮助（如 CHM）作为补充来源。





## **本地文档数据组织与索引**





抓取后应将文档以本地结构化形式保存，并建立检索索引。典型做法是将每个类或组件保存为 JSON 文件，其字段包括类名、单元、声明、继承链、描述和成员列表等。这样便于按类查找和更新。例如：

```
{
  "unit": "Vcl.Forms",
  "name": "TForm",
  "declaration": "TForm = class(TCustomForm)",
  "inheritance": ["TObject","TPersistent","TComponent","TControl","TWinControl","TCustomControl","TCustomForm"],
  "description": "TForm represents a standard application window (form). ...",
  "members": {
    "properties": [
      {"name":"Caption","visibility":"published","description":"Specifies a text string that identifies the control to the user."},
      ...
    ],
    "methods": [
      {"name":"Close","visibility":"public","description":"Closes the form."},
      {"name":"Create","visibility":"public","description":"Creates and initializes a TForm instance."},
      ...
    ],
    "events": [
      {"name":"OnClick","visibility":"published","description":"Occurs when the user clicks the control."},
      ...
    ],
    "fields": [
      {"name":"FAnchorMove","visibility":"protected","description":"Specifies whether the control must keep its dimensions when moved."},
      ...
    ]
  }
}
```

对 DevExpress 文档也类似，只是单元字段可以标记为 DevExpress 或 VCL，并包含额外类别信息。保存后需建立全文搜索索引（如 Lunr、FlexSearch 等）对**类名**、成员名、描述文本等进行索引。Lunr.js 支持关键词匹配、通配符（*）和模糊搜索  ，可用于实现类似 Apple Doc MCP 的强大搜索。搜索时可先按符号名称（类或方法）匹配，再由 AI 进一步筛选；也可对描述文本检索自然语言问题的答案。为支持快速跳转，还可为每个符号记录链接地址。





## **示例：TcxGrid 文档结构化存储**





以 DevExpress 的 TcxGrid 控件为例，其解析后可生成如下结构：

```
{
  "category": "DevExpress ExpressQuantumGrid",
  "name": "TcxGrid",
  "declaration": "TcxGrid = class(TcxCustomGrid)",
  "inheritance": ["TObject","TPersistent","TComponent","TControl","TWinControl","TCustomControl","TcxCustomControl","TcxCustomGrid","TcxGrid"],
  "description": "The VCL Data Grid (TcxGrid) control allows you to display data as a table and in a variety of formats. ...",
  "members": {
    "constructors": [
      {"name":"Create","params":"(AOwner: TComponent)","description":"Inherited from TComponent."},
      ...
    ],
    "properties": [
      {"name":"ActiveLevel","description":"Specifies the active root grid level."},
      {"name":"Levels","description":"Provides access to the root grid level collection."},
      ...
    ],
    "methods": [
      {"name":"BeginUpdate","description":"Allows you to avoid excessive redraw operations during batch changes."},
      {"name":"EndUpdate","description":"Signals the end of batch update."},
      ...
    ],
    "events": [
      {"name":"OnActiveTabChanged","description":"Fires when the active tab changes."},
      {"name":"OnFocusedViewChanged","description":"Fires when the focused view changes."},
      ...
    ]
  }
}
```

上述示例整合了  中的继承信息和说明文字，以及“主要 API 成员”列表（如 “ActiveLevel”, “Levels”等 ）。实际实现中可包含更多字段，如示例链接、图像等，但核心是符号结构和注释。





## **实现路线图（模块划分）**





1. **需求分析与设计** – 确定要抓取的文档源（DevExpress、Embarcadero 版本等），设计文档模型和接口规范。
2. **文档抓取模块** – 实现两个爬虫：一个抓取 DevExpress 文档（采用 axios + Cheerio 或 Puppeteer 解析 HTML），一个抓取 Embarcadero DocWiki。模块负责遍历导航、下载类页和成员页。
3. **解析模块** – 对下载的 HTML 进行解析，抽取类声明、说明、成员列表等，填充文档模型（JSON 对象）。可编写单元测试确保关键字段正确提取。
4. **存储和缓存** – 将解析结果序列化为本地 JSON/Markdown 文件存储，并建立缓存策略（如按单元分类存放）。文档抓取时检查缓存避免重复下载。
5. **索引模块** – 使用 Lunr.js 或类似库对所有文档进行索引构建，包括类名、成员名及描述文本。支持通配符和多字段查询。
6. **MCP 服务和接口** – 基于 Node.js/TypeScript 实现一个 MCP Server（可用现有框架或自定义），提供工具接口如 listUnits（或 listTechnologies）、chooseUnit、searchSymbols(query)、getDocumentation(symbol) 等。每个接口调用对应数据和索引返回响应。格式化输出为 Markdown，引用需要（可附带文档来源）。
7. **测试与优化** – 针对典型问题测试搜索精度和响应速度，优化索引字段和缓存策略。







## **推荐工具与库**





- **网络请求与解析**：使用 [Axios](https://www.npmjs.com/package/axios)![Attachment.tiff](Attachment.tiff) 或 Node.js 内置 fetch 获取页面内容，使用 [Cheerio](https://cheerio.js.org)![Attachment.tiff](Attachment.tiff) 解析静态 HTML（API 明确、无复杂 JS）。若某些页面需要执行脚本，可考虑 [Puppeteer](https://pptr.dev)![Attachment.tiff](Attachment.tiff) （头less Chrome）。
- **数据存储**：可直接写入本地 JSON/Markdown 文件，或使用轻量数据库（如 SQLite、Lowdb 等）存储文档记录。
- **搜索与索引**：推荐 [Lunr.js](https://lunrjs.com/)![Attachment.tiff](Attachment.tiff) 构建全文索引，支持关键词、通配符和模糊匹配  ；也可选 [flexsearch](https://github.com/nextapps-de/flexsearch)![Attachment.tiff](Attachment.tiff) 或 [Fuse.js](https://fusejs.io/)![Attachment.tiff](Attachment.tiff) 实现模糊搜索。
- **开发框架**：采用 TypeScript 提升可维护性；使用命令行工具库（如 [Commander](https://github.com/tj/commander.js)![Attachment.tiff](Attachment.tiff)）管理 CLI；MCP 接口可用 [@anthropic-ai/mcp-server](https://www.npmjs.com/package/@anthropic-ai/mcp-server)![Attachment.tiff](Attachment.tiff) 等现成库快速搭建，也可以自行用 Express 监听 JSON-RPC。
- **其他**：使用 [Lodash](https://lodash.com/)![Attachment.tiff](Attachment.tiff) 等辅助库简化数据处理；使用 [fs-extra](https://github.com/jprichardson/node-fs-extra)![Attachment.tiff](Attachment.tiff) 便捷操作文件。版本控制下代码结构清晰，依赖锁定确保可重复构建。







## **样例 JSON 结构**





以 TcxGrid 类为例，可能的结构化 JSON 如下：

```
{
  "category": "DevExpress ExpressQuantumGrid",
  "unit": "cxGrid",
  "name": "TcxGrid",
  "declaration": "TcxGrid = class(TcxCustomGrid)",
  "inheritance": ["TObject","TPersistent","TComponent","TControl","TWinControl","TCustomControl","TcxCustomControl","TcxCustomGrid","TcxGrid"],
  "description": "The VCL Data Grid (TcxGrid) control allows you to display data as a table and in a variety of formats. ...",
  "members": {
    "constructors": [
      {"name":"Create","params":"(AOwner: TComponent)","description":"Inherited from TComponent [oai_citation:28‡docs.devexpress.com](https://docs.devexpress.com/VCL/cxGrid.TcxGrid._members#:~:text=TcxGridViewInfo)."}
    ],
    "properties": [
      {"name":"ActiveLevel","description":"Specifies the active root grid level."},
      {"name":"Levels","description":"Provides access to the root grid level collection [oai_citation:29‡docs.devexpress.com](https://docs.devexpress.com/VCL/cxGrid.TcxGrid._members#:~:text=cxGridServerModeBandedTableView)."}
    ],
    "methods": [
      {"name":"BeginUpdate","description":"Avoids excessive redraws during batch changes [oai_citation:30‡docs.devexpress.com](https://docs.devexpress.com/VCL/cxGrid.TcxGrid#:~:text=The%20list%20below%20outlines%20key,manage%20grid%20Views%20%2F%20166)."},
      {"name":"EndUpdate","description":"Ends batch update."}
    ],
    "events": [
      {"name":"OnActiveTabChanged","description":"Occurs when the active tab changes [oai_citation:31‡docs.devexpress.com](https://docs.devexpress.com/VCL/cxGrid.TcxGrid#:~:text=Automation%20%20Provides%20access%20to,188)."},
      {"name":"OnFocusedViewChanged","description":"Occurs when the focused view changes [oai_citation:32‡docs.devexpress.com](https://docs.devexpress.com/VCL/cxGrid.TcxGrid#:~:text=Automation%20%20Provides%20access%20to,188)."}
    ]
  }
}
```

其中 "inheritance" 可从 DevExpress 文档尾部继承链提取 或 DocWiki 解析得到。description 字段示例引用了类页中的文字 。成员条目示例带有说明，可包含父类/文档来源链接。实际格式可根据需要调整，总体为便于 AI 模型理解的结构化数据。





## **项目架构建议**





文件组织上，可按功能模块划分：



- src/crawler/：存放爬虫代码，如 DevExpressCrawler.ts、EmbarcaderoCrawler.ts，负责下载页面 HTML。
- src/parser/：解析器代码，如 DevExpressParser.ts、EmbarcaderoParser.ts，将 HTML 转为文档模型。
- src/model/：定义文档模型接口/类（例如 ClassDoc、MemberInfo 等 TypeScript 类型）。
- src/indexer/：索引构建和搜索接口，如使用 Lunr 建立索引。
- src/server/：MCP 服务相关，如 McpServer.ts 实现工具接口，tools/ 目录可按功能（listUnits、searchSymbols、getDocumentation 等）组织。
- config/：配置文件，如抓取目标 URL 列表、缓存路径、版本信息。
- .cache/：存放下载的原始 HTML 或临时文件（可忽略版本控制），加速重跑时复用。
- docs/（可选）：存放生成的 JSON/Markdown 文档或测试示例。





MCP 接口设计可参考 Apple Doc MCP 的工具：如 list_units 返回所有可选 VCL 单元；search_symbols 接受关键词、当前单元筛选等参数，返回匹配符号列表；get_documentation 接受符号全名（如 Vcl.Forms.TForm 或 cxGrid.TcxGrid），返回该符号的 Markdown 文档字符串。接口返回结构可包括符号类型、链接引用，以便 AI 智能跳转。总体设计应模块化、易扩展，新库或新版本的文档加入时只需添加爬虫或解析规则，重建索引即可支持查询。



通过以上架构与模块划分，即可实现一个功能类似 Apple Doc MCP 的 Delphi 文档检索工具，使 AI Agent 能够方便地查询 VCL 及 DevExpress 的 API 文档并获取结构化输出。



**参考资料：** Apple Doc MCP 介绍  、DevExpress 文档示例  、Embarcadero DocWiki 示例  、Lunr.js 搜索功能  。