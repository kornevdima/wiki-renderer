@echo off
"%~dp0bin\node.exe" "%~dp0cli.mjs" %*
exit /b %ERRORLEVEL%
