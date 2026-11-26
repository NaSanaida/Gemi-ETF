#Requires -Version 5.1
<#
.SYNOPSIS
    매일 오전 7시 30분(미국 정규장 마감 직후) 자동으로 시장 데이터를 최신화하도록 Windows 작업 스케줄러에 등록합니다.
#>

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$UpdaterScript = Join-Path $ProjectRoot 'scripts\update-data.ps1'
$TaskName = 'US-ETF-Pulse-Daily-Update'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$UpdaterScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At 7:30AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "등록 완료! 매일 오전 07:30에 '$TaskName' 작업이 자동으로 시장 데이터를 최신화합니다." -ForegroundColor Green
