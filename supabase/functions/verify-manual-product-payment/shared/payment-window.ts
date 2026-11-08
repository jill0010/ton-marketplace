export function validPaymentWindow(createdAt: string, expiresAt: string, now = Date.now()): boolean {
  const start = Date.parse(createdAt);
  const end = Date.parse(expiresAt);
  return Number.isFinite(start) && Number.isFinite(end) &&
    end > start && start <= now + 120_000;
}

export function paymentIsWithinWindow(
  transactionTimestamp: number,
  createdAt: string,
  expiresAt: string,
): boolean {
  const start = Date.parse(createdAt);
  const end = Date.parse(expiresAt);
  return Number.isFinite(transactionTimestamp) && Number.isFinite(start) &&
    Number.isFinite(end) && transactionTimestamp >= start - 120_000 &&
    transactionTimestamp <= end;
}
