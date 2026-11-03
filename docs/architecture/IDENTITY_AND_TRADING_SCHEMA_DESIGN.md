# 钱包身份与交易数据库基础结构（阶段 2）

## 本阶段范围

本文件配套的 SQL 草案位于 `IDENTITY_AND_TRADING_SCHEMA_DRAFT.sql`。它是**设计草案，不是可执行 migration**。当前仅提交到 `architecture/unified-trading-v1` 分支；没有应用到 Supabase。

## 已核实的现状

- 现有共享认证函数 `supabase/functions/_shared/auth.ts` 通过匿名 Supabase Auth token 读取 `public.ton_verified_wallets`，并以 `user_id` 查询唯一记录。
- 该函数随后把该匿名用户 ID 作为 `userId` 返回，业务层容易把一次匿名会话误当成钱包主体。
- 现有地址工具 `normalizeTonAddress()` 已使用 `@ton/core` 将友好地址转为 Raw 地址。
- 当前 NFT listing migration 将 `seller_user_id` 关联到 `auth.users`，这与“钱包才是商城身份、Auth session 只是临时会话”的最终模型不一致。
- 仓库当前 migration 目录可见两份 migration；未发现完整的交易订单、付款、结算、账本或链上事件表。
- `supabase/config.toml` 当前只暴露 `public` 和 `graphql_public`，因此草案把内部资金/身份表放入未暴露的 `private` schema。

## 目标身份模型

1. `private.wallet_identities` 以 `(network, raw_address)` 唯一标识一个钱包。匿名 session 不参与钱包身份唯一性。
2. `private.wallet_identity_sessions` 只把当前 Supabase Auth user/session 映射到已验证钱包；一个 session 同时只能关联一个钱包，同一个钱包可被多个 session 使用。
3. 业务表只引用 `wallet_identities.id`，不再把 `auth.users.id` 当成卖家/买家的最终主体。
4. 每次敏感请求仍须校验 TON Proof 验证记录和有效期。数据库映射不能替代签名验证。
5. 钱包切换时，只更新当前 session 的映射；历史订单仍保留原钱包 identity。

## 交易数据库基座

草案包含：
- `marketplace_orders`：NFT 与会员订单分离，通过 `order_type` 区分。
- `marketplace_payments`：记录付款方、收款地址、最小单位金额、链上交易及事件序号。
- `marketplace_settlements`：每订单、每结算类型唯一，避免重复结算。
- `ledger_journals / ledger_accounts / ledger_entries`：双重记账基础结构；账本只追加，禁止客户端直接写入。
- `chain_events / chain_event_cursors`：链上事件唯一键和监听游标。
- `outbox_events`：异步任务和幂等重试。

金额使用 `numeric(78,0)` 保存最小单位整数，首期 TON 以 nanotons 计价，不使用浮点数。订单快照保存费率，平台费率默认 300 bps；成交价拆分必须满足卖家金额 + 平台费 = 成交价。

## 重要：为什么尚未改写 auth.ts

现在直接把 `authenticateVerifiedWallet()` 改为查询 `private.wallet_identities`，而数据库表尚未存在，会立即令现有 Edge Functions 全部认证失败。正确顺序是：

1. 本地创建并验证数据库 migration。
2. 编写一次性回填：对旧 `ton_verified_wallets.wallet_address` 用现有 `normalizeTonAddress()` 规范化，再按 `network + raw address` 合并身份。
3. 对重复钱包、同一 session 多条冲突记录、无效地址、未知网络生成审计报告；不自动猜测或删除。
4. 新旧认证并行核验，验证身份映射唯一且 Proof 未过期。
5. 再把 Edge Function 认证上下文改为 `walletIdentityId`、`walletAddress`、`network`；逐个迁移业务函数。
6. 最后才考虑移除旧字段或旧表。

## 必须补齐的安全约束后才可启用交易

