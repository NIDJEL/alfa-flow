$ErrorActionPreference = "Stop"

# ALFA FLOW bootstrap for Windows PowerShell.
# It can be run from a checkout or directly from GitHub:
#   (irm https://raw.githubusercontent.com/NIDJEL/alfa-flow/main/scripts/install.ps1).TrimStart([char]0xFEFF) | iex

$RepoUrl = if ($env:ALFA_FLOW_REPO_URL) { $env:ALFA_FLOW_REPO_URL } else { "https://github.com/NIDJEL/alfa-flow.git" }
$RepoRef = if ($env:ALFA_FLOW_REF) { $env:ALFA_FLOW_REF } else { "main" }
$Repository = if ($env:ALFA_FLOW_REPOSITORY) { $env:ALFA_FLOW_REPOSITORY } else { "NIDJEL/alfa-flow" }
$TargetDir = [IO.Path]::GetFullPath($(if ($env:ALFA_FLOW_DIR) { $env:ALFA_FLOW_DIR } else { Join-Path $HOME "alfa-flow" }))
$AppUrl = if ($env:ALFA_FLOW_URL) { $env:ALFA_FLOW_URL } else { "http://localhost:8088" }
$WaitSeconds = if ($env:ALFA_FLOW_WAIT_SECONDS) { [int]$env:ALFA_FLOW_WAIT_SECONDS } else { 300 }
$InstallDocker = $env:ALFA_FLOW_INSTALL_DOCKER -ne "0"
$OpenBrowser = $env:ALFA_FLOW_OPEN_BROWSER -ne "0"
if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    throw "Use scripts/install.sh on macOS and Linux."
}
if ($WaitSeconds -le 0) {
    throw "ALFA_FLOW_WAIT_SECONDS must be a positive integer."
}
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Write-Step {
    param([string]$Message)
    Write-Host "[ALFA FLOW] $Message" -ForegroundColor Cyan
}

function Has-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Checkout {
    param([string]$Path)
    $hasFiles = (
        (Test-Path -LiteralPath (Join-Path $Path "docker-compose.yml")) -and
        (Test-Path -LiteralPath (Join-Path $Path "backend\go.mod")) -and
        (Test-Path -LiteralPath (Join-Path $Path "web\package.json"))
    )
    if (-not $hasFiles) { return $false }
    try {
        $package = Get-Content -LiteralPath (Join-Path $Path "web\package.json") -Raw | ConvertFrom-Json
        return $package.name -eq "alfa-flow-web"
    }
    catch { return $false }
}

function Remove-BootstrapTemp {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        $resolvedTemp = (Resolve-Path -LiteralPath $Path).Path
        $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\")
        if ((Split-Path -Parent $resolvedTemp).TrimEnd("\") -ne $expectedParent -or
            (Split-Path -Leaf $resolvedTemp) -notmatch '^alfa-flow-[a-f0-9]{32}$') {
            throw "Refusing to remove unexpected temp path: $resolvedTemp"
        }
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Download-Checkout {
    if (Test-Path -LiteralPath $TargetDir) {
        if (-not (Test-Path -LiteralPath $TargetDir -PathType Container)) {
            throw "ALFA_FLOW_DIR must be a directory: $TargetDir"
        }
        $existing = @(Get-ChildItem -LiteralPath $TargetDir -Force)
        if ($existing.Count -gt 0) {
            throw "Каталог $TargetDir уже существует и не похож на ALFA FLOW. Укажите ALFA_FLOW_DIR или очистите каталог."
        }
    }

    $parent = Split-Path -Parent $TargetDir
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Write-Step "Скачиваю исходники в $TargetDir"

    $token = if ($env:GH_TOKEN) { $env:GH_TOKEN } else { $env:GITHUB_TOKEN }
    if ((Has-Command "git") -and -not $token) {
        & git clone --depth 1 --branch $RepoRef $RepoUrl $TargetDir
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось клонировать репозиторий."
        }
        return
    }

    $archiveUrl = "https://api.github.com/repos/$Repository/zipball/$RepoRef"
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("alfa-flow-" + [Guid]::NewGuid().ToString("N"))
    $archivePath = Join-Path $tempRoot "source.zip"
    $sourcePath = Join-Path $tempRoot "source"
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

    try {
        $headers = @{ Accept = "application/vnd.github+json" }
        if ($token) { $headers.Authorization = "Bearer $token" }
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $archiveUrl -Headers $headers -OutFile $archivePath
        }
        catch {
            throw "Cannot download the repository. Private repositories need GitHub read access (GH_TOKEN/GITHUB_TOKEN or an authenticated git clone)."
        }
        Expand-Archive -LiteralPath $archivePath -DestinationPath $sourcePath
        $extracted = @(Get-ChildItem -LiteralPath $sourcePath -Directory)
        if ($extracted.Count -ne 1 -or -not (Test-Checkout $extracted[0].FullName)) {
            throw "Архив репозитория не распаковался."
        }
        # Copy into a possibly empty target without nesting the archive's top directory.
        New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
        Get-ChildItem -LiteralPath $extracted[0].FullName -Force |
            Copy-Item -Destination $TargetDir -Recurse -Force
    }
    finally {
        Remove-BootstrapTemp $tempRoot
    }
}

