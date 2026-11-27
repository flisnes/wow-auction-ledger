<#
.SYNOPSIS
Installs the latest Auction Ledger release into a WoW AddOns folder.

.EXAMPLE
.\update-addon.ps1 -AddOnsPath "C:\Program Files (x86)\World of Warcraft\_forever_\Interface\AddOns"
#>
param(
    [Parameter(Mandatory)] [string] $AddOnsPath,
    [string] $Repo = 'flisnes/auction-ledger'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $AddOnsPath)) { throw "AddOns folder not found: $AddOnsPath" }

$release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" `
    -Headers @{ 'User-Agent' = 'auction-ledger-updater' }
$asset = $release.assets | Where-Object { $_.name -like 'AuctionLedger-*.zip' } | Select-Object -First 1
if (-not $asset) { throw "Release $($release.tag_name) has no addon zip." }

$zip = Join-Path $env:TEMP $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing

$target = Join-Path $AddOnsPath 'AuctionLedger'
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
Expand-Archive $zip -DestinationPath $AddOnsPath
Remove-Item $zip

Write-Host "Installed $($release.tag_name) into $target"
