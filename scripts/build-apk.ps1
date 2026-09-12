<#
  灵汐大陆 Android WebView 出包脚本。
  用法（未签名候选包）：
    .\scripts\build-apk.ps1 -ApiBase 'https://api.example.com'
  用法（可安装的正式签名包）：
    $env:HABITPET_KEYSTORE_PASSWORD = '...'
    .\scripts\build-apk.ps1 -ApiBase 'https://api.example.com' -KeystorePath 'D:\keys\lingxi-release.jks' -KeyAlias 'lingxi'

  资源永远从 public/ 复制到构建暂存区，不依赖 webview-apk/assets/www 的历史副本。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$ApiBase,
  [string]$AndroidSdkRoot = $(if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { $env:ANDROID_HOME }),
  [string]$ToolchainRoot,
  [string]$JdkRoot,
  [string]$AndroidJarPath,
  [string]$StagingRoot = $(Join-Path ([IO.Path]::GetTempPath()) 'habitpet-build'),
  [string]$KeystorePath,
  [string]$KeyAlias,
  [string]$KeyStorePasswordEnv = 'HABITPET_KEYSTORE_PASSWORD',
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$apkRoot = Join-Path $repoRoot 'webview-apk'
# 旧版 aapt 对 Unicode 文件路径不稳定。构建输入一律落到可指定的英文临时目录。
$buildRoot = [IO.Path]::GetFullPath($StagingRoot)
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null

function Require-Path([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "$Label 不存在：$Path" }
  return (Resolve-Path -LiteralPath $Path).Path
}
function Require-CommandPath([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "未找到 $Name。请安装 JDK 17+ 并加入 PATH。" }
  return $cmd.Source
}

if ($ToolchainRoot) {
  # WorkBuddy 留存的是便携式工具链：build-tools/android-13 下同时有 aapt、d8、zipalign、apksigner 与 android.jar。
  $toolRoot = Require-Path $ToolchainRoot '便携式 Android 工具链'
  $buildToolsPath = Require-Path (Join-Path $toolRoot 'android-13') '便携式 Android build-tools'
  $androidJar = Require-Path $(if ($AndroidJarPath) { $AndroidJarPath } else { Join-Path $buildToolsPath 'android.jar' }) 'android.jar'
  $javac = Require-Path $(if ($JdkRoot) { Join-Path $JdkRoot 'bin/javac.exe' } else { Join-Path $toolRoot 'jdk/jdk-21.0.12.1+1/bin/javac.exe' }) 'javac'
} else {
  if ([string]::IsNullOrWhiteSpace($AndroidSdkRoot)) { throw '未设置 ANDROID_SDK_ROOT/ANDROID_HOME，也未传入 -AndroidSdkRoot 或 -ToolchainRoot。' }
  $sdkRoot = Require-Path $AndroidSdkRoot 'Android SDK'
  $buildToolsRoot = Require-Path (Join-Path $sdkRoot 'build-tools') 'Android build-tools'
  $platformsRoot = Require-Path (Join-Path $sdkRoot 'platforms') 'Android platforms'
  $buildTools = Get-ChildItem -LiteralPath $buildToolsRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
  $platform = Get-ChildItem -LiteralPath $platformsRoot -Directory | Where-Object { $_.Name -match '^android-\d+$' } | Sort-Object { [int]($_.Name -replace '\D', '') } -Descending | Select-Object -First 1
  if (-not $buildTools -or -not $platform) { throw 'Android SDK 缺少 build-tools 或 android-XX platform。' }
  $buildToolsPath = $buildTools.FullName
  $androidJar = Require-Path $(if ($AndroidJarPath) { $AndroidJarPath } else { Join-Path $platform.FullName 'android.jar' }) 'android.jar'
  $javac = if ($JdkRoot) { Require-Path (Join-Path $JdkRoot 'bin/javac.exe') 'javac' } else { Require-CommandPath 'javac' }
}

$aapt = Require-Path (Join-Path $buildToolsPath 'aapt.exe') 'aapt'
$zipalign = Require-Path (Join-Path $buildToolsPath 'zipalign.exe') 'zipalign'
$apksigner = Require-Path (Join-Path $buildToolsPath 'apksigner.bat') 'apksigner'
$d8Jar = Join-Path $buildToolsPath 'd8.jar'
if (-not (Test-Path -LiteralPath $d8Jar)) { $d8Jar = Join-Path $buildToolsPath 'lib/d8.jar' }
$d8Jar = Require-Path $d8Jar 'd8.jar'
$java = Require-Path (Join-Path (Split-Path -Parent $javac) 'java.exe') 'java'

if (($KeystorePath -and -not $KeyAlias) -or ($KeyAlias -and -not $KeystorePath)) { throw '正式签名必须同时传入 -KeystorePath 与 -KeyAlias。' }
if ($KeystorePath) {
  $KeystorePath = Require-Path $KeystorePath '签名库'
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($KeyStorePasswordEnv))) {
    throw "签名库密码未设置。请先设置环境变量 $KeyStorePasswordEnv，再重新执行。"
  }
}

