@echo off
setlocal
set "COMPILER=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%COMPILER%" (
  echo .NET Framework C# compiler was not found.
  exit /b 1
)
if not exist "%~dp0..\dist" mkdir "%~dp0..\dist"
"%COMPILER%" /nologo /target:winexe /platform:x86 /optimize+ /warnaserror+ /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /out:"%~dp0..\dist\RefrainTrainer.exe" "%~dp0Program.cs" "%~dp0Trainer.cs" "%~dp0Patches.cs"
if errorlevel 1 exit /b 1
echo Built dist\RefrainTrainer.exe
