export function formatTelegramNumber(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (!digits.startsWith("888")) return value

  const subscriber = digits.slice(3)
  if (!subscriber) return "+888"

  // Standard 8-digit numbers render as +888 1234 5678;
  // 7-digit short numbers render as +888 1234 567.
  const firstGroup = subscriber.slice(0, 4)
  const remaining = subscriber.slice(4)
  return remaining ? `+888 ${firstGroup} ${remaining}` : `+888 ${firstGroup}`
}
