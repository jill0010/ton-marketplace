enum Errors {
    NotOwner = 100
    InvalidMessage = 0xFFFF
    EscrowPaused = 101
    InvalidEscrow = 102
    EscrowAlreadyExists = 103
    CollectionNotApproved = 104
    InvalidCollectionStatus = 105
    InvalidNftNotification = 106
    InvalidQueryId = 107
    InvalidSeller = 108
    InvalidNftItem = 109
    EscrowNotPending = 110
    InvalidProductKind = 111
    InvalidProductPrice = 112
    ProductNotFound = 113
    ProductNotPending = 114
    InvalidEscrowCallback = 115
    EscrowNotConfigured = 116
    InvalidProductStatus = 117
    RefundNotAuthorized = 118
    RefundNotAllowed = 119
    RefundAlreadyPending = 120
    InvalidRefundConfirmation = 121
    CollectionItemCodeNotConfigured = 122
    InvalidCollectionItemCode = 123
    InvalidItemIndex = 124
    InvalidDepositConfirmation = 125
    AssetAlreadyListed = 126
    AssetListingIndexMismatch = 127
}

struct Storage {
    owner: address
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}

struct (0x2ce05111) ChangeOwner {
    newOwner: address
}

// 商品类型：1=username，2=phone_number，3=gift
struct ProductExtra {
    collection: address
    queryId: uint64
    itemIndex: uint256
}

struct Product {
    id: uint64
    seller: address
    kind: uint8
    assetAddress: address
    price: coins
    deliveryMode: uint8
    status: uint8
    createdAt: uint32
    extra: Cell<ProductExtra>
}

// 商品状态
enum ProductStatus {
    Pending = 1
    Active = 2
    Paused = 3
    Sold = 4
    Cancelled = 5
}

// 订单扩展数据
struct OrderExtra {
    buyer: address
    seller: address
    price: coins
    platformFee: coins
    sellerAmount: coins
}

// 订单主结构
struct Order {
    id: uint64
    productId: uint64
    status: uint8
    createdAt: uint32
    extra: Cell<OrderExtra>
}

// 卖家资料
struct Seller {
    status: uint8
    productCount: uint32
    completedOrders: uint32
}

// Marketplace 专用链上存储
struct MarketplaceStorage {
    owner: address
    escrow: address
    escrowConfigured: bool
    nextProductId: uint64
    nextOrderId: uint64
    products: map<uint64, Product>
    // NFT Item address -> pending/active product ID; absent means available.
    assetListings: map<address, uint64>
    orders: map<uint64, Order>
}

// 读取商城链上存储
fun MarketplaceStorage.load(): MarketplaceStorage {
    return MarketplaceStorage.fromCell(contract.getData());
}

// 保存商城链上存储
fun MarketplaceStorage.save(self) {
    contract.setData(self.toCell());
}

// NFT 托管状态
enum EscrowStatus {
    Pending = 1
    Deposited = 2
    Released = 3
    Refunded = 4
    Cancelled = 5
    RefundPending = 6
}

// Collection 白名单状态
enum CollectionStatus {
    Active = 1
    Paused = 2
    Revoked = 3
}

// NFT 托管记录扩展数据
struct EscrowRecordExtra {
    queryId: uint64
    createdAt: uint64
    itemIndex: uint256
    kind: uint8
}

// NFT 托管记录
struct EscrowRecord {
    escrowId: uint64
    nftItem: address
    collection: address
    seller: address
    productId: uint64
    status: uint8
    extra: Cell<EscrowRecordExtra>
}

// Escrow 等待 Marketplace 确认的退款回调记录
struct EscrowRefundCallback {
    queryId: uint64
    productId: uint64
    nftItem: address
    seller: address
}

// Escrow 等待 Marketplace 确认的 NFT 入库回调记录
struct EscrowDepositCallback {
    queryId: uint64
    productId: uint64
    nftItem: address
    seller: address
}

