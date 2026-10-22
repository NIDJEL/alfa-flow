$ErrorActionPreference="Stop"
$root=Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force "$root/artifacts" | Out-Null
$override="$root/artifacts/compose.clean.yaml"
@'
services:
  postgres:
    ports: !override []
  api:
    image: alfa-flow-api:latest
    ports: !override []
    environment:
      PUBLIC_ORIGIN: http://localhost:18089
  web:
    image: alfa-flow-web:latest
    ports: !override
      - "127.0.0.1:18089:80"
'@ | Set-Content -LiteralPath $override
$name="alfa-flow-clean-"+([Guid]::NewGuid().ToString("N").Substring(0,8))
Push-Location $root
try{
  docker compose -p $name -f docker-compose.yml -f $override up -d --no-build --wait
  if($LASTEXITCODE -ne 0){throw "Clean Compose launch failed"}
  & "$PSScriptRoot/smoke.ps1" -BaseUrl "http://localhost:18089"
  docker compose -p $name -f docker-compose.yml -f $override ps
  Write-Host "PASS clean Docker project $name; volume retained, not deleted."
  docker compose -p $name -f docker-compose.yml -f $override stop
}finally{Pop-Location}
