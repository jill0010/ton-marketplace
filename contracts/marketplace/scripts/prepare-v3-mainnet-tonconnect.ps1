# Run locally from contracts/marketplace; never put wallet secrets in GitHub Actions.
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
$env:V3_MAINNET_DEPLOYER_ADDRESS = "UQC51Xiy-okgW170o0wlY-Ykb1Zh4HkXQIlcItQFISnVAx1-"
$env:PLATFORM_TREASURY_ADDRESS = "UQATKVTTzg0hlcAd1gBQlvB6JrTMRigfJwd2hsykaSUD17vC"
$required = @("V3_VALIDATOR_0_PUBLIC_KEY","V3_VALIDATOR_1_PUBLIC_KEY","V3_VALIDATOR_2_PUBLIC_KEY")
foreach ($name in $required) {
  $value = [Environment]::GetEnvironmentVariable($name, "Process")
  if ([string]::IsNullOrWhiteSpace($value) -or $value -notmatch '^[0-9]+$') {
    throw "$name missing or invalid. Derive three distinct validator public keys locally before deployment."
  }
}
if ((@($required | ForEach-Object { [Environment]::GetEnvironmentVariable($_, "Process") } | Select-Object -Unique)).Count -ne 3) {
  throw "Validator public keys must be distinct."
}
if (-not (Get-Command acton -ErrorAction SilentlyContinue)) { throw "Acton CLI not installed." }
Write-Host "MAINNET -239; deployer $env:V3_MAINNET_DEPLOYER_ADDRESS; treasury $env:PLATFORM_TREASURY_ADDRESS"
Write-Host "This will send REAL mainnet deployment transactions and incur TON fees."
$approval = Read-Host 'Type DEPLOY MAINNET to start TonConnect signing'
if ($approval -cne 'DEPLOY MAINNET') { throw "Deployment cancelled; no deployment command started." }
$env:V3_MAINNET_DEPLOY_APPROVED = "true"
acton script scripts/deploy-v3-mainnet.tolk --net mainnet --tonconnect
if ($LASTEXITCODE -ne 0) { throw "Deployment script failed (exit $LASTEXITCODE). Inspect on-chain state before retrying." }
