# Trigger iOS CI from Windows (no local Mac required).
# Usage: powershell -File scripts/trigger-ios-build.ps1
$ErrorActionPreference = 'Stop'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) がありません。winget install GitHub.cli 後、gh auth login してください。'
}

gh auth status
gh workflow run ios-build.yml --ref master
Write-Host 'Triggered. Waiting for run...'
Start-Sleep -Seconds 5
gh run list --workflow=ios-build.yml --limit 3
Write-Host ''
Write-Host 'Follow with: gh run watch'
Write-Host 'Download artifact: gh run download <run-id> -n GymTracker-simulator-app'
