@echo off
chcp 65001 >nul
echo US ETF Pulse 웹 서버를 시작합니다 (PC + 휴대폰 Wi-Fi 지원)...
start "" "http://localhost:8080"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-server.ps1" -Port 8080
pause
