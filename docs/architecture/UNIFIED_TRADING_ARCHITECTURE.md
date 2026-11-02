# TON 数字资产商城统一交易架构（v1）

> 本文是商城交易规则、状态机、链上/链下职责边界的唯一基准。当前是目标架构规范，不代表合约、数据库或线上环境已经实现。

## 1. 不可变业务规则

1. 不设独立商城账号。TON 钱包是业务身份；连接钱包不等于完成身份验证。
2. 每次敏感操作必须验证 TON Proof，并校验主网、地址规范化结果、签名时效、域名/应用信息和 nonce 防重放。
3. NFT 只能由当前验证钱包选择；发布前必须先转入商城托管合约，链上确认托管后才可上架。
4. 买家以 TON 付款；Marketplace 锁定资金并启动 NFT 交付。只有确认 NFT 到达买家地址后才允许释放卖家款。
5. 成交价按整数最小单位记账：平台 3%，卖家 97%；Gas 单独记录，不计入商品成交价。
6. 会员付款与 NFT 购买分开建单、分开核验。会员到账后只进入待人工发放状态。
7. 数据库不能伪造链上事实；任何重试前必须先查链上最终状态。
8. 任何入账、交付、结算、退款操作都必须幂等，并有不可变审计记录。
9. 首期 TON；支付适配层预留 Jetton/USDT，但不得把尚未实现的支付方式显示为可用。
10. 不把私钥、助记词或签名密钥放进浏览器、Git 仓库或普通业务表。

## 2. 身份模型

- 主身份键：network + canonical raw wallet address。
- 地址规范化后存储；主网当前 network 标识为 -239。
- 匿名 Supabase Auth session 只是请求会话，不是商城账号，也不是资金归属主体。
- 一个钱包在同一网络必须唯一映射到一个钱包身份；不得因匿名 session 不同产生多个钱包主体。
- 允许钱包更换，但必须重新完成 Proof；旧钱包发起的未完成订单仍归属旧钱包。
- 数据库所有权字段应优先引用 wallet identity，不应把 auth.users.id 当作最终业务身份。

## 3. 组件职责

### 前端
钱包连接、TON Proof、商品展示、用户确认交易、显示链上进度。前端不决定付款成功、托管成功、交付成功或结算成功。

### Supabase Edge Functions
验证用户请求、生成订单、读取链上数据、执行状态编排、写入业务数据库。Service Role 只存在服务端；所有输入重新校验。

### 链上合约
NFT Escrow 管理 NFT 入库/退回/交付；Marketplace 管理商品、购买订单、资金锁定、手续费和卖家结算。合约状态是资产与合约资金的权威来源。

### 链上监听器
持续扫描/订阅 TON 交易和合约事件，按 transaction hash + event/query id 幂等落库。必须支持游标续跑、重复事件、乱序事件和回滚/最终性策略。

### 签名与管理
合约管理权限、运营签名和资金签名隔离；优先独立签名服务/KMS/HSM。高权限动作应多签或延迟执行。

## 4. NFT 发布状态机

- draft：仅本地草稿。
- escrow_pending：卖家已发起 NFT 转移，等待链上入库。
- escrow_confirmed：监听器确认正确 NFT 已进入正确 Escrow。
- listed：链上托管记录与数据库商品记录关联成功，可公开销售。
- reserved：购买订单已被合约接受，商品不可被再次购买。
- sold：买家已收到 NFT，资金已完成结算。
- delisting：卖家请求下架，等待合约退回。
- refunded：NFT 已确认退回卖家。
- suspended：管理员暂停展示/新交易；不能擅自抹掉未完成订单。

禁止从 wallet_owned 直接跳转 listed。任何商品 listed 必须有 escrow id、NFT item、collection、seller wallet、network、链上托管交易及确认高度/时间。

## 5. NFT 购买订单状态机

pending_payment → payment_confirmed → delivery_pending → delivery_confirmed → settlement_pending → completed

异常/补偿状态：
- expired：付款窗口过期且链上未付款。
- underpaid / overpaid：金额不匹配，进入人工处理或明确退款流程。
- delivery_failed：交付失败；先查链上 NFT 实际所有权，再决定重试或退款。
- settlement_failed：资金结算失败；先查链上付款/余额/结算记录，再安全重试。
- refund_pending → refunded：退款申请和链上退款确认。
- manual_review：状态冲突、链上信息不完整或超过重试阈值。

每次状态迁移必须检查前置状态，并保存 actor、source、timestamp、chain tx、reason。不能由客户端任意 PATCH 状态。

## 6. TON 购买与结算规则

- 所有金额以 nanotons 整数存储和计算；禁止浮点数。
- 价格、平台费、卖家收入均为整数。建议 fee = floor(price_atomic × 300 / 10000)，seller = price_atomic - fee；余数归属规则固定并测试。
- 订单必须绑定唯一 order id / query id、商品 id、买家地址、商品价格、平台费率版本、收款合约。
- 合约验证商品仍为 Active、金额足额、买家与订单匹配、订单未处理。
- 资金先锁定在受控合约中。NFT 转移是异步消息流程，不可把“发出转移消息”当作交付完成。
- 交付确认必须来自可信链上验证。若由后端监听后提交确认，合约必须限制确认者权限，并记录确认依据；应评估独立 watcher、多签或买家确认/超时退款等机制，避免单一后端可盗放资金。
- NFT 交付确认前不得向卖家释放 97%。平台 3% 与卖家 97% 只能按同一订单执行一次。
- Gas 由实际链上交易记录单独统计，不能从商品价格中静默扣减。

