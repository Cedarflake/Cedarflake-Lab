$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSScriptRoot
$sessionFile = Join-Path $studioRoot 'environment\session.json'
if (Test-Path -LiteralPath $sessionFile) { throw 'A Studio session record exists; inspect it before starting another.' }
foreach ($inputFile in @('runtime\app\cedarflake_ame.exe', 'capture\out\ame-capture.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $studioRoot $inputFile) -PathType Leaf)) {
        throw "Required Studio input is missing: $inputFile"
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $studioRoot 'library\images') -PathType Container)) {
    throw 'Prepared images are missing: library\images'
}
foreach ($outputDirectory in @('environment\state', 'captures')) {
    New-Item -ItemType Directory -Path (Join-Path $studioRoot $outputDirectory) -Force | Out-Null
}
$entries = @(
    @{Host=(Join-Path $studioRoot 'runtime\app');Guest='C:\AmeApp';ReadOnly='true'},
    @{Host=(Join-Path $studioRoot 'library\images');Guest='C:\Image Library';ReadOnly='true'},
    @{Host=(Join-Path $studioRoot 'environment');Guest='C:\StudioControl';ReadOnly='true'},
    @{Host=(Join-Path $studioRoot 'environment\state');Guest='C:\StudioState';ReadOnly='false'},
    @{Host=(Join-Path $studioRoot 'captures');Guest='C:\StudioCaptures';ReadOnly='false'},
    @{Host=(Join-Path $studioRoot 'capture\out');Guest='C:\StudioCaptureTool';ReadOnly='true'}
)
$folders = ($entries | ForEach-Object {
    $hostFolder=[Security.SecurityElement]::Escape($_.Host)
    "<MappedFolder><HostFolder>$hostFolder</HostFolder><SandboxFolder>$($_.Guest)</SandboxFolder><ReadOnly>$($_.ReadOnly)</ReadOnly></MappedFolder>"
}) -join ''
$config = "<Configuration><MemoryInMB>6144</MemoryInMB><VGpu>Enable</VGpu><Networking>Disable</Networking><ClipboardRedirection>Disable</ClipboardRedirection><MappedFolders>$folders</MappedFolders><LogonCommand><Command>powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\StudioControl\guest-start.ps1</Command></LogonCommand></Configuration>"
$id=[guid]::NewGuid().ToString()
wsb start --id $id --config $config --raw
if ($LASTEXITCODE -ne 0) { throw 'Screenshot sandbox did not start' }
$sessionJson = @{id=$id;created=[DateTimeOffset]::UtcNow.ToString('o');purpose='ame-screenshot-studio'} | ConvertTo-Json
[System.IO.File]::WriteAllText($sessionFile, $sessionJson, [System.Text.UTF8Encoding]::new($false))
wsb connect --id $id --raw
if ($LASTEXITCODE -ne 0) { throw 'Screenshot sandbox did not connect' }
