# 本机 GitHub 网络辅助：TLS 必须走 openssl，凭据助手必须禁用。
# 用法：
#   pwsh scripts/gitnet.ps1 ls-remote
#   pwsh scripts/gitnet.ps1 fetch
#   pwsh scripts/gitnet.ps1 push [refspec...]
#   pwsh scripts/gitnet.ps1 retry-fetch <次数> <间隔秒>
# 说明：本机 schannel 后端与 curl.exe 均无法握手（SEC_E_NO_CREDENTIALS 0x8009030e），
#       唯一可用通道是 git 自带 OpenSSL + node 内置 fetch。github.com:443 可能间歇性 reset，
#       故提供 retry-fetch 做带退避的重试。

param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Action,
  [Parameter(Position = 1)][string]$A1,
  [Parameter(Position = 2)][string]$A2
)

$ErrorActionPreference = 'Continue'
$Repo = Join-Path $PSScriptRoot '..'
$GitExe = 'D:\AIws\WorkBuddy\resources\vendor\PortableGit\cmd\git.exe'
if (-not (Test-Path $GitExe)) { $GitExe = 'git' }

$envFile = Join-Path $Repo '.env'
if (-not (Test-Path $envFile)) { throw ".env 不存在：$envFile" }
$token = [regex]::Match([IO.File]::ReadAllText($envFile), 'ghp_[A-Za-z0-9]+').Value
if (-not $token) { throw '.env 里找不到 ghp_ 开头的 token' }

$url = "https://$token@github.com/byazlle/human-design-tool.git"
$common = @('-c', 'http.sslBackend=openssl', '-c', 'credential.helper=', '-c', 'core.quotepath=false')

function Invoke-Git {
  param([string[]]$Args)
  & $GitExe @common @Args 2>&1 | ForEach-Object { $_ }
  return $LASTEXITCODE
}

switch ($Action) {
  'ls-remote' {
    $code = Invoke-Git @('ls-remote', $url, 'HEAD')
    Write-Host "exit=$code"
    exit $code
  }
  'fetch' {
    $code = Invoke-Git @('fetch', $url, '+refs/heads/*:refs/remotes/origin/*', '+refs/tags/*:refs/tags/*')
    Write-Host "exit=$code"
    exit $code
  }
  'retry-fetch' {
    $times = if ($A1) { [int]$A1 } else { 20 }
    $gap = if ($A2) { [int]$A2 } else { 8 }
    for ($i = 1; $i -le $times; $i++) {
      Write-Host "--- fetch attempt $i/$times ---"
      $code = Invoke-Git @('fetch', $url, '+refs/heads/*:refs/remotes/origin/*')
      Write-Host "exit=$code"
      if ($code -eq 0) { Write-Host 'FETCH-OK'; exit 0 }
      Start-Sleep -Seconds $gap
    }
    Write-Host 'FETCH-FAILED'
    exit 1
  }
  'push' {
    $refs = if ($A1) { @($A1) } else { @('main:main') }
    $code = Invoke-Git (@('push', $url) + $refs)
    Write-Host "exit=$code"
    exit $code
  }
  default { throw "未知动作：$Action" }
}
