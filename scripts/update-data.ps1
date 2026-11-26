#Requires -Version 5.1
<#
.SYNOPSIS
    미국 ETF · 원/달러 환율 · 거시경제(FRED) · ETF별 최신 기사(Google News RSS) 자동 수집 및 신호등 계산 스크립트
.DESCRIPTION
    외부 패키지 설치 없이 Windows PowerShell 기본 기능만으로 Yahoo Finance, FRED CSV, Google News RSS를 호출해
    data/market-data.json 및 data/market-data.js를 최신화합니다.
#>

param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$DataDir = Join-Path $ProjectRoot 'data'
$JsonPath = Join-Path $DataDir 'market-data.json'
$JsPath   = Join-Path $DataDir 'market-data.js'

if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

# 기존 데이터를 백업/폴백용으로 로드
$existingData = $null
if (Test-Path $JsonPath) {
    try {
        $existingData = Get-Content -Path $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Warning "기존 데이터 로드 실패: $($_.Exception.Message)"
    }
}

$UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

function Get-YahooChart {
    param([string]$Symbol, [string]$Range = '1y')
    $encoded = [Uri]::EscapeDataString($Symbol)
    $url = "https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=${Range}&interval=1d"
    try {
        $resp = Invoke-RestMethod -Uri $url -Headers @{ 'User-Agent' = $UserAgent } -TimeoutSec 12
        $res = $resp.chart.result[0]
        $timestamps = $res.timestamp
        $closes = $res.indicators.quote[0].close
        $points = @()
        for ($i = 0; $i -lt $timestamps.Count; $i++) {
            if ($null -ne $closes[$i]) {
                $dt = ([DateTimeOffset]::FromUnixTimeSeconds([long]$timestamps[$i])).ToLocalTime().ToString('yyyy-MM-dd')
                $points += [PSCustomObject]@{
                    date  = $dt
                    close = [math]::Round([double]$closes[$i], 2)
                }
            }
        }
        return [PSCustomObject]@{
            ok     = $true
            meta   = $res.meta
            points = $points
        }
    } catch {
        Write-Warning "Yahoo Finance 조회 실패 ($Symbol): $($_.Exception.Message)"
        return [PSCustomObject]@{ ok = $false }
    }
}

function Get-FredLatest {
    param([string]$SeriesId)
    $url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=$SeriesId"
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ 'User-Agent' = $UserAgent } -TimeoutSec 12
        $lines = ($resp.Content -split "`r?`n") | Where-Object { $_ -and ($_ -notmatch '^DATE') -and ($_ -notmatch ',\.$') }
        if ($lines.Count -ge 2) {
            $last = $lines[-1] -split ','
            $prev = $lines[-2] -split ','
            return [PSCustomObject]@{
                ok    = $true
                date  = $last[0]
                value = [double]$last[1]
                prev  = [double]$prev[1]
            }
        }
    } catch {
        Write-Warning "FRED 조회 실패 ($SeriesId): $($_.Exception.Message)"
    }
    return [PSCustomObject]@{ ok = $false }
}

# 한국어/영어 금융 뉴스 감성 분석 사전 (호재/악재/중립 분류)
$PositiveKeywords = @(
    '상승','급등','반등','호재','강세','신고가','돌파','어닝 서프라이즈','실적 호조','금리 인하',
    '완화','매수','유입','성장','확대','수혜','기대감','회복','최고치','배당 인상','탄탄',
    'rally','surge','gain','bullish','beat','growth','record high','rate cut','inflow','upgrade','rebound','outperform'
)
$NegativeKeywords = @(
    '하락','급락','폭락','악재','약세','우려','관세','인플레이션','물가 상승','금리 인상','긴축',
    '매도','유출','충격','위축','둔화','리스크','경고','전쟁','갈등','부진','조정','공포','하향',
    'drop','plunge','slump','bearish','tariff','inflation','rate hike','hawkish','outflow','selloff','downgrade','recession','fear','cut'
)