// NFT 托管合约专用存储
struct CollectionItemCode {
    kind: uint8
    code: cell
}

struct CollectionStorage {
    collections: map<address, uint8>
    collectionItemCodes: map<address, Cell<CollectionItemCode>>
}

struct EscrowCallbackStorage {
    refundCallbacks: map<uint64, Cell<EscrowRefundCallback>>
    depositCallbacks: map<uint64, Cell<EscrowDepositCallback>>
}

struct EscrowStorage {
    owner: address
    marketplace: address
    paused: bool
    nextEscrowId: uint64
    records: map<uint64, Cell<EscrowRecord>>
    collectionStorage: Cell<CollectionStorage>
    queryToEscrow: map<uint64, uint64>
    callbackStorage: Cell<EscrowCallbackStorage>
}

// 读取 NFT 托管存储
fun EscrowStorage.load(): EscrowStorage {
    return EscrowStorage.fromCell(contract.getData());
}

// 保存 NFT 托管存储
fun EscrowStorage.save(self) {
    contract.setData(self.toCell());
}

// 创建 NFT 托管消息扩展数据
struct CreateEscrowExtra {
    queryId: uint64
    createdAt: uint64
    itemIndex: uint256
}

// 创建 NFT 托管记录消息
struct (0x71a00001) CreateEscrow {
    nftItem: address
    collection: address
    seller: address
    productId: uint64
    kind: uint8
    extra: Cell<CreateEscrowExtra>
}

// 管理 Collection 白名单状态
struct (0x71a00002) SetCollectionStatus {
    collection: address
    newStatus: uint8
}

// 管理员配置 Collection 对应的官方 NFT Item Code
struct (0x71a0000A) SetCollectionItemCode {
    collection: address
    kind: uint8
    code: cell
}

// NFT 托管成功通知 Marketplace
struct (0x71a00003) EscrowDeposited {
    queryId: uint64
    productId: uint64
    nftItem: address
    seller: address
}

// 管理员配置 Escrow 合约地址
struct (0x71a00004) SetEscrowAddress {
    escrow: address
}

// 卖家申请发布 NFT 商品
struct (0x71a00005) PublishProduct {
    kind: uint8
    nftItem: address
    collection: address
    itemIndex: uint256
    price: coins
    deliveryMode: uint8
    createdAt: uint32
}

// 卖家或 Escrow 管理员申请退回已托管 NFT
struct (0x71a00006) RequestRefund {
    escrowId: uint64
}

// Escrow 确认 NFT 已退回后通知 Marketplace
struct (0x71a00007) EscrowRefunded {
    queryId: uint64
    productId: uint64
    nftItem: address
    seller: address
}

// TEP-62 NFT Transfer：NFT 所有者发起转移
struct (0x5fcc3d14) NftTransfer {
    queryId: uint64
    newOwner: address
    responseDestination: address?
    customPayload: cell?
    forwardAmount: coins
    forwardPayload: RemainingBitsAndRefs
}

// TEP-62 NFT Excesses：NFT Item 返回的处理确认
struct (0xd53276db) NftExcesses {
    queryId: uint64
}

// TEP-62 NFT Ownership Assigned：NFT 所有权变更通知
struct (0x05138d91) NftOwnershipAssigned {
    queryId: uint64
    prevOwner: address
    forwardPayload: RemainingBitsAndRefs
}

// Marketplace 确认已处理退款回调
struct (0x71a00008) EscrowRefundAck {
    queryId: uint64
    productId: uint64
    nftItem: address
    seller: address
}

// 管理员重试发送尚未确认的退款回调
struct (0x71a00009) RetryRefundCallback {
    escrowId: uint64
}

// 管理 NFT Escrow 全局暂停状态（仅 Owner）
struct (0x71a0000B) SetEscrowPaused {
    paused: bool
}

