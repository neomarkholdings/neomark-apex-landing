# Samurai / Windows Defender coexistence.
# Adds or removes exclusions ONLY for Samurai's own folders and processes.
# Never disables real-time protection. Never excludes Downloads, Desktop, or sanctuary.

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Align", "Remove", "Status")]
    [string]$Action,
    [string]$InstallDir = "",
    [string]$AppDataDir = ""
)

$ErrorActionPreference = "Stop"

$AllowedProcess = @(
    "samurai.exe",
    "yara.exe",
    "clamscan.exe",
    "freshclam.exe"
)

function Test-SamuraiExclusionPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }
    $n = $Path.Replace("/", "\").ToLowerInvariant().TrimEnd("\")
    if ($n.Length -lt 8) {
        return $false
    }
    $forbidden = @(
        "\downloads",
        "\desktop",
        "\music",
        "\studio-projects",
        "\documents",
        "\pictures",
        "\videos"
    )
    foreach ($bad in $forbidden) {
        if ($n.Contains($bad)) {
            return $false
        }
    }
    if ($n -match "^[a-z]:$" -or $n -eq "c:\" -or $n -eq "c:\program files" -or $n -eq "c:\program files (x86)") {
        return $false
    }
    if ($n.Contains("com.roninsoftworx.samurai")) {
        return $true
    }
    if ($n.EndsWith("\samurai") -or $n.Contains("\samurai\engines")) {
        return $true
    }
    if ($n.Contains("\ronin softworx\samurai")) {
        return $true
    }
    return $false
}

function Get-CandidatePaths {
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($candidate in @($InstallDir, $AppDataDir)) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-SamuraiExclusionPath $candidate)) {
            $out.Add($candidate.TrimEnd("\", "/")) | Out-Null
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($AppDataDir)) {
        $vault = Join-Path $AppDataDir "install_gate"
        if (Test-SamuraiExclusionPath $vault) {
            $out.Add($vault) | Out-Null
        }
        $engines = Join-Path $InstallDir "engines"
        if (Test-SamuraiExclusionPath $engines) {
            $out.Add($engines) | Out-Null
        }
    }
    return @($out | Select-Object -Unique)
}

$paths = Get-CandidatePaths
if ($paths.Count -eq 0) {
    throw "Refused: no Samurai-owned folders were supplied. Downloads/Desktop are never excluded."
}

if ($Action -eq "Status") {
    $pref = Get-MpPreference
    [pscustomobject]@{
        RealTime = [bool](Get-MpComputerStatus).RealTimeProtectionEnabled
        Paths    = @($pref.ExclusionPath)
        Process  = @($pref.ExclusionProcess)
        Wanted   = $paths
    } | ConvertTo-Json -Compress
    exit 0
}

if ($Action -eq "Align") {
    foreach ($path in $paths) {
        if (-not (Test-SamuraiExclusionPath $path)) {
            throw "Refused exclusion path: $path"
        }
        Add-MpPreference -ExclusionPath $path -ErrorAction Stop
    }
    foreach ($proc in $AllowedProcess) {
        Add-MpPreference -ExclusionProcess $proc -ErrorAction Stop
    }
    Write-Output "Aligned Windows Defender exclusions for Samurai folders only. Real-time protection was not changed."
    exit 0
}

foreach ($path in $paths) {
    if (Test-SamuraiExclusionPath $path) {
        Remove-MpPreference -ExclusionPath $path -ErrorAction SilentlyContinue
    }
}
foreach ($proc in $AllowedProcess) {
    Remove-MpPreference -ExclusionProcess $proc -ErrorAction SilentlyContinue
}
Write-Output "Removed Samurai Defender exclusions. Defender real-time protection was not changed."
