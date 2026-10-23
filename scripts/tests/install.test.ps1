# No Docker installation or network access: external commands are deliberately stubbed.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$temp = Join-Path ([IO.Path]::GetTempPath()) ("alfa-installer-test-" + [Guid]::NewGuid().ToString("N"))
$savedEnv = @{}
foreach ($key in @("GH_TOKEN", "ALFA_FLOW_DIR", "ALFA_FLOW_OPEN_BROWSER", "ALFA_FLOW_WAIT_SECONDS", "ALFA_FLOW_INSTALL_DOCKER")) {
    $savedEnv[$key] = [Environment]::GetEnvironmentVariable($key)
}
function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function global:docker {
    $command = $args -join " "
    $global:LASTEXITCODE = 0
    Add-Content -LiteralPath $global:InstallCalls -Value $command
    switch -Wildcard ($command) {
        "info --format*" { "linux" }
        "compose up --help" { "--wait --wait-timeout" }
        "compose version" { "Docker Compose test-double" }
        "compose up --build*" {
            if ($global:FailBuild) { $global:LASTEXITCODE = 17 }
        }
    }
}
function global:Invoke-WebRequest {
    param([switch]$UseBasicParsing, $Uri, $Headers, $OutFile, $TimeoutSec)
    if ($OutFile) {
        if ($Headers.Authorization -ne "Bearer test-token-not-real") { throw "Missing GitHub authorization" }
        Copy-Item -LiteralPath $global:InstallArchive -Destination $OutFile
    }
    else {
        @{ StatusCode = 200; Content = '{"status":"ready"}' }
    }
}
function global:Start-Process { throw "No GUI or installers may start in this test" }
try {
    $bootstrap = Join-Path $temp "bootstrap"
    $source = Join-Path $temp "archive\alfa-main"
    New-Item -ItemType Directory -Force -Path $bootstrap, "$source\backend", "$source\web" | Out-Null
    Copy-Item -LiteralPath "$root\scripts\install.ps1" -Destination "$bootstrap\install.ps1"
    Set-Content -LiteralPath "$source\docker-compose.yml" -Value "name: test"
    Set-Content -LiteralPath "$source\backend\go.mod" -Value "module test"
    Set-Content -LiteralPath "$source\web\package.json" -Value '{"name":"alfa-flow-web"}'
    Set-Content -LiteralPath "$source\.env.example" -Value "POSTGRES_PASSWORD=example"
    $global:InstallArchive = Join-Path $temp "source.zip"
    $global:InstallCalls = Join-Path $temp "calls.txt"
    Compress-Archive -Path $source -DestinationPath $global:InstallArchive
    $env:GH_TOKEN = "test-token-not-real"
    $env:ALFA_FLOW_OPEN_BROWSER = "0"
    $env:ALFA_FLOW_INSTALL_DOCKER = "0"
    $env:ALFA_FLOW_WAIT_SECONDS = "2"
    $env:ALFA_FLOW_DIR = Join-Path $temp "installation with spaces"
    $global:FailBuild = $false
    Push-Location $bootstrap
    try {
        & "$bootstrap\install.ps1"
        Assert (Test-Path -LiteralPath "$env:ALFA_FLOW_DIR\.env") "Archive bootstrap did not create .env"
        Set-Content -LiteralPath "$env:ALFA_FLOW_DIR\.env" -Value "POSTGRES_PASSWORD=preserved"
        & "$bootstrap\install.ps1"
        Assert ((Get-Content -LiteralPath "$env:ALFA_FLOW_DIR\.env" -Raw).Trim() -eq "POSTGRES_PASSWORD=preserved") ".env was overwritten"
        $global:FailBuild = $true
        $failed = $false
        try { & "$bootstrap\install.ps1" } catch { $failed = $true }
        Assert $failed "Build failure was reported as success"
        $calls = Get-Content -LiteralPath $global:InstallCalls -Raw
        Assert ($calls.Contains("--wait --wait-timeout")) "Health wait is missing"
        Assert (-not ($calls -match "down|volume rm|system prune")) "Destructive Docker command detected"
        Assert (-not (Test-Path -LiteralPath "$env:ALFA_FLOW_DIR\.git")) "Archive unexpectedly stored Git credentials"
        $env:ALFA_FLOW_DIR = Join-Path $temp "unrelated folder"
        New-Item -ItemType Directory -Path $env:ALFA_FLOW_DIR | Out-Null
        Set-Content -LiteralPath "$env:ALFA_FLOW_DIR\keep.txt" -Value "keep"
        $failed = $false
        try { & "$bootstrap\install.ps1" } catch { $failed = $true }
        Assert $failed "Unrelated directory was accepted"
        Assert ((Get-Content -LiteralPath "$env:ALFA_FLOW_DIR\keep.txt").Trim() -eq "keep") "Unrelated file was changed"
        Write-Host "PASS: private archive, paths with spaces, readiness, repeat/.env preservation, build failure, no deletion"
    }
    finally { Pop-Location }
}
finally {
    foreach ($key in $savedEnv.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnv[$key]) }
    if (Test-Path -LiteralPath $temp) {
        $resolved = (Resolve-Path -LiteralPath $temp).Path
        $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\")
        if ((Split-Path -Parent $resolved).TrimEnd("\") -ne $expectedParent -or
            (Split-Path -Leaf $resolved) -notmatch '^alfa-installer-test-[a-f0-9]{32}$') {
            throw "Unexpected test cleanup path: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Remove-Item Function:\docker, Function:\Invoke-WebRequest, Function:\Start-Process -ErrorAction SilentlyContinue
}
