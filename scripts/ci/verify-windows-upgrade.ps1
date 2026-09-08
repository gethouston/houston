param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][ValidateSet('x86_64', 'aarch64')][string]$Architecture
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'This installer test must run on an ephemeral GitHub Actions runner.'
}
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$testRoot = Join-Path $env:RUNNER_TEMP ('houston-upgrade-' + [guid]::NewGuid())
$installDir = Join-Path $testRoot 'installed'
New-Item -ItemType Directory -Path $testRoot | Out-Null

function Invoke-Msi([string]$Operation, [string]$Path, [string]$LogName) {
    $log = Join-Path $testRoot $LogName
    $arguments = @($Operation, "`"$Path`"", '/qn', '/norestart', '/l*v', "`"$log`"")
    if ($Operation -eq '/i') { $arguments += "INSTALLDIR=`"$installDir`"" }
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) {
        throw "Installer test failed with $($process.ExitCode); see $log"
    }
}

# Use the last published build from this channel and architecture. Drafts can
# contain incomplete artifacts and must never serve as an upgrade baseline.
$releaseJson = & gh release list --repo $env:GITHUB_REPOSITORY --exclude-drafts --limit 100 --json tagName,publishedAt
if ($LASTEXITCODE -ne 0) { throw 'Cannot load published upgrade baseline.' }
$isCloud = $env:GITHUB_REF_NAME.StartsWith('cloud-')
$baseline = @($releaseJson | ConvertFrom-Json) |
    Where-Object {
        $_.tagName -ne $env:GITHUB_REF_NAME -and
        $(if ($isCloud) { $_.tagName -match '^cloud-v\d' } else { $_.tagName -match '^v\d' })
    } | Sort-Object publishedAt -Descending | Select-Object -First 1
if (-not $baseline) { throw 'No published Windows upgrade baseline exists for this channel.' }
$assetPattern = if ($Architecture -eq 'aarch64') { '*_arm64_*.msi' } else { '*_x64_*.msi' }
& gh release download $baseline.tagName --repo $env:GITHUB_REPOSITORY --pattern $assetPattern --dir $testRoot
if ($LASTEXITCODE -ne 0) { throw 'Cannot download the published Windows upgrade baseline.' }
$previous = @(Get-ChildItem -LiteralPath $testRoot -Filter '*.msi' -File)
if ($previous.Count -ne 1) { throw 'Expected exactly one previous MSI for this architecture.' }

# Installers must preserve the original migration source byte-for-byte.
# Refuse to touch an existing profile even on a misconfigured runner.
$legacyDir = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.houston/local-bridge'
if (Test-Path -LiteralPath $legacyDir) { throw 'Upgrade test requires a clean Houston profile.' }
New-Item -ItemType Directory -Path $legacyDir | Out-Null
$legacyPath = Join-Path $legacyDir 'state.json'
'{"targetBaseUrl":"http://127.0.0.1:1234","proxyKey":"synthetic-upgrade-proof","appName":"LM Studio","transport":"frp"}' |
    Set-Content -LiteralPath $legacyPath -NoNewline
$legacyHash = (Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash
$installedPath = $null
try {
    Invoke-Msi '/i' $previous[0].FullName 'previous.log'
    $installedPath = $previous[0].FullName
    $oldRetired = @(Get-ChildItem -LiteralPath $installDir -Recurse -File |
        Where-Object { $_.Name -match '^frpc(?:-|\.|$)' })
    Write-Host "Upgrade baseline $($baseline.tagName): $($oldRetired.Count) retired client files."
    Invoke-Msi '/i' $installerPath 'upgrade.log'
    $installedPath = $installerPath
    $files = @(Get-ChildItem -LiteralPath $installDir -Recurse -File)
    if (-not ($files | Where-Object { $_.Name -ieq 'Houston.exe' })) {
        throw 'Upgraded Houston executable is missing.'
    }
    if ($files | Where-Object { $_.Name -match '^frpc(?:-|\.|$)' }) {
        throw 'The upgrade left a retired FRP executable installed.'
    }
    if ((Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash -ne $legacyHash) {
        throw 'The installer changed the saved local-model migration source.'
    }
    Write-Host 'Windows upgrade passed: Houston installed, retired client absent, saved settings preserved.'
} finally {
    if ($installedPath) {
        Invoke-Msi '/x' $installedPath 'uninstall.log'
    }
    Remove-Item -LiteralPath $legacyDir -Recurse -Force
}
