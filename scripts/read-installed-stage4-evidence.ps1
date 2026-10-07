param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$deployment = Get-Content -LiteralPath (Join-Path $resolvedRoot "contracts/deployment.json") -Encoding UTF8 -Raw | ConvertFrom-Json
$acceptance = Get-Content -LiteralPath (Join-Path $resolvedRoot "contracts/source-acceptance.json") -Encoding UTF8 -Raw | ConvertFrom-Json
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
    $readerHash = [BitConverter]::ToString($sha256.ComputeHash([IO.File]::ReadAllBytes($PSCommandPath))).Replace("-", "").ToLowerInvariant()
} finally { $sha256.Dispose() }
if ($readerHash -ne $deployment.contentReaderSha256) { throw "Content reader identity changed" }
# A native string avoids serializing Get-Content's PSDrive/PSProvider metadata
# under Windows PowerShell 5.1. Read the same complete UTF-8 source bytes.
$checkerSource = [IO.File]::ReadAllText((Join-Path $resolvedRoot "contracts/verification-checker.mjs"), [Text.Encoding]::UTF8)
[pscustomobject]@{
    outcome = "pass"
    check = "content"
    backendSha256 = $deployment.assets[0].sha256
    evidence = @($deployment, $acceptance)
    checkerSource = $checkerSource
    contentReaderSha256 = $readerHash
} | ConvertTo-Json -Depth 15 -Compress
