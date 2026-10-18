@echo off
setlocal
call "%~dp0source\build.cmd"
if errorlevel 1 exit /b 1
call "%~dp0source\tests\run-native.cmd"
exit /b %errorlevel%
