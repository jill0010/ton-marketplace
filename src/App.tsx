import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { TonConnectUIProvider } from "@tonconnect/ui-react"
import { Layout } from "./components/Layout"
import { AdminRoute } from "./components/AdminRoute"
import { TonConnectLanguageSync } from "./components/TonConnectLanguageSync"
import { LanguageProvider } from "./lib/language"

const CatalogPage = lazy(() => import("./pages/CatalogPage").then((module) => ({ default: module.CatalogPage })))
const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })))
const ProductPage = lazy(() => import("./pages/ProductPage").then((module) => ({ default: module.ProductPage })))
const PublishPage = lazy(() => import("./pages/PublishPage").then((module) => ({ default: module.PublishPage })))
const ProductAdminPage = lazy(() => import("./pages/ProductAdminPage").then((module) => ({ default: module.ProductAdminPage })))
const ProductManagePage = lazy(() => import("./pages/ProductManagePage").then((module) => ({ default: module.ProductManagePage })))
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage").then((module) => ({ default: module.AdminLoginPage })))
const AdminResetPasswordPage = lazy(() => import("./pages/AdminResetPasswordPage").then((module) => ({ default: module.AdminResetPasswordPage })))
const PremiumRoute = lazy(() => import("./components/PremiumRoute").then((module) => ({ default: module.PremiumRoute })))
const PremiumHistoryPage = lazy(() => import("./pages/PremiumHistoryPage").then((module) => ({ default: module.PremiumHistoryPage })))
const PremiumPricingAdminPage = lazy(() => import("./pages/PremiumPricingAdminPage").then((module) => ({ default: module.PremiumPricingAdminPage})))
const PremiumOrdersAdminPage = lazy(() => import("./pages/PremiumOrdersAdminPage").then((module) => ({ default: module.PremiumOrdersAdminPage })))
const AdminWalletSettingsPage = lazy(() => import("./pages/AdminWalletSettingsPage").then((module) => ({ default: module.AdminWalletSettingsPage })))

export default function App() {
  return (
    <LanguageProvider>
      <TonConnectUIProvider
        manifestUrl="https://ton-marketplace-cvj.pages.dev/tonconnect-manifest.json"
        language="en"
      >
        <TonConnectLanguageSync />
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="flex min-h-svh items-center justify-center bg-[#0b0d12] px-4 text-sm text-zinc-400">
                Loading page…
              </div>
            }
          >
            <Routes>
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin/reset-password" element={<AdminResetPasswordPage />} />

              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/premium" element={<PremiumRoute />} />
                <Route path="/premium/history" element={<PremiumHistoryPage />} />
                <Route path="/product/:id" element={<ProductPage />} />
                <Route path="/publish" element={<PublishPage />} />

                <Route element={<AdminRoute />}>
                  <Route path="/admin/products" element={<ProductAdminPage />} />
                  <Route path="/admin/manage-products" element={<ProductManagePage />} />
                  <Route path="/admin/premium-pricing" element={<PremiumPricingAdminPage />} />
                  <Route path="/admin/premium-orders" element={<PremiumOrdersAdminPage />} />
                  <Route path="/admin/wallet-settings" element={<AdminWalletSettingsPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TonConnectUIProvider>
    </LanguageProvider>
  )
}

