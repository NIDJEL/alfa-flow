$ErrorActionPreference="Stop"
$root=Split-Path -Parent $PSScriptRoot
function Check {param([scriptblock]$Command); & $Command; if($LASTEXITCODE -ne 0){throw "Проверка завершилась с кодом $LASTEXITCODE"}}
Push-Location "$root/backend"
try{
  Check {go vet ./...}
  $env:TEST_DATABASE_URL="postgres://alfa_demo:local_synthetic_only@localhost:5434/alfa_flow?sslmode=disable"
  Check {go test ./... -count=1 -v}
  Check {go run ./cmd/contracts}
}finally{Pop-Location}
Push-Location "$root/web"
try{
  Check {pnpm lint};Check {pnpm typecheck};Check {pnpm test};Check {pnpm build};Check {pnpm audit}
  $env:BASE_URL="http://localhost:8088"
  Check {pnpm test:contract};Check {pnpm test:e2e}
}finally{Pop-Location}
& "$PSScriptRoot/smoke.ps1"
