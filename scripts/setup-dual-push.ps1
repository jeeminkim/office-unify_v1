param(
    [string]$PrimaryUrl = "https://github.com/jeeminkim/office-unify.git",
    [string]$MirrorUrl = "https://github.com/jeeminkim/office-unify_v1.git",
    [string]$RemoteName = "origin"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git 실행 파일을 찾지 못했습니다. Git 설치와 PATH를 확인하세요."
}

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    throw "Git 저장소 안에서 실행해야 합니다."
}

Push-Location $repoRoot
try {
    $remoteNames = @(git remote)
    if ($remoteNames -notcontains $RemoteName) {
        git remote add $RemoteName $PrimaryUrl
    }

    git remote set-url $RemoteName $PrimaryUrl

    $existingPushUrls = @(git remote get-url --all --push $RemoteName 2>$null)
    foreach ($url in $existingPushUrls) {
        git remote set-url --delete --push $RemoteName $url 2>$null
    }

    git remote set-url --add --push $RemoteName $PrimaryUrl
    git remote set-url --add --push $RemoteName $MirrorUrl

    Write-Host "Dual push 설정 완료" -ForegroundColor Green
    Write-Host "Fetch URL:" -ForegroundColor Cyan
    git remote get-url $RemoteName
    Write-Host "Push URLs:" -ForegroundColor Cyan
    git remote get-url --all --push $RemoteName
    Write-Host ""
    Write-Host "이후 git push $RemoteName main 실행 시 두 저장소로 순차 push됩니다." -ForegroundColor Yellow
}
finally {
    Pop-Location
}