- 账本每个 journal 的借方总额必须等于贷方总额；应在数据库事务级别强制，不能只依赖前端或单个 API。
- 账本、链上事件、审计记录只能追加，不允许普通业务路径 UPDATE/DELETE。
- `service_role` 仅可在 Edge Functions/可信后端使用；不进入浏览器。
- 私有表没有给 `anon` 或 `authenticated` 授权；RLS 开启作为纵深防御。
- 链上事件唯一键必须基于 network + transaction hash + event index（或经验证的 query/event ID）。
- 任何付款、交付或结算重试前，先核对链上最终状态。
- 会员订单不触发 NFT 交付或卖家结算。
- `product_id` 暂不添加外键，待核实当前 `public.products.id` 的真实类型及商品删除策略后再补。

## Supabase 2026-10-30 Data API 变更

Supabase 已公布：自 2026-10-30 起，新建 public 表不再默认暴露给 Data API。仍需同时管理 GRANT 与 RLS，不能把“未暴露”当作唯一安全措施。该草案采用 private schema、显式撤销 anon/authenticated 权限和启用 RLS。

参考：
- https://supabase.com/changelog?types=breaking-change
- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/database/postgres/row-level-security

## 当前未做的事情

- 没有创建正式 migration 文件（按 Supabase CLI 要求，应由 `supabase migration new` 生成）。
- 没有执行 SQL 或修改远程 Supabase。
- 没有更改 TON Proof challenge/verify/status 函数。
- 没有改变任何用户登录流程。
- 没有部署 Edge Functions 或合约。
- 没有声称该 SQL 已通过 PostgreSQL 执行测试。

## 下一步

需要在本地仓库创建正式 migration、编写 legacy wallet backfill 与账本平衡约束触发器，并在临时本地数据库执行验证。验证通过后再将 migration 提交到本分支；之后才迁移共享认证函数。

## 第二阶段补充：账本完整性与历史不可变

SQL 草案现已增加两项数据库级保护：

- **延迟平衡约束**：每个 ledger journal 在事务提交时必须至少包含借方和贷方，且两边最小单位金额完全相等。允许同一事务先插入 journal、再插入两条或多条 entry，提交时统一检查。
- **只追加保护**：ledger journals、ledger entries、chain events 禁止 UPDATE/DELETE。错误更正必须写入冲正 journal 或新的链上事件记录，不能覆盖历史。

这些触发器属于设计草案，尚未在 PostgreSQL 17 实例执行。部署前必须用临时数据库验证以下用例：

1. 一笔 100 TON 的付款入账：借方与贷方相等，事务提交成功。
2. 97 TON 卖家应付 + 3 TON 平台收入：与 100 TON 清算金额平衡。
3. 仅插入借方或借贷金额不等：事务提交失败。
4. journal 不写任何 entry：事务提交失败。
5. UPDATE / DELETE ledger entry、journal 或 chain event：立即失败。
6. 同一 idempotency key 重复写入：唯一约束拒绝第二次写入。
7. 并发处理同一订单：业务事务必须对订单行加锁，并以唯一键作为最后一道幂等防线。

注意：账本平衡只保证数据库分录自洽，不证明链上付款真实存在。付款确认仍必须来自独立验证的 TON 链上事件；不能由客户端提交的交易 hash 直接触发结算。

## 精确 TON 金额转换（代码准备）

新增共享工具 `supabase/functions/_shared/ton-amount.ts`：

- 输入必须是十进制字符串，最多 9 位小数。
- 使用 `BigInt` 转换为 nanotons，不经过 JavaScript `Number`，避免浮点精度误差。
- 拒绝零、负数、科学计数法、千分位分隔符及超过 9 位小数的输入。
- 对应测试覆盖整数、常见小数、最小单位、精度边界和非法格式；已加入 Wallet Identity Audit GitHub Actions。

**注意：** 该工具目前是后端金额基础组件，尚未接入商品发布 API。当前发布接口仍保持 503 关闭状态；重新实现发布/下单 API 时，必须将请求字段改为十进制字符串或 nanotons 整数字符串，不能再接收 JavaScript 浮点金额。前端现有价格输入也尚未完成该接口迁移。