// Marketplace 确认已处理 NFT 入库回调
struct (0x71a0000C) EscrowDepositAck {
    queryId: uint64
    productId: uint64
    nftItem: address
    seller: address
}

// Escrow 管理员重试发送尚未确认的 NFT 入库回调
struct (0x71a0000D) RetryDepositCallback {
    escrowId: uint64
}

// Marketplace 管理员重试创建 NFT 托管
struct (0x71a0000E) RetryCreateEscrow {
    productId: uint64
}

// Marketplace V2 isolated NFT release ABI. These declarations do not alter
// V1 serialized storage and do not enable any V2 entrypoint.
struct (0x71b00002) ReleaseEscrowV2 {
    orderId: uint64
    productId: uint64
    escrowId: uint64
    queryId: uint64
    buyer: address
}

// Emitted only after the NFT Item's authenticated TEP-62 excesses confirmation.
struct (0x71b00003) EscrowReleasedV2 {
    orderId: uint64
    productId: uint64
    escrowId: uint64
    queryId: uint64
    nftItem: address
    buyer: address
}

// Exact acknowledgement lets Escrow clear its durable callback record.
struct (0x71b00008) EscrowReleaseAckV2 {
    orderId: uint64
    productId: uint64
    escrowId: uint64
    queryId: uint64
    nftItem: address
    buyer: address
}

struct (0x71b00009) RetryReleaseCallbackV2 {
    escrowId: uint64
}

struct (0x71b00013) EscrowReleaseFailedV2 {
    orderId: uint64
    productId: uint64
    escrowId: uint64
    queryId: uint64
    nftItem: address
    buyer: address
}

struct (0x71b00014) EscrowReleaseFailureAckV2 {
    orderId: uint64
    productId: uint64
    escrowId: uint64
    queryId: uint64
    nftItem: address
    buyer: address
}

struct (0x71b00015) RetryReleaseFailureCallbackV2 {
    escrowId: uint64
}

// Seller-initiated NFT return after a listing is cancelled; no buyer funds involved.
struct (0x71b0000E) RefundEscrowV2 {
    escrowId: uint64
    productId: uint64
    queryId: uint64
    seller: address
}

struct (0x71b0000F) EscrowRefundedV2 {
    escrowId: uint64
    productId: uint64
    queryId: uint64
    nftItem: address
    seller: address
}

struct (0x71b00010) EscrowRefundAckV2 {
    escrowId: uint64
    productId: uint64
    queryId: uint64
    nftItem: address
    seller: address
}

struct (0x71b00011) RetryRefundCallbackV2 {
    escrowId: uint64
}

struct EscrowRefundCallbackV2 {
    escrowId: uint64
    productId: uint64
    queryId: uint64
    nftItem: address
    seller: address
}

struct EscrowReleaseCallbackV2 {
    orderId: uint64
    productId: uint64
    escrowId: uint64
    queryId: uint64
    nftItem: address
    buyer: address
}

enum EscrowReleaseStatusV2 {
    Deposited = 1
    ReleasePending = 2
    Released = 3
}

enum ErrorsV2 {
    NotOwner = 200
    InvalidMessage = 0xFFFF
    InvalidRelease = 201
    ReleaseAlreadyPending = 202
    InvalidReleaseConfirmation = 203
    AssetAlreadyEscrowed = 204
    CollectionNotApproved = 205
    InvalidCollectionStatus = 206
    CollectionItemCodeNotConfigured = 207
    InvalidCollectionItemCode = 208
    InvalidNftItem = 209
    InvalidProductKind = 210
    InvalidRefund = 211
    InvalidPurchase = 212
    InvalidPayment = 213
    InvalidDelivery = 214
    InvalidPayout = 215
}

struct CreateEscrowV2Extra {
    itemIndex: uint256
    kind: uint8
}

struct (0x71b00001) CreateEscrowV2 {
    productId: uint64
    nftItem: address
    collection: address
    seller: address
    queryId: uint64
    extra: Cell<CreateEscrowV2Extra>
}