function Get-SentimentInfo {
    param([string]$Text)
    $lower = $Text.ToLower()
    $pos = 0
    $neg = 0
    foreach ($kw in $PositiveKeywords) {
        if ($lower.Contains($kw.ToLower())) { $pos++ }
    }
    foreach ($kw in $NegativeKeywords) {
        if ($lower.Contains($kw.ToLower())) { $neg++ }
    }
    if ($pos -gt $neg) {
        return [PSCustomObject]@{ sentiment = 'positive'; impact = $(if ($pos -ge 2) { '높음' } else { '보통' }) }
    } elseif ($neg -gt $pos) {
        return [PSCustomObject]@{ sentiment = 'negative'; impact = $(if ($neg -ge 2) { '높음' } else { '보통' }) }
    } else {
        return [PSCustomObject]@{ sentiment = 'neutral'; impact = '보통' }
    }
}

function Get-GoogleNewsRss {
    param([string]$Query, [int]$Limit = 5)
    $q = [Uri]::EscapeDataString($Query)
    $url = "https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko"
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ 'User-Agent' = $UserAgent } -TimeoutSec 12
        [xml]$xml = $resp.Content
        $items = $xml.rss.channel.item | Select-Object -First $Limit
        $list = @()
        foreach ($it in $items) {
            $rawTitle = [string]$it.title
            $source = '뉴스'
            $title = $rawTitle
            if ($rawTitle -match '^(.*)\s+-\s+([^-]+)$') {
                $title = $Matches[1].Trim()
                $source = $Matches[2].Trim()
            }
            $sent = Get-SentimentInfo -Text $title
            $pubDate = ''
            try {
                $pubDate = ([DateTime]::Parse($it.pubDate)).ToString('yyyy.MM.dd HH:mm')
            } catch {
                $pubDate = (Get-Date).ToString('yyyy.MM.dd')
            }
            $summaryText = switch ($sent.sentiment) {
                'positive' { '긍정적 모멘텀 또는 수급·실적 개선 신호로 분류된 최신 기사입니다.' }
                'negative' { '단기 변동성 확대 또는 거시·업황 부담 요인으로 분류된 최신 기사입니다.' }
                default    { '시장 방향성을 가늠하기 위해 함께 참고할 중립적 최신 이슈입니다.' }
            }
            $list += [PSCustomObject]@{
                title       = $title
                source      = $source
                publishedAt = $pubDate
                sentiment   = $sent.sentiment
                impactLevel = $sent.impact
                summary     = $summaryText
                url         = [string]$it.link
            }
        }
        return $list
    } catch {
        Write-Warning "뉴스 RSS 조회 실패 ($Query): $($_.Exception.Message)"
        return @()
    }
}

function Get-Rsi14 {
    param([double[]]$Closes)
    if ($Closes.Count -lt 15) { return 50.0 }
    $gains = 0.0
    $losses = 0.0
    $start = $Closes.Count - 14
    for ($i = $start; $i -lt $Closes.Count; $i++) {
        $diff = $Closes[$i] - $Closes[$i - 1]
        if ($diff -gt 0) { $gains += $diff } else { $losses += [math]::Abs($diff) }
    }
    $avgGain = $gains / 14.0
    $avgLoss = $losses / 14.0
    if ($avgLoss -eq 0) { return 100.0 }
    $rs = $avgGain / $avgLoss
    return [math]::Round(100.0 - (100.0 / (1.0 + $rs)), 1)
}

function Get-MovingAverage {
    param([double[]]$Values, [int]$Window)
    if ($Values.Count -eq 0) { return 0.0 }
    $n = [math]::Min($Window, $Values.Count)
    $slice = $Values[($Values.Count - $n)..($Values.Count - 1)]
    $sum = 0.0
    foreach ($v in $slice) { $sum += $v }
    return [math]::Round($sum / $n, 2)
}

Write-Host "=== US ETF Pulse 실시간 데이터 최신화 시작 ===" -ForegroundColor Cyan

