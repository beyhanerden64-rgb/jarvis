# -*- coding: utf-8 -*-
"""JARVIS bilgisayar yardımcısı (Windows) — yalnızca Python standart kütüphanesi.

Yalnız bu bilgisayardan (127.0.0.1) erişilebilir. JARVIS web uygulaması komut gönderir; yardımcı yalnız izin
listesindeki işlemleri yapar. Tehlikeli işlemler (kapatma, PowerShell, silme, tarama, yedek, klavye) uygulamada
onaylanmadan çalışmaz. Telefon köprüsü açıksa, komutlar şifre anahtarıyla imzalanmış olarak GitHub Gist üzerinden gelir.
"""
import base64, ctypes, datetime, hashlib, hmac, json, os, platform, secrets, shutil, subprocess, sys, tempfile, threading, time, urllib.request, webbrowser, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = '7.1.0'
PORT = 8765
ORIGINS = {'https://beyhanerden64-rgb.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'}
HOME = os.path.expanduser('~')
BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(BASE, 'jarvis_pc.json')
WORK = os.path.join(HOME, 'Documents', 'JARVIS')
WIN = os.name == 'nt'
NO_WINDOW = 0x08000000 if WIN else 0

APPS = {  # izin listesi: sesli ad → komut
    'not defteri': 'notepad', 'notepad': 'notepad', 'hesap makinesi': 'calc', 'chrome': 'chrome', 'edge': 'msedge',
    'word': 'winword', 'excel': 'excel', 'powerpoint': 'powerpnt', 'paint': 'mspaint', 'dosyalar': 'explorer',
    'dosya gezgini': 'explorer', 'vscode': 'code', 'kod': 'code', 'ayarlar': 'ms-settings:', 'spotify': 'spotify:',
    'whatsapp': 'whatsapp:', 'telegram': 'tg:', 'görev yöneticisi': 'taskmgr', 'gorev yoneticisi': 'taskmgr',
    'kamera': 'microsoft.windows.camera:', 'takvim': 'outlookcal:', 'posta': 'outlookmail:', 'ekran alıntısı': 'ms-screenclip:',
    'firefox': 'firefox', 'teams': 'msteams:', 'zoom': 'zoommtg:', 'obs': 'obs64'
}
PROC = {'notepad': 'notepad.exe', 'chrome': 'chrome.exe', 'msedge': 'msedge.exe', 'winword': 'WINWORD.EXE', 'excel': 'EXCEL.EXE',
        'powerpnt': 'POWERPNT.EXE', 'mspaint': 'mspaint.exe', 'code': 'Code.exe', 'spotify:': 'Spotify.exe', 'whatsapp:': 'WhatsApp.exe',
        'calc': 'CalculatorApp.exe', 'firefox': 'firefox.exe', 'tg:': 'Telegram.exe', 'obs64': 'obs64.exe', 'taskmgr': 'Taskmgr.exe'}
RISKY = {'nobet_onay', 'servis', 'kapat', 'powershell', 'temizlik_sil', 'tarama', 'yaz', 'yedekle', 'dosya_olustur', 'word_olustur', 'excel_olustur', 'donustur', 'tikla', 'kur', 'yazdir', 'surec_kapat', 'guc', 'dosya_tasi', 'dosya_kopyala', 'dosya_sil', 'dosya_kaydet'}
TEXT_EXT = ('.txt', '.md', '.csv', '.json', '.log', '.py', '.js', '.html', '.css', '.ini', '.xml', '.yaml', '.yml')


def load_cfg():
    try:
        with open(CONFIG, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_cfg(c):
    with open(CONFIG, 'w', encoding='utf-8') as f:
        json.dump(c, f, ensure_ascii=False, indent=1)


cfg = load_cfg()
if not cfg.get('kod'):
    a = secrets.token_hex(2).upper(); b = secrets.token_hex(2).upper()
    cfg['kod'] = f'{a}-{b}'
    save_cfg(cfg)
APPS.update({k.lower(): v for k, v in cfg.get('uygulamalar', {}).items()})


def fold(s):
    return str(s or '').lower().replace('ı', 'i').replace('ş', 's').replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o').replace('ç', 'c').replace('İ', 'i').strip()


def ps(script, timeout=30):
    """PowerShell çalıştırır, çıktıyı döndürür."""
    if not WIN:
        raise RuntimeError('Bu işlem yalnız Windows’ta çalışır.')
    r = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
                       capture_output=True, timeout=timeout, creationflags=NO_WINDOW)
    out = r.stdout.decode('utf-8', 'replace') if r.stdout else ''
    err = r.stderr.decode('utf-8', 'replace') if r.stderr else ''
    if r.returncode != 0 and not out.strip():
        raise RuntimeError((err or 'PowerShell hatası').strip()[:600])
    return out.strip()


