export function validHistoryPage(
  rows: Array<{ utime: unknown; transaction_id?: { lt?: unknown; hash?: unknown } }>,
  previousPageOldestUtime: number,
  seen: Set<string>,
): { valid: boolean; oldestUtime: number } {
  let previousUtime = Number.POSITIVE_INFINITY;
  const pending: string[] = [];
  for (const tx of rows) {
    const utime = Number(tx.utime);
    const lt = String(tx.transaction_id?.lt ?? "");
    const hash = String(tx.transaction_id?.hash ?? "");
    const id = lt + ":" + hash;
    if (!Number.isSafeInteger(utime) || utime <= 0 || utime > previousUtime ||
      !/^\d+$/.test(lt) || !/^[0-9a-f]{64}$/i.test(hash) ||
      seen.has(id) || pending.includes(id)) {
      return { valid: false, oldestUtime: previousPageOldestUtime };
    }
    previousUtime = utime;
    pending.push(id);
  }
  if (rows.length && Number(rows[0].utime) > previousPageOldestUtime) {
    return { valid: false, oldestUtime: previousPageOldestUtime };
  }
  for (const id of pending) seen.add(id);
  return { valid: true, oldestUtime: rows.length ? Number(rows[rows.length - 1].utime) : previousPageOldestUtime };
}
