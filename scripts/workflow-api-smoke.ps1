# Workflow Phase 2 REST API smoke test
param(
    [string]$EngineExe = "$PSScriptRoot\..\target-fresh\debug\houston-engine.exe",
    [string]$AgentPath = "C:\Users\yohan\Documents\houston",
    [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
$houstonHome = "$env:USERPROFILE\.houston"

function Get-EngineCreds {
    param([string]$HomeDir)
    $manifestPath = Join-Path $HomeDir "engine.json"
    if (-not (Test-Path $manifestPath)) {
        throw "engine.json not found at $manifestPath"
    }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if (-not $manifest.port) { throw "engine.json missing port" }
    # Token is not stored in manifest; read from env or bootstrap file
    $tokenFile = Join-Path $HomeDir ".smoke-token"
    if (-not (Test-Path $tokenFile)) {
        throw "Token file not found at $tokenFile (start engine first)"
    }
    $token = (Get-Content $tokenFile -Raw).Trim()
    return @{ Port = $manifest.port; Token = $token }
}

function Start-TestEngine {
    param([string]$Exe, [string]$HomeDir)
    if (-not (Test-Path $Exe)) {
        throw "Engine binary not found: $Exe"
    }
    $token = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    $token | Set-Content (Join-Path $HomeDir ".smoke-token") -NoNewline
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.Environment["HOUSTON_HOME"] = $HomeDir
    $psi.Environment["HOUSTON_DOCS"] = $HomeDir
    $psi.Environment["HOUSTON_ENGINE_TOKEN"] = $token
    $psi.Environment["HOUSTON_BIND"] = "127.0.0.1:0"
    $psi.Environment["HOUSTON_NO_PARENT_WATCHDOG"] = "1"
    $psi.Environment["RUST_LOG"] = "info,houston=debug"
    $psi.Environment["PATH"] = $env:PATH
    $proc = [System.Diagnostics.Process]::Start($psi)
    $banner = $proc.StandardOutput.ReadLine()
    if ($banner -notmatch "HOUSTON_ENGINE_LISTENING") {
        throw "Unexpected engine banner: $banner"
    }
    Start-Sleep -Seconds 2
    return $proc
}

function Invoke-HoustonApi {
    param($Method, $Base, $Token, $Uri, $Body = $null)
    $headers = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }
    try {
        $params = @{ Method = $Method; Uri = $Uri; Headers = $headers }
        if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }
        $r = Invoke-RestMethod @params
        return @{ ok = $true; data = $r }
    } catch {
        $resp = $_.Exception.Response
        $body = ""
        $status = 0
        if ($resp) {
            $status = [int]$resp.StatusCode
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $body = $reader.ReadToEnd()
        }
        return @{ ok = $false; status = $status; body = $body; error = $_.Exception.Message }
    }
}

New-Item -ItemType Directory -Force -Path $houstonHome | Out-Null
$proc = $null
if (-not $SkipStart) {
    $proc = Start-TestEngine -Exe $EngineExe -HomeDir $houstonHome
    Write-Output "Engine started PID=$($proc.Id)"
}

$creds = Get-EngineCreds -HomeDir $houstonHome
$port = $creds.Port
$token = $creds.Token
$encodedAgent = [uri]::EscapeDataString($AgentPath)
$base = "http://127.0.0.1:$port/v1"

Write-Output "=== SETUP ==="
Write-Output "port=$port agentPath=$AgentPath"

Write-Output "`n=== STEP 1: Create workflow definition ==="
$step1Body = @{
    name = "API smoke test"
    description = "Phase 2 manual test"
    plan_prompt = "Break this task into 2 steps: (1) id 'scan' - list the top-level files in the workspace and summarize; (2) id 'report' - depends on 'scan', write a one-paragraph summary of findings. Keep it small. Respond with ONLY JSON matching {""steps"":[{""id"":""..."",""task"":""..."",""depends_on"":[],""use_worktree"":false}]} - no markdown."
}
$step1 = Invoke-HoustonApi -Method POST -Base $base -Token $token -Uri "$base/workflows?agentPath=$encodedAgent" -Body $step1Body
$step1 | ConvertTo-Json -Depth 10
if (-not $step1.ok) { exit 1 }
$workflowId = $step1.data.id

