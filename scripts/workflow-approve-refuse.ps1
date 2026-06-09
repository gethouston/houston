# Approve + refuse (cancel) workflow run tests
param(
    [string]$EngineExe = "$PSScriptRoot\..\target-fresh\debug\houston-engine.exe",
    [string]$AgentPath = "C:\Users\yohan\Documents\houston",
    [string]$WorkflowId = "4901be17-5471-4fc3-b605-a37f4fea2f20",
    [string]$ApproveRunId = "c606f213-ca8d-4396-9d1f-ade14697f603"
)

$ErrorActionPreference = "Stop"
$houstonHome = "$env:USERPROFILE\.houston"
$logFile = Join-Path $houstonHome "engine-approve-refuse.log"
New-Item -ItemType Directory -Force -Path $houstonHome | Out-Null

function Start-Engine {
    if (-not (Test-Path $EngineExe)) { throw "Engine not found: $EngineExe" }
    $token = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    $token | Set-Content (Join-Path $houstonHome ".smoke-token") -NoNewline
    $env:HOUSTON_HOME = $houstonHome
    $env:HOUSTON_DOCS = $houstonHome
    $env:HOUSTON_ENGINE_TOKEN = $token
    $env:HOUSTON_BIND = "127.0.0.1:0"
    $env:HOUSTON_NO_PARENT_WATCHDOG = "1"
    $env:RUST_LOG = "info,houston=debug"
    $pnpmBin = Join-Path $env:LOCALAPPDATA "pnpm"
    if (Test-Path $pnpmBin) { $env:PATH = "$pnpmBin;$env:PATH" }
    if (Test-Path $logFile) { Remove-Item $logFile -Force }
    $stdout = Join-Path $houstonHome "engine-approve-refuse-stdout.log"
    if (Test-Path $stdout) { Remove-Item $stdout -Force }
    $proc = Start-Process -FilePath $EngineExe -PassThru -NoNewWindow `
        -RedirectStandardOutput $stdout -RedirectStandardError $logFile
    Start-Sleep -Seconds 3
    $banner = Get-Content $stdout -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($banner -notmatch 'port=(\d+)') { throw "Bad banner: $banner" }
    $tok = (Get-Content (Join-Path $houstonHome ".smoke-token") -Raw).Trim()
    return @{ Port = $Matches[1]; Token = $tok; Pid = $proc.Id; Banner = $banner }
}

function Invoke-Api($Method, $Base, $Token, $Uri, $Body = $null) {
    $headers = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }
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

function Get-Run($Base, $Token, $AgentEnc, $WfId, $RunId) {
    $poll = Invoke-Api GET $Base $Token "$Base/workflow-runs?agentPath=$AgentEnc&workflowId=$WfId"
    if (-not $poll.ok) { throw $poll.body }
    return ($poll.data | Where-Object { $_.id -eq $RunId } | Select-Object -First 1)
}

function Wait-Status($Base, $Token, $AgentEnc, $WfId, $RunId, $Want, $IntervalSec, $Max) {
    for ($i = 1; $i -le $Max; $i++) {
        Start-Sleep -Seconds $IntervalSec
        $run = Get-Run $Base $Token $AgentEnc $WfId $RunId
        $steps = ($run.steps | ForEach-Object { "$($_.step_id)=$($_.status)" }) -join ", "
        Write-Output "  poll $i : status=$($run.status) steps=[$steps]"
        if ($run.status -in $Want) { return $run }
        if ($run.status -eq "error") { return $run }
    }
    return Get-Run $Base $Token $AgentEnc $WfId $RunId
}

$eng = Start-Engine
Write-Output "ENGINE: $($eng.Banner)"
$base = "http://127.0.0.1:$($eng.Port)/v1"
$agentEnc = [uri]::EscapeDataString($AgentPath)

# --- TEST 1: APPROVE existing run ---
Write-Output "`n========== TEST 1: APPROVE =========="
$pre = Get-Run $base $eng.Token $agentEnc $WorkflowId $ApproveRunId
Write-Output "Pre-approve: status=$($pre.status)"
if ($pre.status -ne "awaiting_approval") {
    Write-Output "WARN: expected awaiting_approval, got $($pre.status)"
}

$approve = Invoke-Api POST $base $eng.Token "$base/workflow-runs/$ApproveRunId/approve?agentPath=$agentEnc"
Write-Output "Approve response:"
$approve | ConvertTo-Json -Depth 10
if (-not $approve.ok) { throw "approve failed" }

Write-Output "Polling until terminal (every 5s)..."
$finalApprove = Wait-Status $base $eng.Token $agentEnc $WorkflowId $ApproveRunId @("done","error","cancelled") 5 180
Write-Output "Final approve run:"
$finalApprove | ConvertTo-Json -Depth 10

# --- TEST 2: REFUSE (cancel at awaiting_approval) ---
Write-Output "`n========== TEST 2: REFUSE (cancel) =========="
Write-Output "No /refuse route - POST /workflow-runs/{id}/cancel while awaiting_approval"

$start = Invoke-Api POST $base $eng.Token "$base/workflows/$WorkflowId/run?agentPath=$agentEnc"
Write-Output "New run:"
$start | ConvertTo-Json -Depth 10
if (-not $start.ok) { throw "start run failed" }
$refuseRunId = $start.data.id

Write-Output "Polling until awaiting_approval..."
$planned = Wait-Status $base $eng.Token $agentEnc $WorkflowId $refuseRunId @("awaiting_approval") 3 120
if ($planned.status -ne "awaiting_approval") {
    Write-Output "WARN: planner did not reach awaiting_approval: $($planned.status)"
    $planned | ConvertTo-Json -Depth 10
    exit 1
}
Write-Output "Plan ready. Cancelling (refuse)..."
$cancel = Invoke-Api POST $base $eng.Token "$base/workflow-runs/$refuseRunId/cancel?agentPath=$agentEnc"
Write-Output "Cancel response:"
$cancel | ConvertTo-Json -Depth 10
if (-not $cancel.ok) { throw "cancel failed" }

$refuseFinal = Get-Run $base $eng.Token $agentEnc $WorkflowId $refuseRunId
Write-Output "Final refuse run:"
$refuseFinal | ConvertTo-Json -Depth 10

Write-Output "`nEngine PID $($eng.Pid). Log: $logFile"
