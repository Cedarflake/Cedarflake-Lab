$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'Packages\Cedarflake.Cedarflake-Ame_t341beqjcwv0y\LocalState\Ame'
if (Test-Path -LiteralPath 'C:\StudioState\saved') {
    if (Test-Path -LiteralPath $root) { throw 'Guest data already exists; refusing to replace it' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $root) -Force | Out-Null
    & robocopy 'C:\StudioState\saved' $root /E /R:0 /W:0 /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) { throw 'Saved catalog restoration failed.' }
}
foreach ($folder in @('Art Collection', 'Creative Archive', 'Photo Archive')) {
    $source = Join-Path 'C:\StudioState\source-folders' $folder
    $destination = Join-Path 'C:\' $folder
    if (Test-Path -LiteralPath $source) {
        if (Test-Path -LiteralPath $destination) { throw 'Guest source folder already exists.' }
        & robocopy $source $destination /E /R:0 /W:0 /NFL /NDL /NJH /NJS
        if ($LASTEXITCODE -ge 8) { throw 'Saved source-folder restoration failed.' }
    }
}
$app = Start-Process -FilePath 'C:\AmeApp\cedarflake_ame.exe' -WorkingDirectory 'C:\AmeApp' -WindowStyle Hidden -PassThru
@{pid=$app.Id; storage=$root; started=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath 'C:\StudioState\guest-session.json' -Encoding UTF8
