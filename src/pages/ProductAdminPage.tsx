
import { useEffect, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import type { ProductType } from "../types/product"

type DraftProduct = {
  identifier: string
  type: ProductType
  title: string
  description: string
  priceTon: string
}

function identifyProduct(value: string): ProductType | null {
  const input = value.trim()

  if (/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(input)) {
    return "username"
  }

  if (/^\+888[0-9]+$/.test(input)) {
    return "number"
  }

  return null
}

function getDefaultDescription(
  identifier: string,
  type: ProductType,
): string {
  if (type === "username") {
    const username = identifier.trim().slice(1)

    return `The @${username} username on Telegram. Aliases: ${username}.t.me, t.me/${username}`
  }

  if (type === "number") {
    const number = identifier.trim()
    const match = number.match(/^(\+888)(\d{4})(\d{4})$/)

    const formattedNumber = match
      ? `${match[1]} ${match[2]} ${match[3]}`
      : number

    return `The anonymous number ${formattedNumber} that can be used to create a Telegram account that is not tied to a SIM card.`
  }

  return ""
}

const TYPE_LABELS: Record<ProductType, string> = {
  username: "Telegram 收藏用户名",
  number: "Telegram +888 收藏号码",
  gift: "Telegram 收藏礼物",
}

const INITIAL_DRAFT: DraftProduct = {
  identifier: "",
  type: "username",
  title: "",
  description: "",
  priceTon: "",
}

export function ProductAdminPage() {
  const [draft, setDraft] = useState<DraftProduct>({
    ...INITIAL_DRAFT,
  })

  const [imageUrl, setImageUrl] = useState("")
  const [imageName, setImageName] = useState("")
  const [imageError, setImageError] = useState("")
  const [message, setMessage] = useState("")
  const [previewReady, setPreviewReady] = useState(false)
  const saving = false
  const [published, setPublished] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (imageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [imageUrl])

  function handleIdentifierChange(value: string) {
    const identifier = value.trim()
    const detectedType = identifyProduct(identifier)

    setDraft((previous) => {
      if (!detectedType) {
        return {
          ...previous,
          identifier: value,
          description: "",
        }
      }

      return {
        ...previous,
        identifier: value,
        type: detectedType,
        title: identifier,
        description: getDefaultDescription(
          identifier,
          detectedType,
        ),
      }
    })

    setMessage("")
    setPreviewReady(false)
  }

  function handleImageFile(file: File, input?: HTMLInputElement) {
    setImageError("")
    setMessage("")
    setPreviewReady(false)

    if (!file.type.startsWith("image/")) {
      setImageName("")
      setImageUrl("")
      setImageError("请选择图片文件。")
      if (input) input.value = ""
      return
    }

    if (file.size > 5 * 1024 * 1024) {
        setImageName("")
      setImageUrl("")
      setImageError("图片不能超过 5 MB。")
      if (input) input.value = ""
      return
    }

    setImageUrl(URL.createObjectURL(file))
    setImageName(file.name || "剪贴板图片")
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) handleImageFile(file, event.target)
  }

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (saving || published) return
      const items = event.clipboardData?.items
      if (!items) return

      const item = Array.from(items).find((entry) =>
        entry.type.startsWith("image/"),
      )
      const file = item?.getAsFile()
      if (!file) return

      event.preventDefault()
      handleImageFile(file)
    }

    window.addEventListener("paste", handlePaste)
    return () => window.removeEventListener("paste", handlePaste)
  }, [saving, published])
  function validateDraft(): ProductType | null {
    if (!draft.identifier.trim()) {
      setMessage("请先输入 Telegram 用户名或 +888 号码。")
      return null
    }

    const detectedType = identifyProduct(draft.identifier)

    if (!detectedType) {
      setMessage(
        "目前仅支持标准 Telegram 用户名（@开头）和 +888 数字号码。",
      )
      return null
    }

    if (!draft.title.trim()) {
      setMessage("请填写商品名称。")
      return null
    }

    if (
      draft.priceTon.trim() === "" ||
      !Number.isFinite(Number(draft.priceTon)) ||
      Number(draft.priceTon) <= 0
    ) {
      setMessage("请输入大于 0 的有效 GRAM 售价。")
      return null
    }

    if (imageError) {
      setMessage("请先修正商品图片错误，或重新选择图片。")
      return null
    }

    return detectedType
  }

  function handlePreview() {
    const detectedType = validateDraft()

    if (!detectedType) return

    setDraft((previous) => ({
      ...previous,
      type: detectedType,
      description: getDefaultDescription(
        previous.identifier,
        detectedType,
      ),
    }))

    setPreviewReady(true)
    setMessage("预览已生成，请检查信息后再发布。")
  }

  function handleNewProduct() {
    if (saving) return

    setDraft({ ...INITIAL_DRAFT })
    setImageUrl("")
    setImageName("")
    setImageFile(null)
    setImageError("")
    setMessage("")
    setPreviewReady(false)
    setPublished(false)

    if (imageInputRef.current) {
      imageInputRef.current.value = ""
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })
  }

  async function handlePublish() {
    setMessage("手动创建商品已关闭。商城只允许通过 TON 主网 Marketplace V2 托管流程上架钱包实际持有的 NFT。")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            TON MARKETPLACE
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            上传商品
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            输入商品标识，填写售价并上传图片，检查后发布商品。
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.assign("/admin/manage-products")}
          className="rounded-full border border-green-400/40 px-4 py-2 text-sm font-medium text-green-300 transition hover:bg-green-400/10"
        >
          下架商品
        </button>
      </header>

      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">
        手动商品发布已停用。只有经过链上托管验证的 Telegram NFT 才能公开上架。
      </div>

      <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div>
          <label
            htmlFor="product-identifier"
            className="mb-2 block text-sm text-zinc-300"
          >
            Telegram 用户名或 +888 号码
          </label>
          <input
            id="product-identifier"
            value={draft.identifier}
            onChange={(event) =>
              handleIdentifierChange(event.target.value)
            }
            placeholder="@example 或 +88812345678"
            disabled={saving || published}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-60"
          />
          <p className="mt-2 text-xs text-zinc-500">
            当前仅识别输入格式，不代表已经核实商品真实性或所有权。
          </p>
        </div>

        <div>
          <label
            htmlFor="product-type"
            className="mb-2 block text-sm text-zinc-300"
          >
            商品类型
          </label>
          <select
            id="product-type"
            value={draft.type}
            disabled={saving || published}
            onChange={(event) => {
              const type = event.target.value as ProductType

              setDraft((previous) => ({
                ...previous,
                type,
                description: getDefaultDescription(
                  previous.identifier,
                  type,
                ),
              }))
              setMessage("")
              setPreviewReady(false)
            }}
            className="w-full rounded-xl border border-white/15 bg-[#0b0d12] px-4 py-3 text-white disabled:opacity-60"
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="product-title"
            className="mb-2 block text-sm text-zinc-300"
          >
            商品名称
          </label>
          <input
            id="product-title"
            value={draft.title}
            onChange={(event) => {
              setDraft((previous) => ({
                ...previous,
                title: event.target.value,
              }))
              setPreviewReady(false)
            }}
            placeholder="请输入商品名称"
            disabled={saving || published}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor="product-price"
            className="mb-2 block text-sm text-zinc-300"
          >
            售价（GRAM）
          </label>
          <input
            id="product-price"
            type="number"
            min="0"
            step="any"
            value={draft.priceTon}
            onChange={(event) => {
              setDraft((previous) => ({
                ...previous,
                priceTon: event.target.value,
              }))
              setPreviewReady(false)
            }}
            placeholder="例如 25"
            disabled={saving || published}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor="product-image"
            className="mb-2 block text-sm text-zinc-300"
          >
            商品图片（可选，最大 5 MB）
          </label>
          <input
            ref={imageInputRef}
            id="product-image"
            type="file"
            accept="image/*"
            disabled={saving || published}
            onChange={handleImageChange}
            className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:font-medium file:text-black disabled:opacity-60"
          />
          {imageName && (
            <p className="mt-2 text-xs text-zinc-500">
              已选择：{imageName}
            </p>
          )}
          {imageError && (
            <p className="mt-2 text-sm text-red-300">{imageError}</p>
          )}
        </div>

        {imageUrl && !imageError && (
          <div
            className="aspect-square w-full max-w-md shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20"
          >
            <img
              src={imageUrl}
              alt="商品图片预览"
              className="h-full w-full object-contain"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handlePreview}
          disabled={saving || published}
          className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          检查并生成预览
        </button>

        {message && (
          <p
            role="status"
            className={`break-words rounded-xl border p-3 text-sm ${
              published
                ? "border-emerald-400/30 text-emerald-200"
                : "border-white/10 text-zinc-200"
            }`}
          >
            {message}
          </p>
        )}
      </section>

      {previewReady && (
        <section className="space-y-3 rounded-2xl border border-emerald-400/20 p-5">
          <h2 className="text-xl font-medium text-white">商品预览</h2>
          <p className="text-sm text-zinc-400">
            {TYPE_LABELS[draft.type]}
          </p>

          {imageUrl && (
            <div
              className="aspect-square w-full max-w-md shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20"
            >
              <img
                src={imageUrl}
                alt={draft.title}
                className="h-full w-full object-contain"
              />
            </div>
          )}

          <h3 className="text-2xl font-semibold text-white">
            {draft.title}
          </h3>

          <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">
            {getDefaultDescription(draft.identifier, draft.type) ||
              "暂无默认描述"}
          </p>

          <p className="text-xl font-semibold text-emerald-300">
            {Number(draft.priceTon)} GRAM
          </p>

          <p className="text-xs text-zinc-500">
            标识：{draft.identifier.trim()}
          </p>

          {!published ? (
            <button
              type="button"
              onClick={handlePublish}
              disabled
              className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {"仅支持链上 NFT 托管上架"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNewProduct}
              disabled={saving}
              className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              录入下一件商品
            </button>
          )}
        </section>
      )}
    </div>
  )
}