// V2 collection policy is isolated from V1 serialized storage.
struct (0x71b0000C) SetCollectionStatusV2 {
    collection: address
    newStatus: uint8
}

struct (0x71b0000D) SetCollectionItemCodeV2 {
    collection: address
    kind: uint8
    code: cell
}

struct NFTEscrowV2CollectionItemCode {
    kind: uint8
    code: cell
}

struct NFTEscrowV2CollectionStorage {
    collections: map<address, uint8>
    collectionItemCodes: map<address, Cell<NFTEscrowV2CollectionItemCode>>
}

struct (0x71b00004) EscrowDepositedV2 {
    escrowId: uint64
    productId: uint64
    nftItem: address
    seller: address
    queryId: uint64
}

struct (0x71b00005) EscrowDepositAckV2 {
    escrowId: uint64
    productId: uint64
    nftItem: address
    seller: address
    queryId: uint64
}

struct (0x71b00006) RetryDepositCallbackV2 {
    escrowId: uint64
}

struct EscrowDepositCallbackV2 {
    escrowId: uint64
    productId: uint64
    nftItem: address
    seller: address
    queryId: uint64
}

struct NFTEscrowV2RecordExtra {
    collection: address
    itemIndex: uint256
    kind: uint8
}

struct NFTEscrowV2Record {
    escrowId: uint64
    nftItem: address
    seller: address
    productId: uint64
    status: uint8
    queryId: uint64
    extra: Cell<NFTEscrowV2RecordExtra>
}

enum NFTEscrowV2RecordStatus {
    Pending = 0
    Deposited = 1
    ReleasePending = 2
    Released = 3
    RefundPending = 4
    Refunded = 5
}

struct EscrowReleaseFailureCallbackV2 {
    orderId: uint64
    productId: uint64
    escrowId: uint64
    queryId: uint64
    nftItem: address
    buyer: address
}

struct NFTEscrowV2ReleaseCallbackStorage {
    pendingReleases: map<uint64, Cell<EscrowReleaseCallbackV2>>
    releaseCallbacks: map<uint64, Cell<EscrowReleaseCallbackV2>>
    releaseFailureCallbacks: map<uint64, Cell<EscrowReleaseFailureCallbackV2>>
}

struct NFTEscrowV2RefundCallbackStorage {
    pendingRefunds: map<uint64, Cell<EscrowRefundCallbackV2>>
    refundCallbacks: map<uint64, Cell<EscrowRefundCallbackV2>>
}

struct NFTEscrowV2CallbackStorage {
    depositCallbacks: map<uint64, Cell<EscrowDepositCallbackV2>>
    releaseStorage: Cell<NFTEscrowV2ReleaseCallbackStorage>
    refundStorage: Cell<NFTEscrowV2RefundCallbackStorage>
    collectionStorage: Cell<NFTEscrowV2CollectionStorage>
}

struct NFTEscrowV2Storage {
    owner: address
    marketplace: address
    records: map<uint64, Cell<NFTEscrowV2Record>>
    // NFT Item -> current custody escrow ID; released items become available again.
    assetToEscrow: map<address, uint64>
    nextEscrowId: uint64
    queryToEscrow: map<uint64, uint64>
    callbacks: Cell<NFTEscrowV2CallbackStorage>
}

fun NFTEscrowV2Storage.load(): NFTEscrowV2Storage {
    return NFTEscrowV2Storage.fromCell(contract.getData());
}

fun NFTEscrowV2Storage.save(self) {
    contract.setData(self.toCell());
}

/// Integer-only settlement split. Fee rounds down; seller receives the remainder,
/// so platformFee + sellerAmount always equals the exact gross price.
struct SettlementAmounts {
    gross: coins
    platformFee: coins
    sellerAmount: coins
}