Write-Output "`n=== STEP 2: Start a run ==="
$step2 = Invoke-HoustonApi -Method POST -Base $base -Token $token -Uri "$base/workflows/$workflowId/run?agentPath=$encodedAgent"
$step2 | ConvertTo-Json -Depth 10
if (-not $step2.ok) { exit 1 }
$runId = $step2.data.id

Write-Output "`n=== STEP 3: Poll until planner finishes ==="
$pollCount = 0
$maxPolls = 120
$currentRun = $null
do {
    Start-Sleep -Seconds 3
    $pollCount++
    $poll = Invoke-HoustonApi -Method GET -Base $base -Token $token -Uri "$base/workflow-runs?agentPath=$encodedAgent&workflowId=$workflowId"
    if (-not $poll.ok) { $poll | ConvertTo-Json; exit 1 }
    $currentRun = ($poll.data | Where-Object { $_.id -eq $runId } | Select-Object -First 1)
    Write-Output "Poll $pollCount : status=$($currentRun.status)"
    if ($currentRun.status -eq "error") {
        Write-Output "ERROR - stopping"
        $currentRun | ConvertTo-Json -Depth 10
        exit 1
    }
} while ($currentRun.status -eq "planning" -and $pollCount -lt $maxPolls)

Write-Output "`n=== STEP 3 result ==="
$currentRun | ConvertTo-Json -Depth 10

Write-Output "`n=== STEP 4: Inspect proposed plan ==="
$hasPlan = $null -ne $currentRun.plan -and $null -ne $currentRun.plan.steps
Write-Output "plan.steps exists: $hasPlan"
if ($hasPlan) { $currentRun.plan.steps | ConvertTo-Json -Depth 5 }
$stepStatuses = $currentRun.steps | ForEach-Object { "$($_.step_id)=$($_.status)" }
Write-Output "run.steps statuses: $($stepStatuses -join ', ')"

Write-Output "`n=== STEP 5: Approve ==="
$step5 = Invoke-HoustonApi -Method POST -Base $base -Token $token -Uri "$base/workflow-runs/$runId/approve?agentPath=$encodedAgent"
$step5 | ConvertTo-Json -Depth 10
if (-not $step5.ok) { exit 1 }

Write-Output "`n=== STEP 6: Poll until terminal ==="
$pollCount = 0
$maxPolls = 180
do {
    Start-Sleep -Seconds 5
    $pollCount++
    $poll = Invoke-HoustonApi -Method GET -Base $base -Token $token -Uri "$base/workflow-runs?agentPath=$encodedAgent&workflowId=$workflowId"
    $currentRun = ($poll.data | Where-Object { $_.id -eq $runId } | Select-Object -First 1)
    $stepStatuses = $currentRun.steps | ForEach-Object { "$($_.step_id)=$($_.status)" }
    Write-Output "Poll $pollCount : status=$($currentRun.status) steps=[$($stepStatuses -join ', ')]"
} while ($currentRun.status -in @("running","planning","awaiting_approval") -and $pollCount -lt $maxPolls)

Write-Output "`n=== STEP 6 FINAL ==="
$currentRun | ConvertTo-Json -Depth 10

Write-Output "`n=== OPTIONAL: Cancel test ==="
$step2b = Invoke-HoustonApi -Method POST -Base $base -Token $token -Uri "$base/workflows/$workflowId/run?agentPath=$encodedAgent"
$runId2 = $step2b.data.id
Write-Output "Cancel run started: $($step2b | ConvertTo-Json -Depth 5 -Compress)"
$pollCount = 0
do {
    Start-Sleep -Seconds 3
    $pollCount++
    $poll = Invoke-HoustonApi -Method GET -Base $base -Token $token -Uri "$base/workflow-runs?agentPath=$encodedAgent&workflowId=$workflowId"
    $cancelRun = ($poll.data | Where-Object { $_.id -eq $runId2 } | Select-Object -First 1)
    Write-Output "Cancel poll $pollCount : status=$($cancelRun.status)"
} while ($cancelRun.status -eq "planning" -and $pollCount -lt 60)

if ($cancelRun.status -eq "awaiting_approval") {
    $cancelResp = Invoke-HoustonApi -Method POST -Base $base -Token $token -Uri "$base/workflow-runs/$runId2/cancel?agentPath=$encodedAgent"
    Write-Output "Cancel response: $($cancelResp | ConvertTo-Json -Depth 10)"
}

if ($proc) {
    Write-Output "`nEngine PID $($proc.Id) still running (leave for inspection)"
}
