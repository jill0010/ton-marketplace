import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78"

type ManagedProduct = {
  id: string
  name: string
  price: number | string
  currency: string
  image_url: string | null
  status: string
  created_at: string
}

function getSafeStoragePath(imageUrl: string): string | null {
  try {
    const projectUrl = import.meta.env.VITE_SUPABASE_URL
    if (!projectUrl) return null

    const image = new URL(imageUrl)
    const project = new URL(projectUrl)

    if (image.origin !== project.origin) return null

    const prefix = "/storage/v1/object/public/product-images/"
    if (!image.pathname.startsWith(prefix)) return null

    const path = decodeURIComponent(image.pathname.slice(prefix.length))

    if (!path.startsWith("products/") || path.includes("..")) {
      return null
    }

    return path
  } catch {
    return null
  }
}

export function ProductManagePage() {
  const [products, setProducts] = useState<ManagedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setMessage("")

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError || authData.user?.id !== ADMIN_UID) {
        setIsAdmin(false)
        setProducts([])
        setMessage("当前账号不是授权管理员，请使用管理员账号登录。")
        return
      }

      setIsAdmin(true)

      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, currency, image_url, status, created_at")
        .order("created_at", { ascending: false })

      if (error) throw new Error(`读取商品失败：${error.message}`)

      setProducts((data ?? []) as ManagedProduct[])
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "读取商品失败，请稍后重试。"
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  async function handleDelete(product: ManagedProduct) {
    if (deletingId) return

    const confirmed = window.confirm(
      `确定删除商品「${product.name}」吗？\n\n商品记录删除后无法通过本页面恢复。请确认后再继续。`
    )

    if (!confirmed) return

    setDeletingId(product.id)
    setMessage("正在验证权限并删除商品……")

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError || authData.user?.id !== ADMIN_UID) {
        throw new Error("管理员身份验证失败，未执行删除。")
      }

      // 重新读取目标记录，避免只依赖页面中的旧数据。
      const { data: target, error: targetError } = await supabase
        .from("products")
        .select("id, name, image_url")
        .eq("id", product.id)
        .maybeSingle()

      if (targetError) {
        throw new Error(`读取待删除商品失败：${targetError.message}`)
      }

      if (!target) {
        await loadProducts()
        setMessage("该商品已不存在，列表已刷新。")
        return
      }

      // 先删除数据库记录；失败时绝不删除图片。
      const { data: deletedRows, error: deleteError } = await supabase
        .from("products")
        .delete()
        .eq("id", target.id)
        .select("id")

      if (deleteError) {
        throw new Error(`删除商品失败：${deleteError.message}`)
      }

      if (!deletedRows || deletedRows.length !== 1) {
        throw new Error(
          "未能确认商品记录已删除。可能是权限不足或记录已变化；为安全起见，未删除图片。"
        )
      }

      let cleanupMessage = "商品记录已删除。"

      if (target.image_url) {
        const storagePath = getSafeStoragePath(target.image_url)

        if (!storagePath) {
          cleanupMessage += " 图片不属于可确认的本商城商品图片路径，因此保留图片。"
        } else {
          // 删除记录后检查是否仍有其他商品引用同一 URL。
          const { data: references, error: referenceError } = await supabase
            .from("products")
            .select("id")
            .eq("image_url", target.image_url)
            .limit(1)

          if (referenceError) {
            cleanupMessage += " 无法确认图片是否被共用，因此保留图片。"
          } else if (references && references.length > 0) {
            cleanupMessage += " 该图片仍被其他商品引用，因此保留图片。"
          } else {
            const { error: storageError } = await supabase.storage
              .from("product-images")
              .remove([storagePath])

            if (storageError) {
              cleanupMessage += ` 图片清理失败，请检查 Storage 权限：${storageError.message}`
            } else {
              cleanupMessage += " 已确认没有其他商品引用该图片，并完成图片清理。"
            }
          }
        }
      }

      await loadProducts()
      setMessage(cleanupMessage)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "操作失败，请检查网络和权限。"
      )
      await loadProducts()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            TON MARKETPLACE
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            下架商品
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            查看已保存商品，安全删除不需要的商品记录。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.location.assign("/admin/products")}
          className="rounded-full border border-green-400/40 px-4 py-2 text-sm font-medium text-green-300 transition hover:bg-green-400/10"
        >
          上传商品
        </button>

        <button
          type="button"
          onClick={() => void loadProducts()}
          disabled={loading || deletingId !== null}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          刷新列表
        </button>
        </div>
      </header>

      {message && (
        <p role="status" className="break-words rounded-xl border border-white/10 p-4 text-sm text-zinc-200">
          {message}
        </p>
      )}

      {!isAdmin && !loading && (
        <p className="text-sm text-zinc-400">
          商品管理功能仅对授权管理员开放。
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">正在加载商品……</p>
      ) : isAdmin && products.length === 0 ? (
        <p className="rounded-xl border border-white/10 p-5 text-sm text-zinc-400">
          暂无商品记录。
        </p>
      ) : isAdmin ? (
        <div className="space-y-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center"
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-24 w-24 rounded-xl border border-white/10 object-contain"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-white/10 text-xs text-zinc-500">
                  无图片
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="break-words font-medium text-white">
                  {product.name}
                </h2>
                <p className="text-sm text-zinc-300">
                  {product.price} {product.currency}
                </p>
                <p className="text-xs text-zinc-500">
                  状态：{product.status}
                </p>
                <p className="break-all text-xs text-zinc-500">
                  ID：{product.id}
                </p>
                <p className="text-xs text-zinc-500">
                  创建时间：{new Date(product.created_at).toLocaleString()}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleDelete(product)}
                disabled={deletingId !== null}
                className="rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId === product.id ? "正在处理……" : "删除商品"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}