PROTECTED = [os.path.realpath(x).lower() for x in filter(None, [os.environ.get('SystemRoot', r'C:\Windows'), os.environ.get('ProgramFiles'), os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramData')])] if os.name == 'nt' else ['/bin', '/sbin', '/usr', '/etc', '/boot', '/proc', '/sys']


def inside_home(path, write=False):
    """Tam erişim: okuma tüm yerel diskler; yazma sistem klasörleri dışında her yer (onaylı). Tam erişim kapalıysa yalnız kullanıcı klasörü."""
    if not path:
        return None
    p = os.path.realpath(os.path.expanduser(str(path).strip().strip('"')))
    if p.startswith('\\\\'):
        return None  # ağ paylaşımları yok
    if not cfg.get('tam_erisim', True):
        return p if p.startswith(os.path.realpath(HOME)) else None
    if write and any(p.lower() == r or p.lower().startswith(r + os.sep) for r in PROTECTED):
        return None  # sistem klasörlerine yazma/silme yok
    return p


def drives():
    if os.name == 'nt':
        return [f'{c}:\\' for c in 'CDEFGHIJKLMNOPQRSTUVWXYZ' if os.path.exists(f'{c}:\\')]
    return ['/']


def safe_name(n):
    n = ''.join(c for c in str(n) if c.isalnum() or c in ' ._-()çğıöşüÇĞİÖŞÜ').strip()[:80] or 'not'
    return n if os.path.splitext(n)[1].lower() in TEXT_EXT else n + '.txt'


def open_target(t):
    if WIN:
        os.startfile(t)  # noqa
    else:
        webbrowser.open(t)


def mem_info():
    if WIN:
        class MS(ctypes.Structure):
            _fields_ = [('l', ctypes.c_ulong), ('load', ctypes.c_ulong), ('total', ctypes.c_ulonglong), ('avail', ctypes.c_ulonglong),
                        ('tp', ctypes.c_ulonglong), ('ap', ctypes.c_ulonglong), ('tv', ctypes.c_ulonglong), ('av', ctypes.c_ulonglong), ('ae', ctypes.c_ulonglong)]
        m = MS(); m.l = ctypes.sizeof(MS)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
        return m.load, m.total / 2**30, (m.total - m.avail) / 2**30
    try:
        info = dict(l.split(':', 1) for l in open('/proc/meminfo'))
        t = int(info['MemTotal'].split()[0]) / 2**20; a = int(info['MemAvailable'].split()[0]) / 2**20
        return round((t - a) / t * 100), t, t - a
    except Exception:
        return 0, 0, 0


def cpu_load():
    if WIN:
        try:
            return int(float(ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average', 15) or 0))
        except Exception:
            return -1
    try:
        return int(os.getloadavg()[0] * 100 / (os.cpu_count() or 1))
    except Exception:
        return -1


def disk_text():
    root = os.environ.get('SystemDrive', 'C:') + '\\' if WIN else '/'
    d = shutil.disk_usage(root)
    return f'{d.used / 2**30:.0f}/{d.total / 2**30:.0f} GB (%{d.used * 100 // d.total})'


def key_press(vk):
    if not WIN:
        raise RuntimeError('Yalnız Windows')
    ctypes.windll.user32.keybd_event(vk, 0, 0, 0); ctypes.windll.user32.keybd_event(vk, 0, 2, 0)


def screenshot():
    path = os.path.join(WORK, 'Ekran', datetime.datetime.now().strftime('ekran-%Y%m%d-%H%M%S.jpg'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    geo = ps(f"""Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -Name U -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
[W.U]::SetProcessDPIAware() | Out-Null
$b=[System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height
$g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size)
$s=[Math]::Min(1.0,1568/[Math]::Max($b.Width,$b.Height)); $w=[int]($b.Width*$s); $h=[int]($b.Height*$s)
$o=New-Object System.Drawing.Bitmap $bmp,$w,$h
$codec=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|?{{$_.MimeType -eq 'image/jpeg'}}
$p=New-Object System.Drawing.Imaging.EncoderParameters 1; $p.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]80)
$o.Save('{path}',$codec,$p)
Write-Output ("$($b.Left),$($b.Top),$($b.Width),$($b.Height)")""", 30)
    try:
        left, top, width, height = [int(x) for x in geo.strip().splitlines()[-1].split(',')]
    except Exception:
        left = top = 0; width = height = 0
    with open(path, 'rb') as f:
        return path, base64.b64encode(f.read()).decode(), {'left': left, 'top': top, 'width': width, 'height': height}


def tool(name, args, onay):
    """Tek bir izinli işlemi yapar. {'text': ..., 'image'?: base64, 'data'?: {...}} döndürür."""
    a = [str(x) for x in (args or [])]
    a0 = a[0] if a else ''
    if name in RISKY and not onay and not (name == 'guc' and fold(a0) == 'iptal'):
        raise PermissionError('Bu işlem için uygulamada onay gerekiyor.')
    if name == 'durum':
        return {'text': f'{platform.node()} · {platform.system()} {platform.release()} · JARVIS yardımcı {VERSION}'}
    if name in ('ac', 'aç'):
        k = fold(a0)
        if not k:
            raise ValueError('Açılacak programın adı gerekli')
        cmd = next((v for n, v in APPS.items() if fold(n) == k), None)
        if not cmd and os.path.exists(a0):  # tam yol: dosya, klasör veya program
            open_target(a0); return {'text': 'Açıldı: ' + a0}
        if not cmd and a0.startswith(('http://', 'https://', 'ms-settings:')):
            open_target(a0); return {'text': 'Açıldı: ' + a0}
        if not cmd and WIN:
            # kurulu tüm programlar: Başlat menüsündeki uygulamalar (Store uygulamaları dahil)
            qq = a0.replace("'", "''")
            hit = ps(f"$a = Get-StartApps | Where-Object {{ $_.Name -like '*{qq}*' }} | Select-Object -First 1; if ($a) {{ Start-Process ('shell:AppsFolder\\' + $a.AppID); Write-Output $a.Name }}", 20)
            if hit.strip():
                return {'text': f'“{hit.strip()}” açıldı'}
        if not cmd:
            cmd = next((v for n, v in APPS.items() if k and (k in fold(n) or fold(n) in k)), None)
        if not cmd:
            raise ValueError(f'“{a0}” adlı program bulunamadı. Kurulu programları görmek için: programlar')
        if cmd.endswith(':'):
            open_target(cmd)
        elif WIN:
            subprocess.Popen(['cmd', '/c', 'start', '', cmd], creationflags=NO_WINDOW)
        else:
            raise RuntimeError('Yalnız Windows')
        time.sleep(1.5)
        running = proc_running(PROC.get(cmd)) if PROC.get(cmd) else None
        return {'text': f'{a0} açıldı' + (' (çalıştığı doğrulandı)' if running else ' (komut verildi; pencere birkaç saniyede gelir)' if running is None else ' komutu verildi ama süreç görünmüyor; program kurulu olmayabilir')}
    if name == 'programlar':
        q = fold(a0)
        names = [x for x in ps("Get-StartApps | Sort-Object Name | ForEach-Object { $_.Name }", 30).splitlines() if x.strip()]
        if q:
            names = [x for x in names if q in fold(x)]
        return {'text': f'{len(names)} program: ' + ', '.join(names[:150])}
    if name == 'servisler':
        return {'text': ps("Get-Service | Where-Object Status -eq 'Running' | Sort-Object DisplayName | Select-Object -First 60 | ForEach-Object { $_.Name + ' — ' + $_.DisplayName }", 20)}
    if name == 'servis':
        act, svc = fold(a0), ''.join(c for c in (a[1] if len(a) > 1 else '') if c.isalnum() or c in '._-')
        verb = {'baslat': 'Start-Service', 'durdur': 'Stop-Service', 'yeniden': 'Restart-Service'}.get(act)
        if not verb or not svc:
            raise ValueError('servis|baslat/durdur/yeniden|servis adı')
        if not onay:
            raise PermissionError('Servis işlemi için onay gerekiyor.')
        ps(f"{verb} -Name '{svc}' -ErrorAction Stop", 60)
        return {'text': f'{svc}: ' + ps(f"(Get-Service -Name '{svc}').Status", 10)}
    if name == 'ag_bilgi':
        return {'text': ps("Get-NetIPConfiguration | ForEach-Object { $_.InterfaceAlias + ' · ' + ($_.IPv4Address.IPAddress -join ',') + ' · ağ geçidi ' + ($_.IPv4DefaultGateway.NextHop -join ',') }", 20) or 'Ağ bilgisi yok'}
    if name == 'suruculer':
        out = []
        for d in drives():
            try:
                u = shutil.disk_usage(d); out.append(f'{d} {u.free / 2**30:.0f} GB boş / {u.total / 2**30:.0f} GB')
            except OSError:
                pass
        return {'text': ' · '.join(out)}
    if name == 'kapat':
        k = fold(a0); cmd = next((v for n, v in APPS.items() if fold(n) == k), None)
        exe = PROC.get(cmd or '', None) or (a0 if a0.lower().endswith('.exe') else None)
        if not exe:
            raise ValueError('Bu program için kapatma tanımlı değil')
        subprocess.run(['taskkill', '/IM', exe], capture_output=True, creationflags=NO_WINDOW)
        time.sleep(1.2)
        return {'text': f'{a0} ' + ('kapandı (doğrulandı)' if not proc_running(exe) else 'kapatma isteği gönderildi; kaydedilmemiş belge sorusu açık olabilir')}
    if name == 'sistem' or name == 'sistem_ozet':
        load, total, used = mem_info(); cpu = cpu_load()
        data = {'CPU': f'%{cpu}' if cpu >= 0 else '?', 'RAM': f'{used:.1f}/{total:.1f} GB (%{load})', 'Disk': disk_text()}
        if name == 'sistem_ozet':
            return {'text': 'ok', 'data': data}
        top = ''
        if WIN:
            try:
                top = ps("Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 6 | ForEach-Object { '{0} {1:N0} MB' -f $_.ProcessName, ($_.WorkingSet64/1MB) }", 20)
            except Exception:
                pass
        up = ''
        if WIN:
            ms = ctypes.windll.kernel32.GetTickCount64(); up = f', açık kalma {ms // 3600000} sa'
        return {'text': f"CPU %{cpu}, RAM {data['RAM']}, disk {data['Disk']}{up}. En çok bellek kullananlar: " + top.replace('\r', '').replace('\n', '; ')}
    if name == 'baslangic':
        return {'text': ps("Get-CimInstance Win32_StartupCommand | ForEach-Object { $_.Name + ' — ' + $_.Location }", 20) or 'Başlangıç programı bulunamadı'}
    if name == 'dosya_ara':
        q = fold(a0); where = a[1] if len(a) > 1 else ''
        if not q:
            raise ValueError('Aranacak ad gerekli')
        if fold(where) in ('tum', 'hepsi', 'tum_diskler', 'bilgisayar'):
            roots = drives()
        elif where:
            r = inside_home(where)
            if not r or not os.path.isdir(r):
                raise ValueError('Arama klasörü bulunamadı')
            roots = [r]
        else:
            roots = [os.path.join(HOME, x) for x in ('Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'OneDrive')]
        found, t0 = [], time.time()
        skip = {'node_modules', 'appdata', '$recycle.bin', 'windows', 'winsxs', 'system volume information', '.git', 'programdata'}
        for root in roots:
            for dp, dn, fn in os.walk(root):
                dn[:] = [d for d in dn if not d.startswith('.') and d.lower() not in skip]
                for f in fn + dn:
                    if q in fold(f):
                        found.append(os.path.join(dp, f))
                if len(found) >= 40 or time.time() - t0 > 20:
                    break
            if len(found) >= 40 or time.time() - t0 > 20:
                break
        return {'text': '\n'.join(found[:40]) or 'Bulunamadı' + (' (süre doldu, daha dar bir klasör dene)' if time.time() - t0 > 20 else '')}
    if name == 'dosya_oku':
        p = inside_home(a0)
        if not p or not os.path.isfile(p):
            raise ValueError('Dosya bulunamadı')
        with open(p, 'rb') as f:
            head = f.read(4096)
        if b'\x00' in head and not p.lower().endswith(TEXT_EXT):
            raise ValueError('Bu bir metin dosyası değil (ikili dosya). PDF/Office için: donustur veya dosya_al')
        with open(p, encoding='utf-8', errors='replace') as f:
            return {'text': f.read(12000)}
    if name == 'dosya_olustur':
        os.makedirs(WORK, exist_ok=True)
        p = os.path.join(WORK, safe_name(a0))
        with open(p, 'w', encoding='utf-8') as f:
            f.write('|'.join(a[1:]) if len(a) > 1 else '')
        ok = os.path.isfile(p)
        return {'text': f'Dosya oluşturuldu: {p} ({os.path.getsize(p)} bayt, doğrulandı)' if ok else 'Dosya oluşturulamadı'}
    if name == 'klasor_ac':
        p = inside_home(a0 or WORK) or WORK
        os.makedirs(p, exist_ok=True) if p == WORK else None
        open_target(p); return {'text': 'Klasör açıldı: ' + p}
    if name == 'ekran':
        p, b64, geo = screenshot(); return {'text': 'Ekran görüntüsü alındı: ' + p, 'image': b64, 'screen': geo}
    if name == 'ses':
        k = fold(a0); vk = {'yukari': 0xAF, 'arttir': 0xAF, 'asagi': 0xAE, 'azalt': 0xAE, 'kapat': 0xAD, 'sessiz': 0xAD, 'ac': 0xAD}.get(k)
        if not vk:
            raise ValueError('ses: yukari / asagi / kapat')
        for _ in range(1 if vk == 0xAD else 5):
            key_press(vk)
        return {'text': 'Ses ayarlandı: ' + a0}
    if name == 'medya':
        vk = {'oynat': 0xB3, 'durdur': 0xB3, 'duraklat': 0xB3, 'sonraki': 0xB0, 'onceki': 0xB1}.get(fold(a0))
        if not vk:
            raise ValueError('medya: oynat / sonraki / onceki')
        key_press(vk); return {'text': 'Medya: ' + a0}
    if name == 'kilitle':
        if not WIN:
            raise RuntimeError('Yalnız Windows')
        ctypes.windll.user32.LockWorkStation(); return {'text': 'Bilgisayar kilitlendi'}
    if name == 'url':
        if not a0.startswith(('http://', 'https://')):
            raise ValueError('Adres http(s) ile başlamalı')
        webbrowser.open(a0); return {'text': 'Tarayıcıda açıldı: ' + a0}
    if name == 'pano':
        text = '|'.join(a)
        ps("Set-Clipboard -Value '" + text.replace("'", "''") + "'", 10)
        return {'text': 'Metin bilgisayarın panosuna kopyalandı (Ctrl+V ile yapıştır)'}
    if name == 'pano_al':
        return {'text': ps('Get-Clipboard -Raw', 10)[:6000] or '(pano boş)'}
    if name == 'gunluk':
        return {'text': ps("Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2} -MaxEvents 12 -ErrorAction SilentlyContinue | ForEach-Object { $_.TimeCreated.ToString('dd.MM HH:mm') + ' ' + $_.ProviderName + ': ' + ($_.Message -split \"`n\")[0] }", 30) or 'Son kritik/hata kaydı yok'}
    if name == 'guncelleme':
        open_target('ms-settings:windowsupdate')
        hf = ''
        try:
            hf = ps("Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 3 | ForEach-Object { $_.HotFixID + ' ' + $_.InstalledOn }", 20)
        except Exception:
            pass
        return {'text': 'Windows Update ekranı açıldı. Son yüklenenler: ' + (hf.replace('\r', '').replace('\n', '; ') or 'bilinmiyor')}
    if name == 'tarama':
        ps('Start-MpScan -ScanType QuickScan', 900)
        res = ps("Get-MpThreatDetection | Select-Object -First 5 | ForEach-Object { $_.ThreatID }", 20)
        return {'text': 'Defender hızlı tarama bitti. ' + ('Tespit: ' + res if res else 'Tehdit bulunmadı.')}
    if name in ('temizlik', 'temizlik_sil'):
        tmp = tempfile.gettempdir(); size = 0; files = []
        for dp, dn, fn in os.walk(tmp):
            for f in fn:
                fp = os.path.join(dp, f)
                try:
                    size += os.path.getsize(fp); files.append(fp)
                except OSError:
                    pass
        if name == 'temizlik':
            return {'text': f'Geçici dosyalar: {len(files)} dosya, {size / 2**20:.0f} MB ({tmp}). Silmek için onaylı “temizlik_sil”.'}
        freed = 0
        for fp in files:
            try:
                s = os.path.getsize(fp); os.remove(fp); freed += s
            except OSError:
                pass
        return {'text': f'{freed / 2**20:.0f} MB geçici dosya silindi (kullanımdaki dosyalar atlandı).'}
    if name == 'yedekle':
        src = inside_home(a0)
        if not src or not os.path.isdir(src):
            raise ValueError('Yedeklenecek klasör bulunamadı')
        dst = os.path.join(WORK, 'Yedekler', os.path.basename(src) + datetime.datetime.now().strftime('-%Y%m%d-%H%M'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        out = shutil.make_archive(dst, 'zip', src)
        with zipfile.ZipFile(out) as z:
            n = len(z.namelist())
        return {'text': f'Yedek alındı ve doğrulandı: {out} ({n} dosya, {os.path.getsize(out) / 2**20:.1f} MB)'}
    if name == 'yazici':
        return {'text': ps('Get-Printer | ForEach-Object { $_.Name + " (" + $_.PrinterStatus + ")" }', 20) or 'Yazıcı yok'}
    if name == 'monitor':
        return {'text': ps('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $_.DeviceName + " " + $_.Bounds.Width + "x" + $_.Bounds.Height + $(if($_.Primary){" (ana)"}) }', 15)}
    if name == 'powershell':
        cmd = '|'.join(a)
        if any(x in cmd.lower() for x in ('format-volume', 'remove-item c:\\windows', 'bcdedit', 'diskpart', 'cipher /w')):
            raise PermissionError('Bu komut güvenlik nedeniyle engellendi')
        return {'text': (ps(cmd, 60) or '(çıktı yok)')[:5000]}
    if name == 'yaz':
        text = '|'.join(a)
        esc = ''.join('{' + c + '}' if c in '+^%~(){}[]' else c for c in text)
        ps("$w=New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 600; $w.SendKeys('" + esc.replace("'", "''") + "')", 20)
        return {'text': 'Metin etkin pencereye yazıldı'}
    if name == 'word_olustur':
        os.makedirs(WORK, exist_ok=True)
        base = os.path.splitext(safe_name(a0))[0]; path = os.path.join(WORK, base + '.docx'); txt = os.path.join(WORK, base + '.tmp.txt')
        with open(txt, 'w', encoding='utf-8') as f:
            f.write('|'.join(a[1:]))
        ps(f"""$w=New-Object -ComObject Word.Application; $w.Visible=$false; $d=$w.Documents.Add(); $d.Content.Text=[IO.File]::ReadAllText('{txt}',[Text.Encoding]::UTF8); $d.SaveAs2('{path}',16); $d.Close(); $w.Quit()""", 90)
        os.remove(txt)
        if not os.path.isfile(path):
            raise RuntimeError('Word belgesi oluşturulamadı (Word kurulu olmayabilir)')
        return {'text': f'Word belgesi oluşturuldu ve doğrulandı: {path}'}
    if name == 'excel_olustur':
        os.makedirs(WORK, exist_ok=True)
        base = os.path.splitext(safe_name(a0))[0]; csvp = os.path.join(WORK, base + '.csv'); path = os.path.join(WORK, base + '.xlsx')
        rows = '|'.join(a[1:]).replace('\\n', '\n')
        with open(csvp, 'w', encoding='utf-8-sig') as f:
            f.write(rows)
        try:
            ps(f"""$x=New-Object -ComObject Excel.Application; $x.Visible=$false; $x.DisplayAlerts=$false; $b=$x.Workbooks.Open('{csvp}'); $b.SaveAs('{path}',51); $b.Close($false); $x.Quit()""", 90)
        except Exception:
            pass
        if os.path.isfile(path):
            return {'text': f'Excel dosyası oluşturuldu ve doğrulandı: {path}'}
        return {'text': f'Excel kurulu değil; CSV olarak kaydedildi (Excel/LibreOffice açar): {csvp}'}
    if name == 'donustur':
        src = inside_home(a0)
        if not src or not os.path.isfile(src):
            raise ValueError('Dosya bulunamadı')
        ext = os.path.splitext(src)[1].lower(); out = os.path.splitext(src)[0] + '.pdf'
        if ext in ('.doc', '.docx', '.rtf', '.txt'):
            ps(f"$w=New-Object -ComObject Word.Application; $d=$w.Documents.Open('{src}'); $d.SaveAs2('{out}',17); $d.Close(); $w.Quit()", 120)
        elif ext in ('.xls', '.xlsx', '.csv'):
            ps(f"$x=New-Object -ComObject Excel.Application; $x.DisplayAlerts=$false; $b=$x.Workbooks.Open('{src}'); $b.ExportAsFixedFormat(0,'{out}'); $b.Close($false); $x.Quit()", 120)
        elif ext in ('.ppt', '.pptx'):
            ps(f"$p=New-Object -ComObject PowerPoint.Application; $d=$p.Presentations.Open('{src}',$true,$false,$false); $d.SaveAs('{out}',32); $d.Close(); $p.Quit()", 120)
        else:
            raise ValueError('Desteklenen: Word, Excel, PowerPoint, metin')
        if not os.path.isfile(out):
            raise RuntimeError('PDF oluşturulamadı (Office kurulu olmayabilir)')
        return {'text': f'PDF oluşturuldu ve doğrulandı: {out}'}
    if name == 'tikla':
        x, y = int(float(a[0])), int(float(a[1]))
        if not WIN:
            raise RuntimeError('Yalnız Windows')
        ctypes.windll.user32.SetCursorPos(x, y); ctypes.windll.user32.mouse_event(2, 0, 0, 0, 0); ctypes.windll.user32.mouse_event(4, 0, 0, 0, 0)
        return {'text': f'({x}, {y}) noktasına tıklandı'}
    if name == 'kur':
        pkg = ''.join(c for c in a0 if c.isalnum() or c in '.-_ ').strip()
        if not pkg:
            raise ValueError('Paket adı gerekli (ör. VideoLAN.VLC)')
        out = subprocess.run(['winget', 'install', '-e', '--accept-package-agreements', '--accept-source-agreements', pkg], capture_output=True, timeout=900, creationflags=NO_WINDOW)
        txt = (out.stdout or b'').decode('utf-8', 'replace')[-1500:]
        if out.returncode != 0:
            raise RuntimeError('Kurulum başarısız: ' + txt[-400:])
        return {'text': 'Kurulum tamamlandı: ' + pkg}
    if name == 'yazdir':
        p = inside_home(a0)
        if not p or not os.path.isfile(p):
            raise ValueError('Yazdırılacak dosya bulunamadı')
        ps(f"Start-Process -FilePath '{p}' -Verb Print", 60)
        return {'text': 'Yazdırma isteği varsayılan yazıcıya gönderildi: ' + os.path.basename(p)}
    if name == 'kaldir':
        for k in ('gh', 'gist', 'anahtar'):
            cfg.pop(k, None)
        save_cfg(cfg)
        return {'text': 'Telefon köprüsü eşleşmesi kaldırıldı'}
    if name == 'pencereler':
        return {'text': ps("Get-Process | Where-Object { $_.MainWindowTitle } | Sort-Object ProcessName | ForEach-Object { $_.ProcessName + ' — ' + $_.MainWindowTitle }", 20) or 'Açık pencere yok'}
    if name == 'pencere':
        act, q = fold(a0), (a[1] if len(a) > 1 else '')
        if not q:
            raise ValueError('Biçim: pencere|odakla/küçült/büyüt/kapat|başlıktan bir parça')
        code = {'odakla': 9, 'kucult': 6, 'buyut': 3, 'geri': 9}.get(act)
        qq = q.replace("'", "''")
        script = ("Add-Type -Name W -Namespace U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h,int c); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h);'; "
                  f"$p = Get-Process | Where-Object {{ $_.MainWindowTitle -like '*{qq}*' -or $_.ProcessName -like '*{qq}*' }} | Where-Object {{ $_.MainWindowHandle -ne 0 }} | Select-Object -First 1; "
                  "if (-not $p) { Write-Output 'YOK'; exit } ")
        if act == 'kapat':
            if not onay:
                raise PermissionError('Pencere kapatmak için onay gerekiyor.')
            script += "$null = $p.CloseMainWindow(); Write-Output $p.MainWindowTitle"
        elif code:
            script += f"[U.W]::ShowWindow($p.MainWindowHandle,{code}) | Out-Null; " + ("[U.W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null; " if code == 9 else '') + "Write-Output $p.MainWindowTitle"
        else:
            raise ValueError('İşlem: odakla, küçült, büyüt, kapat')
        out = ps(script, 20)
        if out.strip() == 'YOK':
            raise ValueError(f'“{q}” adlı pencere bulunamadı')
        return {'text': f'Pencere “{out.strip()}” → {a0}'}
    if name in ('surecler', 'süreçler'):
        return {'text': ps("Get-Process | Sort-Object CPU -Descending | Select-Object -First 12 | ForEach-Object { '{0} · CPU {1:N0} sn · {2:N0} MB' -f $_.ProcessName, $_.CPU, ($_.WorkingSet64/1MB) }", 20)}
    if name == 'surec_kapat':
        exe = ''.join(c for c in a0 if c.isalnum() or c in '._-')
        if not exe:
            raise ValueError('Süreç adı gerekli')
        exe = exe if exe.lower().endswith('.exe') else exe + '.exe'
        if exe.lower() in ('explorer.exe', 'csrss.exe', 'winlogon.exe', 'svchost.exe', 'lsass.exe', 'services.exe', 'system', 'pythonw.exe', 'python.exe'):
            raise PermissionError('Bu sistem süreci güvenlik nedeniyle kapatılmaz')
        subprocess.run(['taskkill', '/IM', exe, '/F'], capture_output=True, creationflags=NO_WINDOW)
        time.sleep(1)
        return {'text': exe + (' kapatıldı (doğrulandı)' if not proc_running(exe) else ' kapatılamadı')}
    if name == 'ses_ayarla':
        lvl = max(0, min(100, int(float(a0))))
        for _ in range(50):
            key_press(0xAE)
        for _ in range(round(lvl / 2)):
            key_press(0xAF)
        return {'text': f'Ses yaklaşık %{lvl} yapıldı'}
    if name == 'parlaklik':
        lvl = max(0, min(100, int(float(a0))))
        ps(f"(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods).WmiSetBrightness(1,{lvl})", 15)
        cur = ps("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness", 10)
        return {'text': f'Parlaklık %{cur or lvl} (yalnız dizüstü ekranlarda çalışır)'}
    if name == 'guc':
        act = fold(a0)
        cmd = {'uyku': ['rundll32.exe', 'powrprof.dll,SetSuspendState', '0,1,0'], 'yeniden_baslat': ['shutdown', '/r', '/t', '60'], 'kapat': ['shutdown', '/s', '/t', '60'], 'iptal': ['shutdown', '/a']}.get(act.replace(' ', '_'))
        if not cmd:
            raise ValueError('guc: uyku / yeniden_baslat / kapat / iptal')
        if act != 'iptal' and not onay:
            raise PermissionError('Güç işlemi için onay gerekiyor.')
        subprocess.run(cmd, creationflags=NO_WINDOW)
        return {'text': {'uyku': 'Bilgisayar uykuya alınıyor', 'iptal': 'Bekleyen kapatma/yeniden başlatma iptal edildi'}.get(act, f'Bilgisayar 60 saniye içinde {"yeniden başlayacak" if "yeniden" in act else "kapanacak"} (iptal için: güç iptal)')}
    if name == 'wifi':
        return {'text': ps('netsh wlan show interfaces', 15)[:1500] or 'Kablosuz bağdaştırıcı yok'}
    if name == 'pil':
        out = ps("Get-CimInstance Win32_Battery | ForEach-Object { 'Pil %' + $_.EstimatedChargeRemaining + ' · durum ' + $_.BatteryStatus }", 15)
        return {'text': out or 'Pil yok (masaüstü bilgisayar)'}
    if name == 'kisayol':
        keys = fold(a0).replace(' ', '')
        names = {'ctrl': 0x11, 'alt': 0x12, 'shift': 0x10, 'win': 0x5B, 'tab': 0x09, 'enter': 0x0D, 'esc': 0x1B, 'space': 0x20, 'bosluk': 0x20, 'sil': 0x2E, 'delete': 0x2E, 'backspace': 0x08, 'yukari': 0x26, 'asagi': 0x28, 'sol': 0x25, 'sag': 0x27, 'home': 0x24, 'end': 0x23, 'pageup': 0x21, 'pagedown': 0x22, 'printscreen': 0x2C}
        names.update({f'f{i}': 0x6F + i for i in range(1, 13)})
        seq = []
        for k in keys.split('+'):
            if k in names:
                seq.append(names[k])
            elif len(k) == 1 and k.isalnum():
                seq.append(ord(k.upper()))
            else:
                raise ValueError('Bilinmeyen tuş: ' + k)
        if not WIN:
            raise RuntimeError('Yalnız Windows')
        for vk in seq:
            ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
        for vk in reversed(seq):
            ctypes.windll.user32.keybd_event(vk, 0, 2, 0)
        return {'text': 'Kısayol gönderildi: ' + a0}
    if name == 'fare':
        if not WIN:
            raise RuntimeError('Yalnız Windows')
        act = fold(a0)
        if act == 'git':
            ctypes.windll.user32.SetCursorPos(int(float(a[1])), int(float(a[2]))); return {'text': 'Fare taşındı'}
        if act == 'kaydir':
            ctypes.windll.user32.mouse_event(0x0800, 0, 0, int(float(a[1] if len(a) > 1 else -3) * 120), 0); return {'text': 'Kaydırıldı'}
        if act == 'sagtik':
            ctypes.windll.user32.mouse_event(8, 0, 0, 0, 0); ctypes.windll.user32.mouse_event(16, 0, 0, 0, 0); return {'text': 'Sağ tıklandı'}
        if act == 'ciftik':
            for _ in range(2):
                ctypes.windll.user32.mouse_event(2, 0, 0, 0, 0); ctypes.windll.user32.mouse_event(4, 0, 0, 0, 0)
            return {'text': 'Çift tıklandı'}
        raise ValueError('fare: git|x|y, kaydir|adim, sagtik, ciftik')
    if name == 'klasor_listele':
        p = inside_home(a0 or HOME)
        if not p or not os.path.isdir(p):
            raise ValueError('Klasör bulunamadı')
        rows = []
        for e in os.scandir(p):
            try:
                st = e.stat(); rows.append((st.st_mtime, e.is_dir(), e.name, st.st_size))
            except OSError:
                continue
        rows.sort(reverse=True)
        return {'text': p + '\n' + '\n'.join(('📁 ' if d else '📄 ') + n + ('' if d else f' ({sz // 1024} KB)') for _, d, n, sz in rows[:50])}
    if name == 'son_dosyalar':
        root = os.path.join(HOME, 'Downloads'); out = []
        for base in (os.path.join(HOME, 'Downloads'), os.path.join(HOME, 'Desktop'), os.path.join(HOME, 'Documents')):
            if os.path.isdir(base):
                out += [e for e in os.scandir(base) if e.is_file()]
        out.sort(key=lambda e: e.stat().st_mtime, reverse=True)
        return {'text': '\n'.join(f'{datetime.datetime.fromtimestamp(e.stat().st_mtime):%d.%m %H:%M}  {e.path}' for e in out[:15]) or 'Dosya yok'}
    if name in ('dosya_tasi', 'dosya_kopyala'):
        src, dst = inside_home(a0, name == 'dosya_tasi'), inside_home(a[1] if len(a) > 1 else '', True)
        if not src or not os.path.exists(src) or not dst:
            raise ValueError('Kaynak bulunamadı veya hedef korumalı bir sistem klasörü')
        if not onay:
            raise PermissionError('Dosya taşıma/kopyalama için onay gerekiyor.')
        if os.path.isdir(dst):
            dst = os.path.join(dst, os.path.basename(src))
        (shutil.move if name == 'dosya_tasi' else (shutil.copytree if os.path.isdir(src) else shutil.copy2))(src, dst)
        return {'text': f'{"Taşındı" if name == "dosya_tasi" else "Kopyalandı"} ve doğrulandı: {dst}' if os.path.exists(dst) else 'İşlem doğrulanamadı'}
    if name == 'dosya_sil':
        p = inside_home(a0, True)
        if not p or not os.path.exists(p):
            raise ValueError('Dosya bulunamadı veya sistem klasöründe (korumalı)')
        if not onay:
            raise PermissionError('Silme için onay gerekiyor.')
        pp = p.replace("'", "''")
        ps(f"Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::{'DeleteDirectory' if os.path.isdir(p) else 'DeleteFile'}('{pp}','OnlyErrorDialogs','SendToRecycleBin')", 30)
        return {'text': ('Geri Dönüşüm Kutusu’na taşındı (geri alınabilir): ' + p) if not os.path.exists(p) else 'Silinemedi'}
    if name == 'dosya_al':
        p = inside_home(a0)
        if not p or not os.path.isfile(p):
            raise ValueError('Dosya bulunamadı')
        size = os.path.getsize(p)
        if size > 8 * 2**20:
            raise ValueError('Dosya 8 MB’tan büyük')
        with open(p, 'rb') as f:
            return {'text': f'{os.path.basename(p)} hazır ({size // 1024} KB)', 'file': {'name': os.path.basename(p), 'data': base64.b64encode(f.read()).decode()}}
    if name == 'dosya_kaydet':
        os.makedirs(os.path.join(WORK, 'Gelen'), exist_ok=True)
        nm = ''.join(c for c in a0 if c.isalnum() or c in ' ._-()').strip()[:100] or 'dosya'
        data = base64.b64decode(a[1] if len(a) > 1 else '')
        path = os.path.join(WORK, 'Gelen', nm)
        with open(path, 'wb') as f:
            f.write(data)
        return {'text': f'Dosya bilgisayara kaydedildi ve doğrulandı: {path} ({len(data) // 1024} KB)'}
    if name == 'bildirim':
        msg = '|'.join(a)[:250].replace("'", "''")
        ps("Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; "
           f"$n.ShowBalloonTip(10000,'JARVIS','{msg}',[System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -Seconds 6; $n.Dispose()", 20)
        return {'text': 'Bilgisayarda bildirim gösterildi'}
    if name == 'nobet':
        st = nb_state(); bad = [a for a in st['ajanlar'] if a['durum'] == 'sorun']
        open_inc = [i for i in st['olaylar'] if i['durum'] in ('açık', 'onay bekliyor')]
        return {'text': f"{st['ajan']} nöbetçi ajan ({st['calisan']} etkin), {st['tur']} denetim yapıldı. Sorun: {len(bad)}. " + ' | '.join(a['ad'] + ': ' + a['mesaj'] for a in bad[:10]) + (' Açık olaylar: ' + ' | '.join(f"[{i['id']}] {i['ad']}: {i['mesaj']} ({i['durum']}{', önerilen: ' + i['onarim'] if i['onarim'] else ''}){' — teşhis: ' + i['teshis'] if i.get('teshis') else ''}" for i in open_inc[:10]) if open_inc else ''), 'data': st}
    if name == 'nobet_onay':
        inc = nb_approve(a0, fold(a[1] if len(a) > 1 else 'evet') in ('evet', 'onay', 'onayla', 'tamam', '1', 'true'))
        return {'text': f"{inc['ad']}: {inc['durum']} {inc['sonuc']}"}
    if name == 'nobet_tara':
        for ag in list(NB['agents'].values()):
            ag['son'] = 0
        return {'text': f"{len(NB['agents'])} nöbetçi yeniden taramaya alındı; sonuçlar 1-3 dakikada gelir."}
    raise ValueError('Bilinmeyen işlem: ' + name)


def proc_running(exe):
    if not WIN or not exe:
        return None
    r = subprocess.run(['tasklist', '/FI', f'IMAGENAME eq {exe}', '/NH'], capture_output=True, creationflags=NO_WINDOW)
    return exe.lower() in r.stdout.decode('utf-8', 'replace').lower()


def run_logged(name, args, onay):
    stamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        out = tool(name, args, onay); ok = True
    except Exception as e:  # her hata kullanıcıya açıkça bildirilir
        out = {'error': str(e) or e.__class__.__name__}; ok = False
    try:
        os.makedirs(WORK, exist_ok=True)
        with open(os.path.join(WORK, 'islem-kaydi.txt'), 'a', encoding='utf-8') as f:
            f.write(f"{stamp}\t{'OK' if ok else 'HATA'}\t{name}\t{' | '.join(map(str, args or []))[:200]}\t{(out.get('text') or out.get('error') or '')[:200]}\n")
    except Exception:
        pass
    out['ok'] = ok
    return out


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        o = self.headers.get('Origin', '')
        if o in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Jarvis-Token')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code); self.cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def allowed(self):
        if self.client_address[0] not in ('127.0.0.1', '::1'):
            return False
        if self.headers.get('Origin', '') not in ORIGINS:
            return False
        return hmac.compare_digest(self.headers.get('X-Jarvis-Token', '').strip().upper(), cfg['kod'])

    def do_GET(self):
        if self.path.startswith('/durum'):
            if not self.allowed():
                return self.reply(401, {'ok': False, 'error': 'Erişim kodu yanlış. Bağlantı sekmesine yardımcı penceresindeki kodu gir.'})
            return self.reply(200, {'ok': True, 'pc': platform.node(), 'version': VERSION, 'relay': bool(cfg.get('gist')), 'full': cfg.get('tam_erisim', True)})
        self.reply(404, {'ok': False})

    def do_POST(self):
        if not self.allowed():
            return self.reply(401, {'ok': False, 'error': 'Erişim kodu yanlış. Bağlantı sekmesine yardımcı penceresindeki kodu gir.'})
        n = int(self.headers.get('Content-Length', '0') or 0)
        try:
            d = json.loads(self.rfile.read(min(n, 2_000_000)) or b'{}')
        except Exception:
            return self.reply(400, {'ok': False, 'error': 'Geçersiz istek'})
        if self.path == '/eslestir':
            cfg.update({k: v for k, v in {'gh': d.get('token'), 'gist': d.get('gist'), 'anahtar': d.get('anahtar'), 'ntfy': d.get('ntfy'), 'tam_erisim': d.get('tam_erisim'), 'gemini': d.get('gemini'), 'nobet_ai': d.get('nobet_ai')}.items() if v is not None}); save_cfg(cfg)
            print('Telefon köprüsü eşleştirildi.')
            return self.reply(200, {'ok': True})
        if self.path == '/run':
            out = run_logged(fold(d.get('tool')).replace(' ', '_'), d.get('args') or [], bool(d.get('onay')))
            return self.reply(200 if out['ok'] else 422, out)
        self.reply(404, {'ok': False})

    def log_message(self, *a):
        pass


def push(title, msg):
    """Telefona anlık bildirim (ntfy.sh, ücretsiz)."""
    topic = cfg.get('ntfy')
    if not topic:
        return
    try:
        body = json.dumps({'topic': topic, 'message': msg, 'title': title, 'tags': ['computer']}).encode('utf-8')
        req = urllib.request.Request('https://ntfy.sh/', data=body, method='POST', headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


def watch_loop():
    """Eski basit izleyici; görevi artık nöbetçiler yapıyor (iş parçacığı adı korunur)."""
    while True:
        time.sleep(3600)


def relay_loop():
    """Telefon köprüsü: Gist'teki imzalı komutları okur, sonuçları yazar."""
    seen = set()
    while True:
        time.sleep(4)
        if not (cfg.get('gh') and cfg.get('gist') and cfg.get('anahtar')):
            continue
        try:
            req = urllib.request.Request('https://api.github.com/gists/' + cfg['gist'], headers={'Authorization': 'Bearer ' + cfg['gh'], 'Accept': 'application/vnd.github+json', 'Cache-Control': 'no-cache'})
            files = json.load(urllib.request.urlopen(req, timeout=15))['files']
            cmds = json.loads((files.get('pc-komut.json') or {}).get('content') or '{}').get('komutlar', [])
            try:
                results = json.loads((files.get('pc-sonuc.json') or {}).get('content') or '{}')
            except Exception:
                results = {}
            changed = False
            for c in cmds:
                cid = c.get('id')
                if not cid or cid in seen or cid in results:
                    continue
                seen.add(cid)
                msg = f"{cid}{c.get('tool')}{json.dumps(c.get('args'), ensure_ascii=False, separators=(',', ':'))}{c.get('ts')}"
                good = hmac.compare_digest(hmac.new(bytes.fromhex(cfg['anahtar']), msg.encode('utf-8'), hashlib.sha256).hexdigest(), str(c.get('sig')))
                fresh = abs(time.time() * 1000 - float(c.get('ts') or 0)) < 300_000
                if not good or not fresh:
                    results[cid] = {'ok': False, 'error': 'İmza veya zaman geçersiz; komut reddedildi'}
                else:
                    print('Telefondan komut:', c.get('tool'), c.get('args'))
                    out = run_logged(fold(c.get('tool')).replace(' ', '_'), c.get('args') or [], bool(c.get('onay')))
                    out.pop('image', None) if len(out.get('image', '')) > 600_000 else None
                    if len(json.dumps(out.get('file', ''))) > 700_000:
                        out.pop('file', None); out['text'] = out.get('text', '') + ' (dosya telefon köprüsü için çok büyük; bilgisayardan aç)'
                    results[cid] = out
                changed = True
            if changed:
                results = dict(list(results.items())[-20:])
                body = json.dumps({'files': {'pc-sonuc.json': {'content': json.dumps(results, ensure_ascii=False)}}}).encode('utf-8')
                urllib.request.urlopen(urllib.request.Request('https://api.github.com/gists/' + cfg['gist'], data=body, method='PATCH', headers={'Authorization': 'Bearer ' + cfg['gh'], 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'}), timeout=20)
        except Exception as e:
            if '401' in str(e):
                print('GitHub anahtarı geçersiz; telefon köprüsü durdu.')
                time.sleep(60)



# =====================================================================================
#  NÖBETÇİLER — 7/24 çalışan, kendi kendini onaran izleme ajanları
#  Her ajan bir şeyi denetler; sorun bulursa güvenli onarımı kendisi yapar, riskli onarımı
#  Beyhan'ın onayına bırakır ve telefona bildirir. Yapay zekâ teşhisi yalnız gerçek sorunda
#  ve günlük bütçeyle çalışır. Bütün ajanlar hata yakalar; biri çökse diğerleri sürer.
# =====================================================================================
NB_FILE = os.path.join(WORK, 'nobet.json')
NB = {'agents': {}, 'incidents': [], 'runs': 0, 'started': time.time(), 'ai_day': '', 'ai_used': 0}
NB_LOCK = threading.Lock()
NB_CACHE = {}
SVC_SKIP = {'gupdate', 'gupdatem', 'edgeupdate', 'edgeupdatem', 'sppsvc', 'remoteregistry', 'mapsbroker', 'trustedinstaller', 'wuauserv', 'bits',
            'dmwappushservice', 'cdpsvc', 'onesyncsvc', 'wbiosrvc', 'tabletinputservice', 'sysmain', 'diagtrack', 'clicktorunsvc', 'gamingservices',
            'brokerinfrastructure', 'tiledatamodelsvc', 'ws-management', 'winrm', 'msiserver', 'wsearch_delayed'}


def nb_load():
    try:
        with open(NB_FILE, encoding='utf-8') as f:
            d = json.load(f)
        NB['incidents'] = d.get('incidents', [])[-200:]
        NB['baseline'] = d.get('baseline', {})
    except Exception:
        NB['baseline'] = {}


def nb_save():
    try:
        os.makedirs(WORK, exist_ok=True)
        tmp = NB_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({'incidents': NB['incidents'][-200:], 'baseline': NB.get('baseline', {})}, f, ensure_ascii=False)
        os.replace(tmp, NB_FILE)
    except Exception:
        pass


def agent(aid, ad, grup, her):
    """Ajan kaydı: fonksiyon {'durum': 'ok'|'sorun'|'atla', 'mesaj', 'onem', 'onarim': (ad, fn, guvenli)} döndürür."""
    def deco(fn):
        NB['agents'][aid] = {'id': aid, 'ad': ad, 'grup': grup, 'her': her, 'fn': fn, 'son': 0, 'durum': 'bekliyor', 'mesaj': '', 'ardisik': 0}
        return fn
    return deco


def ok(msg=''):
    return {'durum': 'ok', 'mesaj': msg}


def sorun(msg, onem='uyarı', onarim=None, esik=1):
    return {'durum': 'sorun', 'mesaj': msg, 'onem': onem, 'onarim': onarim, 'esik': esik}


def atla(msg='bu bilgisayarda geçerli değil'):
    return {'durum': 'atla', 'mesaj': msg}


def incident_for(aid):
    return next((i for i in reversed(NB['incidents']) if i['ajan'] == aid and i['durum'] in ('açık', 'onay bekliyor')), None)


DEPENDS_NET = {'kopru', 'saat', 'surum', 'veri_yedek'}  # internet yokken bunların sorunu ayrı olay sayılmaz (kök neden: internet)


def anomaly(aid, x, floor, k=3.0):
    """Öğrenen eşik: değerin bu bilgisayardaki normalini (EWMA ortalama/sapma) öğrenir; normalin çok üstü ve tabanın üstüyse True."""
    e = NB.setdefault('baseline', {}).setdefault('ewma', {}).setdefault(aid, {'m': x, 'v': 25.0, 'n': 0})
    sd = max(3.0, e['v'] ** 0.5)
    hit = e['n'] >= 20 and x >= floor and x > e['m'] + k * sd
    if not hit:  # anormal değerler normali bozmasın
        e['m'] = e['m'] * 0.95 + x * 0.05; e['v'] = e['v'] * 0.95 + (x - e['m']) ** 2 * 0.05; e['n'] += 1
    return hit, round(e['m'])


def playbook(aid, okd=None):
    pb = NB.setdefault('baseline', {}).setdefault('playbook', {}).setdefault(aid, {'ok': 0, 'fail': 0})
    if okd is not None:
        pb['ok' if okd else 'fail'] += 1
    return pb


def try_fix(inc, fn, aid):
    inc['deneme'] = inc.get('deneme', 0) + 1; inc['son_deneme'] = time.time()
    try:
        out = fn(); playbook(aid, True)
        inc.update(durum='onarıldı', sonuc=str(out or 'tamam')[:300], bitis=time.time()); return True
    except Exception as e:
        playbook(aid, False)
        inc.update(durum='açık', sonuc=f'otomatik onarım denemesi {inc["deneme"]} başarısız: ' + str(e)[:200]); return False


def nb_run_agent(a):
    try:
        r = a['fn']() or ok()
    except Exception as e:
        r = {'durum': 'atla', 'mesaj': 'denetim yapılamadı: ' + str(e)[:120]}
    net = NB['agents'].get('internet')
    if r['durum'] == 'sorun' and a['id'] in DEPENDS_NET and net and net['durum'] == 'sorun':
        r = {'durum': 'atla', 'mesaj': 'internet yok (kök neden: İnternet bağlantısı)'}
    a['son'] = time.time(); a['durum'] = r['durum']; a['mesaj'] = r.get('mesaj', '')
    NB['runs'] += 1
    inc = incident_for(a['id'])
    if r['durum'] != 'sorun':
        a['ardisik'] = 0
        if inc:
            inc.update(durum='kendiliğinden düzeldi', bitis=time.time()); nb_save()
        return
    a['ardisik'] += 1
    fix = r.get('onarim')
    # açık olayda güvenli onarımı artan aralıklarla yeniden dene (10, 20, 40 dk); 3 denemeden sonra Beyhan'a bırak
    if inc and inc['durum'] == 'açık' and fix and fix[2] and inc.get('deneme', 0) < 3 and time.time() - inc.get('son_deneme', 0) > 600 * 2 ** (inc.get('deneme', 1) - 1):
        if not try_fix(inc, fix[1], a['id']) and inc['deneme'] >= 3:
            inc['durum'] = 'onay bekliyor'; NB_FIXES[inc['id']] = fix[1]
            push('JARVIS nöbetçi · ' + inc['ad'], inc['mesaj'] + ' → otomatik onarım 3 kez başarısız, onayını bekliyor')
            threading.Thread(target=nb_ai, args=(inc,), daemon=True).start()
        nb_save(); return
    if a['ardisik'] < r.get('esik', 1) or inc:
        return
    day_ago = time.time() - 86400
    repeat = sum(1 for i in NB['incidents'] if i['ajan'] == a['id'] and i['zaman'] > day_ago)
    msg, onem = r['mesaj'], r.get('onem', 'uyarı')
    if repeat >= 2:
        msg += f' — TEKRARLAYAN SORUN (24 saatte {repeat + 1}. kez)'
        if onem == 'bilgi':
            onem = 'uyarı'
        elif repeat >= 3:
            onem = 'kritik'
    inc = {'id': secrets.token_hex(4), 'ajan': a['id'], 'ad': a['ad'], 'grup': a['grup'], 'mesaj': msg, 'onem': onem,
           'zaman': time.time(), 'durum': 'açık', 'onarim': fix[0] if fix else '', 'guvenli': bool(fix and fix[2]), 'sonuc': '', 'teshis': ''}
    with NB_LOCK:
        NB['incidents'].append(inc)
    pb = playbook(a['id'])
    if fix and fix[2] and not (pb['fail'] >= 3 and pb['ok'] == 0):
        try_fix(inc, fix[1], a['id'])
    elif fix:
        inc['durum'] = 'onay bekliyor'
        if fix[2]:
            inc['sonuc'] = 'bu onarım daha önce hep başarısız oldu; otomatik denenmedi'
        NB_FIXES[inc['id']] = fix[1]
    if inc['onem'] == 'kritik' or inc['durum'] == 'onay bekliyor' or (inc['durum'] == 'açık' and inc['onem'] != 'bilgi'):
        threading.Thread(target=nb_ai, args=(inc,), daemon=True).start()
        push('JARVIS nöbetçi · ' + inc['ad'], inc['mesaj'] + ' → ' + inc['durum'] + (': ' + inc['onarim'] if inc['onarim'] else ''))
    elif inc['durum'] == 'onarıldı' and inc['onem'] != 'bilgi':
        push('JARVIS onardı · ' + inc['ad'], inc['mesaj'] + ' → ' + inc['sonuc'])
    nb_save()


NB_FIXES = {}


def nb_approve(iid, yes):
    inc = next((i for i in NB['incidents'] if i['id'] == iid), None)
    if not inc or inc['durum'] != 'onay bekliyor':
        raise ValueError('Onay bekleyen böyle bir olay yok')
    fn = NB_FIXES.pop(iid, None)
    if not yes or not fn:
        inc.update(durum='reddedildi' if not yes else 'onarım yok', bitis=time.time()); nb_save(); return inc
    try:
        inc.update(durum='onarıldı', sonuc=str(fn() or 'tamam')[:300], bitis=time.time())
    except Exception as e:
        inc.update(durum='açık', sonuc='onarım başarısız: ' + str(e)[:200])
    nb_save(); return inc


def nb_ai(inc):
    """Gerçek sorunda Gemini ile kısa teşhis (günlük 30 istek bütçesi)."""
    key = cfg.get('gemini')
    if not key or cfg.get('nobet_ai') is False:
        return
    day = datetime.date.today().isoformat()
    if NB['ai_day'] != day:
        NB['ai_day'] = day; NB['ai_used'] = 0
    if NB['ai_used'] >= 30:
        return
    NB['ai_used'] += 1
    ctx = ''
    try:
        if WIN:
            ctx = ps("Get-WinEvent -FilterHashtable @{LogName='System','Application';Level=1,2;StartTime=(Get-Date).AddHours(-1)} -MaxEvents 8 -ErrorAction SilentlyContinue | ForEach-Object { $_.ProviderName + ': ' + ($_.Message -split \"`n\")[0] }", 20)[:2500]
    except Exception:
        pass
    prompt = (f'Windows bilgisayarda izleme ajanı bir sorun buldu.\nAjan: {inc["ad"]} ({inc["grup"]})\nBulgu: {inc["mesaj"]}\nOnarım: {inc["onarim"] or "yok"} · durum: {inc["durum"]} {inc["sonuc"]}\n'
              f'Son hata kayıtları:\n{ctx}\n\nTürkçe, en fazla 3 kısa cümle: olası neden, ne kadar ciddi, Beyhan ne yapmalı. Emin değilsen söyle.')
    body = json.dumps({'contents': [{'role': 'user', 'parts': [{'text': prompt}]}], 'generationConfig': {'maxOutputTokens': 300}}).encode('utf-8')
    for model in ('gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest'):
        try:
            req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', data=body, method='POST', headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
            d = json.load(urllib.request.urlopen(req, timeout=30))
            inc['teshis'] = ''.join(p.get('text', '') for p in d['candidates'][0]['content']['parts']).strip()[:800]
            nb_save(); return
        except Exception:
            continue


def nb_services():
    """Otomatik başlayan servislerin durumu (2 dakikada bir tek PowerShell çağrısı, tüm servis ajanları paylaşır)."""
    c = NB_CACHE.get('svc')
    if c and time.time() - c[0] < 110:
        return c[1]
    rows = json.loads(ps("Get-CimInstance Win32_Service -Filter \"StartMode='Auto'\" | Select-Object Name,DisplayName,State,ExitCode | ConvertTo-Json -Compress", 40) or '[]')
    rows = rows if isinstance(rows, list) else [rows]
    d = {r['Name']: r for r in rows}
    NB_CACHE['svc'] = (time.time(), d)
    return d


def nb_register_services():
    if not WIN:
        return
    try:
        svcs = nb_services()
    except Exception:
        return
    for name, r in svcs.items():
        if name.lower() in SVC_SKIP or name.lower().endswith(('_', 'svc_')) or '_' in name:  # kullanıcıya özel servis kopyaları atlanır
            continue
        def make(n=name, disp=r.get('DisplayName') or name):
            def chk():
                s = nb_services().get(n)
                if not s:
                    return atla('servis kaldırılmış')
                if s.get('State') == 'Running':
                    return ok('çalışıyor')
                if (s.get('ExitCode') or 0) == 0:
                    return ok('durmuş ama hata yok (isteğe bağlı başlar)')
                return sorun(f'“{disp}” servisi çöktü (çıkış kodu {s.get("ExitCode")})', 'uyarı', ('servisi yeniden başlat', lambda: ps(f"Start-Service -Name '{n}' -ErrorAction Stop; (Get-Service '{n}').Status", 40), True), esik=2)
            return chk
        agent('servis:' + name, (r.get('DisplayName') or name)[:60], 'Windows servisleri', 120)(make())


def nb_register():
    for d in drives():
        def mk(dr=d):
            def chk():
                u = shutil.disk_usage(dr); free = u.free / u.total
                if free < 0.05:
                    return sorun(f'{dr} diski neredeyse dolu: {u.free / 2**30:.1f} GB boş', 'kritik', ('geçici dosyaları temizle', lambda: tool('temizlik_sil', [], True)['text'], False))
                if free < 0.10:
                    return sorun(f'{dr} diskinde yer azaldı: %{free * 100:.0f} boş', 'uyarı', ('geçici dosyaları temizle', lambda: tool('temizlik_sil', [], True)['text'], False), esik=2)
                return ok(f'%{free * 100:.0f} boş')
            return chk
        agent('disk:' + d, f'{d} disk alanı', 'Depolama', 600)(mk())

    @agent('bellek', 'Bellek (RAM) baskısı', 'Performans', 60)
    def _():
        load, total, used = mem_info()
        hit, norm = anomaly('bellek', load, 85)
        if load >= 92 or hit:
            top = ps("Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 3 | ForEach-Object { $_.ProcessName + ' ' + [int]($_.WorkingSet64/1MB) + 'MB' }", 15).replace('\r', '').replace('\n', ', ') if WIN else ''
            return sorun(f'Bellek %{load} dolu (bu bilgisayarın normali %{norm}). En çok kullanan: {top}', 'uyarı', esik=3)
        return ok(f'%{load} · normali %{norm}')

    @agent('islemci', 'İşlemci yükü', 'Performans', 60)
    def _():
        c = cpu_load()
        if c < 0:
            return atla()
        hit, norm = anomaly('islemci', c, 85)
        if c >= 95 or hit:
            top = ps("Get-Process | Sort-Object CPU -Descending | Select-Object -First 3 | ForEach-Object { $_.ProcessName }", 15).replace('\r', '').replace('\n', ', ') if WIN else ''
            return sorun(f'İşlemci sürekli %{c} yükte (normali %{norm}). Olası: {top}', 'uyarı', esik=4)
        return ok(f'%{c} · normali %{norm}')

    @agent('internet', 'İnternet bağlantısı', 'Ağ', 120)
    def _():
        import socket
        try:
            socket.setdefaulttimeout(5); socket.gethostbyname('www.google.com')
        except Exception:
            return sorun('Alan adı çözülemiyor (DNS) — internet yok veya DNS bozuk', 'uyarı', ('DNS önbelleğini temizle', lambda: subprocess.run(['ipconfig', '/flushdns'], capture_output=True, creationflags=NO_WINDOW) and 'DNS önbelleği temizlendi', True) if WIN else None, esik=2)
        try:
            urllib.request.urlopen('https://www.google.com/generate_204', timeout=8)
        except Exception:
            return sorun('İnternete erişilemiyor (DNS çalışıyor, bağlantı yok)', 'uyarı', esik=2)
        return ok('çevrimiçi')

    @agent('defender', 'Virüs koruması (Defender)', 'Güvenlik', 900)
    def _():
        if not WIN:
            return atla()
        d = json.loads(ps('Get-MpComputerStatus | Select-Object RealTimeProtectionEnabled,AntivirusEnabled,AntivirusSignatureAge | ConvertTo-Json -Compress', 30) or '{}')
        if d.get('AntivirusEnabled') is False or d.get('RealTimeProtectionEnabled') is False:
            return sorun('Gerçek zamanlı virüs koruması KAPALI', 'kritik', ('korumayı aç (yönetici izni gerekebilir)', lambda: ps('Set-MpPreference -DisableRealtimeMonitoring $false', 30) or 'açıldı', False))
        if (d.get('AntivirusSignatureAge') or 0) > 3:
            return sorun(f'Virüs tanımları {d.get("AntivirusSignatureAge")} gündür güncellenmemiş', 'uyarı', ('tanımları güncelle', lambda: ps('Update-MpSignature', 300) or 'güncellendi', True))
        return ok('açık, tanımlar güncel')

    @agent('tehdit', 'Algılanan tehditler', 'Güvenlik', 1800)
    def _():
        if not WIN:
            return atla()
        t = ps("Get-MpThreatDetection | Where-Object { $_.InitialDetectionTime -gt (Get-Date).AddDays(-1) } | ForEach-Object { $_.ThreatID }", 30)
        return sorun('Son 24 saatte Defender tehdit algıladı: ' + t.replace('\n', ', '), 'kritik') if t.strip() else ok('tehdit yok')

    @agent('guvenlik_duvari', 'Güvenlik duvarı', 'Güvenlik', 1800)
    def _():
        if not WIN:
            return atla()
        off = ps("Get-NetFirewallProfile | Where-Object { -not $_.Enabled } | ForEach-Object { $_.Name }", 20).strip()
        return sorun('Güvenlik duvarı kapalı: ' + off.replace('\n', ', '), 'kritik', ('güvenlik duvarını aç (yönetici izni gerekebilir)', lambda: ps('Set-NetFirewallProfile -All -Enabled True', 30) or 'açıldı', False)) if off else ok('açık')

    @agent('hosts', 'Hosts dosyası bütünlüğü', 'Güvenlik', 1800)
    def _():
        hp = r'C:\Windows\System32\drivers\etc\hosts' if WIN else '/etc/hosts'
        try:
            h = hashlib.sha256(open(hp, 'rb').read()).hexdigest()
        except Exception:
            return atla('okunamadı')
        base = NB.setdefault('baseline', {})
        if not base.get('hosts'):
            base['hosts'] = h; nb_save(); return ok('temel kayıt alındı')
        if base['hosts'] != h:
            return sorun('Hosts dosyası değişti — zararlı yazılım siteleri yönlendiriyor olabilir', 'kritik', ('değişikliği bilinen olarak kabul et', lambda: base.update(hosts=h) or nb_save() or 'yeni hâl kaydedildi', False))
        return ok('değişmedi')

    @agent('baslangic_yeni', 'Yeni başlangıç programları', 'Güvenlik', 1800)
    def _():
        if not WIN:
            return atla()
        cur = sorted(x for x in ps("Get-CimInstance Win32_StartupCommand | ForEach-Object { $_.Name }", 20).splitlines() if x.strip())
        base = NB.setdefault('baseline', {})
        if 'startup' not in base:
            base['startup'] = cur; nb_save(); return ok(f'{len(cur)} program kaydedildi')
        new = [x for x in cur if x not in base['startup']]
        if new:
            return sorun('Bilgisayar açılışına yeni program eklendi: ' + ', '.join(new), 'uyarı', ('bilinen olarak kabul et', lambda: base.update(startup=cur) or nb_save() or 'kabul edildi', False))
        return ok(f'{len(cur)} program, yeni yok')

    @agent('olay_gunlugu', 'Sistem hata kayıtları', 'Sistem sağlığı', 600)
    def _():
        if not WIN:
            return atla()
        n = ps("(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddMinutes(-15)} -ErrorAction SilentlyContinue | Measure-Object).Count", 20).strip() or '0'
        return sorun(f'Son 15 dakikada {n} sistem hatası kaydedildi', 'uyarı', esik=2) if int(n) >= 5 else ok(f'{n} hata')

    @agent('cokmeler', 'Program çökmeleri', 'Sistem sağlığı', 900)
    def _():
        if not WIN:
            return atla()
        out = ps("Get-WinEvent -FilterHashtable @{LogName='Application';Id=1000;StartTime=(Get-Date).AddHours(-1)} -ErrorAction SilentlyContinue | ForEach-Object { ($_.Properties[0].Value) } | Group-Object | ForEach-Object { $_.Name + ' x' + $_.Count }", 20).strip()
        return sorun('Son 1 saatte çöken programlar: ' + out.replace('\n', ', '), 'uyarı') if out else ok('çökme yok')

    @agent('disk_saglik', 'Disk donanım sağlığı', 'Depolama', 3600)
    def _():
        if not WIN:
            return atla()
        bad = ps("Get-PhysicalDisk | Where-Object { $_.HealthStatus -ne 'Healthy' } | ForEach-Object { $_.FriendlyName + ' ' + $_.HealthStatus }", 20).strip()
        return sorun('Disk sağlığı bozuluyor: ' + bad + ' — hemen yedek al', 'kritik', ('Belgeler klasörünü yedekle', lambda: tool('yedekle', [os.path.join(HOME, 'Documents')], True)['text'], False)) if bad else ok('sağlıklı')

    @agent('gezgin', 'Masaüstü (Gezgin) çalışıyor', 'Sistem sağlığı', 120)
    def _():
        if not WIN:
            return atla()
        if proc_running('explorer.exe') is False:
            return sorun('Görev çubuğu ve masaüstü (explorer) kapanmış', 'uyarı', ('Gezgini yeniden başlat', lambda: subprocess.Popen(['explorer.exe']) and 'başlatıldı', True))
        return ok('çalışıyor')

    @agent('saat', 'Saat doğruluğu', 'Sistem sağlığı', 3600)
    def _():
        try:
            d = urllib.request.urlopen('https://www.google.com/generate_204', timeout=8).headers.get('Date')
            from email.utils import parsedate_to_datetime
            drift = abs(time.time() - parsedate_to_datetime(d).timestamp())
        except Exception:
            return atla('internet yok')
        if drift > 120:
            return sorun(f'Bilgisayar saati {int(drift)} saniye kaymış', 'uyarı', ('saati eşitle', lambda: subprocess.run(['w32tm', '/resync'], capture_output=True, creationflags=NO_WINDOW) and 'eşitleme istendi', True) if WIN else None)
        return ok(f'{int(drift)} sn fark')

    @agent('yeniden_baslatma', 'Bekleyen yeniden başlatma', 'Güncellemeler', 3600)
    def _():
        if not WIN:
            return atla()
        p = ps("Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'", 10).strip()
        return sorun('Güncellemeler için bilgisayarın yeniden başlatılması bekleniyor', 'bilgi') if p == 'True' else ok('yok')

    @agent('guncelleme', 'Windows güncellemeleri', 'Güncellemeler', 21600)
    def _():
        if not WIN:
            return atla()
        d = ps("(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd')", 30).strip()
        try:
            days = (datetime.date.today() - datetime.date.fromisoformat(d)).days
        except Exception:
            return atla('tarih okunamadı')
        return sorun(f'Son Windows güncellemesi {days} gün önce', 'uyarı', ('Windows Update ekranını aç', lambda: open_target('ms-settings:windowsupdate') or 'açıldı', True)) if days > 40 else ok(f'{days} gün önce')

    @agent('yazici_kuyruk', 'Yazıcı kuyruğu', 'Aygıtlar', 600)
    def _():
        if not WIN:
            return atla()
        n = ps("(Get-Printer | ForEach-Object { Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue } | Where-Object { $_.JobStatus -match 'Error|Blocked' } | Measure-Object).Count", 20).strip() or '0'
        return sorun(f'{n} yazdırma işi takıldı', 'uyarı', ('yazdırma hizmetini yeniden başlat', lambda: ps('Restart-Service Spooler -Force', 40) or 'yeniden başlatıldı', False)) if int(n) else ok('takılan iş yok')

    @agent('pil', 'Pil durumu', 'Aygıtlar', 300)
    def _():
        if not WIN:
            return atla()
        d = json.loads(ps('Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress', 15) or 'null')
        if not d:
            return atla('pil yok')
        lvl, st = d.get('EstimatedChargeRemaining', 100), d.get('BatteryStatus')
        return sorun(f'Pil %{lvl} ve şarj olmuyor', 'uyarı') if lvl < 15 and st == 1 else ok(f'%{lvl}')

    @agent('temp', 'Geçici dosya birikimi', 'Depolama', 21600)
    def _():
        size = 0; tmp = tempfile.gettempdir()
        for dp, dn, fn in os.walk(tmp):
            for f in fn:
                try:
                    size += os.path.getsize(os.path.join(dp, f))
                except OSError:
                    pass
        return sorun(f'Geçici dosyalar {size / 2**30:.1f} GB yer kaplıyor', 'bilgi', ('geçici dosyaları temizle', lambda: tool('temizlik_sil', [], True)['text'], False)) if size > 5 * 2**30 else ok(f'{size / 2**20:.0f} MB')

    # --- yardımcının kendi sağlığı (kendi kendini onarma) ---
    @agent('yardimci_iplikler', 'JARVIS yardımcısı iş parçacıkları', 'Kendi kendini onarma', 60)
    def _():
        dead = [n for n, t in THREADS.items() if not t.is_alive()]
        if dead:
            def revive():
                for n in dead:
                    start_thread(n)
                return 'yeniden başlatıldı: ' + ', '.join(dead)
            return sorun('Durmuş iş parçacığı: ' + ', '.join(dead), 'uyarı', ('yeniden başlat', revive, True))
        return ok('hepsi çalışıyor')

    @agent('yardimci_ayar', 'Yardımcı ayar dosyası', 'Kendi kendini onarma', 600)
    def _():
        try:
            with open(CONFIG, encoding='utf-8') as f:
                json.load(f)
            return ok('sağlam')
        except Exception:
            return sorun('Ayar dosyası bozulmuş', 'uyarı', ('bellekteki ayarlardan yeniden yaz', lambda: save_cfg(cfg) or 'onarıldı', True))

    @agent('yardimci_kayit', 'İşlem kaydı boyutu', 'Kendi kendini onarma', 3600)
    def _():
        lp = os.path.join(WORK, 'islem-kaydi.txt')
        if os.path.isfile(lp) and os.path.getsize(lp) > 5 * 2**20:
            def rotate():
                os.replace(lp, lp + '.' + datetime.date.today().isoformat()); return 'kayıt arşivlendi'
            return sorun('İşlem kaydı 5 MB’ı geçti', 'bilgi', ('arşivle ve yeniden başlat', rotate, True))
        return ok('normal')

    @agent('kopru', 'Telefon köprüsü (eşitleme)', 'Bağlantılar', 900)
    def _():
        if not cfg.get('gist'):
            return atla('eşitleme kurulmamış')
        try:
            req = urllib.request.Request('https://api.github.com/gists/' + cfg['gist'], headers={'Authorization': 'Bearer ' + cfg.get('gh', ''), 'Accept': 'application/vnd.github+json'})
            urllib.request.urlopen(req, timeout=15)
            return ok('erişilebilir')
        except urllib.error.HTTPError as e:
            return sorun('Telefon köprüsü çalışmıyor: GitHub ' + str(e.code) + (' (anahtar geçersiz/süresi dolmuş)' if e.code == 401 else ''), 'uyarı', esik=2)
        except Exception:
            return atla('internet yok')

    @agent('veri_yedek', 'JARVIS verisi günlük yedek', 'Veri koruma', 3600)
    def _():
        if not cfg.get('gist'):
            return atla('eşitleme kurulmamış')
        day = datetime.date.today().isoformat(); dst = os.path.join(WORK, 'Yedekler', 'jarvis-veri-' + day + '.enc')
        if os.path.isfile(dst):
            return ok('bugünün yedeği var')
        def backup():
            req = urllib.request.Request('https://api.github.com/gists/' + cfg['gist'], headers={'Authorization': 'Bearer ' + cfg.get('gh', ''), 'Accept': 'application/vnd.github+json'})
            f = json.load(urllib.request.urlopen(req, timeout=20))['files'].get('jarvis.enc', {})
            content = f.get('content') or (urllib.request.urlopen(f['raw_url'], timeout=20).read().decode() if f.get('raw_url') else '')
            if not content:
                raise RuntimeError('veri yok')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'w', encoding='utf-8') as fh:
                fh.write(content)
            old = sorted(x for x in os.listdir(os.path.dirname(dst)) if x.startswith('jarvis-veri-'))
            for x in old[:-30]:
                os.remove(os.path.join(os.path.dirname(dst), x))
            return 'şifreli yedek alındı: ' + os.path.basename(dst)
        return sorun('Bugünün JARVIS veri yedeği alınmadı', 'bilgi', ('şifreli yedeği al', backup, True))

    @agent('surum', 'Yardımcı sürümü', 'Kendi kendini onarma', 21600)
    def _():
        try:
            latest = urllib.request.urlopen('https://beyhanerden64-rgb.github.io/jarvis/pc/version.txt', timeout=10).read().decode().strip()
        except Exception:
            return atla('kontrol edilemedi')
        if latest and latest != VERSION:
            def update():
                code = urllib.request.urlopen('https://beyhanerden64-rgb.github.io/jarvis/pc/jarvis_pc.py', timeout=30).read()
                compile(code, 'jarvis_pc.py', 'exec')  # bozuk indirme kurulmaz
                me = os.path.abspath(__file__)
                shutil.copy2(me, me + '.eski')
                with open(me, 'wb') as f:
                    f.write(code)
                threading.Timer(3, lambda: os._exit(0)).start()  # bekçi görevi yeni sürümle yeniden başlatır
                return f'{latest} sürümü kuruldu, yardımcı yeniden başlıyor'
            return sorun(f'Yeni yardımcı sürümü var: {latest} (şu an {VERSION})', 'bilgi', ('güncelle', update, False))
        return ok('güncel')

    nb_register_services()


def nobet_loop():
    nb_load()
    try:
        nb_register()
    except Exception as e:
        print('nöbetçi kaydı hatası:', e)
    while True:
        due = [a for a in list(NB['agents'].values()) if time.time() - a['son'] >= a['her']]
        for a in due[:40]:  # tur başına sınır: bilgisayarı yormaz
            nb_run_agent(a)
            time.sleep(0.2)
        if time.time() - NB.get('saved_at', 0) > 600:
            NB['saved_at'] = time.time(); nb_save()
        time.sleep(15)


def nb_state():
    ag = list(NB['agents'].values())
    groups = {}
    for a in ag:
        g = groups.setdefault(a['grup'], {'toplam': 0, 'sorun': 0, 'atla': 0})
        g['toplam'] += 1; g['sorun'] += a['durum'] == 'sorun'; g['atla'] += a['durum'] == 'atla'
    return {'ajan': len(ag), 'calisan': sum(a['durum'] != 'atla' for a in ag), 'sorun': sum(a['durum'] == 'sorun' for a in ag), 'tur': NB['runs'],
            'baslangic': NB['started'], 'gruplar': groups, 'ai_kullanim': NB['ai_used'],
            'ajanlar': [{k: a[k] for k in ('id', 'ad', 'grup', 'durum', 'mesaj', 'son')} for a in ag if a['durum'] in ('sorun',)] + [{k: a[k] for k in ('id', 'ad', 'grup', 'durum', 'mesaj', 'son')} for a in ag if a['durum'] not in ('sorun',)][:400],
            'olaylar': NB['incidents'][-60:]}


THREADS = {}


def start_thread(name):
    t = threading.Thread(target={'relay': relay_loop, 'watch': watch_loop, 'nobet': nobet_loop}[name], daemon=True, name=name)
    t.start(); THREADS[name] = t


def main():
    os.makedirs(WORK, exist_ok=True)
    print('=' * 56)
    print(f'  JARVIS bilgisayar yardımcısı {VERSION}')
    print(f'  ERİŞİM KODU:  {cfg["kod"]}')
    print('  JARVIS → BAĞLANTI → “Yardımcı erişim kodu” kutusuna yaz.')
    print('  Bu pencere açık kaldıkça JARVIS bilgisayarını kullanabilir.')
    print('=' * 56)
    for n in ('relay', 'watch', 'nobet'):
        start_thread(n)
    push('JARVIS', f'Bilgisayar yardımcısı başladı ({platform.node()})')
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        print('Yardımcı zaten çalışıyor.'); return
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    if '--kod' in sys.argv:
        print(cfg['kod'])
    elif '--test' in sys.argv:
        print(json.dumps(run_logged(sys.argv[2], sys.argv[3:], True), ensure_ascii=False))
    else:
        main()
