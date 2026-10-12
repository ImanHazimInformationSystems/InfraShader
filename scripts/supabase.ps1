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
            # The CLI loads signing_keys_path before generating keys. Bootstrap
            # with a separate minimal config that does not reference the missing key.
            $bootstrapRoot = Join-Path $PWD '.local/signing-key-bootstrap'
            $bootstrapConfig = Join-Path $bootstrapRoot 'supabase'
            New-Item -ItemType Directory -Force -Path $bootstrapConfig | Out-Null
            [IO.File]::WriteAllText((Join-Path $bootstrapConfig 'config.toml'), 'project_id = "infrashader-key-bootstrap"')
            $key = & npx supabase gen signing-key --algorithm ES256 --workdir $bootstrapRoot
            if ($LASTEXITCODE -ne 0) { throw 'Local signing key generation failed.' }
            $parsed = $key | ConvertFrom-Json
            if (-not $parsed -or @($parsed).Count -ne 1 -or $parsed.kty -ne 'EC' -or $parsed.crv -ne 'P-256' -or -not $parsed.d) {
                throw 'Local signing key generation returned an unexpected format; no key file was written.'
            }
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