if ($null -eq $existingData) {
    Write-Error "기본 데이터 파일($JsonPath)이 존재하지 않습니다."
    exit 1
}

$liveSuccessCount = 0

# 1. 환율(USD/KRW) & 달러 인덱스(DXY) 업데이트
$fxChart = Get-YahooChart -Symbol 'KRW=X' -Range '1y'
if ($fxChart.ok -and $fxChart.points.Count -gt 20) {
    $liveSuccessCount++
    $fxCloses = @($fxChart.points | ForEach-Object { [double]$_.close })
    $curFx = $fxCloses[-1]
    $prevFx = $fxCloses[-2]
    $fxChg = [math]::Round((($curFx - $prevFx) / $prevFx) * 100.0, 2)
    $minFx = ($fxCloses | Measure-Object -Minimum).Minimum
    $maxFx = ($fxCloses | Measure-Object -Maximum).Maximum
    $pct1Y = if ($maxFx -gt $minFx) { [math]::Round((($curFx - $minFx) / ($maxFx - $minFx)) * 100.0, 0) } else { 50 }
    $ma20  = Get-MovingAverage -Values $fxCloses -Window 20
    $ma60  = Get-MovingAverage -Values $fxCloses -Window 60
    $ma120 = Get-MovingAverage -Values $fxCloses -Window 120

    $fxLight = if ($pct1Y -le 40) { 'green' } elseif ($pct1Y -le 70) { 'yellow' } else { 'red' }
    $fxRec = switch ($fxLight) {
        'green'  { '최근 1년 기준 하단권 · 분할 환전 유리 구간' }
        'yellow' { '최근 1년 중간 구간 · 정기 적립식 분할 환전 적합' }
        'red'    { '최근 1년 상단권 · 환율 부담 높음 (소액 분할 권장)' }
    }

    $existingData.fx.usdKrw = $curFx
    $existingData.fx.changePct = $fxChg
    $existingData.fx.percentile1Y = [int]$pct1Y
    $existingData.fx.ma20 = $ma20
    $existingData.fx.ma60 = $ma60
    $existingData.fx.ma120 = $ma120
    $existingData.fx.high52w = [math]::Round($maxFx, 2)
    $existingData.fx.low52w  = [math]::Round($minFx, 2)
    $existingData.fx.light   = $fxLight
    $existingData.fx.recommendation = $fxRec

    # 최근 60개 포인트 샘플링 저장
    $step = [math]::Max(1, [math]::Floor($fxChart.points.Count / 60))
    $sampled = @()
    for ($i = 0; $i -lt $fxChart.points.Count; $i += $step) {
        $sampled += [PSCustomObject]@{ date = $fxChart.points[$i].date; value = $fxChart.points[$i].close }
    }
    if ($sampled[-1].date -ne $fxChart.points[-1].date) {
        $sampled += [PSCustomObject]@{ date = $fxChart.points[-1].date; value = $fxChart.points[-1].close }
    }
    $existingData.fx.history = $sampled

    $existingData.overview.fxSignal.light = $fxLight
    $existingData.overview.fxSignal.score = [int](100 - $pct1Y)
    $existingData.overview.fxSignal.label = $(if ($fxLight -eq 'green') { '환전 우호적' } elseif ($fxLight -eq 'yellow') { '분할 환전' } else { '환율 부담' })
    $existingData.overview.fxSignal.summary = "원/달러 $([string]::Format('{0:N1}', $curFx))원 (1년 백분위 ${pct1Y}%). ${fxRec}."
}

$dxyChart = Get-YahooChart -Symbol 'DX-Y.NYB' -Range '1mo'
if ($dxyChart.ok -and $dxyChart.points.Count -ge 2) {
    $liveSuccessCount++
    $curDxy = $dxyChart.points[-1].close
    $prevDxy = $dxyChart.points[-2].close
    $existingData.fx.dxy = $curDxy
    $existingData.fx.dxyChangePct = [math]::Round((($curDxy - $prevDxy) / $prevDxy) * 100.0, 2)
}