fun calculateSettlementAmounts(gross: coins): SettlementAmounts {
    // Divide before multiplying so the intermediate never exceeds the
    // TON VarUInteger 16 (120-bit) amount range for a valid gross amount.
    // Splitting quotient and remainder preserves exact floor(gross * 3 / 100).
    val wholeHundreds = gross / 100;
    val remainder = gross % 100;
    val platformFee = wholeHundreds * 3 + remainder * 3 / 100;

    return SettlementAmounts {
        gross: gross,
        platformFee: platformFee,
        sellerAmount: gross - platformFee,
    };
}

// Isolated Marketplace V2 purchase, escrow delivery, payout and refund protocol.
struct PublishProductV2Extra {
    itemIndex: uint256
    // MarketplaceV2AssetKind: Username=1, PhoneNumber=2, Gift=3.
    kind: uint8
    price: coins
}

struct (0x71b0000A) PublishProductV2 {
    expectedProductId: uint64
    queryId: uint64
    nftItem: address
    collection: address
    extra: Cell<PublishProductV2Extra>
}

struct (0x71b0000B) SetMarketplaceV2Escrow {
    escrow: address
}

struct (0x71b00012) CancelProductV2 {
    productId: uint64
}

// Buyer purchase request. The buyer identity is always in.senderAddress;
// expectedPrice and deadline are replay/price protection, never payment proof.
struct (0x71b00100) BuyProductV2 {
    productId: uint64
    expectedPrice: coins
    queryId: uint64
    deadline: uint32
}

// Outgoing payout envelopes carry immutable operation identities. They are
// bounce-correlated by MarketplaceV2; beneficiaries do not need to execute them.
struct (0x71b00101) SellerPayoutV2 {
    orderId: uint64
    operationId: uint64
    queryId: uint64
}

struct (0x71b00102) PlatformPayoutV2 {
    orderId: uint64
    operationId: uint64
    queryId: uint64
}

struct (0x71b00104) BuyerRefundV2 {
    orderId: uint64
    operationId: uint64
    queryId: uint64
}

// One-time treasury configuration before any order exists.
struct (0x71b00107) SetMarketplaceV2Treasury {
    treasury: address
}

// Permissionless retry/dispatch refers only to an already persisted payout liability.
struct (0x71b00103) RetryPayoutV2 {
    operationId: uint64
}

struct (0x71b00106) DispatchPayoutV2 {
    operationId: uint64
}

enum MarketplaceV2AssetKind {
    Username = 1
    PhoneNumber = 2
    Gift = 3
}

struct MarketplaceV2ProductExtra {
    collection: address
    itemIndex: uint256
    // MarketplaceV2AssetKind: Username=1, PhoneNumber=2, Gift=3.
    kind: uint8
}

struct MarketplaceV2Product {
    id: uint64
    seller: address
    nftItem: address
    price: coins
    escrowId: uint64
    queryId: uint64
    refundQueryId: uint64
    status: uint8
    createdAt: uint32
    extra: Cell<MarketplaceV2ProductExtra>
}

// Order lifecycle is separate from delivery and each payout leg. A partially
// settled order must never be represented as Completed.
enum MarketplaceV2OrderStatus {
    PaymentAccepted = 1
    DeliveryPending = 2
    DeliveryConfirmed = 3
    SettlementPending = 4
    // Both payout messages were dispatched. A later exact bounce can return
    // the order to SettlementPending; recipient finality is observed by indexers.
    PayoutsDispatched = 5
    RefundPending = 6
    ManualReview = 7
    // Buyer refund and seller NFT return were dispatched after a proven delivery failure.
    RefundDispatched = 8
}

enum MarketplaceV2DeliveryStatus {
    NotStarted = 0
    Pending = 1
    Confirmed = 2
    Bounced = 3
}

enum MarketplaceV2PayoutStatus {
    NotCreated = 0
    Pending = 1
    Dispatched = 2
    Bounced = 3
    ManualReview = 4
}

