import { createClient } from "@supabase/supabase-js";
import { normalizeTonAddress } from "./ton-address.ts";

export type VerifiedWalletContext = {
  userId: string;
  walletAddress: string;
  network: "-239";
};

export async function authenticateVerifiedWallet(
  request: Request,
): Promise<VerifiedWalletContext> {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing authorization token");
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    throw new Error("Missing authorization token");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server configuration unavailable");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user || user.is_anonymous !== true) {
    throw new Error("Invalid or unauthorized user session");
  }

  const { data: wallet, error: walletError } = await supabase
    .from("ton_verified_wallets")
    .select("user_id, wallet_address, network")
    .eq("user_id", user.id)
    .eq("network", "-239")
    .maybeSingle();

  if (walletError || !wallet) {
    throw new Error("No verified TON mainnet wallet found");
  }

  if (wallet.user_id !== user.id || wallet.network !== "-239") {
    throw new Error("Verified wallet identity mismatch");
  }

  return {
    userId: user.id,
    walletAddress: normalizeTonAddress(wallet.wallet_address),
    network: "-239",
  };
}