function Add-DockerToPath {
    $dockerLocations = @(
        (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin"),
        (Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin")
    )
    foreach ($location in $dockerLocations) {
        if ((Test-Path -LiteralPath $location) -and (($env:Path -split ";") -notcontains $location)) {
            $env:Path = "$location;$env:Path"
        }
    }
}

function Test-DockerReady {
    # Windows PowerShell treats redirected native stderr as ErrorRecord objects.
    $ErrorActionPreference = "Continue"
    & docker info *> $null
    return $LASTEXITCODE -eq 0
}

function Install-DockerDesktop {
    if (Has-Command "winget") {
        Write-Step "Устанавливаю Docker Desktop через winget"
        & winget install --id Docker.DockerDesktop --exact --accept-source-agreements --accept-package-agreements
        $installExit = $LASTEXITCODE
    }
    else {
        $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
        switch ($architecture) {
            "ARM64" { $dockerArch = "arm64" }
            "AMD64" { $dockerArch = "amd64" }
            default { throw "Docker Desktop requires 64-bit Windows (x64 or ARM64)." }
        }
        $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("alfa-flow-" + [Guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $tempRoot | Out-Null
        try {
            $installer = Join-Path $tempRoot "DockerDesktopInstaller.exe"
            Write-Step "Скачиваю официальный Docker Desktop для $dockerArch"
            Invoke-WebRequest -UseBasicParsing -Uri "https://desktop.docker.com/win/main/$dockerArch/Docker%20Desktop%20Installer.exe" -OutFile $installer
            $signature = Get-AuthenticodeSignature -LiteralPath $installer
            if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Docker") {
                throw "Docker Desktop installer signature verification failed."
            }
            $process = Start-Process -FilePath $installer -ArgumentList @("install", "--user", "--quiet", "--backend=wsl-2") -WindowStyle Hidden -Wait -PassThru
            $installExit = $process.ExitCode
        }
        finally {
            Remove-BootstrapTemp $tempRoot
        }
    }
    if ($installExit -eq 3010 -or $installExit -eq 1641) {
        throw "Docker установлен. Нужна перезагрузка Windows: перезагрузите компьютер и повторите ту же команду."
    }
    if ($installExit -ne 0) {
        throw "Docker Desktop install failed (exit $installExit). See the install output, then retry. Windows was not restarted."
    }
}

function Ensure-Wsl {
    if (-not (Has-Command "wsl.exe")) {
        throw "WSL is unavailable. Update Windows and enable WSL 2, then retry."
    }
    $ErrorActionPreference = "Continue"
    & wsl.exe --status *> $null
    $wslExit = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($wslExit -eq 0) { return }
    Write-Step "Включаю WSL 2. Windows запросит права администратора; автоматической перезагрузки не будет."
    $helper = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $process = Start-Process -FilePath $helper -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile -Command "wsl.exe --install --no-distribution; exit $LASTEXITCODE"'
    if ($process.ExitCode -ne 0 -and $process.ExitCode -ne 3010) {
        throw "WSL setup did not complete. Enable virtualization and run wsl --install --no-distribution as Administrator, restart if requested, then retry."
    }
    $ErrorActionPreference = "Continue"
    & wsl.exe --status *> $null
    $wslExit = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($wslExit -ne 0) {
        throw "WSL is installed but not ready. Restart Windows if requested and run this command again."
    }
}

function Ensure-Docker {
    Add-DockerToPath
    if (-not (Has-Command "docker")) {
        if (-not $InstallDocker) {
            throw "Docker не найден. Установите Docker Desktop или уберите ALFA_FLOW_INSTALL_DOCKER=0."
        }
        Ensure-Wsl
        Install-DockerDesktop
        Add-DockerToPath
    }

    if (-not (Has-Command "docker")) {
        throw "Docker установлен, но команда docker ещё не появилась в PATH. Перезапустите PowerShell и повторите запуск."
    }

    $dockerDesktopPaths = @(
        (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe")
    )
    if (-not (Test-DockerReady) -and -not (Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue)) {
        foreach ($path in $dockerDesktopPaths) {
            if (Test-Path -LiteralPath $path) {
                Start-Process -FilePath $path -WindowStyle Hidden | Out-Null
                break
            }
        }
    }

    Write-Step "При первом запуске подтвердите условия Docker Desktop. Нужны WSL 2 и аппаратная виртуализация."
    Write-Step "Жду готовности Docker Engine"
    for ($elapsed = 0; $elapsed -lt $WaitSeconds; $elapsed += 2) {
        if (Test-DockerReady) {
            & docker compose version
            if ($LASTEXITCODE -ne 0) {
                throw "Нужен Docker Compose v2: команда 'docker compose' недоступна."
            }
            $osType = & docker info --format "{{.OSType}}"
            if ($osType -ne "linux") {
                throw "Switch Docker Desktop to Linux containers and retry."
            }
            $helpText = & docker compose up --help
            if (($helpText -join "`n") -notmatch '\-\-wait-timeout') {
                throw "Update Docker Compose: up --wait --wait-timeout is required."
            }
            return
        }
        Start-Sleep -Seconds 2
    }
    throw "Docker Engine не запустился за $WaitSeconds секунд. Откройте Docker Desktop. Если он просит WSL 2 / перезагрузку, завершите настройку и повторите эту же команду. Данные не удалены."
}

function Start-AlfaFlow {
    param([string]$Root)
    Push-Location $Root
    try {
        if ((Test-Path -LiteralPath ".env.example") -and -not (Test-Path -LiteralPath ".env")) {
            Copy-Item -LiteralPath ".env.example" -Destination ".env"
            Write-Step "Создан локальный .env из .env.example"
        }

        Write-Step "Собираю контейнеры и запускаю ALFA FLOW"
        & docker compose up --build -d --wait --wait-timeout $WaitSeconds
        if ($LASTEXITCODE -ne 0) {
            & docker compose ps
            & docker compose logs --tail=60
            throw "Docker Compose не смог запустить проект. Проверьте: docker compose logs."
        }

        Write-Step "Жду readiness API"
        for ($elapsed = 0; $elapsed -lt $WaitSeconds; $elapsed += 2) {
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri "$AppUrl/api/v1/health/ready" -TimeoutSec 5
                $health = $response.Content | ConvertFrom-Json
                if ($response.StatusCode -eq 200 -and $health.status -eq "ready") {
                    return
                }
            }
            catch {
                # Containers are still starting.
            }
            Start-Sleep -Seconds 2
        }
        & docker compose ps
        throw "ALFA FLOW не вышел в ready за $WaitSeconds секунд."
    }
    finally {
        Pop-Location
    }
}

$rootCandidates = @()
if ($PSScriptRoot) {
    $rootCandidates += (Split-Path -Parent $PSScriptRoot)
}
$rootCandidates += (Get-Location).Path
$rootCandidates += $TargetDir
$root = $null
foreach ($candidate in ($rootCandidates | Select-Object -Unique)) {
    if (Test-Checkout $candidate) {
        $root = $candidate
        break
    }
}

if (-not $root) {
    Download-Checkout
    $root = $TargetDir
}

Ensure-Docker
Start-AlfaFlow -Root $root

if ($OpenBrowser) {
    try { Start-Process "$AppUrl/demo" }
    catch { Write-Warning "Open $AppUrl/demo in your browser." }
}

Write-Host ""
Write-Step "Готово."
Write-Host "Кабинет: $AppUrl/demo"
Write-Host "Swagger: $AppUrl/docs/"
Write-Host ('Стоп: docker compose -f "{0}\docker-compose.yml" stop' -f $root)
