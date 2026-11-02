import fs from "node:fs";

const path = "src/pages/PremiumPage.tsx";
let s = fs.readFileSync(path, "utf8");

if (s.includes("TonConnectButton") || s.includes("useTonAddress")) {
  throw new Error("检测到钱包代码已存在，停止重复修改。");
}

const importTarget = 'import { useEffect, useState } from "react"';
if (!s.includes(importTarget)) throw new Error("找不到 React 导入位置");
s = s.replace(importTarget, importTarget + '\nimport { TonConnectButton, useTonAddress } from "@tonconnect/ui-react"');

const stateTarget = '  const { t } = useLanguage()';
if (!s.includes(stateTarget)) throw new Error("找不到页面状态位置");
s = s.replace(stateTarget, stateTarget + '\n  const walletAddress = useTonAddress()');

const paymentTitle = 't("Payment Method"';
const titleIndex = s.indexOf(paymentTitle);
if (titleIndex < 0) throw new Error("找不到支付方式标题");

const statusStart = s.indexOf('<span className="text-xs text-amber-300">', titleIndex);
if (statusStart >= 0) {
  const statusEnd = s.indexOf("</span>", statusStart);
  if (statusEnd >= 0) {
    s = s.slice(0, statusStart) +
      `<span className={walletAddress ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>
            {walletAddress ? t("Wallet connected", "钱包已连接") : t("Not connected", "尚未接通")}
          </span>` +
      s.slice(statusEnd + 7);
  }
}

const paymentTarget = '        <div className="rounded-xl border border-sky-400 bg-sky-400/10 px-4 py-3 font-medium text-white">';
if (!s.includes(paymentTarget)) throw new Error("找不到 GRAM 支付区域");

const walletBlock = `        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">
                {t("Connect TON Wallet", "连接 TON 钱包")}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {t("Connect your wallet to prepare payment.", "连接钱包以准备支付。")}
              </p>
            </div>
            <TonConnectButton />
          </div>
          {walletAddress && (
            <p className="break-all text-xs text-emerald-300">
              {walletAddress}
            </p>
          )}
        </div>

${paymentTarget}`;

const backup = path + ".before-tonconnect-ui";
if (!fs.existsSync(backup)) fs.copyFileSync(path, backup);

s = s.replace(paymentTarget, walletBlock);
fs.writeFileSync(path, s, "utf8");

console.log("TON Connect 钱包连接 UI 已接入。");
console.log("备份文件：" + backup);
