# 净值速查 - 微信小程序

关注净值/估值查询工具，使用 **微信开发者工具** 开发，UI 使用 **Vant Weapp**。数据来源于天天/东方财富公开接口，**仅供参考，不构成任何投资建议**。

## 功能

- 列表展示关注项的实时估值（估算净值、估算涨跌、净值日期）
- 下拉刷新
- 首页头部免责说明

## 合规与平台限制说明

本小程序已考虑**腾讯对个人资质与敏感词的管理**：

1. **个人资质**  
   不涉及证券销售、代客理财等需持牌业务，仅展示公开数据，不做任何“投资建议”“推荐”“承诺收益”等表述。

2. **敏感词与表述**  
   - 全文使用中性表述：如“估值”“净值”“涨幅”“仅供参考”。  
   - 禁止使用：推荐、必涨、稳赚、保证收益、投资建议、承诺回报等。  
   - 首页头部均带有“数据仅供参考，不构成任何投资建议”等提示。

3. **免责声明**  
   首页头部提供免责说明，说明数据来源、用途限制与风险提示。

4. **数据与频率**  
   数据来自持牌机构公开接口，仅建议个人/自用，请控制请求频率，勿大规模爬取或商用。

## 本地运行

### 1. 安装依赖

```bash
cd /Users/momo/Documents/custom/fund-valuation-mini
yarn
# 或 npm install
```

### 2. 用微信开发者工具打开

- 打开微信开发者工具，选择「导入项目」  
- 目录选择：`/Users/momo/Documents/custom/fund-valuation-mini`  
- AppID：可使用测试号或自己的小程序 AppID（`project.config.json` 中当前为 `touristappid`，仅作占位）  
- 在「详情 → 本地设置」中可勾选「不校验合法域名」以便本地请求接口

### 3. 构建 npm（使用 Vant Weapp）

- 菜单：**工具 → 构建 npm**  
- 构建完成后会生成 `miniprogram_npm`，即可正常使用 Vant 组件

### 4. 请求域名（正式发布时）

- 小程序后台 **开发 → 开发管理 → 开发设置 → 服务器域名** 中，在 **request 合法域名** 添加：  
  `https://fundgz.1234567.com.cn`  
- 若该接口仅支持 http，正式环境无法直接请求，需通过**自有后端代理**该接口，并在 `utils/fundApi.js` 中将 `REALTIME_BASE` 改为代理地址。

## 项目结构

```
fund-valuation-mini/
├── app.js / app.json / app.wxss
├── pages/
│   └── tiantian/
│       ├── index/       # 首页：关注列表 + 估值 + 头部免责
│       └── add-fund/     # 我的关注：搜索 + 添加/删除
├── utils/
│   ├── fundApi.js       # 估值请求（天天公开接口）
│   └── storage.js       # 关注列表本地存储
├── styles/
│   ├── _init.wxss
│   └── _vant.wxss
├── package.json         # 含 @vant/weapp
├── project.config.json
└── README.md
```

## 接口说明

- **实时估值**：`https://fundgz.1234567.com.cn/js/{代码}.js?rt={时间戳}`  
- 返回 JSONP，解析后可得：名称、净值日期、单位净值、估算净值、估算涨幅、估值时间等。  
- 仅供个人学习/自用，请遵守站点服务条款并控制请求频率。

## License

ISC
