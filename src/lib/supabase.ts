import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Supabase configuration is missing")
}

// 管理员及商城原有业务客户端
// 不指定 storageKey，恢复 Supabase 原来的默认存储位置
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
)

// 买家专用匿名认证客户端
export const anonymousSupabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: "ton-marketplace-anonymous-auth",
    },
  }
)

export async function ensureAnonymousSession() {
  const {
    data: { session },
    error: sessionError,
  } = await anonymousSupabase.auth.getSession()

  if (sessionError) {
    throw new Error("Unable to read anonymous session")
  }

  if (session) {
    if (!session.user.is_anonymous) {
      throw new Error("Invalid anonymous session")
    }

    return session
  }

  const {
    data,
    error,
  } = await anonymousSupabase.auth.signInAnonymously()

  if (error || !data.session) {
    console.error("Anonymous sign-in failed:", error?.message)
    throw new Error("Unable to create anonymous session")
  }

  return data.session
}