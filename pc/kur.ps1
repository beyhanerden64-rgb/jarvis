# JARVIS bilgisayar yardimcisi - tek satirlik kurulum (SmartScreen'e takilan .bat yerine)
# Kullanim (PowerShell'e yapistir):  irm https://beyhanerden64-rgb.github.io/jarvis/pc/kur.ps1 | iex
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Write-Host ''
Write-Host '  JARVIS bilgisayar yardimcisi kuruluyor...' -ForegroundColor Cyan

function Find-Py {
  foreach ($c in @('py', 'python', 'python3')) {
    $g = Get-Command $c -ErrorAction SilentlyContinue
    if ($g) {
      try { $v = & $g.Source -c 'print(42)' 2>$null; if ("$v".Trim() -eq '42') { return $g.Source } } catch {}
    }
  }
  return $null
}

$py = Find-Py
if (-not $py) {
  Write-Host '  Python bulunamadi; ucretsiz Python kuruluyor (1-2 dakika)...' -ForegroundColor Yellow
  try { winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements --silent | Out-Null } catch {}
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $py = Find-Py
}
if (-not $py) {
  Write-Host '  Python otomatik kurulamadi. Microsoft Store aciliyor: "Python 3.12" sayfasinda "Al"a bas, sonra bu komutu tekrar calistir.' -ForegroundColor Red
  Start-Process 'ms-windows-store://pdp/?productid=9NCVDN91XZQP'
  return
}

$dest = Join-Path $env:LOCALAPPDATA 'JARVIS-PC'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$script = Join-Path $dest 'jarvis_pc.py'

# eski calisan yardimciyi kapat (guncelleme icin)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*jarvis_pc.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

Invoke-WebRequest -ErrorAction Stop -UseBasicParsing -Uri ('https://beyhanerden64-rgb.github.io/jarvis/pc/jarvis_pc.py?v=' + [DateTime]::Now.Ticks) -OutFile $script
Unblock-File -Path $script -ErrorAction SilentlyContinue

$pyw = (& $py -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))").Trim()
if (-not (Test-Path $pyw)) { $pyw = $py }

# gizli baslatici (pencere acmaz) + bilgisayar acilinca otomatik baslat
$vbs = Join-Path $dest 'JARVIS-PC.vbs'
$line = 'CreateObject("WScript.Shell").Run """' + $pyw + '"" ""' + $script + '""", 0, False'
Set-Content -Path $vbs -Value $line -Encoding Unicode
Copy-Item $vbs (Join-Path ([Environment]::GetFolderPath('Startup')) 'JARVIS-PC.vbs') -Force

# bekci gorevi: 10 dakikada bir kapanmissa yeniden baslatir
try {
  $act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"')
  $trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
  Register-ScheduledTask -TaskName 'JARVIS-PC-Bekci' -Action $act -Trigger $trg -Force -ErrorAction Stop | Out-Null
} catch { Write-Host '  (Bekci gorevi kurulamadi; yardimci yine de her acilista baslar.)' -ForegroundColor DarkYellow }

Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $vbs + '"')
Start-Sleep -Seconds 3
$kod = (& $py $script --kod).Trim()

Write-Host ''
Write-Host '  ======================================================' -ForegroundColor Green
Write-Host '    KURULUM TAMAM. Yardimci arka planda calisiyor ve' -ForegroundColor Green
Write-Host '    bilgisayar her acildiginda kendiliginden baslar.' -ForegroundColor Green
Write-Host ''
Write-Host ('    ERISIM KODU:  ' + $kod) -ForegroundColor Yellow
Write-Host ''
Write-Host '    JARVIS -> BAGLANTI -> "Yardimci erisim kodu" kutusuna yaz.' -ForegroundColor Green
Write-Host '  ======================================================' -ForegroundColor Green
Write-Host ''
try { Set-Clipboard -Value $kod; Write-Host '  (Kod panoya kopyalandi; JARVIS''te kutuya yapistirabilirsin.)' } catch {}
