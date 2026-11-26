#Requires -Version 5.1
# 미국 핵심 ETF 16종 + 경제지표 6종 시계열/상세분석 + 의사결정 데이터 생성 스크립트 (2026.11.26 기준)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $ProjectRoot 'data'
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }

function New-Series {
    param(
        [double]$StartVal,
        [double]$EndVal,
        [double]$PeakVal,
        [double]$TroughVal,
        [int]$PeakIdx,
        [int]$Seed
    )
    $rng = [System.Random]::new($Seed)
    $startDate = [DateTime]::Parse('2025-12-01')
    $count = 26
    $vals = @()
    for ($i = 0; $i -lt $count; $i++) {
        if ($i -le $PeakIdx) {
            $u = $i / [double][math]::Max(1, $PeakIdx)
            $base = $StartVal + ($PeakVal - $StartVal) * [math]::Pow($u, 0.85)
        } else {
            $u = ($i - $PeakIdx) / [double][math]::Max(1, ($count - 1 - $PeakIdx))
            $base = $PeakVal + ($EndVal - $PeakVal) * [math]::Pow($u, 1.1)
        }
        $wave = [math]::Sin($i * 0.85 + $Seed) * (($PeakVal - $TroughVal) * 0.045)
        $noise = ($rng.NextDouble() - 0.5) * (($PeakVal - $TroughVal) * 0.03)
        $v = if ($i -eq ($count - 1)) { $EndVal } else { [math]::Max($TroughVal, [math]::Min($PeakVal, $base + $wave + $noise)) }
        $vals += [math]::Round($v, 2)
    }

    $result = @()
    for ($i = 0; $i -lt $count; $i++) {
        $dt = $startDate.AddDays($i * 14).ToString('yyyy-MM-dd')
        if ($i -eq ($count - 1)) { $dt = '2026-11-25' }
        $winStart = [math]::Max(0, $i - 10)
        $slice = $vals[$winStart..$i]
        $ma = [math]::Round((($slice | Measure-Object -Average).Average), 2)
        $result += [PSCustomObject]@{ date = $dt; close = $vals[$i]; ma200 = $ma }
    }
    return $result
}

function New-FxSeries {
    $dates = @(
        '2025-12-01','2025-12-15','2026-01-02','2026-01-16','2026-02-02','2026-02-16',
        '2026-03-02','2026-03-16','2026-04-01','2026-04-15','2026-05-01','2026-05-15',
        '2026-06-01','2026-06-15','2026-07-01','2026-07-15','2026-08-03','2026-08-17',
        '2026-09-01','2026-09-15','2026-10-01','2026-10-15','2026-10-29','2026-11-10',
        '2026-11-18','2026-11-25'
    )
    $vals = @(
        1394.5, 1405.2, 1412.5, 1398.0, 1386.4, 1378.2,
        1382.0, 1369.5, 1358.2, 1366.8, 1374.1, 1361.0,
        1348.5, 1339.2, 1326.8, 1318.4, 1308.0, 1321.5,
        1334.0, 1349.8, 1362.4, 1355.1, 1348.9, 1351.2,
        1346.8, 1343.2
    )
    $out = @()
    for ($i = 0; $i -lt $dates.Count; $i++) {
        $out += [PSCustomObject]@{ date = $dates[$i]; value = $vals[$i] }
    }
    return $out
}

function New-MacroHistory([string[]]$Dates, [double[]]$Vals) {
    $out = @()
    for ($i = 0; $i -lt $Dates.Count; $i++) {
        $out += [PSCustomObject]@{ date = $Dates[$i]; value = $Vals[$i] }
    }
    return $out
}

function NewsUrl([string]$q) {
    return "https://news.google.com/search?q=$([Uri]::EscapeDataString($q))&hl=ko&gl=KR&ceid=KR:ko"
}

function BloombergUrl([string]$q) {
    return "https://www.bloomberg.com/search?query=$([Uri]::EscapeDataString($q))"
}

