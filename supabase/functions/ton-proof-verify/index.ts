
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { Buffer } from "node:buffer";
import { sha256 } from "npm:@ton/crypto";

import type { Slice, StateInit } from "npm:@ton/core";

import {
  Address,
  Cell,
  contractAddress,
  domainSignVerify,
  loadStateInit,
  WalletContractV1R1,
  WalletContractV1R2,
  WalletContractV1R3,
  WalletContractV2R1,
  WalletContractV2R2,
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4 as WalletContractV4R2,
  WalletContractV5R1,
} from "npm:@ton/ton";

// =====================================================
// 1. 基础配置
// =====================================================

const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);

const EXPECTED_DOMAIN = "ton-marketplace-cvj.pages.dev";
const EXPECTED_NETWORK = "-239";

const MAX_PROOF_AGE_SECONDS = 600;
const MAX_BODY_BYTES = 200000;
const MAX_STATE_INIT_LENGTH = 100000;

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
});

function jsonResponse(
  data: Record<string, unknown>,
  status: number,
  origin: string,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin),
  });
}

// =====================================================
// 2. 标准钱包版本及公钥解析
// =====================================================

function loadV1(cs: Slice): Buffer {
  cs.loadUint(32);
  return cs.loadBuffer(32);
}

function loadV2(cs: Slice): Buffer {
  cs.loadUint(32);
  return cs.loadBuffer(32);
}

function loadV3(cs: Slice): Buffer {
  cs.loadUint(32);
  cs.loadUint(32);
  return cs.loadBuffer(32);
}

function loadV4(cs: Slice): Buffer {
  cs.loadUint(32);
  cs.loadUint(32);
  return cs.loadBuffer(32);
}

function loadV5(cs: Slice): Buffer {
  cs.loadBoolean();
  cs.loadUint(32);
  cs.loadUint(32);
  return cs.loadBuffer(32);
}

const knownWallets = [
  {
    version: "V1R1",
    contract: WalletContractV1R1,
    load: loadV1,
  },
  {
    version: "V1R2",
    contract: WalletContractV1R2,
    load: loadV1,
  },
  {
    version: "V1R3",
    contract: WalletContractV1R3,
    load: loadV1,
  },
  {
    version: "V2R1",
    contract: WalletContractV2R1,
    load: loadV2,
  },
  {
    version: "V2R2",
    contract: WalletContractV2R2,
    load: loadV2,
  },
  {
    version: "V3R1",
    contract: WalletContractV3R1,
    load: loadV3,
  },
  {
    version: "V3R2",
    contract: WalletContractV3R2,
    load: loadV3,
  },
  {
    version: "V4R2",
    contract: WalletContractV4R2,
    load: loadV4,
  },
  {
    version: "V5R1",
    contract: WalletContractV5R1,
    load: loadV5,
  },
].map(({ version, contract, load }) => ({
  version,
  code: contract.create({
    workchain: 0,
    publicKey: Buffer.alloc(32),
  }).init.code,
  load,
}));

function tryExtractPublicKey(
  stateInit: StateInit,
): {
  publicKey: Buffer;
  version: string;
} | null {
  if (!stateInit.code || !stateInit.data) {
    return null;
  }

  for (const wallet of knownWallets) {
    try {
      if (!wallet.code.equals(stateInit.code)) {
        continue;
      }

      const publicKey = wallet.load(
        stateInit.data.beginParse(),
      );

      if (publicKey.length !== 32) {
        return null;
      }

      return {
        publicKey,
        version: wallet.version,
      };
    } catch {
      // 当前版本不匹配，继续检查其他版本
    }
  }

  return null;
}

// =====================================================
// 3. Supabase 匿名用户身份验证
// =====================================================

async function verifyAnonymousUser(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<string | null> {
  const authorization = req.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1]) {
    return null;
  }

  const accessToken = match[1].trim();

  if (!accessToken || accessToken.length > 10000) {
    return null;
  }

  const response = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    console.error(
      "Supabase identity verification failed:",
      response.status,
    );
    return null;
  }

  const user = await response.json();

  if (
    typeof user.id !== "string" ||
    user.is_anonymous !== true
  ) {
    return null;
  }

  return user.id;
}

// =====================================================
// 4. TON Proof 参数验证
// =====================================================

interface VerifiedInput {
  address: string;
  network: string;
  publicKey?: string;
  timestamp: number;
  domain: string;
  domainLength: number;
  payload: string;
  signature: Buffer;
  stateInitBase64: string;
}

