$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

& (Join-Path $PSScriptRoot 'source\build.cmd')
if ($LASTEXITCODE -ne 0) { throw 'Trainer build failed.' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dist = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
$packageName = 'RefrainTrainer-zh-CN-v2'
$archiveName = 'RefrainTrainer-Steam-3256141-zh-CN-v2.zip'
$stage = [IO.Path]::GetFullPath((Join-Path $dist ('package-' + [Guid]::NewGuid().ToString('N'))))
if (-not $stage.StartsWith($dist + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Package staging directory must remain inside dist.'
}
$packageRoot = Join-Path $stage $packageName
$temporaryArchive = Join-Path $stage $archiveName
$archivePath = Join-Path $dist $archiveName
$utf8 = New-Object Text.UTF8Encoding($false)
$sources = @(
  'README.md',
  'docs/validation.md',
  'check.cmd',
  'package.ps1',
  'source/build.cmd',
  'source/Program.cs',
  'source/Trainer.cs',
  'source/Patches.cs',
  'source/tests/NativeChecks.cs',
  'source/tests/run-native.cmd',
  'source/tests/test_patches.py'
)

try {
  New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
  foreach ($relativePath in $sources) {
    $target = Join-Path $packageRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $relativePath) -Destination $target
  }
  Copy-Item -LiteralPath (Join-Path $dist 'RefrainTrainer.exe') -Destination $packageRoot

  $entries = @(
    foreach ($relativePath in (($sources + 'RefrainTrainer.exe') | Sort-Object)) {
      $file = Get-Item -LiteralPath (Join-Path $packageRoot $relativePath)
      [ordered]@{
        path = $relativePath
        bytes = $file.Length
        sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
      }
    }
  )
  $manifest = [ordered]@{ release = $packageName; steamBuild = 3256141; files = $entries }
  $manifestJson = ($manifest | ConvertTo-Json -Depth 5) + "`n"
  [IO.File]::WriteAllText((Join-Path $packageRoot 'SHA256.json'), $manifestJson, $utf8)
  [IO.Compression.ZipFile]::CreateFromDirectory($packageRoot, $temporaryArchive, [IO.Compression.CompressionLevel]::Optimal, $true)

  $zip = [IO.Compression.ZipFile]::OpenRead($temporaryArchive)
  try {
    $files = @($zip.Entries | Where-Object { $_.Name.Length -gt 0 })
    $expectedNames = @($entries | ForEach-Object { $packageName + '/' + $_.path }) + ($packageName + '/SHA256.json')
    $actualNames = @($files | ForEach-Object { $_.FullName.Replace('\', '/') })
    if ($files.Count -ne $expectedNames.Count -or (Compare-Object $actualNames $expectedNames)) {
      throw 'ZIP file list does not match the package allowlist.'
    }
    foreach ($file in $files) {
      $relativePath = $file.FullName.Replace('\', '/').Substring($packageName.Length + 1)
      $expectedHash = (Get-FileHash -LiteralPath (Join-Path $packageRoot $relativePath) -Algorithm SHA256).Hash
      $stream = $file.Open()
      $hasher = [Security.Cryptography.SHA256]::Create()
      try {
        $actualHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '')
        if ($actualHash -ne $expectedHash) { throw "ZIP content mismatch: $relativePath" }
      }
      finally {
        $hasher.Dispose()
        $stream.Dispose()
      }
    }
  }
  finally { $zip.Dispose() }

  Move-Item -LiteralPath $temporaryArchive -Destination $archivePath -Force
  $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
  [IO.File]::WriteAllText(($archivePath + '.sha256'), "$archiveHash  $archiveName`n", $utf8)
  Write-Output "Packaged and verified $($entries.Count + 1) files: $archivePath"
  Write-Output "SHA-256: $archiveHash"
}
finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