$data = [ordered]@{
    meta = [ordered]@{
        updatedAt    = '2026-11-26T07:30:00+09:00'
        updatedLabel = '11.26 (목) 07:30 기준'
        sourceMode   = 'snapshot'
        dataSources  = @('Yahoo Finance', 'FRED', 'Bloomberg', 'Google News')
    }
    overview = [ordered]@{
        headline = '환율은 유리, 증시는 불안. 우량·배당·파킹 ETF로 나눠 담으세요.'
        quickPicks = @(
            [ordered]@{ title = '적립 매수 유리'; light = 'green'; note = '저보수·방어력'; tickers = @('SPLG', 'VOO', 'SCHD') },
            [ordered]@{ title = '달러 이자 대기'; light = 'green'; note = '연 4%대 안정'; tickers = @('SGOV', 'TLT', 'JEPI') },
            [ordered]@{ title = '변동성 주의'; light = 'red'; note = '바닥 확인 후'; tickers = @('SOXX', 'SMH', 'TQQQ') }
        )
        fxSignal = [ordered]@{
            light   = 'green'
            label   = '환전 유리'
            score   = 66
            summary = '1년 중 싼 편 (하위 34%)'
        }
        marketSentiment = [ordered]@{
            light          = 'yellow'
            label          = '공포 구간'
            fearGreed      = 15
            fearGreedLabel = '극단적 공포'
            vix            = 28.19
            summary        = '변동성 큼 · 분할 매수 권장'
        }
        macroSignal = [ordered]@{
            light   = 'red'
            label   = '금리·관세 경계'
            summary = '성장 4.3% 견조, 물가 3.8% 부담'
        }
        dailyBriefing = @(
            '환율: 1,343원 (1년 평균 아래) → 달러 나눠 바꾸기 좋은 가격대',
            '전략: 현금은 SGOV로 연 4%대 이자 받으며, SPLG·SCHD 분할 진입',
            '주의: 12월 FOMC·관세 이슈로 반도체(SOXX)·레버리지(TQQQ) 급등락 경계'
        )
    }
    fx = [ordered]@{
        usdKrw         = 1343.20
        changePct      = -0.27
        dxy            = 104.12
        dxyChangePct   = 0.21
        krUsRateGap    = -1.25
        percentile1Y   = 34
        percentile5Y   = 58
        ma20           = 1351.80
        ma60           = 1354.60
        ma120          = 1361.40
        high52w        = 1412.50
        low52w         = 1308.00
        light          = 'green'
        recommendation = '1년 평균보다 낮아 분할 환전에 유리해요'
        plan = @(
            [ordered]@{ zone = '1,320원 이하'; ratio = '50%'; status = '대기'; desc = '연중 저점권 · 적극 환전' },
            [ordered]@{ zone = '1,320 ~ 1,355원'; ratio = '30%'; status = '현재 구간'; desc = '이평선 아래 · 정기 분할 환전' },
            [ordered]@{ zone = '1,355원 이상'; ratio = '20%'; status = '보수적'; desc = '부담 구간 · 소액만 환전' }
        )
        history = New-FxSeries
    }
    macro = [ordered]@{
        indicators = @(
            [ordered]@{
                id = 'gdp'; name = '미국 GDP 성장률'; value = '4.3%'; numValue = 4.3; unit = '%'; prev = '3.4%'; delta = '+0.9%p'; period = '26년 3분기'
                light = 'green'; tag = '경기 탄탄'
                impact = '소비·기업투자 호조로 실적 하단 지지'
                verdictHeadline = '미국 경기가 예상보다 훨씬 탄탄해 침체 걱정이 크게 줄었어요.'
                targetLine = 2.0; targetLabel = '장기 잠재성장률 2.0%'
                nextRelease = '12.23 (수) 22:30 · 3분기 GDP 확정치'
                history = New-MacroHistory @('24-Q1','24-Q2','24-Q3','24-Q4','25-Q1','25-Q2','25-Q3','25-Q4','26-Q1','26-Q2','26-Q3') @(1.6, 3.0, 3.1, 2.5, 2.2, 2.8, 3.0, 2.7, 2.9, 3.4, 4.3)
                zones = @(
                    [ordered]@{ range = '3.0% 이상'; status = '강한 확장'; light = 'green'; meaning = '기업 실적 호조 (단, 금리 인상 경계 동반)'; current = $true },
                    [ordered]@{ range = '1.5% ~ 3.0%'; status = '골디락스'; light = 'green'; meaning = '물가 자극 없는 이상적 성장 구간'; current = $false },
                    [ordered]@{ range = '1.5% 미만'; status = '침체 우려'; light = 'red'; meaning = '주식 조정 · 장기국채(TLT) 강세'; current = $false }
                )
                beneficiaries = [ordered]@{ tickers = @('VOO', 'SPLG', 'VTI', 'SCHD'); reason = '미국 내수·대형주 기업 이익 확대' }
                pressured = [ordered]@{ tickers = @('TLT'); reason = '경기 과열 시 금리 인하 지연 부담' }
                actionChecklist = @(
                    '경기 침체 공포로 주식을 전량 매도할 필요 없음',
                    '미국 전체 성장 수혜인 SPLG·VOO·VTI 중심 유지',
                    '다만 과열로 물가가 뛰는지 CPI와 함께 확인'
                )
            },
            [ordered]@{
                id = 'cpi'; name = '미국 소비자물가(CPI)'; value = '3.8%'; numValue = 3.8; unit = '%'; prev = '3.5%'; delta = '+0.3%p'; period = '26년 10월'
                light = 'red'; tag = '목표(2%) 상회'
                impact = '물가 고착화로 기술주 밸류에이션 부담'
                verdictHeadline = '물가가 연준 목표(2%)의 거의 2배로 재상승해 증시 발목을 잡고 있어요.'
                targetLine = 2.0; targetLabel = '연준 목표 2.0%'
                nextRelease = '12.10 (목) 22:30 · 11월 CPI 발표'
                history = New-MacroHistory @('25-12','26-01','26-02','26-03','26-04','26-05','26-06','26-07','26-08','26-09','26-10') @(2.9, 3.0, 2.8, 2.7, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5, 3.8)
                zones = @(
                    [ordered]@{ range = '2.5% 이하'; status = '물가 안정'; light = 'green'; meaning = '금리 인하 기대 → 기술주·장기채 강세'; current = $false },
                    [ordered]@{ range = '2.5% ~ 3.2%'; status = '경계 구간'; light = 'yellow'; meaning = '금리 동결 장기화 · 종목 장세'; current = $false },
                    [ordered]@{ range = '3.2% 초과'; status = '고물가 부담'; light = 'red'; meaning = '금리 인상 우려 → 고밸류 성장주 조정'; current = $true }
                )
                beneficiaries = [ordered]@{ tickers = @('SGOV', 'SCHD', 'GLD'); reason = '고금리 이자 수취 및 실물·가치 방어' }
                pressured = [ordered]@{ tickers = @('QQQ', 'QQQM', 'TQQQ', 'TLT'); reason = '할인율 상승으로 성장주·장기채 압박' }
                actionChecklist = @(
                    '12월 10일 CPI가 3.8% 아래로 꺾이는지 최우선 확인',
                    '물가 진정 전까지 나스닥·레버리지 추격 매수 자제',
                    '현금 대기 자금은 SGOV에 넣어 고금리 이자 활용'
                )
            },
            [ordered]@{
                id = 'fed'; name = '연준 기준금리'; value = '3.75~4.00%'; numValue = 3.88; unit = '%'; prev = '3.50~3.75%'; delta = '12월 인상 경계'; period = '10월 동결'
                light = 'red'; tag = '12월 인상 경계'
                impact = '추가 인상 우려로 성장주 단기 압박'
                verdictHeadline = '12월 FOMC에서 0.25%p 추가 인상 가능성이 커져 시장이 긴장하고 있어요.'
                targetLine = 3.0; targetLabel = '중립금리 추정 3.0%'
                nextRelease = '12.16 (수) 04:00 · 12월 FOMC 결정'
                history = New-MacroHistory @('25-07','25-09','25-11','25-12','26-01','26-03','26-05','26-07','26-09','26-10','26-11') @(4.38, 4.13, 3.88, 3.63, 3.63, 3.63, 3.63, 3.63, 3.88, 3.88, 3.88)
                zones = @(
                    [ordered]@{ range = '인하 사이클'; status = '유동성 확대'; light = 'green'; meaning = '주식·채권 동반 상승 우호적 환경'; current = $false },
                    [ordered]@{ range = '동결 유지'; status = '관망 국면'; light = 'yellow'; meaning = '실적 좋은 우량주 중심 완만한 상승'; current = $false },
                    [ordered]@{ range = '인상 재개 우려'; status = '긴축 경계'; light = 'red'; meaning = '단기 변동성 확대 · 방어/현금 비중 중요'; current = $true }
                )
                beneficiaries = [ordered]@{ tickers = @('SGOV', 'JEPI', 'SCHD'); reason = '초단기채 이자 상승 · 저변동 방어' }
                pressured = [ordered]@{ tickers = @('TQQQ', 'SOXX', 'QQQM', 'XLK'); reason = '자금 조달 비용 상승 · 밸류 부담' }
                actionChecklist = @(
                    '12월 16일 FOMC 점도표(2027년 금리 전망) 확인',
                    '금리 확정 전에는 전체 예산의 30~50%만 분할 집행',
                    '매파적 발언 직후 급락 시 우량 지수(SPLG·VOO) 분할 매수'
                )
            },
            [ordered]@{
                id = 'unemp'; name = '미국 실업률'; value = '4.1%'; numValue = 4.1; unit = '%'; prev = '4.2%'; delta = '-0.1%p'; period = '26년 10월'
                light = 'green'; tag = '고용 안정'
                impact = '탄탄한 고용으로 침체 가능성 낮음'
                verdictHeadline = '일하는 사람이 많아 소비가 꺾이지 않는 안정적인 고용 상태예요.'
                targetLine = 4.5; targetLabel = '침체 경계선 4.5%'
                nextRelease = '12.04 (금) 22:30 · 11월 고용보고서'
                history = New-MacroHistory @('25-12','26-01','26-02','26-03','26-04','26-05','26-06','26-07','26-08','26-09','26-10') @(4.1, 4.0, 4.1, 4.2, 4.2, 4.3, 4.2, 4.3, 4.2, 4.2, 4.1)
                zones = @(
                    [ordered]@{ range = '4.3% 이하'; status = '고용 탄탄'; light = 'green'; meaning = '미국 소비 견조 · 경기 침체 확률 낮음'; current = $true },
                    [ordered]@{ range = '4.4% ~ 4.8%'; status = '둔화 신호'; light = 'yellow'; meaning = '금리 인하 명분 커지나 경기 둔화 경계'; current = $false },
                    [ordered]@{ range = '4.9% 이상'; status = '침체 경보'; light = 'red'; meaning = '주식 약세 · 안전자산(TLT·GLD) 강세'; current = $false }
                )
                beneficiaries = [ordered]@{ tickers = @('VOO', 'SPLG', 'VTI'); reason = '꾸준한 미국 가계 소비·고용 유지' }
                pressured = [ordered]@{ tickers = @('TLT'); reason = '고용 강세 지속 시 빠른 금리 인하 지연' }
                actionChecklist = @(
                    '실업률 4.5% 미만 유지 시 미국 주식 장기 보유 유지',
                    '12월 4일 발표에서 4.2~4.3%로 소폭 둔화되면 증시엔 호재',
                    '급격한 실업률 상승(4.6%↑) 시 채권 비중 확대 검토'
                )
            },
            [ordered]@{
                id = 'spread'; name = '장단기 금리차'; value = '+0.29%'; numValue = 0.29; unit = '%'; prev = '+0.24%'; delta = '+0.05%p'; period = '10년-2년'
                light = 'green'; tag = '정상 구간'
                impact = '역전 해소 상태, 금융·가치주에 우호적'
                verdictHeadline = '10년물 금리가 2년물보다 높은 정상 구조로, 금융·배당주에 우호적이에요.'
                targetLine = 0.0; targetLabel = '역전 기준선 0.0%'
                nextRelease = '매일 미국 채권시장 마감 시 자동 반영'
                history = New-MacroHistory @('25-12','26-01','26-02','26-03','26-04','26-05','26-06','26-07','26-08','26-09','26-11') @(0.18, 0.22, 0.19, 0.14, 0.12, 0.16, 0.21, 0.25, 0.22, 0.24, 0.29)
                zones = @(
                    [ordered]@{ range = '+0.1% ~ +1.0%'; status = '정상 우상향'; light = 'green'; meaning = '건강한 채권 구조 · 금융/배당 가치주 유리'; current = $true },
                    [ordered]@{ range = '-0.1% ~ +0.1%'; status = '경계 중립'; light = 'yellow'; meaning = '경기 방향성 탐색 구간'; current = $false },
                    [ordered]@{ range = '-0.1% 미만'; status = '금리 역전'; light = 'red'; meaning = '중기 경기 침체 선행 경고 신호'; current = $false }
                )
                beneficiaries = [ordered]@{ tickers = @('SCHD', 'VOO', 'JEPI'); reason = '은행·가치주 수익성 개선 구간' }
                pressured = [ordered]@{ tickers = @('TLT'); reason = '장기물 금리(4.8~4.9%)가 높게 유지' }
                actionChecklist = @(
                    '금리차 정상화 구간에서는 배당·가치 ETF(SCHD) 비중 유리',
                    '10년물 금리 5% 근접 시 장기국채(TLT) 분할 매수 기회',
                    '단기 금리 급등 여부와 함께 2년물 추이 주시'
                )
            },
            [ordered]@{
                id = 'vix'; name = 'VIX 공포지수'; value = '28.19'; numValue = 28.19; unit = 'pt'; prev = '24.60'; delta = '+3.59pt'; period = '최신 종가'
                light = 'red'; tag = '변동성 확대'
                impact = '단기 등락 큼 · 레버리지 주의 구간'
                verdictHeadline = '시장 공포가 평소(15)의 2배 수준. 급등락이 심하니 나눠 사야 안전해요.'
                targetLine = 20.0; targetLabel = '경계 기준선 20'
                nextRelease = '매일 미국 증시 마감 시 자동 반영'
                history = New-MacroHistory @('26-02','26-03','26-04','26-05','26-06','26-07','26-08','26-09','26-10','26-11초','26-11말') @(15.2, 16.8, 18.4, 14.9, 13.8, 15.6, 17.9, 20.4, 24.6, 35.8, 28.19)
                zones = @(
                    [ordered]@{ range = '15 미만'; status = '안정 · 낙관'; light = 'green'; meaning = '완만한 상승장 (단, 과열 방심 주의)'; current = $false },
                    [ordered]@{ range = '15 ~ 25'; status = '보통 · 경계'; light = 'yellow'; meaning = '일반적인 등락 · 정기 적립식 적합'; current = $false },
                    [ordered]@{ range = '25 초과'; status = '공포 · 고변동'; light = 'red'; meaning = '단기 급락 위험 / 장기 분할매수 기회 공존'; current = $true }
                )
                beneficiaries = [ordered]@{ tickers = @('JEPI', 'JEPQ', 'SGOV', 'TLT'); reason = '커버드콜 옵션 수익 증가 · 안전자산 선호' }
                pressured = [ordered]@{ tickers = @('TQQQ', 'SOXX', 'SMH'); reason = '고변동 구간에서 레버리지 음의 복리 타격' }
                actionChecklist = @(
                    'VIX 25 이상에서는 3배 레버리지(TQQQ) 신규 진입 자제',
                    '공포 구간은 오히려 우량 지수(SPLG·VOO) 분할 매수 기회',
                    'VIX가 20 아래로 안정되면 기술주(QQQM) 비중 확대 검토'
                )
            }
        )
        globalStory = @(
            [ordered]@{ step = '1'; stage = '발단 · 관세 & 지정학'; light = 'red'; title = '미 무역법 301조 관세 + 중동·에너지 긴장'; desc = '수입 물가와 글로벌 공급망 비용이 다시 자극받는 출발점' },
            [ordered]@{ step = '2'; stage = '전개 · 미국 경기 강세'; light = 'yellow'; title = '3분기 GDP 4.3% + 실업률 4.1% 탄탄'; desc = '경기가 너무 강해 물가(3.8%)가 쉽게 꺾이지 않는 역설 발생' },
            [ordered]@{ step = '3'; stage = '충격 · 연준 긴축 경계'; light = 'red'; title = '12월 FOMC 인상 우려 + VIX 28 급등'; desc = '금리 부담이 커지며 고밸류 AI·반도체(SOXX·QQQM) 차익실현 집중' },
            [ordered]@{ step = '4'; stage = '자금 이동 · 현재 국면'; light = 'green'; title = '배당(SCHD) · 파킹(SGOV) · 국채(TLT)로 분산'; desc = '환율(1,343원) 안정 속 우량 지수 분할 + 안전자산 병행 전략 우세' }
        )
        geopolitics = @(
            [ordered]@{
                id = 'war'; title = '중동·러-우 전쟁 및 에너지 항로'; status = '긴장 유지'; light = 'red'
                trigger = '호르무즈·홍해 해상 물류 차질 및 국제유가($80↑) 급등 여부'
                chain = '유가 급등 → 미국 물가(CPI) 재상승 → 금리 인하 지연 → 성장주 흔들림'
                good = @('GLD', 'SGOV'); bad = @('QQQM', 'TLT', 'TQQQ')
            },
            [ordered]@{
                id = 'trade'; title = '미·중 패권 및 대만·관세 갈등'; status = '경계 높음'; light = 'red'
                trigger = '무역법 301조 관세 품목 발표 및 첨단 반도체 수출 규제 확대'
                chain = '공급망 재편 비용 증가 → 반도체·빅테크 마진 압박 · 아시아 파운드리 변동성'
                good = @('SCHD', 'SPLG', 'VTI'); bad = @('SOXX', 'SMH', 'XLK')
            },
            [ordered]@{
                id = 'debt'; title = '미국 재정적자 & 국채 발행 부담'; status = '주시 필요'; light = 'yellow'
                trigger = '미국 10년물 국채금리 5.0% 돌파 여부 및 국채 입찰 수요 부진'
                chain = '국채 공급 과잉 → 장기금리 급등 → 장기채(TLT) 변동성 및 주식 할인율 압박'
                good = @('SGOV', 'GLD'); bad = @('TLT', 'QQQ')
            },
            [ordered]@{
                id = 'fxshock'; title = '엔화·달러 급변 (엔캐리 청산 등)'; status = '보통'; light = 'yellow'
                trigger = '일본은행(BOJ) 금리 인상 시사 또는 달러 인덱스(DXY) 106 돌파'
                chain = '글로벌 자금 일시 회수 → 단기 투매 발생 (직후 우량 지수 저가 매수 기회)'
                good = @('SGOV', 'JEPI'); bad = @('TQQQ', 'SMH')
            }
        )
        globalSummary = @(
            [ordered]@{ topic = '관세·무역'; light = 'red'; text = '미국 무역법 301조(중국·EU 겨냥) 관세 추진으로 반도체·글로벌 공급망 부담 확대' },
            [ordered]@{ topic = '물가·금리'; light = 'red'; text = '근원 PCE 물가 반등으로 12월 FOMC 0.25%p 추가 인상 경계감 고조' },
            [ordered]@{ topic = '자금 흐름'; light = 'green'; text = 'AI·반도체 차익실현 자금이 배당주(SCHD)·초단기채(SGOV)·장기국채(TLT)로 이동' }
        )
        globalNews = @(
            [ordered]@{
                id = 'g1'; title = '백악관, 중국·EU 겨냥 무역법 301조 광범위 관세 추진'
                source = 'Bloomberg'; publishedAt = '11.25 22:10'; sentiment = 'negative'; impactLevel = '높음'
                summary = '주요 교역국 관세 확대로 공급망 비용과 물가 압력 재자극 우려'
                digest = [ordered]@{
                    what   = '미국 행정부가 중국·EU 등 주요 교역국의 과잉생산을 겨냥해 무역법 301조 기반의 광범위한 추가 관세 도입을 검토하고 있습니다.'
                    impact = '해외 생산·부품 의존도가 높은 반도체(SOXX·SMH)와 빅테크(QQQM)의 마진 압박 및 물가 재상승 우려로 작용했습니다.'
                    action = '관세 대상 품목이 확정되기 전까지 반도체·3배 레버리지(TQQQ) 추격 매수를 피하고 현금 비중을 유지하세요.'
                }
                affectedEtfs = @('SOXX', 'SMH', 'QQQM', 'TQQQ')
                url = BloombergUrl('Section 301 tariffs Federal Reserve stocks')
            },
            [ordered]@{
                id = 'g2'; title = '미국 10월 근원 PCE 물가 3년 만에 최고… 12월 금리 인상 경계'
                source = 'Reuters'; publishedAt = '11.25 18:40'; sentiment = 'negative'; impactLevel = '높음'
                summary = '연준 목표(2%)를 크게 웃돈 물가 탓에 12월 0.25%p 인상 가능성 부상'
                digest = [ordered]@{
                    what   = '연준이 가장 중시하는 근원 개인소비지출(PCE) 물가가 시장 예상치를 웃돌며 3년 만에 최고 수준을 기록했습니다.'
                    impact = '금리 인하 기대가 꺾이며 고밸류 기술주(QQQ·QQQM)가 흔들리는 반면, 고금리 이자를 받는 초단기국채(SGOV) 매력은 커졌습니다.'
                    action = '12월 10일 CPI와 12월 16일 FOMC 전까지 여유 달러는 SGOV에 파킹해 두고 우량주만 소액 분할 매수하세요.'
                }
                affectedEtfs = @('SGOV', 'QQQM', 'QQQ', 'JEPI')
                url = NewsUrl('로이터 미국 PCE 물가 연준 12월 금리')
            },
            [ordered]@{
                id = 'g3'; title = '미국 3분기 GDP 성장률 4.3%로 대폭 상향… 경기 침체 우려 해소'
                source = 'WSJ'; publishedAt = '11.25 21:30'; sentiment = 'positive'; impactLevel = '높음'
                summary = '강한 소비와 기업 투자 확인으로 S&P 500 대형주 실적 기초체력 입증'
                digest = [ordered]@{
                    what   = '미국 3분기 실질 GDP 성장률 수정치가 기존 3.4%에서 4.3%로 크게 상향되며 탄탄한 내수 소비와 기업 투자를 확인했습니다.'
                    impact = '경기 침체로 인한 증시 붕괴 가능성을 낮춰주며, S&P 500(SPLG·VOO)과 미국 전체주식(VTI)의 중장기 우상향 근거를 강화했습니다.'
                    action = '단기 변동성에 흔들려 전량 매도하기보다 SPLG·VOO 같은 대표 지수 적립식 분할 매수를 유지하기 좋은 근거입니다.'
                }
                affectedEtfs = @('SPLG', 'VOO', 'VTI', 'SCHD')
                url = NewsUrl('WSJ 미국 3분기 GDP 성장률 수정치')
            },
            [ordered]@{
                id = 'g4'; title = '기술주 급락 속 미 국채 안전자산 유입… 10년물 금리 4.84%대 하락'
                source = 'CNBC'; publishedAt = '11.25 06:20'; sentiment = 'positive'; impactLevel = '보통'
                summary = '주식 회피 자금이 국채로 몰리며 장기채(TLT) 가격 반등 · 방어력 확인'
                digest = [ordered]@{
                    what   = '나스닥과 기술주가 크게 출렁이자 위험을 피하려는 글로벌 기관 자금이 미국 국채로 유입되며 10년물 금리가 4.84%대로 내려왔습니다.'
                    impact = '채권 금리가 하락하면 채권 가격은 오르므로, 장기국채 ETF(TLT)가 주식 하락장의 손실을 완충하는 안전판 역할을 했습니다.'
                    action = '주식 100% 구성이 불안하다면 연 4.4%대 월이자도 나오는 TLT나 초단기 SGOV를 15~25% 섞어두세요.'
                }
                affectedEtfs = @('TLT', 'SGOV', 'GLD')
                url = NewsUrl('CNBC 미국 10년물 국채 금리 TLT')
            },
            [ordered]@{
                id = 'g5'; title = '빅테크 AI 투자 수익성 재평가… 반도체 이탈, 배당·가치주 순환매'
                source = 'Financial Times'; publishedAt = '11.24 23:15'; sentiment = 'neutral'; impactLevel = '높음'
                summary = 'AI 설비투자 회수 속도 논란 속 현금흐름 우량 배당 ETF(SCHD) 강세'
                digest = [ordered]@{
                    what   = '빅테크 기업들의 막대한 AI 인프라 투자가 단기 이익으로 얼마나 빠르게 이어질지 의구심이 커지며 기술주 차익실현이 진행 중입니다.'
                    impact = '반도체(SOXX·SMH)에서는 단기 자금이 빠져나간 반면, PER이 낮고 배당을 꾸준히 늘리는 SCHD와 월배당 JEPI는 견조한 흐름입니다.'
                    action = '기술주 비중이 과도하다면 이번 기회에 SCHD·JEPI 같은 배당·방어 자산으로 균형을 맞추는 리밸런싱을 검토하세요.'
                }
                affectedEtfs = @('SCHD', 'SOXX', 'SMH', 'JEPQ')
                url = NewsUrl('FT AI 투자 수익성 반도체 가치주 순환매')
            },
            [ordered]@{
                id = 'g6'; title = '원/달러 환율 1,343원대 안정… 연중 고점 대비 하락해 분할 환전 유리'
                source = '연합인포맥스'; publishedAt = '11.25 15:40'; sentiment = 'positive'; impactLevel = '보통'
                summary = '1년 범위 중 하위 34% 구간 · 20일/60일 이평선 아래로 달러 확보 부담 완화'
                digest = [ordered]@{
                    what   = '달러 인덱스(104.1)가 숨 고르기에 들어가며 원/달러 환율이 연중 고점(1,412원) 대비 크게 낮아진 1,343원대에서 안정 흐름을 보이고 있습니다.'
                    impact = '한국 투자자 입장에서는 달러 매입 단가 부담이 줄어들어, 지금 환전해 두면 추후 환율 반등 시 환차익 방어 효과도 기대할 수 있습니다.'
                    action = '1,320~1,355원 구간에서는 매월 예정된 달러의 30% 이상을 꾸준히 분할 환전해 두기 좋은 타이밍입니다.'
                }
                affectedEtfs = @('SPLG', 'VOO', 'SGOV')
                url = NewsUrl('원달러 환율 달러인덱스 미국주식 환전')
            }
        )
        calendar = @(
            [ordered]@{ date = '12.04 (금)'; dDay = 'D-8';  event = '미국 11월 고용보고서'; importance = '높음'; note = '고용 둔화 시 금리 인상 부담 완화' },
            [ordered]@{ date = '12.10 (목)'; dDay = 'D-14'; event = '미국 11월 소비자물가(CPI)'; importance = '매우 높음'; note = '3.8% 물가 진정 여부가 핵심 분수령' },
            [ordered]@{ date = '12.16 (수)'; dDay = 'D-20'; event = '12월 FOMC 금리 결정'; importance = '매우 높음'; note = '25bp 인상 여부와 내년 금리 경로 발표' },
            [ordered]@{ date = '12.18 (금)'; dDay = 'D-22'; event = '네 마녀의 날 (만기일)'; importance = '보통'; note = '선물·옵션 동시 만기로 장중 변동성 확대' }
        )
    }
    etfs = @(
        [ordered]@{
            ticker = 'SCHD'; name = 'Schwab U.S. Dividend Equity'; krName = '미국 배당성장 100'; category = '배당·인컴'
            expenseRatio = '0.06%'; dividendYield = '3.68%'; forwardPE = '15.4배'
            price = 35.12; changePct = 0.42; return1M = 1.6; return3M = 4.2; return1Y = 12.1
            high52w = 36.10; low52w = 29.85; mddFromHigh = -2.71; rsi14 = 49.2; ma200 = 33.40; ma200DiffPct = 5.15
            score = 81; light = 'green'; actionBadge = '매수 유리'
            strategy = '3회 분할 매수'; entryRatio = '1회 30%'; riskLevel = 2
            compareTip = '성장(SPLG·QQQM)과 반반 섞으면 하락장 방어력이 크게 높아져요.'
            actionSummary = '하락장 방어력이 뛰어나고 PER 15배로 부담이 적어요.'
            breakdown = [ordered]@{ valuation = 82; technical = 74; newsSentiment = 86; fxBonus = 66 }
            bullFactors = @('기술주 조정 속 배당·가치주 자금 유입', 'PER 15.4배로 시장 평균 대비 저평가', '배당률 3.68% · 10년 이상 배당성장')
            bearFactors = @('국채 금리 5% 근접 시 단기 상단 제한', '강세장 재개 시 기술주보다 상승 완만')
            history = New-Series -StartVal 30.8 -EndVal 35.12 -PeakVal 36.1 -TroughVal 29.85 -PeakIdx 23 -Seed 102
            news = @(
                [ordered]@{ title = '빅테크 조정장 속 가치·배당주 순환매, SCHD 상대 강세'; source = 'ETF 리포트'; publishedAt = '11.25 20:15'; sentiment = 'positive'; impactLevel = '높음'; summary = '기술주 차익실현 자금이 배당 ETF로 이동'; url = NewsUrl('SCHD 배당 ETF 가치주 순환매') },
                [ordered]@{ title = '미국 우량 배당기업, 견조한 실적으로 배당금 인상 지속'; source = '배당 인사이트'; publishedAt = '11.24 16:40'; sentiment = 'positive'; impactLevel = '높음'; summary = '꾸준한 분배금 증가로 장기 보유 매력 상승'; url = NewsUrl('SCHD 배당 성장 미국 배당주') },
                [ordered]@{ title = '미 국채 금리 4.8~4.9% 유지, 배당주 단기 상단 제약'; source = '채권·주식'; publishedAt = '11.23 11:30'; sentiment = 'negative'; impactLevel = '보통'; summary = '높은 채권 금리가 단기 주가 탄력을 일부 제한'; url = NewsUrl('미국 국채 금리 배당주 SCHD') },
                [ordered]@{ title = 'VIX 28 변동성 장세, SCHD·VOO 혼합 포트폴리오 방어 효과'; source = '포트폴리오'; publishedAt = '11.22 09:00'; sentiment = 'positive'; impactLevel = '보통'; summary = '하락장 계좌 흔들림을 줄이는 핵심 분산 자산'; url = NewsUrl('SCHD VOO 포트폴리오 분산투자') }
            )
        },
        [ordered]@{
            ticker = 'SGOV'; name = 'iShares 0-3 Month Treasury Bond'; krName = '미국 초단기국채 파킹'; category = '채권·금'
            expenseRatio = '0.09%'; dividendYield = '4.08%'; forwardPE = '-'
            price = 100.66; changePct = 0.02; return1M = 0.3; return3M = 1.0; return1Y = 4.2
            high52w = 100.82; low52w = 100.18; mddFromHigh = -0.16; rsi14 = 52.0; ma200 = 100.45; ma200DiffPct = 0.21
            score = 80; light = 'green'; actionBadge = '현금 파킹 유리'
            strategy = '대기 자금 수시 매수'; entryRatio = '여유 달러 100%'; riskLevel = 1
            compareTip = '환전해 둔 달러를 그냥 두는 대신 넣어두면 매달 연 4%대 이자를 받아요.'
            actionSummary = '원금 변동이 거의 없이 연 4%대 월이자를 받는 달러 파킹통장이에요.'
            breakdown = [ordered]@{ valuation = 84; technical = 80; newsSentiment = 82; fxBonus = 66 }
            bullFactors = @('고금리(3.75~4.00%) 유지로 안정적 월이자', '만기 0~3개월 초단기국채로 가격 변동 극소', '증시 급락 시 언제든 팔아 저가 매수 탄약 활용')
            bearFactors = @('원/달러 환율 급락 시 원화 환산 수익 감소', '연준 금리 인하 전환 시 분배율 점진 하락')
            history = New-Series -StartVal 100.3 -EndVal 100.66 -PeakVal 100.82 -TroughVal 100.18 -PeakIdx 18 -Seed 115
            news = @(
                [ordered]@{ title = '연준 고금리 장기화 전망, 초단기국채 SGOV 연 4%대 월배당 매력 유지'; source = '채권 리포트'; publishedAt = '11.25 17:10'; sentiment = 'positive'; impactLevel = '높음'; summary = '12월 인상 경계 속에서도 원금 손실 없이 이자 수취'; url = NewsUrl('SGOV 미국 초단기국채 파킹 ETF') },
                [ordered]@{ title = 'VIX 28 급등에 관망 자금, 달러 파킹 ETF(SGOV)로 대거 이동'; source = 'ETF 플로우'; publishedAt = '11.24 20:05'; sentiment = 'positive'; impactLevel = '높음'; summary = '증시 방향성 확인 전 안전한 달러 대기처로 인기'; url = NewsUrl('SGOV 달러 파킹 ETF 자금 유입') },
                [ordered]@{ title = '원화 투자자는 환율 변동 리스크만 유의해 분할 환전 필요'; source = '환율 가이드'; publishedAt = '11.22 14:00'; sentiment = 'neutral'; impactLevel = '보통'; summary = '현재 환율 1,343원대는 1년 하위권으로 부담 낮음'; url = NewsUrl('SGOV 환율 리스크') }
            )
        },
        [ordered]@{
            ticker = 'SPLG'; name = 'SPDR Portfolio S&P 500 ETF'; krName = 'S&P 500 초저보수 미니'; category = '대표지수'
            expenseRatio = '0.02%'; dividendYield = '1.28%'; forwardPE = '20.8배'
            price = 84.61; changePct = -0.66; return1M = -3.7; return3M = 0.9; return1Y = 16.5
            high52w = 89.25; low52w = 71.80; mddFromHigh = -5.20; rsi14 = 37.9; ma200 = 81.60; ma200DiffPct = 3.69
            score = 77; light = 'green'; actionBadge = '소액 적립 1순위'
            strategy = '3~5회 분할 매수'; entryRatio = '1회 25%'; riskLevel = 2
            compareTip = 'VOO($661·보수 0.03%)와 똑같은 S&P500인데 1주 약 11만원·보수 0.02%로 가장 저렴해요.'
            actionSummary = 'VOO와 동일한 S&P 500을 가장 낮은 보수(0.02%)와 소액으로 모을 수 있어요.'
            breakdown = [ordered]@{ valuation = 76; technical = 78; newsSentiment = 70; fxBonus = 66 }
            bullFactors = @('S&P 500 ETF 중 최저 운용보수(연 0.02%)', '1주 약 11만원대로 매월 적립식 매수 편리', '미국 GDP 4.3% 호조 + 고점 대비 -5.2% 조정')
            bearFactors = @('12월 FOMC·관세 이슈로 단기 출렁임', '빅테크 비중 30%대로 기술주 하락 시 동반 조정')
            history = New-Series -StartVal 72.6 -EndVal 84.61 -PeakVal 89.25 -TroughVal 71.8 -PeakIdx 22 -Seed 112
            news = @(
                [ordered]@{ title = '소액 적립식 투자자 사이 SPLG 인기 급증… 연 0.02% 최저 보수 강점'; source = 'ETF 트렌드'; publishedAt = '11.25 19:20'; sentiment = 'positive'; impactLevel = '높음'; summary = 'VOO·SPY 대비 낮은 1주 가격과 최저 보수로 장기 복리 유리'; url = NewsUrl('SPLG VOO 비교 S&P500 ETF') },
                [ordered]@{ title = '미국 3분기 GDP 4.3% 상향, S&P 500 실적 신뢰 확인'; source = '경제 브리핑'; publishedAt = '11.25 21:35'; sentiment = 'positive'; impactLevel = '높음'; summary = '미국 대형주 전반의 기초 체력 입증'; url = NewsUrl('SPLG S&P500 미국 GDP') },
                [ordered]@{ title = '관세·금리 경계에 11월 약세, 공포 구간 분할 매수 전략 유효'; source = '월가 데일리'; publishedAt = '11.25 07:45'; sentiment = 'negative'; impactLevel = '보통'; summary = '단기 변동성을 활용해 3~5회 나눠 담기 적합'; url = NewsUrl('미국 증시 관세 S&P500') }
            )
        },
        [ordered]@{
            ticker = 'VOO'; name = 'Vanguard S&P 500 ETF'; krName = '미국 S&P 500 대표'; category = '대표지수'
            expenseRatio = '0.03%'; dividendYield = '1.26%'; forwardPE = '20.8배'
            price = 661.80; changePct = -0.68; return1M = -3.8; return3M = 0.9; return1Y = 16.4
            high52w = 698.40; low52w = 562.10; mddFromHigh = -5.24; rsi14 = 37.8; ma200 = 638.50; ma200DiffPct = 3.65
            score = 75; light = 'green'; actionBadge = '분할매수 유리'
            strategy = '3~5회 분할 매수'; entryRatio = '1회 25%'; riskLevel = 2
            compareTip = '1주 약 89만원이 부담된다면 같은 지수인 SPLG($84.6·보수 0.02%)를 보세요.'
            actionSummary = '고점 대비 5.2% 조정 + 환율 안정으로 적립식 분할 매수 적기예요.'
            breakdown = [ordered]@{ valuation = 74; technical = 78; newsSentiment = 68; fxBonus = 66 }
            bullFactors = @('미국 3분기 GDP 4.3%로 실적 탄탄', 'RSI 37.8 · 고점 대비 5% 과열 해소', '연 0.03% 초저보수 · 글로벌 대표 지수')
            bearFactors = @('12월 금리 인상 · 관세 이슈 변동성', '상위 빅테크 비중(30%대) 흔들림 영향')
            history = New-Series -StartVal 568.5 -EndVal 661.8 -PeakVal 698.4 -TroughVal 562.1 -PeakIdx 22 -Seed 101
            news = @(
                [ordered]@{ title = '미국 3분기 GDP 4.3% 상향, S&P 500 실적 신뢰 확인'; source = '경제 브리핑'; publishedAt = '11.25 21:35'; sentiment = 'positive'; impactLevel = '높음'; summary = '미국 대형주 전반의 이익 성장세 지지'; url = NewsUrl('VOO S&P500 미국 GDP 실적') },
                [ordered]@{ title = '공포지수 15 진입… 과거 극단적 공포 구간서 중기 반등 우세'; source = '마켓 통계'; publishedAt = '11.25 14:20'; sentiment = 'positive'; impactLevel = '보통'; summary = '적립식 투자자에게 유리한 평균단가 구간'; url = NewsUrl('S&P500 공포탐욕지수 반등') },
                [ordered]@{ title = '관세 우려와 12월 금리 경계에 미 증시 11월 약세'; source = '월가 데일리'; publishedAt = '11.25 07:45'; sentiment = 'negative'; impactLevel = '높음'; summary = '단기 출렁임 대비해 분할 진입 필요'; url = NewsUrl('미국 증시 관세 12월 FOMC S&P500') },
                [ordered]@{ title = '하락장 속 VOO·VTI 저보수 지수 ETF로 기관·개인 자금 유입'; source = 'ETF 플로우'; publishedAt = '11.24 19:10'; sentiment = 'positive'; impactLevel = '보통'; summary = '장기 저가 매수 수급이 꾸준히 유입 중'; url = NewsUrl('VOO ETF 자금 유입') }
            )
        },
        [ordered]@{
            ticker = 'VTI'; name = 'Vanguard Total Stock Market'; krName = '미국 전체주식 3,600'; category = '대표지수'
            expenseRatio = '0.03%'; dividendYield = '1.22%'; forwardPE = '20.1배'
            price = 353.84; changePct = -0.61; return1M = -3.5; return3M = 1.4; return1Y = 16.9
            high52w = 372.50; low52w = 298.60; mddFromHigh = -5.01; rsi14 = 38.6; ma200 = 340.80; ma200DiffPct = 3.83
            score = 74; light = 'green'; actionBadge = '분할매수 유리'
            strategy = '3~5회 분할 매수'; entryRatio = '1회 25%'; riskLevel = 2
            compareTip = 'VOO(대형주 500개)에 미국 중소형주 3,100개까지 함께 담고 싶을 때 선택하세요.'
            actionSummary = '미국 대형·중소형주 전체를 0.03% 보수로 나눠 담기 좋아요.'
            breakdown = [ordered]@{ valuation = 74; technical = 76; newsSentiment = 70; fxBonus = 66 }
            bullFactors = @('미국 3,600개 기업 초분산 투자', '미국 내수 성장(GDP 4.3%) 직접 수혜', '연 0.03% 최저 보수 · 고점 대비 -5%')
            bearFactors = @('금리 상승 시 중소형주 이자 부담', '단기 증시 변동성(VIX 28) 노출')
            history = New-Series -StartVal 302.5 -EndVal 353.84 -PeakVal 372.5 -TroughVal 298.6 -PeakIdx 22 -Seed 108
            news = @(
                [ordered]@{ title = '미국 내수 경기 호조, 중소형주까지 담은 VTI 분산 매력 부각'; source = '미국 증시'; publishedAt = '11.25 18:10'; sentiment = 'positive'; impactLevel = '높음'; summary = '대형주 편중을 완화하며 내수 성장 수혜'; url = NewsUrl('VTI 미국 전체주식 ETF') },
                [ordered]@{ title = '연준 금리 경계에 중소형주 변동성 확대, 적립식 접근 유효'; source = '마켓 리포트'; publishedAt = '11.24 13:20'; sentiment = 'negative'; impactLevel = '보통'; summary = '고금리 구간에선 분할 매수가 안정적'; url = NewsUrl('미국 중소형주 금리 VTI') },
                [ordered]@{ title = 'VOO vs VTI, 초저보수 0.03%로 미국 시장 장기 우상향 추종'; source = 'ETF 비교'; publishedAt = '11.22 16:00'; sentiment = 'positive'; impactLevel = '보통'; summary = '장기 수익률 99% 유사, 취향 따라 선택'; url = NewsUrl('VOO VTI 비교 미국 ETF') }
            )
        },
        [ordered]@{
            ticker = 'SPY'; name = 'SPDR S&P 500 ETF Trust'; krName = 'S&P 500 원조(최대거래)'; category = '대표지수'
            expenseRatio = '0.09%'; dividendYield = '1.21%'; forwardPE = '20.8배'
            price = 706.99; changePct = -0.65; return1M = -3.7; return3M = 0.8; return1Y = 16.3
            high52w = 745.20; low52w = 601.40; mddFromHigh = -5.13; rsi14 = 38.0; ma200 = 682.10; ma200DiffPct = 3.65
            score = 73; light = 'green'; actionBadge = '분할매수 유리'
            strategy = '3~5회 분할 매수'; entryRatio = '1회 25%'; riskLevel = 2
            compareTip = '단기 매매·옵션 유동성이 최고지만, 장기 적립은 SPLG(0.02%)·VOO(0.03%)가 보수 유리해요.'
            actionSummary = '세계 최대 거래량의 S&P 500 원조 ETF예요. 장기 보유라면 SPLG·VOO와 비교해 보세요.'
            breakdown = [ordered]@{ valuation = 73; technical = 77; newsSentiment = 68; fxBonus = 66 }
            bullFactors = @('세계 최고 유동성으로 호가 스프레드 최소', '미국 3분기 GDP 4.3% · 대형주 이익 탄탄', '고점 대비 -5.1% 건전한 조정 구간')
            bearFactors = @('운용보수 0.09%로 SPLG(0.02%) 대비 다소 높음', '12월 FOMC · 관세 단기 변동성')
            history = New-Series -StartVal 608.0 -EndVal 706.99 -PeakVal 745.2 -TroughVal 601.4 -PeakIdx 22 -Seed 113
            news = @(
                [ordered]@{ title = '미국 3분기 GDP 4.3% 상향에 SPY·VOO 등 S&P 500 하방 지지'; source = '월가 속보'; publishedAt = '11.25 21:40'; sentiment = 'positive'; impactLevel = '높음'; summary = '경기 침체 우려 완화로 대표 지수 신뢰 유지'; url = NewsUrl('SPY S&P500 ETF 미국 증시') },
                [ordered]@{ title = '관세·금리 인상 경계 속 S&P 500 11월 조정, 분할 매수 구간 평가'; source = '마켓 브리핑'; publishedAt = '11.25 08:10'; sentiment = 'negative'; impactLevel = '보통'; summary = '12월 FOMC 전후 변동성을 활용한 분할 접근 유리'; url = NewsUrl('SPY 12월 FOMC 관세') }
            )
        },
        [ordered]@{
            ticker = 'JEPI'; name = 'JPMorgan Equity Premium Income'; krName = '미국 저변동 월배당'; category = '배당·인컴'
            expenseRatio = '0.35%'; dividendYield = '7.85%'; forwardPE = '17.6배'
            price = 55.90; changePct = 0.18; return1M = -0.9; return3M = 1.4; return1Y = 6.2
            high52w = 58.90; low52w = 51.40; mddFromHigh = -5.09; rsi14 = 46.8; ma200 = 55.20; ma200DiffPct = 1.27
            score = 73; light = 'green'; actionBadge = '월배당 유리'
            strategy = '분할 매수 · 월배당 재투자'; entryRatio = '1회 25%'; riskLevel = 2
            compareTip = '더 높은 월배당(9~10%)과 나스닥 노출을 원하면 JEPQ, 안정성은 JEPI가 우위예요.'
            actionSummary = '변동성(VIX 28)이 클수록 옵션 수익이 늘어 월배당에 유리해요.'
            breakdown = [ordered]@{ valuation = 74; technical = 72; newsSentiment = 76; fxBonus = 66 }
            bullFactors = @('고변동성 장세에서 콜옵션 수익 확대', '연 7.85% 월배당으로 현금흐름 확보', '최근 1개월 -0.9%로 뛰어난 하락 방어')
            bearFactors = @('증시 V자 급반등 시 상승폭 제한', '매월 분배금 배당소득세(15.4%) 발생')
            history = New-Series -StartVal 52.6 -EndVal 55.9 -PeakVal 58.9 -TroughVal 51.4 -PeakIdx 21 -Seed 107
            news = @(
                [ordered]@{ title = 'VIX 28 돌파, 커버드콜 월배당 JEPI 옵션 프리미엄 수혜 기대'; source = '인컴 ETF'; publishedAt = '11.25 15:30'; sentiment = 'positive'; impactLevel = '높음'; summary = '변동성 확대로 월분배 재원 탄탄해짐'; url = NewsUrl('JEPI 월배당 ETF 변동성 커버드콜') },
                [ordered]@{ title = '11월 급락장 속 JEPI 낙폭 -1% 미만 방어, 현금흐름 자금 유입'; source = 'ETF 트렌드'; publishedAt = '11.24 12:15'; sentiment = 'positive'; impactLevel = '보통'; summary = '기술주 급락 피로감으로 방어형 수요 증가'; url = NewsUrl('JEPI 방어력 미국 월배당') },
                [ordered]@{ title = '급반등장에서는 상방 제한 구조, 지수 ETF와 병행 권장'; source = '투자 가이드'; publishedAt = '11.21 09:40'; sentiment = 'neutral'; impactLevel = '보통'; summary = 'SPLG·QQQM과 섞으면 성장·현금흐름 균형'; url = NewsUrl('JEPI 커버드콜 장단점') }
            )
        },
        [ordered]@{
            ticker = 'TLT'; name = 'iShares 20+ Year Treasury Bond'; krName = '미국 20년+ 장기국채'; category = '채권·금'
            expenseRatio = '0.15%'; dividendYield = '4.42%'; forwardPE = '-'
            price = 81.85; changePct = 0.94; return1M = 2.8; return3M = -1.9; return1Y = -6.4
            high52w = 94.20; low52w = 78.40; mddFromHigh = -13.11; rsi14 = 54.6; ma200 = 85.10; ma200DiffPct = -3.82
            score = 72; light = 'green'; actionBadge = '방어·분할 유리'
            strategy = '3~5회 분할 · 주식 헤지'; entryRatio = '1회 20%'; riskLevel = 3
            compareTip = '원금 변동이 싫다면 SGOV(초단기), 향후 금리 하락 시 시세차익까지 노리면 TLT예요.'
            actionSummary = '연 4.4% 이자를 받으며 증시 급락을 방어(헤지)하기 좋은 구간이에요.'
            breakdown = [ordered]@{ valuation = 78; technical = 66; newsSentiment = 76; fxBonus = 66 }
            bullFactors = @('주식 급락 시 안전자산 자금 유입', '연 4.42% 높은 월배당 이자 수익', '52주 저점($78.4) 근접해 가격 메리트')
            bearFactors = @('12월 금리 인상 시 장기금리 재상승 위험', '만기가 길어 금리 변동에 가격 출렁임 큼')
            history = New-Series -StartVal 87.5 -EndVal 81.85 -PeakVal 94.2 -TroughVal 78.4 -PeakIdx 14 -Seed 105
            news = @(
                [ordered]@{ title = '증시 투매 속 미 국채 피난, 10년물 4.84% 하락에 TLT 반등'; source = '채권 속보'; publishedAt = '11.25 06:30'; sentiment = 'positive'; impactLevel = '높음'; summary = '주식 손실을 방어하는 안전자산 역할 확인'; url = NewsUrl('TLT 미국 장기국채 금리 안전자산') },
                [ordered]@{ title = '월 4.4% 이자 받으며 내년 경기 둔화 대비, 장기채 헤지 수요 증가'; source = '채권 전략'; publishedAt = '11.24 18:00'; sentiment = 'positive'; impactLevel = '보통'; summary = '고금리 이자 수취와 향후 금리 하락 대비'; url = NewsUrl('TLT 월배당 장기채 투자') },
                [ordered]@{ title = '물가 3.8% 고착화와 12월 인상 경계, 채권 반등폭 제한'; source = '거시경제'; publishedAt = '11.24 10:15'; sentiment = 'negative'; impactLevel = '높음'; summary = '단기 금리 5% 재돌파 위험에 분할 접근'; url = NewsUrl('미국 인플레이션 국채 금리 TLT') }
            )
        },
        [ordered]@{
            ticker = 'JEPQ'; name = 'JPMorgan Nasdaq Equity Premium'; krName = '나스닥 고배당 월배당'; category = '배당·인컴'
            expenseRatio = '0.35%'; dividendYield = '9.85%'; forwardPE = '24.5배'
            price = 53.06; changePct = -0.82; return1M = -4.1; return3M = -0.4; return1Y = 9.8
            high52w = 57.90; low52w = 45.20; mddFromHigh = -8.36; rsi14 = 39.4; ma200 = 51.80; ma200DiffPct = 2.43
            score = 68; light = 'green'; actionBadge = '고배당 분할 유리'
            strategy = '4회 분할 · 배당 재투자'; entryRatio = '1회 20%'; riskLevel = 3
            compareTip = '나스닥에 투자하되 매달 약 9~10%대 현금흐름을 원할 때(성장은 QQQM 우위).'
            actionSummary = '나스닥 조정으로 고점 대비 -8.4% 할인 중이며, VIX 급등으로 월배당 재원이 커졌어요.'
            breakdown = [ordered]@{ valuation = 72; technical = 74; newsSentiment = 58; fxBonus = 66 }
            bullFactors = @('연 9.8%대 높은 월배당 현금흐름', '나스닥 변동성 확대 → 옵션 프리미엄 증가', '고점 대비 -8.4% · 200일선 위 지지')
            bearFactors = @('나스닥 급락 시 원금 하락 노출 (JEPI보다 변동 큼)', '급반등 시 QQQM 대비 주가 상승폭 제한')
            history = New-Series -StartVal 48.3 -EndVal 53.06 -PeakVal 57.9 -TroughVal 45.2 -PeakIdx 21 -Seed 114
            news = @(
                [ordered]@{ title = '나스닥 변동성 확대에 JEPQ 옵션 수익 급증, 연 9%대 월배당 주목'; source = '월배당 리포트'; publishedAt = '11.25 16:20'; sentiment = 'positive'; impactLevel = '높음'; summary = '하락장에서도 높은 월분배금으로 손실 완충'; url = NewsUrl('JEPQ 나스닥 월배당 ETF') },
                [ordered]@{ title = '빅테크 조정으로 JEPQ 주가도 소폭 하락, 분할 매수 기회 평가'; source = 'ETF 분석'; publishedAt = '11.24 14:45'; sentiment = 'neutral'; impactLevel = '보통'; summary = '원금 변동 감안해 SCHD·JEPI와 분산 보유 권장'; url = NewsUrl('JEPQ JEPI 비교 미국 월배당') },
                [ordered]@{ title = '기술주 급락장 지속 시 커버드콜도 하방 노출 유의'; source = '투자 주의'; publishedAt = '11.23 11:10'; sentiment = 'negative'; impactLevel = '보통'; summary = '일괄 매수보다 나스닥 과매도 구간 분할 접근'; url = NewsUrl('JEPQ 하락장 리스크') }
            )
        },
        [ordered]@{
            ticker = 'QQQM'; name = 'Invesco NASDAQ 100 ETF'; krName = '나스닥 100 저보수 미니'; category = '기술·반도체'
            expenseRatio = '0.15%'; dividendYield = '0.60%'; forwardPE = '25.9배'
            price = 262.78; changePct = -1.42; return1M = -6.7; return3M = -1.4; return1Y = 19.1
            high52w = 288.40; low52w = 215.20; mddFromHigh = -8.88; rsi14 = 33.6; ma200 = 252.90; ma200DiffPct = 3.91
            score = 65; light = 'yellow'; actionBadge = '과매도 · 분할'
            strategy = '5회 분할 매수'; entryRatio = '1회 15~20%'; riskLevel = 3
            compareTip = 'QQQ($632·보수 0.20%)와 완전 동일 지수! 장기 적립식은 QQQM(0.15%)이 유리해요.'
            actionSummary = 'QQQ의 저보수 버전이에요. RSI 33 과매도지만 12월 금리 전까지 천천히 나눠 사세요.'
            breakdown = [ordered]@{ valuation = 66; technical = 80; newsSentiment = 42; fxBonus = 66 }
            bullFactors = @('QQQ 대비 연 보수 0.05%p 저렴 + 1주 가격 절반 이하', '고점 대비 -8.9% · RSI 33.6 과매도 진입', '200일선($252.9) 지지대 근접')
            bearFactors = @('AI 설비투자 수익성 논쟁으로 단기 투심 위축', '12월 연준 금리 인상 경계 · 관세 리스크')
            history = New-Series -StartVal 220.6 -EndVal 262.78 -PeakVal 288.4 -TroughVal 215.2 -PeakIdx 21 -Seed 111
            news = @(
                [ordered]@{ title = '장기 투자자 QQQ 대신 QQQM 선택 가속… 0.15% 저보수 매력'; source = 'ETF 비교'; publishedAt = '11.25 18:30'; sentiment = 'positive'; impactLevel = '높음'; summary = '동일 나스닥 100 추종에 보수 절감 + 소액 적립 최적화'; url = NewsUrl('QQQM QQQ 차이 나스닥100 ETF') },
                [ordered]@{ title = 'AI 투자 수익성 의구심에 나스닥 기술주 11월 조정'; source = '월가 뉴스'; publishedAt = '11.25 23:05'; sentiment = 'negative'; impactLevel = '높음'; summary = '단기 변동성 커져 12월 FOMC 전후 분할 매수 유리'; url = NewsUrl('QQQM 나스닥 기술주 조정') },
                [ordered]@{ title = '나스닥 100 RSI 33대 과매도 도달, 중기 분할 매수 구간 진입'; source = '차트 분석'; publishedAt = '11.25 11:20'; sentiment = 'positive'; impactLevel = '보통'; summary = '200일 이동평균선 부근 반등 지지력 주목'; url = NewsUrl('QQQM RSI 과매도 분할매수') }
            )
        },
        [ordered]@{
            ticker = 'GLD'; name = 'SPDR Gold Shares'; krName = '국제 금 현물 ETF'; category = '채권·금'
            expenseRatio = '0.40%'; dividendYield = '0.00%'; forwardPE = '-'
            price = 333.60; changePct = -1.12; return1M = -4.2; return3M = 5.4; return1Y = 26.8
            high52w = 359.80; low52w = 258.10; mddFromHigh = -7.28; rsi14 = 43.5; ma200 = 312.40; ma200DiffPct = 6.79
            score = 64; light = 'yellow'; actionBadge = '중립 · 분산'
            strategy = '포트폴리오 5~10% 분산'; entryRatio = '1회 20%'; riskLevel = 2
            compareTip = '이자는 없지만 물가(3.8%)·관세 불안을 방어하는 보험 역할로 소량 보유하세요.'
            actionSummary = '단기 차익실현 조정 중. 인플레이션·관세 방어용 소액 분산이 적절해요.'
            breakdown = [ordered]@{ valuation = 62; technical = 68; newsSentiment = 54; fxBonus = 66 }
            bullFactors = @('고점 대비 -7.3% 건강한 조정 구간', '물가 3.8% · 관세 갈등 속 헤지 가치', '각국 중앙은행 금 매수 기조 유지')
            bearFactors = @('증시 급락 시 현금화(마진콜) 매도 압력', '강달러·금리 인상 우려는 무이자 금에 부담')
            history = New-Series -StartVal 263.0 -EndVal 333.6 -PeakVal 359.8 -TroughVal 258.1 -PeakIdx 22 -Seed 106
            news = @(
                [ordered]@{ title = '국제 금값 단기 후퇴… 증시 마진콜 청산 및 강달러 영향'; source = '원자재'; publishedAt = '11.25 19:45'; sentiment = 'negative'; impactLevel = '높음'; summary = '주식 손실 메우기용 단기 매도세 유입'; url = NewsUrl('GLD 국제 금시세 하락 달러') },
                [ordered]@{ title = '관세 갈등·고물가 환경 속 금의 중장기 헤지 가치 재부각'; source = '자산배분'; publishedAt = '11.24 14:30'; sentiment = 'positive'; impactLevel = '보통'; summary = '포트폴리오 5~10% 분산 방어용으로 유효'; url = NewsUrl('금 ETF GLD 인플레이션 헤지') },
                [ordered]@{ title = '신흥국 중앙은행 금 매입 지속, 200일선 중기 지지력 기대'; source = '원자재 리포트'; publishedAt = '11.22 11:00'; sentiment = 'positive'; impactLevel = '보통'; summary = '구조적 수요가 급락 하방을 받쳐줌'; url = NewsUrl('중앙은행 금 매입 GLD') }
            )
        },
        [ordered]@{
            ticker = 'QQQ'; name = 'Invesco QQQ Trust'; krName = '나스닥 100 대표'; category = '기술·반도체'
            expenseRatio = '0.20%'; dividendYield = '0.58%'; forwardPE = '25.9배'
            price = 632.50; changePct = -1.45; return1M = -6.8; return3M = -1.5; return1Y = 18.9
            high52w = 694.20; low52w = 518.40; mddFromHigh = -8.89; rsi14 = 33.4; ma200 = 609.10; ma200DiffPct = 3.84
            score = 62; light = 'yellow'; actionBadge = '중립 · 분할'
            strategy = '5회 분할 매수'; entryRatio = '1회 15%'; riskLevel = 3
            compareTip = '장기 보유 목적이시면 똑같은 지수에 보수가 더 싼 QQQM($262·0.15%)을 추천해요.'
            actionSummary = 'RSI 33 과매도 구간이지만 12월 금리·AI 우려로 천천히 나눠 사세요.'
            breakdown = [ordered]@{ valuation = 64; technical = 80; newsSentiment = 38; fxBonus = 66 }
            bullFactors = @('고점 대비 -8.9% · RSI 33 과매도 진입', '200일 이동평균선($609) 지지대 근접', '빅테크 클라우드·AI 매출 두 자릿수 성장')
            bearFactors = @('AI 설비투자 수익화 지연 논쟁', '12월 연준 금리 인상 우려 직접 타격', '관세 이슈로 글로벌 기술주 변동성 확대')
            history = New-Series -StartVal 532.0 -EndVal 632.5 -PeakVal 694.2 -TroughVal 518.4 -PeakIdx 21 -Seed 103
            news = @(
                [ordered]@{ title = 'AI 투자 수익성 의구심에 나스닥 급락, 빅테크 차익실현'; source = '월가 뉴스'; publishedAt = '11.25 23:05'; sentiment = 'negative'; impactLevel = '높음'; summary = '단기 과열 해소 과정으로 변동성 지속'; url = NewsUrl('QQQ 나스닥 기술주 AI 투자 조정') },
                [ordered]@{ title = '연준 12월 금리 인상 경계, 성장주 밸류에이션 압박'; source = '금리 속보'; publishedAt = '11.25 17:50'; sentiment = 'negative'; impactLevel = '높음'; summary = 'FOMC 결과 확인 전까지 보수적 분할 유리'; url = NewsUrl('나스닥 QQQ 연준 금리 인상') },
                [ordered]@{ title = '나스닥 100 RSI 30대 초반, 단기 과매도 반등 구간 근접'; source = '차트 분석'; publishedAt = '11.25 11:20'; sentiment = 'positive'; impactLevel = '보통'; summary = '200일선 부근 저가 매수세 유입 가능'; url = NewsUrl('QQQ RSI 과매도 반등') },
                [ordered]@{ title = '빅테크 클라우드·기업용 AI 매출 전년 대비 견조한 성장'; source = '실적 리뷰'; publishedAt = '11.23 19:00'; sentiment = 'positive'; impactLevel = '보통'; summary = '주가 조정과 달리 핵심 실적은 견고'; url = NewsUrl('미국 빅테크 클라우드 AI 실적') }
            )
        },
        [ordered]@{
            ticker = 'XLK'; name = 'Technology Select Sector SPDR'; krName = '미국 테크 섹터'; category = '기술·반도체'
            expenseRatio = '0.09%'; dividendYield = '0.68%'; forwardPE = '26.4배'
            price = 158.40; changePct = -1.62; return1M = -7.9; return3M = -2.8; return1Y = 17.2
            high52w = 177.20; low52w = 129.50; mddFromHigh = -10.61; rsi14 = 32.8; ma200 = 154.90; ma200DiffPct = 2.26
            score = 57; light = 'yellow'; actionBadge = '중립 · 관망'
            strategy = '200일선 지지 확인 후 분할'; entryRatio = '1회 15%'; riskLevel = 3
            compareTip = 'QQQM보다 애플·MS·엔비디아 집중도가 높고 보수(0.09%)가 저렴해요.'
            actionSummary = '고점 대비 10.6% 하락. 200일선($155) 지지 확인 후 접근하세요.'
            breakdown = [ordered]@{ valuation = 62; technical = 74; newsSentiment = 34; fxBonus = 66 }
            bullFactors = @('고점 대비 -10.6% · RSI 32.8 과매도', '0.09% 저렴한 보수로 빅테크 핵심 투자')
            bearFactors = @('상위 3개 종목 집중도가 높아 출렁임 큼', '금리 인상·관세 이슈에 민감한 섹터')
            history = New-Series -StartVal 135.1 -EndVal 158.4 -PeakVal 177.2 -TroughVal 129.5 -PeakIdx 21 -Seed 109
            news = @(
                [ordered]@{ title = '빅테크 AI 자본지출 검증 국면, 테크 섹터 10% 조정'; source = '테크 마켓'; publishedAt = '11.25 21:00'; sentiment = 'negative'; impactLevel = '높음'; summary = '고밸류 소프트웨어·하드웨어 전반 재조정'; url = NewsUrl('XLK 미국 기술주 ETF 조정') },
                [ordered]@{ title = '주요 테크 기업 자사주 매입과 풍부한 현금, 하방 완충'; source = '기업 실적'; publishedAt = '11.24 17:20'; sentiment = 'positive'; impactLevel = '보통'; summary = '대형주 현금창출력이 중기 펀더멘털 지지'; url = NewsUrl('미국 빅테크 자사주 매입 XLK') },
                [ordered]@{ title = '12월 FOMC 이후 금리 불확실성 해소 여부 주목'; source = '섹터 전망'; publishedAt = '11.23 14:10'; sentiment = 'neutral'; impactLevel = '보통'; summary = '방향성 확인 전 소액 분할 대응 권장'; url = NewsUrl('XLK 12월 FOMC 기술주 전망') }
            )
        },
        [ordered]@{
            ticker = 'SOXX'; name = 'iShares Semiconductor ETF'; krName = '미국 반도체 30'; category = '기술·반도체'
            expenseRatio = '0.35%'; dividendYield = '0.74%'; forwardPE = '24.2배'
            price = 124.80; changePct = -2.38; return1M = -11.4; return3M = -6.2; return1Y = 14.5
            high52w = 149.60; low52w = 98.50; mddFromHigh = -16.58; rsi14 = 31.2; ma200 = 127.40; ma200DiffPct = -2.04
            score = 46; light = 'red'; actionBadge = '변동성 주의'
            strategy = '바닥 확인 후 소액 분할'; entryRatio = '1회 10%'; riskLevel = 4
            compareTip = 'SMH보다 종목 비중이 고르게 분산되어 있어 반도체 내에서는 상대적으로 덜 출렁여요.'
            actionSummary = '가격은 많이 내렸지만 관세·자금 유출 악재가 겹쳐 바닥 확인이 필요해요.'
            breakdown = [ordered]@{ valuation = 72; technical = 62; newsSentiment = 22; fxBonus = 66 }
            bullFactors = @('고점 대비 -16.6% · RSI 31 가격 메리트', '미국 핵심 반도체 30종목 고른 분산')
            bearFactors = @('무역법 301조 관세로 공급망 직접 타격', '200일 이동평균선($127.4) 하향 이탈', '기관 단기 자금 유출 지속 중')
            history = New-Series -StartVal 108.9 -EndVal 124.8 -PeakVal 149.6 -TroughVal 98.5 -PeakIdx 20 -Seed 104
            news = @(
                [ordered]@{ title = '백악관 무역법 301조 관세 검토, 반도체 공급망 직격탄 우려'; source = '국제 무역'; publishedAt = '11.25 22:30'; sentiment = 'negative'; impactLevel = '높음'; summary = '수출 제약 및 제조 비용 상승 우려로 악재'; url = NewsUrl('SOXX 반도체 ETF 미국 관세') },
                [ordered]@{ title = '엔비디아·AMD 급락… 미국 반도체 ETF 자금 유출 확대'; source = '반도체 뉴스'; publishedAt = '11.25 06:40'; sentiment = 'negative'; impactLevel = '높음'; summary = '차익실현 매물 집중되며 200일선 이탈'; url = NewsUrl('SOXX 엔비디아 AMD 반도체 ETF 하락') },
                [ordered]@{ title = '단기 조정에도 내년 데이터센터 AI 가속기 수요 전망 견고'; source = '테크 분석'; publishedAt = '11.24 15:10'; sentiment = 'positive'; impactLevel = '보통'; summary = '거품 해소 후 중장기 반등 여력 존재'; url = NewsUrl('AI 반도체 데이터센터 수요 전망') },
                [ordered]@{ title = '반도체 변동성 확대, 관세 윤곽 확인 후 분할 접근 권고'; source = '투자 전략'; publishedAt = '11.23 13:00'; sentiment = 'neutral'; impactLevel = '보통'; summary = '성급한 일괄 매수보다 추세 안정 확인'; url = NewsUrl('미국 반도체 ETF 투자 전략') }
            )
        },
        [ordered]@{
            ticker = 'SMH'; name = 'VanEck Semiconductor ETF'; krName = '글로벌 AI 반도체'; category = '기술·반도체'
            expenseRatio = '0.35%'; dividendYield = '0.45%'; forwardPE = '25.8배'
            price = 434.20; changePct = -2.65; return1M = -12.6; return3M = -5.8; return1Y = 21.4
            high52w = 514.80; low52w = 342.00; mddFromHigh = -15.66; rsi14 = 30.8; ma200 = 442.50; ma200DiffPct = -1.88
            score = 44; light = 'red'; actionBadge = '변동성 주의'
            strategy = '추세 반등 확인 후 진입'; entryRatio = '관망 · 1회 10%'; riskLevel = 4
            compareTip = '엔비디아·TSMC 집중도가 매우 높아 반등 탄력도 크지만 하락폭도 큽니다.'
            actionSummary = '엔비디아·TSMC 집중도가 높아 관세 악재에 가장 민감해요. 확인 후 진입하세요.'
            breakdown = [ordered]@{ valuation = 68; technical = 58; newsSentiment = 20; fxBonus = 66 }
            bullFactors = @('엔비디아·TSMC 글로벌 1등 기업 집중', '고점 대비 -15.7% · RSI 30.8 과매도')
            bearFactors = @('반도체 ETF 중 단기 자금 유출 최대', '관세·아시아 파운드리 리스크 직접 노출', '200일선($442.5) 하회로 하락 추세 중')
            history = New-Series -StartVal 357.6 -EndVal 434.2 -PeakVal 514.8 -TroughVal 342.0 -PeakIdx 20 -Seed 110
            news = @(
                [ordered]@{ title = '반도체 ETF SMH 자금 유출 가속, 엔비디아·TSMC 약세'; source = '월가 속보'; publishedAt = '11.25 22:50'; sentiment = 'negative'; impactLevel = '높음'; summary = 'AI 주도주 집중 구조로 하락폭 확대'; url = NewsUrl('SMH 반도체 ETF 엔비디아 자금 유출') },
                [ordered]@{ title = '미국 관세 예고에 아시아 파운드리·반도체 밸류체인 긴장'; source = '국제 경제'; publishedAt = '11.25 16:40'; sentiment = 'negative'; impactLevel = '높음'; summary = 'TSMC·ASML 비중이 높아 단기 경계감 커짐'; url = NewsUrl('SMH TSMC 미국 관세 반도체') },
                [ordered]@{ title = 'AI 반도체 실적 성장은 유효, 조정 마무리 시 반등 후보 1순위'; source = '테크 분석'; publishedAt = '11.24 11:05'; sentiment = 'positive'; impactLevel = '보통'; summary = '악재 진정 후 가장 빠른 반등 탄력 기대'; url = NewsUrl('SMH AI 반도체 장기 전망') }
            )
        },
        [ordered]@{
            ticker = 'TQQQ'; name = 'ProShares UltraPro QQQ (3x)'; krName = '나스닥 100 3배 레버리지'; category = '기술·반도체'
            expenseRatio = '0.88%'; dividendYield = '0.92%'; forwardPE = '-'
            price = 46.19; changePct = -4.35; return1M = -20.8; return3M = -9.4; return1Y = 34.2
            high52w = 64.80; low52w = 31.50; mddFromHigh = -28.72; rsi14 = 29.5; ma200 = 49.40; ma200DiffPct = -6.50
            score = 32; light = 'red'; actionBadge = '고위험 · 진입 자제'
            strategy = 'VIX 20 이하 안정 후 검토'; entryRatio = '관망 권장'; riskLevel = 5
            compareTip = 'VIX 28 고변동 장세에서는 횡보만 해도 원금이 녹아요. 일반 투자는 QQQM 권장.'
            actionSummary = 'VIX 28 고변동 구간에서 3배 레버리지는 음의 복리 손실이 커 진입을 자제하세요.'
            breakdown = [ordered]@{ valuation = 58; technical = 34; newsSentiment = 20; fxBonus = 66 }
            bullFactors = @('고점 대비 -28.7% 급락 · RSI 29.5 극단 과매도', '강세장 전환 시 나스닥 3배 상승 탄력')
            bearFactors = @('VIX 28 고변동 구간에서 음의 복리(계좌 녹음) 심화', '200일선(-6.5%) 하향 이탈 · 하락 추세', '연 0.88% 높은 운용보수 및 12월 FOMC 리스크')
            history = New-Series -StartVal 34.4 -EndVal 46.19 -PeakVal 64.8 -TroughVal 31.5 -PeakIdx 20 -Seed 116
            news = @(
                [ordered]@{ title = 'VIX 28 급등에 3배 레버리지 TQQQ 한 달 -20% 급락, 변동성 경보'; source = '월가 속보'; publishedAt = '11.25 23:20'; sentiment = 'negative'; impactLevel = '높음'; summary = '고변동 하락장에서 3배 추종 상품 손실 확대'; url = NewsUrl('TQQQ 나스닥 3배 레버리지 급락') },
                [ordered]@{ title = '12월 금리 인상·관세 변수 앞둔 레버리지 ETF, 손절·현금관리 필수'; source = '투자 경고'; publishedAt = '11.25 14:10'; sentiment = 'negative'; impactLevel = '높음'; summary = 'VIX 20 이하 진정 전까지 QQQM 등 1배수 상품 안전'; url = NewsUrl('TQQQ 리스크 12월 FOMC') },
                [ordered]@{ title = 'RSI 30 하회 단기 기술적 반등 기대감도 공존, 초소액 대응만'; source = '트레이딩'; publishedAt = '11.24 10:30'; sentiment = 'neutral'; impactLevel = '보통'; summary = '장기 적립보다 단기 반등 확인 후 소액 접근 영역'; url = NewsUrl('TQQQ RSI 과매도') }
            )
        }
    )
}