# 2. VIX 업데이트
$vixChart = Get-YahooChart -Symbol '^VIX' -Range '1mo'
if ($vixChart.ok -and $vixChart.points.Count -ge 1) {
    $liveSuccessCount++
    $curVix = $vixChart.points[-1].close
    $existingData.overview.marketSentiment.vix = $curVix
    foreach ($ind in $existingData.macro.indicators) {
        if ($ind.id -eq 'vix') {
            $ind.value = [string]$curVix
            $ind.light = if ($curVix -lt 18) { 'green' } elseif ($curVix -lt 25) { 'yellow' } else { 'red' }
            $ind.tag   = if ($curVix -lt 18) { '변동성 안정' } elseif ($curVix -lt 25) { '경계 구간' } else { '공포·변동성 확대' }
        }
    }
}

# 3. FRED 주요 거시경제 지표 업데이트
$fredMap = @{
    'fed'    = 'FEDFUNDS'
    'unemp'  = 'UNRATE'
    'spread' = 'T10Y2Y'
}
foreach ($key in $fredMap.Keys) {
    $fr = Get-FredLatest -SeriesId $fredMap[$key]
    if ($fr.ok) {
        $liveSuccessCount++
        foreach ($ind in $existingData.macro.indicators) {
            if ($ind.id -eq $key) {
                $ind.value = "$([math]::Round($fr.value, 2))%"
                $ind.prev  = "$([math]::Round($fr.prev, 2))%"
                $ind.period = $fr.date
            }
        }
    }
}

# 4. 각 ETF 시세·기술적 지표·뉴스·신호등 업데이트
$etfQueryMap = @{
    'VOO'  = 'VOO S&P500 미국증시 ETF'
    'SPLG' = 'SPLG S&P500 미국증시 ETF'
    'SPY'  = 'SPY S&P500 미국증시 ETF'
    'QQQ'  = 'QQQ 나스닥100 미국 기술주 ETF'
    'QQQM' = 'QQQM 나스닥100 ETF'
    'SCHD' = 'SCHD 미국 배당 ETF'
    'SOXX' = 'SOXX 미국 반도체 ETF 엔비디아'
    'SMH'  = 'SMH 반도체 ETF AI'
    'XLK'  = 'XLK 미국 테크 기술주 ETF'
    'TLT'  = 'TLT 미국 장기국채 금리 ETF'
    'SGOV' = 'SGOV 미국 초단기국채 달러 파킹 ETF'
    'GLD'  = 'GLD 금값 국제금시세 ETF'
    'JEPI' = 'JEPI 미국 월배당 커버드콜 ETF'
    'JEPQ' = 'JEPQ 나스닥 월배당 ETF'
    'VTI'  = 'VTI 미국 전체주식 ETF'
    'TQQQ' = 'TQQQ 나스닥 3배 레버리지 ETF'
}

