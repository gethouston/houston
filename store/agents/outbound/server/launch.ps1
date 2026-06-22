# Outbound A2A Server — launcher
# Run: right-click -> Run with PowerShell, or: powershell -ExecutionPolicy Bypass -File launch.ps1

$token  = (Get-Content "C:\Users\agarc\.claude\.credentials.json" | ConvertFrom-Json).claudeAiOauth.accessToken
$ws     = $PSScriptRoot
$cf     = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$cfLog  = "$env:TEMP\cf-tunnel-out.log"

Write-Host "== Outbound A2A Launcher =="

# Kill port 3001
$conn = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Cleared port 3001"
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Install deps
Write-Host "Checking dependencies..."
Set-Location $ws
& npm install --silent

# Start server
Write-Host "Starting A2A server..."
$psi = New-Object System.Diagnostics.ProcessStartInfo "node", "index.js"
$psi.WorkingDirectory = $ws
$psi.UseShellExecute  = $false
$psi.CreateNoWindow   = $true
$psi.EnvironmentVariables["ANTHROPIC_API_KEY"] = $token
$srv = [System.Diagnostics.Process]::Start($psi)
$srv.Id | Out-File "$env:TEMP\server.pid"
Start-Sleep -Seconds 3
$health = (Invoke-WebRequest "http://localhost:3001/" -UseBasicParsing -TimeoutSec 5).Content
Write-Host "Server running (PID $($srv.Id)): $health"

# Start cloudflared
Write-Host "Starting Cloudflare tunnel..."
if (Test-Path "$env:TEMP\cf-out.log") { Clear-Content "$env:TEMP\cf-out.log" }
Start-Process -FilePath $cf -ArgumentList "tunnel --url http://localhost:3001" `
    -RedirectStandardError $cfLog -RedirectStandardOutput "$env:TEMP\cf-out.log" `
    -NoNewWindow -PassThru | Select-Object -ExpandProperty Id | Out-File "$env:TEMP\cf.pid"

$tunnelUrl = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    $content = (Get-Content $cfLog -Raw -ErrorAction SilentlyContinue) +
               (Get-Content "$env:TEMP\cf-out.log" -Raw -ErrorAction SilentlyContinue)
    if ($content -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
        $tunnelUrl = $Matches[0]; break
    }
    Write-Host "  Waiting for tunnel... $([int](($i+1)*2))s"
}

if (-not $tunnelUrl) {
    Write-Host "ERROR: Could not get tunnel URL. Check cloudflared output."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Tunnel: $tunnelUrl"
Write-Host "Updating Vercel..."
& node "$ws\update-tunnel.js" $tunnelUrl

Write-Host ""
Write-Host "========================================"
Write-Host " Outbound agent is LIVE"
Write-Host " Local : http://localhost:3001"
Write-Host " Tunnel: $tunnelUrl"
Write-Host " Bio   : https://outbound-agent-iota.vercel.app/api"
Write-Host "========================================"
Write-Host ""
Read-Host "Press Enter to stop the agent"
Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Agent stopped."
