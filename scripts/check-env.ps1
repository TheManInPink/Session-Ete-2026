# ═══════════════════════════════════════════════════
# NINA-AES Platform — Vérification de l'environnement
# Usage : powershell -ExecutionPolicy Bypass -File scripts\check-env.ps1
# ═══════════════════════════════════════════════════

$errors = 0

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " NINA-AES — Vérification de l'environnement"   -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

function Test-Tool {
    param([string]$Name, [string]$Command)
    try {
        $version = Invoke-Expression $Command 2>&1
        Write-Host "  ✅ ${Name} : $version" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ ${Name} : NON TROUVÉ" -ForegroundColor Red
        $script:errors++
    }
}

Write-Host "── Outils de développement ──"
Test-Tool "Node.js"        "node --version"
Test-Tool "pnpm"           "pnpm --version"
Test-Tool "Python"         "python --version"
Test-Tool "Git"            "git --version"
Test-Tool "Docker"         "docker --version"
Test-Tool "Docker Compose" "docker compose version"

Write-Host ""
Write-Host "── Conteneurs Docker ──"
$containers = @("nina-postgres","nina-redis","nina-rabbitmq","nina-minio",
                "nina-elasticsearch","nina-keycloak","nina-vault","nina-maildev")
foreach ($c in $containers) {
    $status = docker inspect --format='{{.State.Status}}' $c 2>$null
    if ($status -eq "running") {
        Write-Host "  ✅ ${c} : running" -ForegroundColor Green
    } else {
        Write-Host "  ❌ ${c} : NON DÉMARRÉ" -ForegroundColor Red
        $errors++
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
if ($errors -eq 0) {
    Write-Host " ✅ ENVIRONNEMENT OK — Prêt à coder !" -ForegroundColor Green
} else {
    Write-Host " ❌ $errors ERREUR(S) DÉTECTÉE(S)" -ForegroundColor Red
}
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
