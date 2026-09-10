$voiceRoot = Join-Path $env:LOCALAPPDATA 'GymTracker/voice-bridge'
$voiceConfig = Get-Content -LiteralPath (Join-Path $voiceRoot 'config.json') -Raw | ConvertFrom-Json
$voiceScript = Join-Path $PSScriptRoot 'bridge.py'
Start-Process -FilePath $voiceConfig.python -ArgumentList @('"' + $voiceScript + '"') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $voiceRoot 'status.log') -RedirectStandardError (Join-Path $voiceRoot 'error.log')
