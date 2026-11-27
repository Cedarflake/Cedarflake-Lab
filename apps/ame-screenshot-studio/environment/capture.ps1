param([Parameter(Mandatory)][ValidatePattern('^ame-[0-9a-f-]{36}\.png$')][string]$OutputName)
$ErrorActionPreference = 'Stop'
try {
    $windows = & 'C:\StudioCaptureTool\ame-capture.exe' enumerate | ConvertFrom-Json
    $ame = @($windows | Where-Object { $_.process -eq 'cedarflake_ame.exe' })
    if ($ame.Count -ne 1) { throw 'Expected exactly one Ame window' }
    $destination = Join-Path 'C:\StudioCaptures' $OutputName
    $result = & 'C:\StudioCaptureTool\ame-capture.exe' capture-ame $ame[0].id $ame[0].pid $ame[0].started $destination
    if ($LASTEXITCODE -ne 0) { throw "Capture failed: $result" }
    [System.IO.File]::WriteAllText(
        ($destination + '.json'), ($result -join [Environment]::NewLine),
        [System.Text.UTF8Encoding]::new($false)
    )
} catch {
    $_ | Out-String | Set-Content -LiteralPath 'C:\StudioState\capture-error.txt' -Encoding UTF8
    exit 1
}