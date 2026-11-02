import { useEffect, useRef, useState } from "react";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { anonymousSupabase, ensureAnonymousSession } from "../lib/supabase.ts";

export type WalletVerification = {
  verified: boolean;
  address: string;
  network: string;
  walletVersion: string;
};

export function useVerifiedTonWallet() {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();

  const [connecting, setConnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [walletVerification, setWalletVerification] = useState<
    WalletVerification | null
  >(null);
  const [proofMessage, setProofMessage] = useState("");

  const pendingProofRef = useRef(false);
  const verificationInProgressRef = useRef(false);
  const verificationWalletRef = useRef<string | null>(null);
  const restoreRequestRef = useRef(0);
  const walletSessionRef = useRef(0);

  // Restore the server-verified wallet status.
  useEffect(() => {
    let active = true;
    const requestId = ++restoreRequestRef.current;
    const sessionId = walletSessionRef.current;

    async function restoreWalletVerification() {
      if (!walletAddress) {
        setWalletVerification(null);
        setProofMessage("");
        return;
      }

      if (
        pendingProofRef.current ||
        verificationInProgressRef.current
      ) {
        return;
      }

      setWalletVerification(null);
      setProofMessage("正在恢复钱包身份验证状态……");

      try {
        await ensureAnonymousSession();

        if (
          !active ||
          requestId !== restoreRequestRef.current ||
          sessionId !== walletSessionRef.current
        ) {
          return;
        }

        const currentWallet = tonConnectUI.wallet;
        const currentAddress = currentWallet?.account.address;
        const currentNetwork = currentWallet?.account.chain;

        if (!currentWallet || !currentAddress) {
          throw new Error("钱包连接状态尚未准备完成，请稍后重试。");
        }

        if (currentNetwork !== "-239") {
          throw new Error("当前钱包不在 TON 主网，请切换至 TON 主网。");
        }

        const { data, error } = await anonymousSupabase.functions.invoke(
          "ton-proof-status",
          { body: {} },
        );

        if (error) {
          throw new Error(error.message || "钱包验证状态查询失败");
        }

        if (
          !active ||
          requestId !== restoreRequestRef.current ||
          sessionId !== walletSessionRef.current
        ) {
          return;
        }

        if (data?.success !== true) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "服务器未能确认钱包验证状态",
          );
        }

        if (data.verified !== true) {
          setWalletVerification(null);
          setProofMessage(
            "当前会话没有已验证的钱包记录，请重新完成 TON Proof 验证。",
          );
          return;
        }

        if (
          typeof data.address !== "string" ||
          data.network !== "-239" ||
          typeof data.walletVersion !== "string"
        ) {
          throw new Error("服务器返回的钱包记录格式无效");
        }

        const latestWallet = tonConnectUI.wallet;

        if (
          !latestWallet ||
          latestWallet.account.chain !== "-239" ||
          latestWallet.account.address !== data.address ||
          currentAddress !== data.address
        ) {
          throw new Error(
            "当前连接的钱包与服务器已验证的钱包不一致，请重新验证。",
          );
        }

        setWalletVerification({
          verified: true,
          address: data.address,
          network: data.network,
          walletVersion: data.walletVersion,
        });

        setProofMessage(
          `钱包身份验证已恢复 · ${data.walletVersion}`,
        );
      } catch (error) {
        if (
          !active ||
          requestId !== restoreRequestRef.current ||
          sessionId !== walletSessionRef.current
        ) {
          return;
        }

        setWalletVerification(null);

        const message = error instanceof Error
          ? error.message
          : "未知验证状态查询错误";

        console.error(
          "TON wallet verification restoration failed:",
          message,
        );

        setProofMessage(`无法恢复钱包验证状态：${message}`);
      }
    }

    void restoreWalletVerification();

    return () => {
      active = false;
    };
  }, [walletAddress, tonConnectUI]);

  // Listen for TON Connect and verify the TON Proof.
  useEffect(() => {
    let active = true;

    const unsubscribe = tonConnectUI.onStatusChange(
      async (wallet) => {
        if (!active) return;

        if (!wallet) {
          walletSessionRef.current += 1;
          restoreRequestRef.current += 1;
          setWalletVerification(null);
          setVerifying(false);
          verificationInProgressRef.current = false;
          verificationWalletRef.current = null;
          pendingProofRef.current = false;
          setProofMessage("");
          return;
        }

        if (verificationInProgressRef.current) {
          const currentVerificationWallet = verificationWalletRef.current;
          const incomingWallet = wallet.account.address + ":" +
            wallet.account.chain;

          if (currentVerificationWallet === incomingWallet) {
            return;
          }

          walletSessionRef.current += 1;
          verificationInProgressRef.current = false;
          verificationWalletRef.current = null;
          pendingProofRef.current = false;
          setVerifying(false);
          setWalletVerification(null);
          setProofMessage(
            "验证期间检测到钱包或网络切换，请断开钱包后重新连接并验证。",
          );
          return;
        }

        if (!pendingProofRef.current) return;

        const tonProof = wallet.connectItems?.tonProof;

        if (!tonProof) {
          pendingProofRef.current = false;
          setWalletVerification(null);
          setProofMessage(
            "当前钱包没有返回 TON Proof，请断开钱包后重新连接。",
          );
          return;
        }

        if (!("proof" in tonProof)) {
          pendingProofRef.current = false;
          setWalletVerification(null);
          setProofMessage(
            "当前钱包不支持所需的 TON Proof 验证，请尝试其他标准 TON 钱包。",
          );
          return;
        }

        const proof = tonProof.proof;
        const account = wallet.account;

        if (!account.walletStateInit) {
          pendingProofRef.current = false;
          setWalletVerification(null);
          setProofMessage(
            "钱包未提供 StateInit，无法完成钱包身份验证。",
          );
          return;
        }

        if (account.chain !== "-239") {
          pendingProofRef.current = false;
          setWalletVerification(null);
          setProofMessage(
            "当前钱包不在 TON 主网，请切换至 TON 主网后重新验证。",
          );
          return;
        }

        const sessionId = ++walletSessionRef.current;
        restoreRequestRef.current += 1;

        verificationWalletRef.current = account.address + ":" + account.chain;
        verificationInProgressRef.current = true;
        setVerifying(true);
        setProofMessage("正在向服务器验证钱包签名……");

        try {
          await ensureAnonymousSession();

          if (!active || sessionId !== walletSessionRef.current) return;

          const { data, error } = await anonymousSupabase.functions.invoke(
            "ton-proof-verify",
            {
              body: {
                address: account.address,
                network: account.chain,
                public_key: account.publicKey,
                proof: {
                  ...proof,
                  state_init: account.walletStateInit,
                },
              },
            },
          );

          if (error) {
            throw new Error(error.message || "钱包验证请求失败");
          }

          if (
            data?.success !== true ||
            data?.verified !== true ||
            data?.network !== "-239" ||
            typeof data?.address !== "string" ||
            typeof data?.walletVersion !== "string"
          ) {
            throw new Error(
              typeof data?.error === "string"
                ? data.error
                : "服务器未确认钱包身份",
            );
          }

          if (!active || sessionId !== walletSessionRef.current) return;

          const latestWallet = tonConnectUI.wallet;

          if (
            !latestWallet ||
            latestWallet.account.address !== account.address ||
            latestWallet.account.chain !== "-239" ||
            data.address !== account.address
          ) {
            throw new Error(
              "验证期间钱包连接发生变化，请重新验证。",
            );
          }

          setWalletVerification({
            verified: true,
            address: data.address,
            network: data.network,
            walletVersion: data.walletVersion,
          });

          setProofMessage(
            `钱包身份验证成功 · ${data.walletVersion}`,
          );
        } catch (error) {
          if (!active || sessionId !== walletSessionRef.current) return;

          setWalletVerification(null);

          const message = error instanceof Error
            ? error.message
            : "未知验证错误";

          console.error("TON Proof verification failed:", message);

          setProofMessage(`钱包身份验证失败：${message}`);
        } finally {
          if (sessionId === walletSessionRef.current) {
            pendingProofRef.current = false;
            verificationInProgressRef.current = false;
            verificationWalletRef.current = null;

            if (active) {
              setVerifying(false);
            }
          }
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [tonConnectUI]);

  // Clear pending proof state when the user cancels the wallet modal.
  useEffect(() => {
    const unsubscribe = tonConnectUI.onModalStateChange((state) => {
      if (
        state.status !== "closed" ||
        state.closeReason !== "action-cancelled"
      ) {
        return;
      }

      if (
        !pendingProofRef.current ||
        verificationInProgressRef.current ||
        tonConnectUI.connected
      ) {
        return;
      }

      pendingProofRef.current = false;

      setProofMessage(
        "你已取消钱包连接，尚未完成身份验证。需要时可以重新连接钱包。",
      );
    });

    return () => {
      unsubscribe();
    };
  }, [tonConnectUI]);
  // Request a one-time challenge and open the wallet connection modal.
  async function connectAndVerifyWallet() {
    if (connecting || verifying) return;


    setConnecting(true);
    setWalletVerification(null);
    setProofMessage("正在准备钱包身份验证……");

    pendingProofRef.current = false;
    verificationInProgressRef.current = false;
    verificationWalletRef.current = null;

    try {
      if (tonConnectUI.connected) {
        setProofMessage("正在断开当前钱包，准备重新进行 TON Proof 验证……");
        await tonConnectUI.disconnect();
      }

      await ensureAnonymousSession();

      tonConnectUI.setConnectionNetwork("-239");

      tonConnectUI.setConnectRequestParameters({
        state: "loading",
      });

      const { data, error } = await anonymousSupabase.functions.invoke(
        "ton-proof-challenge",
        { body: {} },
      );

      if (error) {
        throw new Error(error.message || "挑战值申请失败");
      }

      if (
        data?.success !== true ||
        typeof data?.payload !== "string" ||
        !/^[0-9a-f]{64}$/.test(data.payload)
      ) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "服务器返回的挑战值无效",
        );
      }

      tonConnectUI.setConnectRequestParameters({
        state: "ready",
        value: {
          tonProof: data.payload,
        },
      });

      pendingProofRef.current = true;

      setProofMessage(
        "挑战值已准备完成，请在钱包中确认连接和签名。",
      );

      await tonConnectUI.openModal();
    } catch (error) {
      pendingProofRef.current = false;

      const message = error instanceof Error ? error.message : "未知错误";

      console.error("TON wallet connection failed:", message);

      setProofMessage(`无法发起钱包验证：${message}`);
    } finally {
      setConnecting(false);
    }
  }

  const isWalletVerified = walletVerification?.verified === true &&
    walletVerification.network === "-239" &&
    walletVerification.address ===
      tonConnectUI.wallet?.account.address &&
    tonConnectUI.wallet?.account.chain === "-239";

  return {
    walletAddress,
    connecting,
    verifying,
    walletVerification,
    proofMessage,
    isWalletVerified,
    connectAndVerifyWallet,
  };
}
