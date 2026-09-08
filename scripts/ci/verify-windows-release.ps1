param([Parameter(Mandatory = $true)][string]$Installer)

$ErrorActionPreference = 'Stop'

function Assert-Signed([string]$Path) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate) {
        throw "Release artifact requires a valid timestamped signature: $Path ($($signature.Status))"
    }
    $hash = Get-FileHash -LiteralPath $Path -Algorithm SHA256
    Write-Host "$($hash.Hash) $Path"
}

$installerPath = (Resolve-Path -LiteralPath $Installer).Path
Assert-Signed $installerPath
$extraction = Join-Path ([System.IO.Path]::GetTempPath()) ('houston-release-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $extraction | Out-Null
try {
    # An administrative installation extracts the MSI payload without installing
    # Houston. Verify the delivered files, including sidecars inside the cabinet.
    $arguments = @('/a', "`"$installerPath`"", '/qn', "TARGETDIR=`"$extraction`"")
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "MSI extraction failed: $($process.ExitCode)" }
    $files = @(Get-ChildItem -LiteralPath $extraction -Recurse -File)
    $retired = @($files | Where-Object { $_.Name -match '^frpc(?:-|\.|$)' })
    if ($retired.Count -gt 0) { throw 'The release still contains the retired FRP client.' }
    $executables = @($files | Where-Object { $_.Extension -ieq '.exe' })
    if ($executables.Count -eq 0) { throw 'The MSI contained no executable payload.' }
    foreach ($executable in $executables) { Assert-Signed $executable.FullName }
} finally {
    Remove-Item -LiteralPath $extraction -Recurse -Force
}