foreach ($etf in $existingData.etfs) {
    $ticker = $etf.ticker
    $chart = Get-YahooChart -Symbol $ticker -Range '1y'
    if ($chart.ok -and $chart.points.Count -gt 20) {
        $liveSuccessCount++
        $closes = @($chart.points | ForEach-Object { [double]$_.close })
        $curPrice = $closes[-1]
        $prevPrice = $closes[-2]
        $chgPct = [math]::Round((($curPrice - $prevPrice) / $prevPrice) * 100.0, 2)
        $high52 = ($closes | Measure-Object -Maximum).Maximum
        $low52  = ($closes | Measure-Object -Minimum).Minimum
        $mdd    = [math]::Round((($curPrice - $high52) / $high52) * 100.0, 2)
        $rsi14  = Get-Rsi14 -Closes $closes
        $ma200  = Get-MovingAverage -Values $closes -Window 200
        $ma200Diff = if ($ma200 -gt 0) { [math]::Round((($curPrice - $ma200) / $ma200) * 100.0, 2) } else { 0.0 }

        $idx1M = [math]::Max(0, $closes.Count - 22)
        $idx3M = [math]::Max(0, $closes.Count - 64)
        $ret1M = [math]::Round((($curPrice - $closes[$idx1M]) / $closes[$idx1M]) * 100.0, 1)
        $ret3M = [math]::Round((($curPrice - $closes[$idx3M]) / $closes[$idx3M]) * 100.0, 1)
        $ret1Y = [math]::Round((($curPrice - $closes[0]) / $closes[0]) * 100.0, 1)

        # ETF 관련 최신 뉴스 수집
        $qText = if ($etfQueryMap.ContainsKey($ticker)) { $etfQueryMap[$ticker] } else { "$ticker 미국 ETF" }
        $freshNews = Get-GoogleNewsRss -Query $qText -Limit 5
        if ($freshNews.Count -gt 0) {
            $etf.news = $freshNews
        }

        # 뉴스 감성 점수 계산
        $posCount = @($etf.news | Where-Object { $_.sentiment -eq 'positive' }).Count
        $negCount = @($etf.news | Where-Object { $_.sentiment -eq 'negative' }).Count
        $newsScore = [math]::Min(95, [math]::Max(15, 50 + ($posCount - $negCount) * 12))

        # 가격 매력도(낙폭 기반) + 기술적 지표(RSI 기반) 점수 계산
        $valScore  = [math]::Min(95, [math]::Max(25, [int](55 + [math]::Abs($mdd) * 2.5)))
        $techScore = if ($rsi14 -lt 35) { 86 } elseif ($rsi14 -lt 48) { 74 } elseif ($rsi14 -lt 62) { 58 } elseif ($rsi14 -lt 72) { 42 } else { 28 }
        $fxBonus   = [int](100 - $existingData.fx.percentile1Y)
        $totalScore = [int][math]::Round($valScore * 0.35 + $techScore * 0.30 + $newsScore * 0.20 + $fxBonus * 0.15)

        $light = if ($totalScore -ge 68) { 'green' } elseif ($totalScore -ge 48) { 'yellow' } else { 'red' }
        $badge = switch ($light) {
            'green'  { '분할매수 매력' }
            'yellow' { '중립 · 적립식 유지' }
            'red'    { '단기 과열 · 변동성 경계' }
        }

        $etf.price = $curPrice
        $etf.changePct = $chgPct
        $etf.high52w = [math]::Round($high52, 2)
        $etf.low52w  = [math]::Round($low52, 2)
        $etf.mddFromHigh = $mdd
        $etf.rsi14 = $rsi14
        $etf.ma200 = $ma200
        $etf.ma200DiffPct = $ma200Diff
        $etf.return1M = $ret1M
        $etf.return3M = $ret3M
        $etf.return1Y = $ret1Y
        $etf.score = $totalScore
        $etf.light = $light
        $etf.actionBadge = $badge
        $etf.breakdown.valuation = $valScore
        $etf.breakdown.technical = $techScore
        $etf.breakdown.newsSentiment = $newsScore
        $etf.breakdown.fxBonus = $fxBonus

        # 60포인트 히스토리 샘플링
        $step = [math]::Max(1, [math]::Floor($chart.points.Count / 60))
        $hist = @()
        for ($i = 0; $i -lt $chart.points.Count; $i += $step) {
            $hist += [PSCustomObject]@{
                date  = $chart.points[$i].date
                close = $chart.points[$i].close
                ma200 = $ma200
            }
        }
        if ($hist[-1].date -ne $chart.points[-1].date) {
            $hist += [PSCustomObject]@{
                date  = $chart.points[-1].date
                close = $chart.points[-1].close
                ma200 = $ma200
            }
        }
        $etf.history = $hist
    }
}

