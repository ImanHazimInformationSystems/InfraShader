param([ValidateSet('setup','start','stop','status')][string]$Task = 'status')
$ErrorActionPreference = 'Stop'
$pythonExecutable = Join-Path $PSScriptRoot '../apps/api/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonExecutable)) { throw 'Run .\scripts\api.ps1 sync first.' }
& $pythonExecutable (Join-Path $PSScriptRoot 'local_db.py') $Task
if ($LASTEXITCODE -ne 0) { throw "Local database task failed: $Task" }
