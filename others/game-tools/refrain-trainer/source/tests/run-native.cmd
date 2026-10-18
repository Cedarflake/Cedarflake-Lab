@echo off
setlocal
set "COMPILER=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%COMPILER%" (
  echo .NET Framework C# compiler was not found.
  exit /b 1
)
set "TESTOUT=%~dp0..\..\test-output"
if not exist "%TESTOUT%" mkdir "%TESTOUT%"
"%COMPILER%" /nologo /target:exe /platform:x86 /optimize+ /warnaserror+ /main:NativeChecks /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /out:"%TESTOUT%\NativeChecks.exe" "%~dp0NativeChecks.cs" "%~dp0..\Program.cs" "%~dp0..\Trainer.cs" "%~dp0..\Patches.cs"
if errorlevel 1 exit /b 1
"%TESTOUT%\NativeChecks.exe"
exit /b %errorlevel%
