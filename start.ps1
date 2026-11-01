# CiteBase one-click start.
# ASCII only on purpose: this file is executed by cmd via start.bat and cmd
# mangles non-ASCII paths.

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host '== CiteBase ==' -ForegroundColor Cyan

# 1) docker engine
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host '[1/7] docker engine is not running. Start Docker Desktop and try again.' -ForegroundColor Red
  exit 1
}
Write-Host '[1/7] docker engine OK'

# 2) .env
if (-not (Test-Path -LiteralPath '.env')) {
  $pw = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
  $tpl = Get-Content -LiteralPath '.env.example' -Raw
  $tpl = $tpl.Replace('CHANGE_ME_ON_FIRST_RUN', $pw)
  # Write UTF-8 without BOM: a BOM becomes part of the first key as seen by
  # docker compose, which then fails to resolve POSTGRES_USER.
  [System.IO.File]::WriteAllText((Join-Path $PWD '.env'), $tpl, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host '[2/7] .env created with a random database password'
}
else {
  Write-Host '[2/7] .env already present'
}

# 3) database
docker compose up -d
if ($LASTEXITCODE -ne 0) {
  Write-Host '[3/7] docker compose failed' -ForegroundColor Red
  exit 1
}
Write-Host '[3/7] postgres starting'

# 4) wait for healthy
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  $state = docker inspect --format '{{.State.Health.Status}}' citebase-pg 2>$null
  if ($state -eq 'healthy') { $ok = $true; break }
}
if (-not $ok) {
  Write-Host '[4/7] postgres did not become healthy in 120s. Run: docker logs citebase-pg' -ForegroundColor Red
  exit 1
}
Write-Host '[4/7] postgres healthy on port 5440'

# 5) dependencies
if (-not (Test-Path -LiteralPath 'node_modules')) {
  Write-Host '[5/7] installing dependencies (first run only)...'
  bun install
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[5/7] bun install failed' -ForegroundColor Red
    exit 1
  }
}
else {
  Write-Host '[5/7] dependencies present'
}

# 6) web bundle - rebuild when the bundle is missing or older than web sources
$needBuild = $false
if (-not (Test-Path -LiteralPath 'public/index.html')) {
  $needBuild = $true
}
else {
  $builtAt = (Get-Item -LiteralPath 'public/index.html').LastWriteTimeUtc
  $changed = Get-ChildItem -LiteralPath 'web' -Recurse -File |
    Where-Object { $_.LastWriteTimeUtc -gt $builtAt } |
    Select-Object -First 1
  if ($changed) { $needBuild = $true }
}

if ($needBuild) {
  Write-Host '[6/7] building web bundle...'
  bun run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[6/7] vite build failed' -ForegroundColor Red
    exit 1
  }
}
else {
  Write-Host '[6/7] web bundle up to date'
}

# 7) demo corpus: only fills an empty library, safe to run every time
Write-Host '[7/7] checking sample documents...'
bun run seed
if ($LASTEXITCODE -ne 0) {
  Write-Host '[7/7] seeding failed, continuing with the existing library' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'CiteBase is ready:' -ForegroundColor Green
Write-Host '  http://localhost:15640'
Write-Host ''
Write-Host 'Press Ctrl+C to stop the server (the database keeps running).'
Write-Host ''

bun run src/index.ts
