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
struct Product {
    id: uint64
    seller: address
    kind: uint8
    assetAddress: address
    price: coins
    deliveryMode: uint8
    status: uint8
    createdAt: uint32
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
    nextProductId: uint64
    nextOrderId: uint64
    products: map<uint64, Product>
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

// NFT 托管合约专用存储
struct EscrowStorage {
    owner: address
    marketplace: address
    paused: bool
    nextEscrowId: uint64
    records: map<uint64, Cell<EscrowRecord>>
    collections: map<address, uint8>
    queryToEscrow: map<uint64, uint64>
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
}

// 创建 NFT 托管记录消息
struct (0x71a00001) CreateEscrow {
    nftItem: address
    collection: address
    seller: address
    productId: uint64
    extra: Cell<CreateEscrowExtra>
}

// 管理 Collection 白名单状态
struct (0x71a00002) SetCollectionStatus {
    collection: address
    newStatus: uint8
}