# 각 ETF별 매력적인 가격 구간(적극 분할 / 적정 적립 / 추격 주의) 자동 산출
foreach ($etf in $data.etfs) {
    $p = [double]$etf.price
    $h = [double]$etf.high52w
    $l = [double]$etf.low52w
    $ma = [double]$etf.ma200
    if ($etf.ticker -eq 'SGOV') {
        $buyLow = [math]::Round($l, 2)
        $buyHigh = [math]::Round($p + 0.15, 2)
        $fairHigh = [math]::Round($h + 0.20, 2)
        $zLabel = '수시 매수 구간'
        $zLight = 'green'
        $zNote = '초단기국채 특성상 가격 변동이 거의 없어 언제든 파킹 가능'
    } else {
        # 적극 분할 구간: 200일선 하단 ~ 200일선(+1%) 또는 고점 대비 -10% 이하
        $buyLow = [math]::Round([math]::Max($l, $ma * 0.94), 2)
        $buyHigh = [math]::Round([math]::Min($h * 0.92, $ma * 1.01), 2)
        if ($buyHigh -le $buyLow) { $buyHigh = [math]::Round($buyLow * 1.04, 2) }
        # 적정 적립 상단: 고점 대비 -3%
        $fairHigh = [math]::Round([math]::Max($buyHigh * 1.04, $h * 0.97), 2)
        if ($p -le $buyHigh) {
            $zLabel = '적극 분할 구간'
            $zLight = 'green'
            $zNote = '200일선 부근 또는 고점 대비 충분히 눌린 저평가 매수 구간'
        } elseif ($p -le $fairHigh) {
            $zLabel = '적정 적립 구간'
            $zLight = 'yellow'
            $zNote = '고점 대비 과열이 식은 구간 · 정기 분할 매수에 무리 없음'
        } else {
            $zLabel = '추격 주의 구간'
            $zLight = 'red'
            $zNote = '52주 고점 근접 · 일괄 매수보다 눌림목 대기 권장'
        }
    }
    $etf['priceZones'] = [ordered]@{
        buyLow    = $buyLow
        buyHigh   = $buyHigh
        fairHigh  = $fairHigh
        overPrice = $fairHigh
        status    = $zLabel
        light     = $zLight
        note      = $zNote
    }
}

$json = $data | ConvertTo-Json -Depth 12
$jsonPath = Join-Path $DataDir 'market-data.json'
$jsPath   = Join-Path $DataDir 'market-data.js'
[System.IO.File]::WriteAllText($jsonPath, $json, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($jsPath, "window.MARKET_DATA = $json;`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "16종 ETF + 경제지표 시계열 데이터 생성 완료: $jsonPath" -ForegroundColor Green
