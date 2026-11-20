# LANSend installer for Windows (PowerShell 5.1+).
#
# Usage:
#   irm https://raw.githubusercontent.com/fcbyk/lansend/main/scripts/install.ps1 | iex
#
# Downloads the latest CLI release for Windows x64, verifies its SHA-256
# against checksums.txt, installs to %LOCALAPPDATA%\LANSend and adds that
# directory to the user PATH. No administrator rights are required.

[CmdletBinding()]
param(
    [string]$InstallDir,
    [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Older PowerShell versions default to TLS 1.0, which GitHub rejects.
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
    # PowerShell 7 does not need this setting.
}

$Repo = 'fcbyk/lansend'
$Asset = 'lansend-windows-x64.zip'
$BaseUrl = "https://github.com/$Repo/releases/latest/download"

if (-not $InstallDir) {
    if ($env:LANSEND_INSTALL_DIR) {
        $InstallDir = $env:LANSEND_INSTALL_DIR
    } else {
        $InstallDir = Join-Path $env:LOCALAPPDATA 'LANSend'
    }
}

$Arch = if ($env:PROCESSOR_ARCHITEW6432) {
    $env:PROCESSOR_ARCHITEW6432
} else {
    $env:PROCESSOR_ARCHITECTURE
}

if ($Arch -eq 'ARM64') {
    Write-Host 'ARM64 detected: installing the x64 build (requires Windows 11 x64 emulation).'
} elseif ($Arch -ne 'AMD64') {
    throw "Unsupported architecture: $Arch. LANSend provides a Windows x64 build only."
}

function Test-PathEntry {
    param([string]$PathValue, [string]$Directory)
    $target = $Directory.TrimEnd('\')
    foreach ($entry in ($PathValue -split ';')) {
        if ($entry -and $entry.TrimEnd('\') -ieq $target) {
            return $true
        }
    }
    return $false
}

$TempDir = Join-Path ([IO.Path]::GetTempPath()) ('lansend-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    $ZipPath = Join-Path $TempDir $Asset

    Write-Host "Downloading $Asset ..."
    Invoke-WebRequest -Uri "$BaseUrl/$Asset" -OutFile $ZipPath -UseBasicParsing

    if (-not $SkipVerify) {
        $ChecksumsPath = Join-Path $TempDir 'checksums.txt'
        $ChecksumsReady = $false
        try {
            Invoke-WebRequest -Uri "$BaseUrl/checksums.txt" -OutFile $ChecksumsPath -UseBasicParsing
            $ChecksumsReady = $true
        } catch {
            Write-Warning 'Could not download checksums.txt; skipping verification.'
        }

        if ($ChecksumsReady) {
            $Line = Get-Content -Path $ChecksumsPath |
                Where-Object { $_ -match '\slansend-windows-x64\.zip\s*$' } |
                Select-Object -First 1

            if ($Line) {
                $Expected = ($Line -split '\s+')[0].ToLowerInvariant()
                $Actual = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($Actual -ne $Expected) {
                    throw "SHA-256 mismatch for $Asset. The download may be corrupted; aborting."
                }
                Write-Host 'SHA-256 verified.'
            } else {
                Write-Warning "checksums.txt does not list $Asset; skipping verification."
            }
        }
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force

    $ExePath = Join-Path $InstallDir 'lansend.exe'
    if (-not (Test-Path -Path $ExePath)) {
        throw 'lansend.exe was not found after extraction.'
    }

    # Remove the mark-of-the-web so first launch is not blocked.
    try {
        Unblock-File -Path $ExePath -ErrorAction SilentlyContinue
    } catch {
        # Unblock-File is optional.
    }

    $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $UserPath) {
        $UserPath = ''
    }

    if (-not (Test-PathEntry -PathValue $UserPath -Directory $InstallDir)) {
        try {
            $NewPath = (@(($UserPath -split ';') | Where-Object { $_ }) + $InstallDir) -join ';'
            [Environment]::SetEnvironmentVariable('Path', $NewPath, 'User')
            Write-Host "Added $InstallDir to the user PATH."
        } catch {
            Write-Warning "Could not update the user PATH automatically. Add it manually: $InstallDir"
        }
    }

    if (-not (Test-PathEntry -PathValue $env:Path -Directory $InstallDir)) {
        $env:Path = $env:Path + ';' + $InstallDir
    }

    Write-Host ''
    Write-Host "Installed to $ExePath"

    try {
        $Version = & $ExePath -v 2>$null | Select-Object -First 1
        if ($LASTEXITCODE -eq 0 -and $Version) {
            Write-Host $Version
        }
    } catch {
        # The binary still installed correctly even if the version check fails.
    }

    Write-Host ''
    Write-Host 'Open a new terminal for the PATH change to take effect.'
} finally {
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
