# CiteBase eval runner.
# ASCII only: this file is invoked from cmd as well, and cmd mangles non-ASCII.
# Calls the running API so the numbers come from the same code path the UI uses.

param(
  [string]$Base = 'http://localhost:15640'
)

$ErrorActionPreference = 'Stop'

function Invoke-JsonPost([string]$Url) {
  $request = [System.Net.WebRequest]::Create($Url)
  $request.Method = 'POST'
  $request.ContentLength = 0
  $response = $request.GetResponse()
  $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), [System.Text.Encoding]::UTF8)
  $body = $reader.ReadToEnd()
  $reader.Close()
  $response.Close()
  return ($body | ConvertFrom-Json)
}

Write-Host 'Running the eval set (20 questions)...'
try {
  $result = Invoke-JsonPost "$Base/api/eval/run"
}
catch {
  Write-Host 'Cannot reach the API. Start the app first (start.bat).' -ForegroundColor Red
  exit 1
}

$run = $result.run
foreach ($item in $result.outcomes) {
  if ($item.correct) { $flag = 'PASS' } else { $flag = 'FAIL' }
  $recall = 'n/a'
  if ($item.answerable) {
    if ($item.recalled) { $recall = 'hit ' } else { $recall = 'miss' }
  }
  $latency = '{0,5}ms' -f $item.latencyMs
  Write-Host ("{0}  {1}  {2}  {3}  {4}" -f $flag, $item.id, $recall, $latency, $item.question)
}

Write-Host ''
Write-Host 'Metrics'
Write-Host ("  recall@5           {0,7:P1}" -f [double]$run.recallAt5)
Write-Host ("  citation hit       {0,7:P1}" -f [double]$run.citationHit)
Write-Host ("  refusal accuracy   {0,7:P1}" -f [double]$run.refusalAcc)
Write-Host ("  questions          {0,7}" -f $run.total)
Write-Host ("  run id             {0,7}" -f $run.id)
Write-Host ''

$failed = @($result.outcomes | Where-Object { -not $_.correct })
if ($failed.Count -gt 0) {
  Write-Host 'Failures'
  foreach ($item in $failed) {
    $docs = ($item.topDocs -join ', ')
    Write-Host ("  {0}  expected {1}  top docs: {2}" -f $item.id, $item.expectedDoc, $docs)
  }
}
