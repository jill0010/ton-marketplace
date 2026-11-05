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
      return <svg viewBox="0 0 24 24" {...common}><rect x="2.8" y="3.7" width="18.4" height="16.6" rx="1.4" /><path d="M9.2 3.7v4.6h5.6V3.7" /><path d="M9.2 8.3h5.6" /><path d="M11.1 12.1h1.8" /></svg>
    case "bids":
      return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.5" /><path d="M7.3 6.6h9.4L12 17.4 7.3 6.6Z" /><path d="M12 6.6v10.8" /></svg>
    case "numbers":
      return <svg viewBox="0 0 24 24" {...common}><path d="M6.1 3.2c1.1-.3 2.2.3 2.6 1.4l.8 2.1c.3.8.1 1.6-.6 2.2l-1.2 1a13.6 13.6 0 0 0 6.4 6.4l1-1.2c.6-.7 1.4-.9 2.2-.6l2.1.8c1.1.4 1.7 1.5 1.4 2.6l-.5 1.5c-.4 1.2-1.7 1.9-2.9 1.7C9.4 20.2 3.8 14.6 3 6.6 2.8 5.4 3.5 4.1 4.7 3.7l1.4-.5Z" /><rect x="15.1" y="2.4" width="6.1" height="6.1" rx="1.1" /><path d="M16.7 2.4V1.7a1.45 1.45 0 0 1 2.9 0v.7" /></svg>
    case "sessions":
      return <svg viewBox="0 0 24 24" {...common}><rect x="4.1" y="2.8" width="15.1" height="14.2" rx="1.3" /><path d="M1.8 20.1h14.4" /><rect x="17.2" y="8.3" width="5" height="11.2" rx="1" /></svg>
    case "logout":
      return <svg viewBox="0 0 24 24" {...common}><path d="M13.2 3.1H5.1a2 2 0 0 0-2 2v13.8a2 2 0 0 0 2 2h8.1" /><path d="M13.1 8.1 17 12l-3.9 3.9" /><path d="M8.2 12H17" /></svg>
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
