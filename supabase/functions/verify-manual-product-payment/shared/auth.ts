import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { normalizeTonAddress } from "./ton-address.ts";

export type VerifiedWalletContext = {
  userId: string;
  walletIdentityId: string | null;
  walletAddress: string;
  network: "-239";
};

export function requireActiveWalletProof(expiresAt: string, now = Date.now()): void {
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp) || timestamp <= now) {
    throw new Error("TON wallet proof expired; reconnect and verify the wallet");
  }
}

export function requireBearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing authorization token");
  }
  const token = authorization.slice(7).trim();
  if (!token) {
    throw new Error("Missing authorization token");
  }
  return token;
}

export async function authenticateVerifiedWallet(
  request: Request,
): Promise<VerifiedWalletContext> {
  const token = requireBearerToken(request);

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

  // Prefer the canonical wallet identity shared by multiple anonymous
  // Auth sessions. The legacy lookup remains as a temporary migration
  // fallback for users who have not completed a post-migration proof.
  const { data: identityRows, error: identityError } = await supabase.rpc(
    "get_current_ton_wallet_identity",
    { p_auth_user_id: user.id },
  );

  if (identityError && identityError.code !== "PGRST202") {
    throw new Error("Unable to resolve canonical wallet identity");
  }

  const identity = Array.isArray(identityRows) ? identityRows[0] : null;

  if (identity) {
    if (
      typeof identity.wallet_identity_id !== "string" ||
      typeof identity.wallet_address !== "string" ||
      identity.network !== "-239" ||
      typeof identity.proof_expires_at !== "string"
    ) {
      throw new Error("Canonical wallet identity mismatch");
    }

    requireActiveWalletProof(identity.proof_expires_at);

    return {
      userId: user.id,
      walletIdentityId: identity.wallet_identity_id,
      walletAddress: normalizeTonAddress(identity.wallet_address),
      network: "-239",
    };
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
    walletIdentityId: null,
    walletAddress: normalizeTonAddress(wallet.wallet_address),
    network: "-239",
  };
}
