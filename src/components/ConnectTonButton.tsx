import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

type MenuItem = {
  label: string
  path?: string
  action?: "logout"
  icon: "profile" | "assets" | "bids" | "numbers" | "sessions" | "logout"
}

const MENU_ITEMS: MenuItem[] = [
  { label: "My Profile", path: "/profile", icon: "profile" },
  { label: "My Assets", path: "/assets", icon: "assets" },
  { label: "My Bids", path: "/my-bids", icon: "bids" },
  { label: "My Numbers", path: "/assets?type=phone_number", icon: "numbers" },
  { label: "Active Sessions", path: "/active-sessions", icon: "sessions" },
  { label: "Log out", action: "logout", icon: "logout" },
]

function MenuIcon({ name }: { name: MenuItem["icon"] }) {
  const common = { className: "h-6 w-6 shrink-0 fill-none stroke-current", strokeWidth: 1.55, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const }
  switch (name) {
    case "profile":
      return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="9" r="3" /><path d="M6.8 18.2a5.7 5.7 0 0 1 10.4 0" /></svg>
    case "assets":
      return <svg viewBox="0 0 24 24" {...common}><rect x="2.8" y="4.2" width="18.4" height="15.6" rx="2.4" /><path d="M3 8.5h18M8.5 13h7" /><circle cx="12" cy="13" r="1.2" /></svg>
    case "bids":
      return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.5" /><path d="M6.9 6.5h10.2L12 17.7 6.9 6.5Z" /><path d="M12 6.5v11.2" /></svg>
    case "numbers":
      return <svg viewBox="0 0 24 24" {...common}><path d="M7 3.5c1.2-.5 2.4.2 2.8 1.4l.7 2.2c.3.9 0 1.8-.7 2.4l-1.2 1a14 14 0 0 0 6.9 6.9l1-1.2c.6-.7 1.5-1 2.4-.7l2.2.7c1.2.4 1.9 1.6 1.4 2.8l-.5 1.3c-.5 1.3-1.9 2-3.3 1.8C10 20.8 3.2 14 2.6 5.3 2.5 3.9 3.2 2.5 4.5 2l2.5-.9Z" /><rect x="15" y="2.5" width="6.5" height="6.5" rx="1.3" /><path d="M17 5.75h2.5" /></svg>
    case "sessions":
      return <svg viewBox="0 0 24 24" {...common}><rect x="5.5" y="3" width="16" height="15" rx="1.7" /><path d="M2 21h18M2.5 18.5h9" /></svg>
    case "logout":
      return <svg viewBox="0 0 24 24" {...common}><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="M14 8l5 4-5 4M8 12h11" /></svg>
  }
}

export function ConnectTonButton() {
  const { language, t } = useLanguage()
  const walletAddress = useTonAddress()
  const [tonConnectUI] = useTonConnectUI()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [menuError, setMenuError] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setMenuOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!walletAddress) setMenuOpen(false)
  }, [walletAddress])

  function handleButtonClick() {
    if (!walletAddress) {
      void tonConnectUI.openModal()
      return
    }
    setMenuError("")
    setMenuOpen((open) => !open)
  }

  async function handleMenuItem(item: MenuItem) {
    if (item.action === "logout") {
      setLoggingOut(true)
      setMenuError("")
      try {
        await tonConnectUI.disconnect()
        setMenuOpen(false)
      } catch (cause) {
        setMenuError(cause instanceof Error ? cause.message : t("Unable to disconnect wallet.", "退出失败，请重试。"))
      } finally {
        setLoggingOut(false)
      }
      return
    }
    if (item.path) {
      setMenuOpen(false)
      navigate(item.path)
    }
  }

  const shortAddress = walletAddress ? `${walletAddress.slice(0, 4)} ... ${walletAddress.slice(-5)}` : ""

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleButtonClick}
        aria-haspopup={walletAddress ? "menu" : undefined}
        aria-expanded={walletAddress ? menuOpen : undefined}
        aria-label={walletAddress ? t("Wallet menu: ", "钱包菜单：") + shortAddress : t("Connect TON wallet", "连接 TON 钱包")}
        className={`inline-flex h-10 min-w-[148px] items-center justify-center gap-2 rounded-xl border border-transparent px-3 text-white shadow-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d12] ${menuOpen ? "bg-[#228bdc]" : "bg-[#2a3342] hover:bg-[#344052]"}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 shrink-0 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 5.2h17L12 20.3 3.5 5.2Z" />
          <path d="M12 5.2v15.1" />
        </svg>
        {walletAddress ? (
          <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.02em]">{shortAddress}</span>
        ) : (
          <span className="whitespace-nowrap text-sm font-semibold">{language === "zh" || language === "zh-TW" ? "连接 TON" : "Connect TON"}</span>
        )}
        <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 shrink-0 fill-none stroke-current opacity-75 transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 7 6 6 6-6" />
        </svg>
      </button>

      {walletAddress && menuOpen && (
        <div role="menu" aria-label={t("Wallet navigation", "钱包导航")} className="absolute right-0 z-50 mt-2 w-[256px] overflow-hidden rounded-xl border border-white/10 bg-[#2d3948] py-1.5 shadow-2xl">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.icon}
              type="button"
              role="menuitem"
              onClick={() => void handleMenuItem(item)}
              disabled={loggingOut}
              className={`flex min-h-[54px] w-full items-center gap-5 px-4 text-left text-[15px] font-medium text-white transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.08] focus-visible:outline-none disabled:opacity-60 ${item.action === "logout" ? "mt-1 border-t border-white/[0.06]" : ""}`}
            >
              <MenuIcon name={item.icon} />
              <span>{item.action === "logout" ? t("Log out", "退出登录") : t(item.label, item.icon === "profile" ? "我的个人资料" : item.icon === "assets" ? "我的资产" : item.icon === "bids" ? "我的出价" : item.icon === "numbers" ? "我的号码" : "活跃会话")}</span>
              {item.action === "logout" && loggingOut && <span className="ml-auto text-xs text-zinc-300">{t("…", "…")}</span>}
            </button>
          ))}
          {menuError && <p role="alert" className="px-4 py-2 text-xs text-red-200">{menuError}</p>}
        </div>
      )}
    </div>
  )
}
