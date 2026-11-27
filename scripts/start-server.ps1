#Requires -Version 5.1
<#
.SYNOPSIS
    멀티스레드 고속 로컬 HTTP 웹서버 (PC + 같은 Wi-Fi 휴대폰 동시 접속 시 무한로딩 방지)
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

$csharp = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

public class FastStaticServer {
    private readonly string _root;
    private readonly int _port;
    private readonly string _localIp;
    private TcpListener _listener;
    private volatile bool _running;

    private static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
        { ".html", "text/html; charset=utf-8" },
        { ".css",  "text/css; charset=utf-8" },
        { ".js",   "application/javascript; charset=utf-8" },
        { ".json", "application/json; charset=utf-8" },
        { ".svg",  "image/svg+xml" },
        { ".png",  "image/png" },
        { ".ico",  "image/x-icon" },
        { ".webmanifest", "application/manifest+json; charset=utf-8" }
    };

    public FastStaticServer(string root, int port, string localIp) {
        _root = Path.GetFullPath(root);
        _port = port;
        _localIp = localIp;
    }

    public void Start() {
        _listener = new TcpListener(IPAddress.Any, _port);
        _listener.Start(64);
        _running = true;
        while (_running) {
            TcpClient client = _listener.AcceptTcpClient();
            ThreadPool.QueueUserWorkItem(_ => HandleClient(client));
        }
    }

    public void Stop() {
        _running = false;
        try { if (_listener != null) _listener.Stop(); } catch {}
    }

    private void HandleClient(TcpClient client) {
        try {
            client.ReceiveTimeout = 2000;
            client.SendTimeout = 5000;
            using (client)
            using (NetworkStream stream = client.GetStream())
            using (StreamReader reader = new StreamReader(stream, Encoding.UTF8, false, 4096, true)) {
                string requestLine = reader.ReadLine();
                if (string.IsNullOrWhiteSpace(requestLine)) return;

                string line;
                while (!string.IsNullOrEmpty(line = reader.ReadLine())) { }

                string[] parts = requestLine.Split(' ');
                string rawUrl = parts.Length >= 2 ? parts[1] : "/";
                int qIdx = rawUrl.IndexOf('?');
                string pathOnly = qIdx >= 0 ? rawUrl.Substring(0, qIdx) : rawUrl;

                if (pathOnly == "/api/info") {
                    string infoJson = "{\"pcUrl\":\"http://localhost:" + _port + "\",\"mobileUrl\":\"http://" + _localIp + ":" + _port + "\",\"localIp\":\"" + _localIp + "\",\"port\":" + _port + "}";
                    Send(stream, 200, "OK", "application/json; charset=utf-8", Encoding.UTF8.GetBytes(infoJson));
                    return;
                }

                if (pathOnly == "/api/refresh") {
                    string updater = Path.Combine(_root, "scripts", "update-data.ps1");
                    bool ok = true;
                    string msg = "최신화가 완료되었습니다.";
                    try {
                        var psi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + updater + "\" -ProjectRoot \"" + _root + "\"");
                        psi.UseShellExecute = false;
                        psi.CreateNoWindow = true;
                        var p = Process.Start(psi);
                        if (p != null) p.WaitForExit(45000);
                    } catch (Exception ex) {
                        ok = false;
                        msg = ex.Message.Replace("\"", "'");
                    }
                    string respJson = "{\"ok\":" + (ok ? "true" : "false") + ",\"message\":\"" + msg + "\"}";
                    Send(stream, 200, "OK", "application/json; charset=utf-8", Encoding.UTF8.GetBytes(respJson));
                    return;
                }

                string rel = (pathOnly == "/" || pathOnly == "") ? "index.html" : pathOnly.TrimStart('/');
                rel = Uri.UnescapeDataString(rel).Replace('/', Path.DirectorySeparatorChar);
                if (rel.Contains("..")) {
                    Send(stream, 403, "Forbidden", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Forbidden"));
                    return;
                }

                string full = Path.Combine(_root, rel);
                if (Directory.Exists(full)) full = Path.Combine(full, "index.html");

                if (File.Exists(full)) {
                    string ext = Path.GetExtension(full);
                    string ct;
                    if (!MimeTypes.TryGetValue(ext, out ct)) ct = "application/octet-stream";
                    byte[] bytes = File.ReadAllBytes(full);
                    Send(stream, 200, "OK", ct, bytes);
                } else {
                    Send(stream, 404, "Not Found", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("404 Not Found: " + pathOnly));
                }
            }
        } catch {
            // 빈 preconnect 소켓 또는 클라이언트 종료 무시
        }
    }

    private static void Send(NetworkStream stream, int code, string text, string ct, byte[] body) {
        string header = "HTTP/1.1 " + code + " " + text + "\r\n" +
                        "Content-Type: " + ct + "\r\n" +
                        "Content-Length: " + body.Length + "\r\n" +
                        "Cache-Control: no-cache\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Connection: close\r\n\r\n";
        byte[] hBytes = Encoding.ASCII.GetBytes(header);
        stream.Write(hBytes, 0, hBytes.Length);
        if (body.Length > 0) stream.Write(body, 0, body.Length);
        stream.Flush();
    }
}
"@

Add-Type -TypeDefinition $csharp -Language CSharp

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  제미나이 경제 고속 멀티스레드 서버가 실행되었습니다!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  [PC 접속]     http://localhost:$Port" -ForegroundColor White
Write-Host "  [휴대폰 접속] http://${localIp}:$Port  (PC와 같은 Wi-Fi 연결 시)" -ForegroundColor Yellow
Write-Host "  종료하려면 이 창에서 Ctrl + C 를 누르세요." -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$server = New-Object FastStaticServer($ProjectRoot, $Port, $localIp)
try {
    $server.Start()
} finally {
    $server.Stop()
}