function Test-MostlyKorean {
    param([string]$Text)
    $kr = ([regex]::Matches($Text, '[가-힣]')).Count
    $en = ([regex]::Matches($Text, '[A-Za-z]')).Count
    return ($kr -ge 4 -and $kr -ge ($en * 0.25))
}

function ConvertTo-Korean {
    param([string]$Text)
    $clean = ([string]$Text).Trim()
    if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
    if (Test-MostlyKorean -Text $clean) { return $clean }
    try {
        $q = [Uri]::EscapeDataString($clean)
        $url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=$q"
        $resp = Invoke-RestMethod -Uri $url -Headers @{ 'User-Agent' = $UserAgent } -TimeoutSec 8
        $sb = ''
        foreach ($seg in $resp[0]) { $sb += [string]$seg[0] }
        $sb = $sb.Trim()
        if (Test-MostlyKorean -Text $sb) { return $sb }
    } catch {}
    return $null
}

function Get-SmartSummary {
    param([string]$Title, [string]$RawDesc, [string]$Sentiment)
    $desc = ([string]$RawDesc -replace '<[^>]+>', ' ' -replace '\s+', ' ').Trim()
    if ($desc.Length -ge 18 -and (Test-MostlyKorean -Text $desc) -and -not $desc.StartsWith($Title.Substring(0, [math]::Min(14, $Title.Length)))) {
        if ($desc.Length -gt 92) { return $desc.Substring(0, 91).Trim() + '…' }
        return $desc
    }
    if ($Title -match '관세|무역|중국|유럽|지정학|전쟁|중동') {
        return $(if ($Sentiment -eq 'positive') { '무역·지정학 긴장 완화 조짐 → 글로벌 공급망·증시 투자심리 개선' } else { '관세·지정학 불확실성 확대 → 반도체·다국적 기업 마진 부담 주의' })
    }
    if ($Title -match '연준|금리|FOMC|파월|물가|CPI|PCE|인플레이션') {
        return $(if ($Sentiment -eq 'positive') { '물가 둔화·금리 완화 기대 → 성장주(QQQM)·장기채(TLT)에 우호적' } else { '고물가·긴축 경계 확대 → 기술주 부담, 초단기채(SGOV)·배당주 유리' })
    }
    if ($Title -match '반도체|엔비디아|AI|나스닥|빅테크') {
        return $(if ($Sentiment -eq 'positive') { 'AI·빅테크 실적 및 수요 모멘텀 강화 → QQQM·SOXX·SMH 상승 동력' } else { 'AI 밸류에이션·차익실현 압력 → 반도체·기술주 단기 변동성 주의' })
    }
    return $(if ($Sentiment -eq 'positive') { '미국 증시와 관련 ETF 수급·실적에 긍정적인 모멘텀으로 평가되는 이슈' } elseif ($Sentiment -eq 'negative') { '단기 투자심리 위축 및 변동성 확대 요인으로 분할 대응이 필요한 이슈' } else { '미국 시장 방향성과 섹터 흐름을 점검하기 위해 참고할 핵심 이슈' })
}

