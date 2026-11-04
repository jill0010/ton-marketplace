import { memo } from "react"

export const GramTokenMark = memo(function GramTokenMark({ className = "h-4 w-4" }: { className?: string }) {
  return <img src="/gram-logo.svg" alt="" aria-hidden="true" className={`inline-block shrink-0 object-contain ${className}`} />
})