$stage = Join-Path $buildRoot 'release-stage'
$buildRootFull = Require-Path $buildRoot 'APK build 目录'
$stageFull = [IO.Path]::GetFullPath($stage)
if (-not $stageFull.StartsWith($buildRootFull, [StringComparison]::OrdinalIgnoreCase)) { throw '构建暂存目录越界，已停止。' }
if (Test-Path -LiteralPath $stageFull) { Remove-Item -LiteralPath $stageFull -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageFull, (Join-Path $stageFull 'gen'), (Join-Path $stageFull 'classes'), (Join-Path $stageFull 'dex'), (Join-Path $stageFull 'assets') | Out-Null

$resDir = Require-Path (Join-Path $apkRoot 'res') 'Android res'
$srcDir = Require-Path (Join-Path $apkRoot 'src') 'Android src'
$manifest = Require-Path (Join-Path $apkRoot 'AndroidManifest.xml') 'AndroidManifest.xml'
$publicDir = Require-Path (Join-Path $repoRoot 'public') 'Web 前端资源'
Copy-Item -LiteralPath $resDir -Destination (Join-Path $stageFull 'res') -Recurse -Force
Copy-Item -LiteralPath $srcDir -Destination (Join-Path $stageFull 'src') -Recurse -Force
Copy-Item -LiteralPath $manifest -Destination (Join-Path $stageFull 'AndroidManifest.xml') -Force
Copy-Item -LiteralPath $publicDir -Destination (Join-Path $stageFull 'assets/www') -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $stageFull 'platform') | Out-Null
Copy-Item -LiteralPath $androidJar -Destination (Join-Path $stageFull 'platform/android.jar') -Force
Copy-Item -LiteralPath $d8Jar -Destination (Join-Path $stageFull 'platform/d8.jar') -Force
$manifest = Join-Path $stageFull 'AndroidManifest.xml'
$srcDir = Join-Path $stageFull 'src'
$androidJar = Join-Path $stageFull 'platform/android.jar'
$d8Jar = Join-Path $stageFull 'platform/d8.jar'

# 仅覆盖构建暂存文件，源码 public/runtime-config.js 永远不携带环境地址。
$normalizedApiBase = $ApiBase.TrimEnd('/')
Set-Content -LiteralPath (Join-Path $stageFull 'assets/www/runtime-config.js') -Encoding utf8 -NoNewline -Value "window.HABITPET_API_BASE = '$normalizedApiBase';"

$generatedR = Join-Path $stageFull 'gen'
& $aapt package -f -m -J $generatedR -M $manifest -S (Join-Path $stageFull 'res') -I $androidJar
if ($LASTEXITCODE -ne 0) { throw 'aapt 资源编译失败。' }

$javaSources = @(
  (Join-Path $generatedR 'com/habitpet/app/R.java'),
  (Join-Path $srcDir 'com/habitpet/app/MainActivity.java')
)
& $javac -encoding UTF-8 -source 8 -target 8 -classpath $androidJar -d (Join-Path $stageFull 'classes') @javaSources
if ($LASTEXITCODE -ne 0) { throw 'javac 编译失败。' }
# 旧 d8.bat 会传入 Java 21 已移除的 -Djava.ext.dirs；直接调用同版本 d8.jar。
$classFiles = @(Get-ChildItem -LiteralPath (Join-Path $stageFull 'classes') -Filter '*.class' -File -Recurse | ForEach-Object FullName)
if ($classFiles.Count -eq 0) { throw 'javac 未生成 .class 文件。' }
& $java -Xmx1024M -Xss1m -cp $d8Jar com.android.tools.r8.D8 --min-api 24 --lib $androidJar --output (Join-Path $stageFull 'dex') @classFiles
if ($LASTEXITCODE -ne 0) { throw 'd8 dex 编译失败。' }

$unsigned = Join-Path $stageFull 'lingxi-unsigned.apk'
$aligned = Join-Path $stageFull 'lingxi-aligned.apk'
& $aapt package -f -M $manifest -S (Join-Path $stageFull 'res') -A (Join-Path $stageFull 'assets') -I $androidJar -F $unsigned
if ($LASTEXITCODE -ne 0) { throw 'aapt APK 打包失败。' }
Push-Location (Join-Path $stageFull 'dex')
try { & $aapt add $unsigned 'classes.dex' } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'classes.dex 写入 APK 失败。' }
& $zipalign -f 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign 失败。' }

$signed = [bool]$KeystorePath
if (-not $OutputPath) {
  $name = if ($signed) { 'lingxi-mainland-1.0.0-beta.1.apk' } else { 'lingxi-mainland-1.0.0-beta.1-unsigned.apk' }
  $OutputPath = Join-Path $repoRoot (Join-Path 'dist' $name)
}
$outputFull = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputFull) | Out-Null

if ($signed) {
  & $apksigner sign --ks $KeystorePath --ks-key-alias $KeyAlias --ks-pass "env:$KeyStorePasswordEnv" --out $outputFull $aligned
  if ($LASTEXITCODE -ne 0) { throw 'apksigner 签名失败。' }
  & $apksigner verify --verbose --print-certs $outputFull
  if ($LASTEXITCODE -ne 0) { throw 'APK 签名校验失败。' }
} else {
  Copy-Item -LiteralPath $aligned -Destination $outputFull -Force
  Write-Warning "已生成未签名候选包：$outputFull。它不能分发安装；传入发布签名参数后才会生成可安装 APK。"
}

Write-Host "APK 构建完成：$outputFull"
Write-Host "后端地址：$normalizedApiBase"