function Get-EnglishRssTranslated {
    param([string]$FeedUrl, [string]$SourceName, [int]$Limit = 2)
    $list = @()
    try {
        $resp = Invoke-WebRequest -Uri $FeedUrl -UseBasicParsing -Headers @{ 'User-Agent' = $UserAgent } -TimeoutSec 10
        [xml]$xml = $resp.Content
        $items = $xml.rss.channel.item | Select-Object -First ($Limit + 2)
        foreach ($it in $items) {
            if ($list.Count -ge $Limit) { break }
            $rawTitle = (([string]$it.title) -replace '<[^>]+>', ' ' -replace '\s+', ' ').Trim()
            $rawDesc  = (([string]$it.description) -replace '<[^>]+>', ' ' -replace '\s+', ' ').Trim()
            if ([string]::IsNullOrWhiteSpace($rawTitle)) { continue }
            $koTitle = ConvertTo-Korean -Text $rawTitle
            if ([string]::IsNullOrWhiteSpace($koTitle)) { continue }
            $koDesc = if ($rawDesc.Length -gt 0) { ConvertTo-Korean -Text ($rawDesc.Substring(0, [math]::Min(160, $rawDesc.Length))) } else { '' }
            $sent = Get-SentimentInfo -Text "$rawTitle $koTitle $koDesc"
            $pubDate = ''
            try { $pubDate = ([DateTime]::Parse($it.pubDate)).ToString('MM.dd HH:mm') } catch { $pubDate = (Get-Date).ToString('MM.dd') }
            $list += [PSCustomObject]@{
                title       = $koTitle
                source      = $SourceName
                publishedAt = $pubDate
                sentiment   = $sent.sentiment
                impactLevel = $sent.impact
                summary     = Get-SmartSummary -Title $koTitle -RawDesc $koDesc -Sentiment $sent.sentiment
                url         = [string]$it.link
            }
        }
    } catch {
        Write-Warning "$SourceName RSS 조회 실패: $($_.Exception.Message)"
    }
    return $list
}

# 5. 다매체 글로벌·국제정황 뉴스 (Bloomberg + CNBC + 로이터/WSJ + 국내 경제지, 100% 한글 번역·요약)
$bbNews   = Get-EnglishRssTranslated -FeedUrl 'https://feeds.bloomberg.com/markets/news.rss' -SourceName 'Bloomberg' -Limit 2
$cnbcNews = Get-EnglishRssTranslated -FeedUrl 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664' -SourceName 'CNBC' -Limit 2
$wireNews = Get-GoogleNewsRss -Query '로이터 OR WSJ OR 파이낸셜타임스 미국 증시 연준 관세' -Limit 3
$krNews   = Get-GoogleNewsRss -Query '미국 증시 연준 금리 관세 달러 반도체 국채' -Limit 3
$macroNews = @($bbNews) + @($cnbcNews) + @($wireNews) + @($krNews) | Select-Object -First 8
if ($macroNews.Count -gt 0) {
    $liveSuccessCount++
    $mapped = @()
    $idx = 1
    foreach ($n in $macroNews) {
        $affected = @('VOO', 'QQQ')
        if ($n.title -match '금리|채권|국채|연준') { $affected = @('TLT', 'VOO', 'SCHD') }
        elseif ($n.title -match '반도체|AI|엔비디아|기술') { $affected = @('SOXX', 'SMH', 'QQQ') }
        elseif ($n.title -match '금값|금|안전자산|전쟁|관세') { $affected = @('GLD', 'TLT', 'VOO') }
        $mapped += [PSCustomObject]@{
            id           = "live-$idx"
            title        = $n.title
            source       = $n.source
            publishedAt  = $n.publishedAt
            sentiment    = $n.sentiment
            impactLevel  = $n.impactLevel
            summary      = $n.summary
            affectedEtfs = $affected
            url          = $n.url
        }
        $idx++
    }
    $existingData.macro.globalNews = $mapped
}

# 메타데이터 타임스탬프 갱신
$now = Get-Date
$dayNames = @('일','월','화','수','목','금','토')
$dayKr = $dayNames[[int]$now.DayOfWeek]
$existingData.meta.updatedAt = $now.ToString('yyyy-MM-ddTHH:mm:ss+09:00')
$existingData.meta.updatedLabel = "$($now.ToString('yyyy.MM.dd')) ($dayKr) $($now.ToString('HH:mm')) KST"
$existingData.meta.sourceMode = if ($liveSuccessCount -gt 0) { 'live' } else { 'snapshot' }

$jsonOut = $existingData | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($JsonPath, $jsonOut, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($JsPath, "window.MARKET_DATA = $jsonOut;`n", [System.Text.UTF8Encoding]::new($false))

Write-Host "최신화 완료! (실시간 API 성공 항목: $liveSuccessCount 개, 시각: $($existingData.meta.updatedLabel))" -ForegroundColor Green
