#Requires -Version 5.1
<#
.SYNOPSIS
    PC 및 같은 Wi-Fi 휴대폰에서 즉시 접속 가능한 경량 HTTP 웹서버 (PowerShell 기본 기능 사용)
#>

param(
    [int]$Port = 8080,
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

# 같은 Wi-Fi 내 휴대폰 접속용 로컬 IP 탐색
$localIp = '127.0.0.1'
try {
    $ipObj = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } | Select-Object -First 1
    if ($ipObj) { $localIp = $ipObj.IPAddress }
} catch {}

# TcpListener를 사용해 관리자 권한 없이도 0.0.0.0(PC + 휴대폰 Wi-Fi) 바인딩 지원
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()

$MimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [string]$ContentType,
        [byte[]]$BodyBytes
    )
    $header = "HTTP/1.1 $StatusCode $StatusText`r`n" +
              "Content-Type: $ContentType`r`n" +
              "Content-Length: $($BodyBytes.Length)`r`n" +
              "Cache-Control: no-cache`r`n" +
              "Access-Control-Allow-Origin: *`r`n" +
              "Connection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($BodyBytes.Length -gt 0) {
        $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
    }
    $Stream.Flush()
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  US ETF Pulse 서버가 실행되었습니다!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  [PC 접속]     http://localhost:$Port" -ForegroundColor White
Write-Host "  [휴대폰 접속] http://${localIp}:$Port  (PC와 같은 Wi-Fi 연결 시)" -ForegroundColor Yellow
Write-Host "  종료하려면 이 창에서 Ctrl + C 를 누르세요." -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 5000
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $false, 4096, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                $client.Close()
                continue
            }
            # 나머지 헤더 소비
            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
            }

            $parts = $requestLine -split ' '
            $method = $parts[0]
            $rawUrl = if ($parts.Count -ge 2) { $parts[1] } else { '/' }
            $pathOnly = ($rawUrl -split '\?')[0]

            # 서버 접속 정보 API (모바일 QR/URL 표시용)
            if ($pathOnly -eq '/api/info') {
                $infoJson = (@{
                    pcUrl = "http://localhost:$Port"
                    mobileUrl = "http://${localIp}:$Port"
                    localIp = $localIp
                    port = $Port
                } | ConvertTo-Json -Compress)
                Send-Response -Stream $stream -StatusCode 200 -StatusText 'OK' -ContentType 'application/json; charset=utf-8' -BodyBytes ([System.Text.Encoding]::UTF8.GetBytes($infoJson))
                $client.Close()
                continue
            }

            # 실시간 데이터 갱신 API
            if ($pathOnly -eq '/api/refresh') {
                $updater = Join-Path $ProjectRoot 'scripts\update-data.ps1'
                $ok = $true
                $msg = '최신화가 완료되었습니다.'
                try {
                    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updater -ProjectRoot $ProjectRoot | Out-Null
                } catch {
                    $ok = $false
                    $msg = $_.Exception.Message
                }
                $respJson = (@{ ok = $ok; message = $msg } | ConvertTo-Json -Compress)
                Send-Response -Stream $stream -StatusCode 200 -StatusText 'OK' -ContentType 'application/json; charset=utf-8' -BodyBytes ([System.Text.Encoding]::UTF8.GetBytes($respJson))
                $client.Close()
                continue
            }

            # 정적 파일 서빙
            $relPath = if ($pathOnly -eq '/' -or $pathOnly -eq '') { 'index.html' } else { $pathOnly.TrimStart('/') }
            $relPath = [Uri]::UnescapeDataString($relPath).Replace('/', '\')
            if ($relPath.Contains('..')) {
                Send-Response -Stream $stream -StatusCode 403 -StatusText 'Forbidden' -ContentType 'text/plain; charset=utf-8' -BodyBytes ([System.Text.Encoding]::UTF8.GetBytes('Forbidden'))
                $client.Close()
                continue
            }

            $fullPath = Join-Path $ProjectRoot $relPath
            if (Test-Path $fullPath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                $ct = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                Send-Response -Stream $stream -StatusCode 200 -StatusText 'OK' -ContentType $ct -BodyBytes $bytes
            } else {
                $notFound = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
                Send-Response -Stream $stream -StatusCode 404 -StatusText 'Not Found' -ContentType 'text/plain; charset=utf-8' -BodyBytes $notFound
            }
        } catch {
            # 개별 요청 오류는 서버 전체를 중단시키지 않음
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
