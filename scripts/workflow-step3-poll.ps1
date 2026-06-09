# STEP 3 only: start a run and poll until planner finishes
param(
    [string]$EngineExe = "$PSScriptRoot\..\target-fresh\debug\houston-engine.exe",
    [string]$AgentPath = "C:\Users\yohan\Documents\houston",
    [string]$WorkflowId = "4901be17-5471-4fc3-b605-a37f4fea2f20",
    [int]$MaxPolls = 120,
    [int]$PollSeconds = 3
)

$ErrorActionPreference = "Stop"
$houstonHome = "$env:USERPROFILE\.houston"
$logFile = Join-Path $houstonHome "engine-smoke.log"
New-Item -ItemType Directory -Force -Path $houstonHome | Out-Null

if (-not (Test-Path $EngineExe)) {
    throw "Engine binary not found: $EngineExe"
}

$token = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$token | Set-Content (Join-Path $houstonHome ".smoke-token") -NoNewline

$env:HOUSTON_HOME = $houstonHome
$env:HOUSTON_DOCS = $houstonHome
$env:HOUSTON_ENGINE_TOKEN = $token
$env:HOUSTON_BIND = "127.0.0.1:0"
$env:HOUSTON_NO_PARENT_WATCHDOG = "1"
$env:RUST_LOG = "info,houston=debug"
# Ensure codex is on PATH for standalone engine (pnpm shim on this machine)
$pnpmBin = Join-Path $env:LOCALAPPDATA "pnpm"
if (Test-Path $pnpmBin) {
    $env:PATH = "$pnpmBin;$env:PATH"
}

if (Test-Path $logFile) { Remove-Item $logFile -Force }

$proc = Start-Process -FilePath $EngineExe -PassThru -NoNewWindow `
    -RedirectStandardOutput (Join-Path $houstonHome "engine-stdout.log") `
    -RedirectStandardError $logFile

Start-Sleep -Seconds 3
$banner = Get-Content (Join-Path $houstonHome "engine-stdout.log") -ErrorAction SilentlyContinue | Select-Object -First 1
Write-Output "ENGINE: $banner"
if ($banner -notmatch 'port=(\d+)') { throw "No port in banner: $banner" }
$port = $Matches[1]

$manifest = Get-Content (Join-Path $houstonHome "engine.json") -Raw | ConvertFrom-Json
Write-Output "engine.json port=$($manifest.port) pid=$($manifest.pid)"

$encodedAgent = [uri]::EscapeDataString($AgentPath)
$base = "http://127.0.0.1:$port/v1"
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

function Invoke-Api($Method, $Uri, $Body = $null) {
    try {
        $p = @{ Method = $Method; Uri = $Uri; Headers = $headers }
        if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }
        return @{ ok = $true; data = (Invoke-RestMethod @p) }
    } catch {
        $resp = $_.Exception.Response
        $body = ""
        if ($resp) {
            $sr = New-Object IO.StreamReader($resp.GetResponseStream())
            $body = $sr.ReadToEnd()
        }
        return @{ ok = $false; status = if ($resp) { [int]$resp.StatusCode } else { 0 }; body = $body; error = $_.Exception.Message }
    }
}

Write-Output "workflowId=$WorkflowId"

Write-Output "`n=== STEP 2: Start run ==="
$runResp = Invoke-Api POST "$base/workflows/$WorkflowId/run?agentPath=$encodedAgent"
$runResp | ConvertTo-Json -Depth 10
if (-not $runResp.ok) { throw "start run failed" }
$runId = $runResp.data.id
Write-Output "runId=$runId initialStatus=$($runResp.data.status)"

Write-Output "`n=== STEP 3: Poll until planner finishes (every ${PollSeconds}s, max $MaxPolls) ==="
$pollCount = 0
$currentRun = $null
do {
    Start-Sleep -Seconds $PollSeconds
    $pollCount++
    $poll = Invoke-Api GET "$base/workflow-runs?agentPath=$encodedAgent&workflowId=$WorkflowId"
    if (-not $poll.ok) { $poll | ConvertTo-Json; throw "poll failed" }
    $currentRun = ($poll.data | Where-Object { $_.id -eq $runId } | Select-Object -First 1)
    $ts = Get-Date -Format "HH:mm:ss"
    Write-Output "[$ts] Poll $pollCount : status=$($currentRun.status)"
    if ($currentRun.status -eq "error") { break }
} while ($currentRun.status -eq "planning" -and $pollCount -lt $MaxPolls)

Write-Output "`n=== STEP 3 RESULT ==="
$currentRun | ConvertTo-Json -Depth 10

if ($currentRun.status -eq "awaiting_approval") {
    Write-Output "`nplan.steps:"
    $currentRun.plan.steps | ConvertTo-Json -Depth 5
    $statuses = $currentRun.steps | ForEach-Object { "$($_.step_id)=$($_.status)" }
    Write-Output "run.steps: $($statuses -join ', ')"
}

Write-Output "`n=== ENGINE LOG TAIL (last 50 lines) ==="
if (Test-Path $logFile) { Get-Content $logFile -Tail 50 } else { Write-Output "(no log)" }

Write-Output "`nEngine PID $($proc.Id). Logs: $logFile"
