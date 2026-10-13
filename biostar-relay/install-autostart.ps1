# Sets the Vision7 BioStar Relay up to start automatically when the PC boots (no login needed) and to
# restart itself if it ever stops. Safe to run again: it replaces the previous setup.
$ErrorActionPreference = 'Stop'
$TaskName = 'Vision7 BioStar Relay'
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Dir

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Good($msg) { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

try {
  # 1. Node.js
  Step 'Checking Node.js'
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $node) { throw 'Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.' }
  Good "Found $node"

  # 2. Settings
  Step 'Checking config.env'
  $cfg = Join-Path $Dir 'config.env'
  if (-not (Test-Path $cfg)) {
    Copy-Item (Join-Path $Dir 'config.env.example') $cfg
    Warn 'config.env did not exist. Notepad will open: fill in the BioStar login ID and password, save, and close it.'
    Start-Process notepad.exe -ArgumentList $cfg -Wait
  }
  $text = Get-Content $cfg -Raw
  if ($text -match 'CHANGE_ME') { throw 'config.env still contains CHANGE_ME. Fill in BIOSTAR_LOGIN_ID and BIOSTAR_PASSWORD, save, then run this again.' }
  $port = 8443
  if ($text -match '(?m)^\s*RELAY_PORT\s*=\s*(\d+)') { $port = [int]$Matches[1] }
  Good "Relay port: $port"

  # Only administrators and this user may read the BioStar password.
  $me = "$env:USERDOMAIN\$env:USERNAME"
  & icacls.exe $cfg /inheritance:r /grant:r 'SYSTEM:(F)' 'BUILTIN\Administrators:(F)' "${me}:(M)" | Out-Null

  # 3. Stop an old relay that is still holding the port
  Step "Stopping anything already using port $port"
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force; Good "Stopped old relay (process $($p.Id))" }
    elseif ($p) { throw "Port $port is used by '$($p.ProcessName)', which is not the relay. Free that port or change RELAY_PORT in config.env." }
  }

  # 4. Certificate (HTTPS is required because the CRM is an https site)
  Step 'Preparing the HTTPS certificate'
  $certDir = Join-Path $Dir 'certs'
  New-Item -ItemType Directory -Force $certDir | Out-Null
  $pfx = Join-Path $certDir 'relay.pfx'
  $passFile = Join-Path $certDir 'pfx-password.txt'
  $legacy = (Test-Path (Join-Path $Dir '.cert\key.pem')) -and (Test-Path (Join-Path $Dir '.cert\cert.pem'))
  if ($legacy) {
    Good 'Using the relay''s existing certificate (.cert) - browsers that trust it keep working'
  } elseif (-not (Test-Path $pfx)) {
    $bytes = New-Object byte[] 18
    [Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
    $pfxPass = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', 'x'
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254*' } | Select-Object -ExpandProperty IPAddress)
    $san = @('DNS=localhost', "DNS=$env:COMPUTERNAME") + @($ips | ForEach-Object { "IPAddress=$_" })
    $ext = '2.5.29.17={text}' + ($san -join '&')
    $cert = New-SelfSignedCertificate -Subject 'CN=Vision7 BioStar Relay' -TextExtension @($ext) `
      -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(10) `
      -CertStoreLocation Cert:\LocalMachine\My
    $secure = ConvertTo-SecureString -String $pfxPass -AsPlainText -Force
    Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $secure | Out-Null
    $cer = Join-Path $certDir 'relay.cer'
    Export-Certificate -Cert $cert -FilePath $cer | Out-Null
    Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\Root | Out-Null   # trusted by browsers on this PC
    Remove-Item "Cert:\LocalMachine\My\$($cert.Thumbprint)" -ErrorAction SilentlyContinue
    Set-Content -Path $passFile -Value $pfxPass -NoNewline
    & icacls.exe $passFile /inheritance:r /grant:r 'SYSTEM:(R)' 'BUILTIN\Administrators:(F)' | Out-Null
    Good "Created a certificate valid for: $($san -join ', ')"
  } else {
    Good 'Using the existing certificate'
  }

  # 5. Firewall: let other PCs on the LAN reach the relay
  Step 'Opening the firewall for the relay (private/domain networks only)'
  if (-not (Get-NetFirewallRule -DisplayName $TaskName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $TaskName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Private,Domain | Out-Null
  }
  Good "Port $port allowed"

  # 6. Autostart: runs at boot as SYSTEM (no one needs to log in) and restarts itself on failure
  Step 'Registering the autostart task'
  $action = New-ScheduledTaskAction -Execute $node -Argument 'index.js' -WorkingDirectory $Dir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'Vision7 CRM to BioStar 2 relay. Starts at boot and restarts on failure.' -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Good 'Registered and started'

  # 7. Check it
  Step 'Checking the relay'
  $health = $null
  for ($i = 0; $i -lt 20 -and -not $health; $i++) {
    Start-Sleep -Seconds 1
    try { $health = Invoke-RestMethod -Uri "https://localhost:$port/relay/health?fresh=1" -TimeoutSec 10 } catch { }
  }
  if (-not $health) {
    Warn "The relay did not answer. Look at: $Dir\logs\relay.log"
  } elseif ($health.ok) {
    Good "Connected to BioStar at $($health.biostar). All done."
  } else {
    Warn "The relay is running but BioStar says: $($health.error)"
    Warn 'Fix the login ID / password in config.env, then double-click restart.bat.'
  }
  Write-Host "`nHealth page:  https://localhost:$port/relay/health" -ForegroundColor White
  Write-Host "Log file:     $Dir\logs\relay.log" -ForegroundColor White
}
catch {
  Write-Host "`nSETUP STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
