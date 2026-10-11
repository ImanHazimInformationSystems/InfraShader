param([ValidateSet('sync','dev','test','lint','migrate','bootstrap')][string]$Task = 'dev', [Parameter(ValueFromRemainingArguments=$true)][string[]]$TaskArgs)
$ErrorActionPreference = 'Stop'
$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
$uvExecutable = if ($uvCommand) { $uvCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\uv.exe' }
if (-not (Test-Path -LiteralPath $uvExecutable)) { throw 'uv was not found. Install uv or put its executable on PATH; see docs/setup.md.' }
$databaseConfig = Join-Path $PSScriptRoot '../.local/database.json'
$apiEnvFile = Join-Path $PSScriptRoot '../apps/api/.env'
$hasFileDatabase = (Test-Path -LiteralPath $apiEnvFile) -and [bool](Select-String -LiteralPath $apiEnvFile -Pattern '^\s*(?:export\s+)?DATABASE_URL\s*=' -Quiet)
$previousDatabase = $env:DATABASE_URL
$previousTestDatabase = $env:TEST_DATABASE_URL
if (Test-Path -LiteralPath $databaseConfig) {
    $localDatabase = Get-Content -LiteralPath $databaseConfig -Raw | ConvertFrom-Json
    $connectionBase = "postgresql+psycopg://infrashader:$($localDatabase.app_password)@127.0.0.1:$($localDatabase.port)"
    if (-not $env:DATABASE_URL -and -not $hasFileDatabase) { $env:DATABASE_URL = "$connectionBase/infrashader" }
    if ($Task -eq 'test' -and -not $env:TEST_DATABASE_URL) { $env:TEST_DATABASE_URL = "$connectionBase/infrashader_test" }
}
Push-Location (Join-Path $PSScriptRoot '..\apps\api')
try {
    switch ($Task) {
        sync { & $uvExecutable sync --frozen }
        dev { & $uvExecutable run --frozen uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload }
        test { & $uvExecutable run --frozen pytest @TaskArgs }
        lint { & $uvExecutable run --frozen ruff check .; if ($LASTEXITCODE -eq 0) { & $uvExecutable run --frozen ruff format --check . } }
        migrate { & $uvExecutable run --frozen alembic upgrade head }
        bootstrap { & $uvExecutable run --frozen python -m app.bootstrap @TaskArgs }
    }
    if ($LASTEXITCODE -ne 0) { throw "API task $Task failed with exit code $LASTEXITCODE" }
} finally { Pop-Location; $env:DATABASE_URL = $previousDatabase; $env:TEST_DATABASE_URL = $previousTestDatabase }
