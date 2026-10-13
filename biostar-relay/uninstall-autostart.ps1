# Removes the autostart task and firewall rule. Leaves config.env, certificates and logs in place.
$ErrorActionPreference = 'Continue'
$TaskName = 'Vision7 BioStar Relay'
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName $TaskName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host 'The relay will no longer start automatically, and its firewall rule is removed.' -ForegroundColor Green