## 7. 会员支付

会员订单单独使用 premium_orders / premium_payments 或统一订单表中的独立业务类型，但绝不复用 NFT 交付状态。
流程：创建订单 → 用户付款 → 链上监听确认收款地址、金额、付款钱包、订单识别数据和交易状态 → paid_pending_delivery → 管理员手动赠送 → 管理员提交凭证/备注 → fulfilled。
未确认到账不得发放；重复交易、少付、多付、超时、错误网络均进入独立异常状态。管理员操作记录操作者、时间、套餐、收款交易和发放凭证。

## 8. 数据库目标模型

建议逐步建立以下表，迁移必须分批、小步、可回滚，并在本地测试后才申请远程执行：

- wallet_identities：network + raw_address 唯一；验证时间、Proof nonce/状态。
- products：展示字段、price_atomic、currency、seller_wallet_identity_id、escrow_id、链上状态。
- nft_escrow_assets：item/collection/seller/escrow/query id/托管交易/确认状态；item + network 唯一。
- orders：订单业务类型、买家/卖家身份、product id、金额原子单位、费率快照、状态。
- payments：支付网络、币种、金额原子单位、from/to、order id、tx hash、事件索引、确认状态；链上事件唯一。
- settlements：卖家金额、平台费、交易引用、状态；order id + settlement type 唯一。
- ledger_accounts / ledger_entries：双重记账；每笔分录借贷平衡，只追加不覆盖。
- chain_transactions / chain_events / chain_event_cursors：链上原始事实、事件幂等键和监听进度。
- premium_orders：会员订单及人工发放状态。
- admin_audit_logs：管理操作审计。
- outbox_events：异步任务、重试次数、下次执行时间、幂等键。

公开商品读取可开放必要字段；身份、订单、付款、账本、签名任务和管理数据必须采用最小权限与 RLS。不能给 anon/authenticated 直接写入交易状态或账本的权限。Service Role 不得暴露前端。

## 9. Collection / NFT 类型验证

TONAPI 的 verified 字段只作为辅助信号，不能替代官方 Collection 白名单。每个允许的 Collection 必须绑定 asset type、network、官方来源、Item Code/接口校验策略和启用状态。username、phone_number、gift 的转移/入库/交付行为分别验证。禁止仅因类型字段匹配就接受未知 Item Code。

## 10. 幂等与恢复

- API：客户端请求 idempotency key + 服务端唯一约束。
- 链上事件：network + tx hash + event index/query id 唯一。
- NFT：network + item address 唯一有效托管记录。
- 结算：order id + settlement type 唯一。
- 重试：先读取合约 getter/链上交易，判断是否已成功；禁止盲目再次发送。
- 超时：不等于失败；必须先查询链上结果。
- 事件乱序：状态迁移必须可判定前置条件，必要时暂存待处理事件。
- 人工修复：只能通过带审计的补偿动作，不得直接篡改原始链上事实。

## 11. 上线前验收门槛

1. 钱包 Proof 重放、跨域、过期 nonce 测试通过。
2. 卖家钱包仍持有 NFT 时，发布接口必须拒绝上架。
3. NFT 托管确认前，商品 API 不得返回 listed。
4. 同一 NFT 并发发布只能成功一次。
5. 同一商品并发购买只能有一个订单成功锁定。
6. 少付、错币种、错网络、错误订单标识不得确认付款。
7. 重复链上通知不得重复入账、交付或结算。
8. NFT 未到买家钱包时不得释放卖家款。
9. 97% + 3% 精确等于成交价；Gas 独立核算。
10. 会员到账只进入待人工发放；管理员发放动作有审计。
11. 暂停、失败、重试、退款和恢复流程完成测试。
12. 所有 migration、Edge Function、合约测试和前端构建通过；测试网端到端验收后才考虑主网。

## 12. 当前代码迁移顺序

1. 关闭旧的直接上架入口（本分支先实施 fail-closed）。
2. 钱包身份唯一化与数据库权限审计。
3. 定义共享交易类型、金额原子单位和状态映射。
4. 重构 NFT Escrow：入库确认、按类型验证、退回和交付。
5. 重构 Marketplace：商品关联、订单、付款锁定、结算和退款。
6. 增加数据库迁移与幂等索引。
7. 增加链上监听器和补偿任务。
8. 重构发布/商品详情/购买页面。
9. 独立实现会员付款监听和人工发放。
10. 自动化测试、测试网验收、安全审计、部署审批。

## 13. 明确禁止事项

本阶段不执行正式 Supabase migration、不部署 Edge Functions、不配置生产密钥、不部署或升级主网合约、不发起真实链上交易、不修改 main 分支。所有实现先在独立 Git 分支完成并验证，再通过 PR 审查。
