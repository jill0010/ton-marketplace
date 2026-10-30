import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Layout } from "./components/Layout"
import { AdminRoute } from "./components/AdminRoute"
import { CatalogPage } from "./pages/CatalogPage"
import { HomePage } from "./pages/HomePage"
import { ProductPage } from "./pages/ProductPage"
import { ProductAdminPage } from "./pages/ProductAdminPage"
import { ProductManagePage } from "./pages/ProductManagePage"
import { AdminLoginPage } from "./pages/AdminLoginPage"
import { LanguageProvider } from "./lib/language"
import { PremiumPage } from "./pages/PremiumPage"
import { PremiumPricingAdminPage } from "./pages/PremiumPricingAdminPage"

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/admin/login"
            element={<AdminLoginPage />}
          />

          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/premium" element={<PremiumPage />} />
            <Route path="/product/:id" element={<ProductPage />} />

            <Route element={<AdminRoute />}>
              <Route
                path="/admin/products"
                element={<ProductAdminPage />}
              />
              <Route
                path="/admin/manage-products"
                element={<ProductManagePage />}
              />
              <Route
                path="/admin/premium-pricing"
                element={<PremiumPricingAdminPage />}
              />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}


