param([ValidateSet('start','stop','status','configure')][string]$Task = 'status')
$ErrorActionPreference = 'Stop'
$dockerPath = Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin'
if (Test-Path -LiteralPath $dockerPath) { $env:PATH = "$dockerPath;$env:PATH" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Local Supabase requires Docker with Linux containers. Docker/WSL is not installed here. Install and start Docker, then rerun this script. No hosted fallback is used.'
}
Push-Location (Join-Path $PSScriptRoot '..')
try {
    if ($Task -eq 'start') {
        if (-not (Test-Path -LiteralPath 'supabase/signing_keys.json')) {
            $key = & npx supabase gen signing-key --algorithm ES256
            if ($LASTEXITCODE -ne 0) { throw 'Local signing key generation failed.' }
            $parsed = $key | ConvertFrom-Json
            $encoded = ConvertTo-Json -InputObject @($parsed) -Depth 10
            [IO.File]::WriteAllText((Join-Path $PWD 'supabase/signing_keys.json'), $encoded)
        }
        & npx supabase start
    } elseif ($Task -eq 'configure') {
        $status = (& npx supabase status -o json) | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'Start local Supabase first.' }
        $webEnv = Join-Path $PWD 'apps/web/.env.local'
        $apiEnv = Join-Path $PWD 'apps/api/.env'
        if ((Test-Path -LiteralPath $webEnv) -or (Test-Path -LiteralPath $apiEnv)) {
            throw 'Environment files already exist. Preserve them and update local Supabase values manually; see docs/setup.md.'
        }
        $publicKey = if ($status.PUBLISHABLE_KEY) { $status.PUBLISHABLE_KEY } else { $status.ANON_KEY }
        if (-not $publicKey -or -not $status.API_URL) { throw 'Local public endpoint/key missing from CLI status.' }
        [IO.File]::WriteAllText($webEnv, "VITE_SUPABASE_URL=$($status.API_URL)`nVITE_SUPABASE_PUBLISHABLE_KEY=$publicKey`n")
        [IO.File]::WriteAllText($apiEnv, "SUPABASE_URL=$($status.API_URL)`nSTORAGE_SERVICE_KEY=$($status.SERVICE_ROLE_KEY)`n")
        Write-Output 'Local environment files configured. Restart web and API processes.'
    } else { & npx supabase $Task }
    if ($LASTEXITCODE -ne 0) { throw "Local Supabase $Task failed." }
} finally { Pop-Location }
