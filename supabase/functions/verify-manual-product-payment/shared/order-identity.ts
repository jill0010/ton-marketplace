export function isOrderOwnedByVerifiedWallet(
  order: { buyer_user_id: unknown; buyer_wallet_raw: unknown },
  wallet: { userId: string; walletAddress: string },
): boolean {
  return order.buyer_user_id === wallet.userId &&
    order.buyer_wallet_raw === wallet.walletAddress;
}
