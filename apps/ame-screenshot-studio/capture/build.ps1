[CmdletBinding()]
param(
  [string]$WindowsSdkVersion = "10.0.26100.0",
  [switch]$TestIdentity,
  [switch]$TestGeometry
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$vswhere = Join-Path ([Environment]::GetFolderPath("ProgramFilesX86")) "Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path -LiteralPath $vswhere)) {
  throw "Visual Studio Installer/vswhere was not found."
}
$installation = & $vswhere -latest -products "*" -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installation) {
  throw "Visual Studio C++ x64 Build Tools are required."
}
$devShell = Join-Path $installation "Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
Import-Module $devShell
Enter-VsDevShell -VsInstallPath $installation -SkipAutomaticLocation -DevCmdArguments "-arch=x64 -host_arch=x64 -winsdk=$WindowsSdkVersion"

$outputDirectory = Join-Path $PSScriptRoot "out"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$sourceFiles = @("main.cpp", "windows.cpp", "capture.cpp", "capture_identity.cpp", "capture_geometry.cpp") | ForEach-Object {
  Join-Path $PSScriptRoot $_
}
$compilerOptions = @(
  "/nologo", "/std:c++20", "/EHsc", "/O2", "/W4", "/WX", "/utf-8",
  "/permissive-", "/Zc:__cplusplus", "/DUNICODE", "/D_UNICODE", "/DNOMINMAX",
  "/DWIN32_LEAN_AND_MEAN", "/MT"
)
$compilerArguments = $compilerOptions + $sourceFiles + @(
  "/Fe:ame-capture.exe", "/link", "/INCREMENTAL:NO", "/SUBSYSTEM:CONSOLE",
  "windowsapp.lib", "d3d11.lib", "dxgi.lib", "windowscodecs.lib", "ole32.lib",
  "user32.lib", "gdi32.lib", "dwmapi.lib"
)
Push-Location -LiteralPath $outputDirectory
try {
  & cl.exe @compilerArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Native capture build failed with exit code $LASTEXITCODE."
  }
  if ($TestGeometry) {
    $geometryArguments = $compilerOptions + @(
      (Join-Path $PSScriptRoot "geometry_tests.cpp"),
      (Join-Path $PSScriptRoot "capture_geometry.cpp"),
      "/Fe:ame-geometry-tests.exe", "/link", "/INCREMENTAL:NO", "/SUBSYSTEM:CONSOLE",
      "windowsapp.lib", "ole32.lib", "user32.lib", "dwmapi.lib"
    )
    & cl.exe @geometryArguments
    if ($LASTEXITCODE -ne 0) { throw "Capture geometry test build failed." }
    & ".\ame-geometry-tests.exe"
    if ($LASTEXITCODE -ne 0) { throw "Capture geometry tests failed." }
  }
  if ($TestIdentity) {
    $testArguments = $compilerOptions + @(
      (Join-Path $PSScriptRoot "identity_tests.cpp"),
      (Join-Path $PSScriptRoot "capture_identity.cpp"),
      "/Fe:ame-identity-tests.exe", "/link", "/INCREMENTAL:NO", "/SUBSYSTEM:CONSOLE",
      "windowsapp.lib", "ole32.lib", "user32.lib"
    )
    & cl.exe @testArguments
    if ($LASTEXITCODE -ne 0) { throw "Capture identity test build failed." }
    & ".\ame-identity-tests.exe"
    if ($LASTEXITCODE -ne 0) { throw "Non-Ame identity tests failed." }
    $fixtureDirectory = Join-Path $outputDirectory "identity-fixture"
    New-Item -ItemType Directory -Path $fixtureDirectory -Force | Out-Null
    $fixtureExecutable = Join-Path $fixtureDirectory "cedarflake_ame.exe"
    Copy-Item -LiteralPath (Join-Path $outputDirectory "ame-identity-tests.exe") -Destination $fixtureExecutable -Force
    & $fixtureExecutable --expect-ame
    if ($LASTEXITCODE -ne 0) { throw "Matching Ame identity tests failed." }
  }
} finally {
  Pop-Location
}
Get-Item -LiteralPath (Join-Path $outputDirectory "ame-capture.exe") |
  Select-Object FullName, Length, LastWriteTime