function validateRequest(body: unknown): VerifiedInput {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;

  const proof = data.proof as
    | Record<string, unknown>
    | null;

  if (!proof || typeof proof !== "object") {
    throw new Error("Missing TON proof");
  }

  if (
    typeof data.address !== "string" ||
    data.address.length > 100 ||
    !/^-?\d+:[0-9a-fA-F]{64}$/.test(data.address)
  ) {
    throw new Error("Invalid wallet address");
  }

  if (data.network !== EXPECTED_NETWORK) {
    throw new Error("Unsupported TON network");
  }

  if (
    data.public_key !== undefined &&
    (
      typeof data.public_key !== "string" ||
      !/^[0-9a-fA-F]{64}$/.test(data.public_key)
    )
  ) {
    throw new Error("Invalid public key");
  }

  const timestamp =
    typeof proof.timestamp === "number"
      ? proof.timestamp
      : typeof proof.timestamp === "string" &&
          /^\d+$/.test(proof.timestamp)
        ? Number(proof.timestamp)
        : NaN;

  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) {
    throw new Error("Invalid proof timestamp");
  }

  const domain = proof.domain as
    | Record<string, unknown>
    | null;

  if (
    !domain ||
    typeof domain !== "object" ||
    typeof domain.value !== "string" ||
    typeof domain.lengthBytes !== "number" ||
    !Number.isSafeInteger(domain.lengthBytes)
  ) {
    throw new Error("Invalid proof domain");
  }

  const domainBytes = new TextEncoder().encode(
    domain.value,
  );

  if (
    domain.value !== EXPECTED_DOMAIN ||
    domainBytes.length !== domain.lengthBytes ||
    domainBytes.length > 128
  ) {
    throw new Error("Domain verification failed");
  }

  if (
    typeof proof.payload !== "string" ||
    !/^[0-9a-f]{64}$/.test(proof.payload)
  ) {
    throw new Error("Invalid challenge payload");
  }

  const payloadBytes = new TextEncoder().encode(
    proof.payload,
  );

  if (
    payloadBytes.length > 128 ||
    domainBytes.length + payloadBytes.length > 222
  ) {
    throw new Error("Proof payload too large");
  }

  if (
    typeof proof.signature !== "string" ||
    proof.signature.length === 0 ||
    proof.signature.length > 256 ||
    typeof proof.state_init !== "string" ||
    proof.state_init.length === 0 ||
    proof.state_init.length > MAX_STATE_INIT_LENGTH
  ) {
    throw new Error("Invalid signature or StateInit");
  }

  const signature = Buffer.from(
    proof.signature,
    "base64",
  );

  if (
    signature.length !== 64 ||
    signature.toString("base64") !== proof.signature
  ) {
    throw new Error("Invalid signature encoding");
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    Math.abs(now - timestamp) >
    MAX_PROOF_AGE_SECONDS
  ) {
    throw new Error("Proof timestamp expired");
  }

  return {
    address: data.address,
    network: EXPECTED_NETWORK,
    publicKey:
      typeof data.public_key === "string"
        ? data.public_key
        : undefined,
    timestamp,
    domain: domain.value,
    domainLength: domain.lengthBytes,
    payload: proof.payload,
    signature,
    stateInitBase64: proof.state_init,
  };
}

// =====================================================
// 5. TON Proof 密码学验证
// =====================================================

async function verifyTonProof(
  input: VerifiedInput,
): Promise<{
  address: string;
  walletVersion: string;
}> {
  const stateInitCell = Cell.fromBase64(
    input.stateInitBase64,
  );

  const stateInit = loadStateInit(
    stateInitCell.beginParse(),
  );

  const wantedAddress = Address.parse(
    input.address,
  );

  if (wantedAddress.workChain !== 0) {
    throw new Error("Unsupported wallet workchain");
  }

  const derivedAddress = contractAddress(
    wantedAddress.workChain,
    stateInit,
  );

  if (!derivedAddress.equals(wantedAddress)) {
    throw new Error("Wallet StateInit address mismatch");
  }

  const extracted = tryExtractPublicKey(
    stateInit,
  );

  if (!extracted) {
    throw new Error(
      "Unsupported wallet contract version",
    );
  }

  const publicKey = extracted.publicKey;

  if (input.publicKey !== undefined) {
    const suppliedKey = Buffer.from(
      input.publicKey,
      "hex",
    );

    if (!publicKey.equals(suppliedKey)) {
      throw new Error("Wallet public key mismatch");
    }
  }

  const workchain = Buffer.alloc(4);

  workchain.writeInt32BE(
    wantedAddress.workChain,
    0,
  );

  const domainLength = Buffer.alloc(4);

  domainLength.writeUInt32LE(
    input.domainLength,
    0,
  );

  const timestamp = Buffer.alloc(8);

  timestamp.writeBigUInt64LE(
    BigInt(input.timestamp),
    0,
  );

  const domainBytes = Buffer.from(
    input.domain,
    "utf8",
  );

  const payloadBytes = Buffer.from(
    input.payload,
    "utf8",
  );

  const message = Buffer.concat([
    Buffer.from("ton-proof-item-v2/", "utf8"),
    workchain,
    wantedAddress.hash,
    domainLength,
    domainBytes,
    timestamp,
    payloadBytes,
  ]);

  const messageHash = Buffer.from(
    await sha256(message),
  );

  const fullMessage = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from("ton-connect", "utf8"),
    messageHash,
  ]);

  const digest = Buffer.from(
    await sha256(fullMessage),
  );

  const valid = await domainSignVerify({
    data: digest,
    signature: input.signature,
    publicKey,
    domain: {
      type: "empty",
    },
  });

  if (!valid) {
    throw new Error("TON wallet signature invalid");
  }

  return {
    address: wantedAddress.toRawString(),
    walletVersion: extracted.version,
  };
}

