import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { LanguageContext } from "./language-context"
import type { Language } from "./language-context"

export type { Language } from "./language-context"

const TRANSLATIONS: Partial<Record<Language, Record<string, string>>> = {
  "zh-TW": {
    "Home": "首頁",
    "All Products": "所有商品",
    "View All Products": "瀏覽所有商品",
    "Publish Product": "刊登商品",
    "Connect wallet": "連接錢包",
    "Connect TON Wallet": "連接 TON 錢包",
    "Payment Method": "付款方式",
    "Wallet verified": "錢包已驗證",
    "Verification required": "需要驗證",
    "Not connected": "尚未連接",
    "Preparing...": "準備中……",
    "Verifying...": "驗證中……",
    "Connect your wallet and verify ownership with TON Proof.": "連接錢包並透過 TON Proof 驗證錢包所有權。",
    "Verified wallet version: ": "已驗證錢包版本：",
    "Telegram Premium": "Telegram 高級版",
    "View Details": "查看詳情",
    "Listed Products": "在售商品",
    "Loading products…": "正在載入商品……",
    "No products listed yet. Please check back later.": "目前沒有在售商品，請稍後再查看。",
    "Retry": "重試",
    "Loading…": "載入中……",
    "Failed to load products. Please try again.": "讀取商品失敗，請稍後重試。",
    "Marketplace preview: search and filtering are available. Wallet payments are not enabled yet.": "商城預覽：目前支援搜尋與篩選，錢包付款尚未啟用。",
    "TON Digital Asset Marketplace · Phase 2": "TON 數位資產交易市場 · 第二階段",
    "Explore Usernames, Numbers, Gifts and Telegram Premium": "探索收藏用戶名、匿名號碼、收藏禮物與 Telegram 高級版",
    "Browse listed products from the database. Wallet payments will be added in a later phase.": "瀏覽資料庫中的在售商品。錢包付款將於後續階段開放。",
    "Usernames": "收藏用戶名",
    "Numbers": "匿名號碼",
    "Gifts": "收藏禮物",
  },
  ru: {
    "Home": "Главная",
    "All Products": "Все товары",
    "View All Products": "Смотреть все товары",
    "Publish Product": "Разместить товар",
    "Connect wallet": "Подключить кошелёк",
    "Connect TON Wallet": "Подключить TON-кошелёк",
    "Payment Method": "Способ оплаты",
    "Wallet verified": "Кошелёк подтверждён",
    "Verification required": "Требуется проверка",
    "Not connected": "Не подключён",
    "Preparing...": "Подготовка...",
    "Verifying...": "Проверка...",
    "Connect your wallet and verify ownership with TON Proof.": "Подключите кошелёк и подтвердите владение с помощью TON Proof.",
    "Verified wallet version: ": "Подтверждённая версия кошелька: ",
    "Telegram Premium": "Telegram Premium",
    "View Details": "Подробнее",
    "Listed Products": "Товары в продаже",
    "Loading products…": "Загрузка товаров…",
    "No products listed yet. Please check back later.": "Пока нет товаров. Загляните позже.",
    "Retry": "Повторить",
    "Loading…": "Загрузка…",
    "Failed to load products. Please try again.": "Не удалось загрузить товары. Попробуйте ещё раз.",
    "Marketplace preview: search and filtering are available. Wallet payments are not enabled yet.": "Предварительная версия: доступны поиск и фильтры. Оплата кошельком пока отключена.",
    "TON Digital Asset Marketplace · Phase 2": "Торговая площадка цифровых активов TON · Этап 2",
    "Explore Usernames, Numbers, Gifts and Telegram Premium": "Ищите имена пользователей, номера, подарки и Telegram Premium",
    "Browse listed products from the database. Wallet payments will be added in a later phase.": "Просматривайте товары из базы данных. Оплата кошельком появится на следующем этапе.",
    "Usernames": "Имена пользователей",
    "Numbers": "Номера",
    "Gifts": "Подарки",
  },
  ar: {
    "Home": "الرئيسية",
    "All Products": "جميع المنتجات",
    "View All Products": "عرض جميع المنتجات",
    "Publish Product": "نشر منتج",
    "Connect wallet": "ربط المحفظة",
    "Connect TON Wallet": "ربط محفظة TON",
    "Payment Method": "طريقة الدفع",
    "Wallet verified": "تم التحقق من المحفظة",
    "Verification required": "التحقق مطلوب",
    "Not connected": "غير متصلة",
    "Preparing...": "جارٍ التحضير...",
    "Verifying...": "جارٍ التحقق...",
    "Connect your wallet and verify ownership with TON Proof.": "اربط محفظتك وأثبت ملكيتها باستخدام TON Proof.",
    "Verified wallet version: ": "إصدار المحفظة الذي تم التحقق منه: ",
    "Telegram Premium": "Telegram Premium",
    "View Details": "عرض التفاصيل",
    "Listed Products": "المنتجات المعروضة",
    "Loading products…": "جارٍ تحميل المنتجات...",
    "No products listed yet. Please check back later.": "لا توجد منتجات معروضة حاليًا. يرجى العودة لاحقًا.",
    "Retry": "إعادة المحاولة",
    "Loading…": "جارٍ التحميل...",
    "Failed to load products. Please try again.": "تعذر تحميل المنتجات. يرجى المحاولة مرة أخرى.",
    "Marketplace preview: search and filtering are available. Wallet payments are not enabled yet.": "نسخة معاينة السوق: البحث والتصفية متاحان. الدفع بالمحفظة غير مفعّل بعد.",
    "TON Digital Asset Marketplace · Phase 2": "سوق الأصول الرقمية TON · المرحلة الثانية",
    "Explore Usernames, Numbers, Gifts and Telegram Premium": "استكشف أسماء المستخدمين والأرقام والهدايا وTelegram Premium",
    "Browse listed products from the database. Wallet payments will be added in a later phase.": "تصفح المنتجات المعروضة في قاعدة البيانات. ستتوفر مدفوعات المحفظة في مرحلة لاحقة.",
    "Usernames": "أسماء المستخدمين",
    "Numbers": "الأرقام",
    "Gifts": "الهدايا",
  },
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem("ton-marketplace-language")
      return saved === "zh" || saved === "zh-TW" || saved === "ru" || saved === "ar"
        ? saved
        : "en"
    } catch {
      return "en"
    }
  })

  function setLanguage(next: Language) {
    setLanguageState(next)
    try {
      localStorage.setItem("ton-marketplace-language", next)
    } catch {
      // Language selection still works for the current session.
    }
  }

  const t = (english: string, chinese: string) => {
    if (language === "en") return english
    if (language === "zh") return chinese
    return TRANSLATIONS[language]?.[english] ?? english
  }

  useEffect(() => {
    document.documentElement.lang =
      language === "zh" ? "zh-CN" :
      language === "zh-TW" ? "zh-TW" : language
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr"
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}
