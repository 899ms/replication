[CmdletBinding()]
param(
    [string]$Destination,
    [string]$BootstrapPython = "python"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$VendorRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot "vendor"))
if (-not $Destination) {
    $Destination = Join-Path $VendorRoot "replication-runtime"
}
$Destination = [IO.Path]::GetFullPath($Destination)
if (-not $Destination.StartsWith($VendorRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Destination must stay below $VendorRoot"
}

$PythonVersion = "3.13.14"
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$PythonSha256 = "90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907"
$FfmpegVersion = "8.1.2"
$FfmpegUrl = "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-$FfmpegVersion-essentials_build.zip"
$FfmpegSha256 = "db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec"

$TemporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("replication-runtime-" + [Guid]::NewGuid().ToString("N"))
$StagingRoot = Join-Path $TemporaryRoot "staging"
$PythonArchive = Join-Path $TemporaryRoot "python.zip"
$FfmpegArchive = Join-Path $TemporaryRoot "ffmpeg.zip"

function Assert-Sha256 {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Expected
    )
    $Actual = Get-Sha256 -Path $Path
    if ($Actual -ne $Expected.ToLowerInvariant()) {
        throw "SHA-256 mismatch for $Path. Expected $Expected; got $Actual."
    }
}

function Get-Sha256 {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )
    $Stream = [IO.File]::OpenRead($Path)
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $Bytes = $Hasher.ComputeHash($Stream)
        return ([BitConverter]::ToString($Bytes)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $Hasher.Dispose()
        $Stream.Dispose()
    }
}

try {
    New-Item -ItemType Directory -Path $TemporaryRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $StagingRoot -Force | Out-Null

    Write-Host "Downloading Python $PythonVersion embedded runtime..."
    Invoke-WebRequest -Uri $PythonUrl -OutFile $PythonArchive -UseBasicParsing
    Assert-Sha256 -Path $PythonArchive -Expected $PythonSha256
    $PythonRoot = Join-Path $StagingRoot "python"
    Expand-Archive -Path $PythonArchive -DestinationPath $PythonRoot -Force

    $SitePackages = Join-Path $PythonRoot "Lib\site-packages"
    New-Item -ItemType Directory -Path $SitePackages -Force | Out-Null
    & $BootstrapPython -m pip install `
        --disable-pip-version-check `
        --no-compile `
        --requirement (Join-Path $ProjectRoot "requirements.txt") `
        --target $SitePackages
    if ($LASTEXITCODE -ne 0) {
        throw "Installing the embedded Python packages failed."
    }

    $PthFile = Get-ChildItem -Path $PythonRoot -Filter "python*._pth" | Select-Object -First 1
    if (-not $PthFile) {
        throw "The embedded Python path file is missing."
    }
    $PthLines = @(Get-Content -Path $PthFile.FullName)
    $PthLines = @($PthLines | ForEach-Object {
        if ($_ -eq "#import site") { "import site" } else { $_ }
    })
    if ($PthLines -notcontains "Lib\site-packages") {
        $PthLines += "Lib\site-packages"
    }
    Set-Content -Path $PthFile.FullName -Value $PthLines -Encoding Ascii

    $EmbeddedPython = Join-Path $PythonRoot "python.exe"
    & $EmbeddedPython -c "import requests; print(requests.__version__)"
    if ($LASTEXITCODE -ne 0) {
        throw "The embedded Python runtime cannot import requests."
    }

    Write-Host "Downloading FFmpeg $FfmpegVersion essentials..."
    Invoke-WebRequest -Uri $FfmpegUrl -OutFile $FfmpegArchive -UseBasicParsing
    Assert-Sha256 -Path $FfmpegArchive -Expected $FfmpegSha256
    $FfmpegExtracted = Join-Path $TemporaryRoot "ffmpeg-extracted"
    Expand-Archive -Path $FfmpegArchive -DestinationPath $FfmpegExtracted -Force
    $FfmpegSourceRoot = Get-ChildItem -Path $FfmpegExtracted -Directory | Select-Object -First 1
    if (-not $FfmpegSourceRoot) {
        throw "The FFmpeg archive has no root directory."
    }
    $FfmpegRoot = Join-Path $StagingRoot "ffmpeg"
    New-Item -ItemType Directory -Path $FfmpegRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $FfmpegSourceRoot.FullName "bin\ffmpeg.exe") -Destination $FfmpegRoot
    Copy-Item -Path (Join-Path $FfmpegSourceRoot.FullName "bin\ffprobe.exe") -Destination $FfmpegRoot
    Copy-Item -Path (Join-Path $FfmpegSourceRoot.FullName "LICENSE") -Destination (Join-Path $FfmpegRoot "LICENSE.txt")

    $EmbeddedFfprobe = Join-Path $FfmpegRoot "ffprobe.exe"
    & $EmbeddedFfprobe -version
    if ($LASTEXITCODE -ne 0) {
        throw "The embedded ffprobe executable did not start."
    }

    $Manifest = [ordered]@{
        schema_version = "replication.windows-runtime.v1"
        architecture = "x64"
        python = [ordered]@{
            version = $PythonVersion
            source = $PythonUrl
            archive_sha256 = $PythonSha256
            executable_sha256 = (Get-Sha256 -Path $EmbeddedPython)
            packages = (& $EmbeddedPython -c "import importlib.metadata as m, json; print(json.dumps({n:m.version(n) for n in ('requests','certifi','charset-normalizer','idna','urllib3')}))" | ConvertFrom-Json)
        }
        ffmpeg = [ordered]@{
            version = $FfmpegVersion
            source = $FfmpegUrl
            source_project = "https://ffmpeg.org/"
            archive_sha256 = $FfmpegSha256
            ffmpeg_sha256 = (Get-Sha256 -Path (Join-Path $FfmpegRoot "ffmpeg.exe"))
            ffprobe_sha256 = (Get-Sha256 -Path $EmbeddedFfprobe)
        }
    }
    $Manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $StagingRoot "runtime-manifest.json") -Encoding UTF8

    if (Test-Path $Destination) {
        Remove-Item -Path $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Split-Path $Destination -Parent) -Force | Out-Null
    Move-Item -Path $StagingRoot -Destination $Destination
    Write-Host "Windows runtime ready: $Destination"
}
finally {
    if (Test-Path $TemporaryRoot) {
        Remove-Item -Path $TemporaryRoot -Recurse -Force
    }
}
