Write-Host "Installation du moteur Sonara Sync..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Moteur Sonara Sync installé. FFmpeg est embarqué via ffmpeg-static." -ForegroundColor Green
