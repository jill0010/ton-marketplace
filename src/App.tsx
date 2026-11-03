import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { TonConnectUIProvider } from "@tonconnect/ui-react"
import { Layout } from "./components/Layout"
import { AdminRoute } from "./components/AdminRoute"
import { TonConnectLanguageSync } from "./components/TonConnectLanguageSync"
import { LanguageProvider } from "./lib/language"

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })))
const AssetsPage = lazy(() => import("./pages/AssetsPage").then((module) => ({ default: module.AssetsPage })))
const MyBidsPage = lazy(() => import("./pages/MyBidsPage").then((module) => ({ default: module.MyBidsPage })))
const PublishPage = lazy(() => import("./pages/PublishPage").then((module) => ({ default: module.PublishPage })))
const ProductAdminPage = lazy(() => import("./pages/ProductAdminPage").then((module) => ({ default: module.ProductAdminPage })))
const ProductManagePage = lazy(() => import("./pages/ProductManagePage").then((module) => ({ default: module.ProductManagePage })))
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage").then((module) => ({ default: module.AdminLoginPage })))
const PremiumRoute = lazy(() => import("./components/PremiumRoute").then((module) => ({ default: module.PremiumRoute })))
const PremiumPricingAdminPage = lazy(() => import("./pages/PremiumPricingAdminPage").then((module) => ({ default: module.PremiumPricingAdminPage })))

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
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/assets" element={<AssetsPage />} />
                <Route path="/my-bids" element={<MyBidsPage />} />
                <Route path="/catalog" element={<Navigate to="/" replace />} />
                <Route path="/product/:id" element={<Navigate to="/" replace />} />
                <Route path="/premium" element={<PremiumRoute />} />
                <Route path="/publish" element={<Navigate to="/assets" replace />} />
                <Route element={<AdminRoute />}>
                  <Route path="/admin/products" element={<ProductAdminPage />} />
                  <Route path="/admin/manage-products" element={<ProductManagePage />} />
                  <Route path="/admin/premium-pricing" element={<PremiumPricingAdminPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TonConnectUIProvider>
    </LanguageProvider>
  )
}