// =====================================================
// 6. Supabase Edge Function 主入口
// =====================================================

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";

  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden", {
      status: 403,
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
      origin,
    );
  }

  try {
    const supabaseUrl = Deno.env.get(
      "SUPABASE_URL",
    );

    const anonKey = Deno.env.get(
      "SUPABASE_ANON_KEY",
    );

    const secretKeysRaw = Deno.env.get(
      "SUPABASE_SECRET_KEYS",
    );

    if (
      !supabaseUrl ||
      !anonKey ||
      !secretKeysRaw
    ) {
      console.error("Supabase configuration missing");

      return jsonResponse(
        {
          success: false,
          error: "Server configuration missing",
        },
        500,
        origin,
      );
    }

    const secretKeys = JSON.parse(
      secretKeysRaw,
    );

    const serviceKey = secretKeys.default;

    if (
      typeof serviceKey !== "string" ||
      !serviceKey
    ) {
      console.error("Service key missing");

      return jsonResponse(
        {
          success: false,
          error: "Server configuration missing",
        },
        500,
        origin,
      );
    }

    // 1. 验证匿名买家身份
    const userId = await verifyAnonymousUser(
      req,
      supabaseUrl,
      anonKey,
    );

    if (!userId) {
      return jsonResponse(
        {
          success: false,
          error: "Valid anonymous buyer session required",
        },
        401,
        origin,
      );
    }

    // 2. 限制请求体大小
    const rawBody = await req.text();

    if (
      new TextEncoder().encode(rawBody).length >
      MAX_BODY_BYTES
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Request body too large",
        },
        413,
        origin,
      );
    }

    // 3. 解析请求
    const body = JSON.parse(rawBody);
    const input = validateRequest(body);

    // 4. 验证 TON 钱包签名
    const verified = await verifyTonProof(input);

    // 5. 原子消费一次性挑战值
    const consumeResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/consume_ton_proof_challenge`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_payload: input.payload,
          p_attempt_id: userId,
          p_now: Math.floor(Date.now() / 1000),
        }),
      },
    );

    if (!consumeResponse.ok) {
      console.error(
        "Challenge consumption failed:",
        consumeResponse.status,
      );

      return jsonResponse(
        {
          success: false,
          error: "Challenge verification unavailable",
        },
        503,
        origin,
      );
    }

    const consumed = await consumeResponse.json();

    if (consumed !== true) {
      return jsonResponse(
        {
          success: false,
          error:
            "Challenge expired, already used, or belongs to another buyer",
        },
        401,
        origin,
      );
    }

    // 6. 保存服务端验证通过的钱包身份
    const now = new Date().toISOString();

    const saveResponse = await fetch(
      `${supabaseUrl}/rest/v1/ton_verified_wallets`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          "Content-Type": "application/json",
          Prefer:
            "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          user_id: userId,
          wallet_address: verified.address,
          network: EXPECTED_NETWORK,
          wallet_version: verified.walletVersion,
          verified_at: now,
          updated_at: now,
        }),
      },
    );

    if (!saveResponse.ok) {
      console.error(
        "Verified wallet storage failed:",
        saveResponse.status,
      );

      return jsonResponse(
        {
          success: false,
          error: "Unable to save verified wallet",
        },
        500,
        origin,
      );
    }

    // 7. 返回验证结果
    return jsonResponse(
      {
        success: true,
        verified: true,
        address: verified.address,
        network: EXPECTED_NETWORK,
        walletVersion: verified.walletVersion,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error(
      "TON proof verification failed:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error: "TON wallet verification failed",
      },
      400,
      origin,
    );
  }
});
