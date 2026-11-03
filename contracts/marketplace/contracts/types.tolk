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