enum MarketplaceV2RefundStatus {
    None = 0
    Pending = 1
    Dispatched = 2
    Bounced = 3
    ManualReview = 4
}

// Immutable order snapshot. All operation IDs are distinct uint64 values;
// none is inferred from the order ID or NFT Escrow ID.
// Keep each snapshot segment below the TON 1023-bit cell limit.
struct MarketplaceV2OrderParties {
    buyer: address
    seller: address
    treasury: address
}

struct MarketplaceV2OrderAsset {
    nftItem: address
    collection: address
    itemIndex: uint256
    escrowId: uint64
}

struct MarketplaceV2OrderSettlement {
    gross: coins
    feeBps: uint16
    feeRoundingVersion: uint8
    platformFee: coins
    sellerProceeds: coins
    processingReserve: coins
}

struct MarketplaceV2OrderOperations {
    paymentQueryId: uint64
    releaseQueryId: uint64
    sellerPayoutOperationId: uint64
    platformPayoutOperationId: uint64
    buyerRefundOperationId: uint64
    sellerPayoutQueryId: uint64
    platformPayoutQueryId: uint64
    buyerRefundQueryId: uint64
}

struct MarketplaceV2OrderExtra {
    parties: Cell<MarketplaceV2OrderParties>
    asset: Cell<MarketplaceV2OrderAsset>
    settlement: Cell<MarketplaceV2OrderSettlement>
    operations: Cell<MarketplaceV2OrderOperations>
}

struct MarketplaceV2Order {
    id: uint64
    productId: uint64
    status: uint8
    deliveryStatus: uint8
    sellerPayoutStatus: uint8
    platformPayoutStatus: uint8
    refundStatus: uint8
    createdAt: uint32
    extra: Cell<MarketplaceV2OrderExtra>
}

// Independent payout liability snapshot. Seller and platform legs are
// persisted separately so a retry of one can never duplicate the other.
struct MarketplaceV2Payout {
    orderId: uint64
    operationId: uint64
    queryId: uint64
    beneficiary: address
    amount: coins
    kind: uint8
    status: uint8
    createdAt: uint32
}

// Split nested dictionaries into separate referenced cells: TON cells allow at
// most four references, independently of the 1023-bit data limit.
struct MarketplaceV2OrderStorage {
    orders: map<uint64, Cell<MarketplaceV2Order>>
    productToOrder: map<uint64, uint64>
    paymentQueryToOrder: map<uint64, uint64>
    refundQueryToOrder: map<uint64, uint64>
}

struct MarketplaceV2PayoutStorage {
    payouts: map<uint64, Cell<MarketplaceV2Payout>>
    payoutQueryToOperation: map<uint64, uint64>
}

// Purchase state is nested in one referenced cell so the root storage cell
// remains safely below TON's 1023-bit limit as the listing indexes grow.
struct MarketplaceV2PurchaseStorage {
    schemaVersion: uint16
    treasury: address
    treasuryConfigured: bool
    nextOrderId: uint64
    nextOperationId: uint64
    // Listing refund query correlation lives here to keep the root to four refs.
    refundQueryToProduct: map<uint64, uint64>
    orders: Cell<MarketplaceV2OrderStorage>
    payoutStorage: Cell<MarketplaceV2PayoutStorage>
}

struct MarketplaceV2Storage {
    owner: address
    escrow: address
    escrowConfigured: bool
    nextProductId: uint64
    nextQueryId: uint64
    products: map<uint64, Cell<MarketplaceV2Product>>
    // NFT Item address -> pending/active Marketplace V2 product ID.
    assetListings: map<address, uint64>
    queryToProduct: map<uint64, uint64>
    purchaseStorage: Cell<MarketplaceV2PurchaseStorage>
}

fun MarketplaceV2Storage.load(): MarketplaceV2Storage {
    return MarketplaceV2Storage.fromCell(contract.getData());
}

fun MarketplaceV2Storage.save(self) {
    contract.setData(self.toCell());
}
