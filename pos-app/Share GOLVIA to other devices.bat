@echo off
title GOLVIA POS - shared to other devices
cd /d %~dp0
echo Keep this window OPEN while you are using GOLVIA on other devices.
echo Closing it takes the link offline.
echo.
node share.js
pause
