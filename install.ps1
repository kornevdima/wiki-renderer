# Installs Wiki Renderer on Windows (US-279):
#   irm https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.ps1 | iex
#
# Downloads wiki-renderer-<version>-win-x64.zip from the GitHub release, checks it against SHA256SUMS, unpacks it into
# %LOCALAPPDATA%\wiki-renderer\<version>\ and writes a wiki-renderer.cmd shim in %LOCALAPPDATA%\wiki-renderer\bin that
# runs that version, then adds the bin folder to your user PATH. It never touches your config or your wikis. Run it
# again to update; older versions stay beside the new one.
#
# Environment:
#   WIKI_RENDERER_VERSION        install this version instead of the latest (1.2.3 or v1.2.3)
#   WIKI_RENDERER_HOME           install folder (default %LOCALAPPDATA%\wiki-renderer)
#   WIKI_RENDERER_DOWNLOAD_BASE  default https://github.com/kornevdima/wiki-renderer/releases   (a test seam)
#   WIKI_RENDERER_API_BASE       default https://api.github.com/repos/kornevdima/wiki-renderer   (a test seam)
#   WIKI_RENDERER_PATH_VALUE_NAME  the user-environment value to extend, default Path   (a test seam: the release workflow uses a throwaway one)
#
# Windows PowerShell 5.1 compatible: no PowerShell 7-only syntax, ASCII only (5.1 reads a file without a BOM as ANSI).
# Run through iex, so it never calls exit; a failure prints one line. Everything sits in a script block (& { ... }), so
# no function or variable is left in the person's session.

& {
    param($asFile)

    # Plain http only for a URL under a test seam that was set; everything else must be https.
    function Assert-Https {
        param([string]$Url)
        if ($Url.StartsWith('https://')) { return }
        foreach ($seam in @($env:WIKI_RENDERER_DOWNLOAD_BASE, $env:WIKI_RENDERER_API_BASE)) {
            if ($seam -and $Url.StartsWith($seam)) { return }
        }
        throw "Refusing to download over plain http: $Url"
    }

    function Install-WikiRenderer {
        $ErrorActionPreference = 'Stop'
        $ProgressPreference = 'SilentlyContinue'

        # Windows PowerShell 5.1 negotiates TLS 1.0 by default; GitHub needs 1.2.
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        } catch {
        }

        $downloadBase = $env:WIKI_RENDERER_DOWNLOAD_BASE
        if (-not $downloadBase) { $downloadBase = 'https://github.com/kornevdima/wiki-renderer/releases' }
        $apiBase = $env:WIKI_RENDERER_API_BASE
        if (-not $apiBase) { $apiBase = 'https://api.github.com/repos/kornevdima/wiki-renderer' }

        # --- this machine ---
        $cpu = $env:PROCESSOR_ARCHITEW6432
        if (-not $cpu) { $cpu = $env:PROCESSOR_ARCHITECTURE }
        if ($cpu -ne 'AMD64') {
            throw "Wiki Renderer has no Windows build for $cpu. It runs on Windows x64."
        }
        $platform = 'win-x64'

        # --- where to install ---
        $installHome = $env:WIKI_RENDERER_HOME
        if (-not $installHome) {
            if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is not set. Set WIKI_RENDERER_HOME to the folder to install into.' }
            $installHome = Join-Path $env:LOCALAPPDATA 'wiki-renderer'
        }
        $binDir = Join-Path $installHome 'bin'
        New-Item -ItemType Directory -Force -Path $installHome | Out-Null
        # A short temp name: Windows PowerShell 5.1 cannot open paths over 260 characters.
        $tmpDir = Join-Path $installHome ('.t' + [Guid]::NewGuid().ToString('N').Substring(0, 6))

        try {
            # --- which version ---
            $version = $env:WIKI_RENDERER_VERSION
            if ($version) {
                if ($version.StartsWith('v')) { $version = $version.Substring(1) }
            } else {
                try {
                    Assert-Https "$apiBase/releases/latest"
                    $latest = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri "$apiBase/releases/latest" -Headers @{ 'User-Agent' = 'wiki-renderer-installer' }).Content | ConvertFrom-Json
                } catch {
                    throw "Could not read the latest release from $apiBase/releases/latest. Check your connection, or set WIKI_RENDERER_VERSION=<version>."
                }
                $version = [string]$latest.tag_name
                if ($version.StartsWith('v')) { $version = $version.Substring(1) }
                if (-not $version) { throw 'The latest release has no version tag. Set WIKI_RENDERER_VERSION=<version>.' }
            }
            if ($version -notmatch '\A[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?\z') {
                throw "`"$version`" is not a version like 1.2.3."
            }

            # --- already installed? ---
            $versionDir = Join-Path $installHome $version
            $already = $false
            $shimPath = Join-Path $binDir 'wiki-renderer.cmd'
            if (Test-Path -LiteralPath (Join-Path $versionDir 'wiki-renderer.cmd')) {
                Write-WikiRendererShim -BinDir $binDir -Version $version
                $already = $true
            } else {
                if (Test-Path -LiteralPath $versionDir) {
                    throw "$versionDir exists but is not a Wiki Renderer install. Move it away and run this again."
                }
                New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

                # --- download and check ---
                $asset = "wiki-renderer-$version-$platform.zip"
                $releaseUrl = "$downloadBase/download/v$version"
                $zipPath = Join-Path $tmpDir $asset
                $sumsPath = Join-Path $tmpDir 'SHA256SUMS'
                Write-Host "Downloading Wiki Renderer $version for $platform..."
                try {
                    Assert-Https "$releaseUrl/$asset"
                    # No -TimeoutSec here: a total limit would cut a slow but moving download of the archive.
                    Invoke-WebRequest -UseBasicParsing -Uri "$releaseUrl/$asset" -OutFile $zipPath
                } catch {
                    throw "Could not download $releaseUrl/$asset. Check the version and your connection."
                }
                try {
                    Assert-Https "$releaseUrl/SHA256SUMS"
                    Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri "$releaseUrl/SHA256SUMS" -OutFile $sumsPath
                } catch {
                    throw "Could not download $releaseUrl/SHA256SUMS."
                }

                $expected = $null
                foreach ($line in (Get-Content -LiteralPath $sumsPath)) {
                    if ($line -match '^([0-9A-Fa-f]{64})\s+\*?(.+?)\s*$' -and $Matches[2] -eq $asset) {
                        $expected = $Matches[1].ToLowerInvariant()
                        break
                    }
                }
                if (-not $expected) { throw "SHA256SUMS has no entry for $asset." }
                $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
                if ($actual -ne $expected) {
                    throw "The download does not match SHA256SUMS ($asset). It was deleted and nothing was installed."
                }

                # --- unpack beside, then move into place ---
                $top = "wiki-renderer-$version-$platform"
                $unpacked = Join-Path $tmpDir 'u'
                Expand-Archive -LiteralPath $zipPath -DestinationPath $unpacked -Force
                if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $unpacked $top) 'wiki-renderer.cmd'))) {
                    throw "$asset does not hold $top\wiki-renderer.cmd, so nothing was installed."
                }
                if (Test-Path -LiteralPath $versionDir) {
                    throw "$versionDir exists but is not a Wiki Renderer install. Move it away and run this again."
                }
                Move-Item -LiteralPath (Join-Path $unpacked $top) -Destination $versionDir
                if (-not (Test-Path -LiteralPath (Join-Path $versionDir 'wiki-renderer.cmd'))) {
                    throw "$versionDir has no wiki-renderer.cmd, so nothing was linked."
                }
                Write-WikiRendererShim -BinDir $binDir -Version $version
            }

            # --- user PATH ---
            # Read the raw registry value (DoNotExpandEnvironmentNames) and write it back as ExpandString, so every %VAR% entry the
            # person already has stays a %VAR% entry. [Environment]::Get/SetEnvironmentVariable would expand them for good.
            $valueName = $env:WIKI_RENDERER_PATH_VALUE_NAME
            if (-not $valueName) { $valueName = 'Path' }
            $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
            try {
                $raw = [string]$key.GetValue($valueName, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                $onPath = $false
                foreach ($entry in ($raw -split ';')) {
                    if ($entry -eq '') { continue }
                    $plain = $entry.TrimEnd('\')
                    $expanded = [Environment]::ExpandEnvironmentVariables($entry).TrimEnd('\')
                    if (($plain -ieq $binDir.TrimEnd('\')) -or ($expanded -ieq $binDir.TrimEnd('\'))) { $onPath = $true }
                }
                if (-not $onPath) {
                    if ($raw -eq '') { $newPath = $binDir } elseif ($raw.EndsWith(';')) { $newPath = $raw + $binDir } else { $newPath = $raw + ';' + $binDir }
                    $key.SetValue($valueName, $newPath, [Microsoft.Win32.RegistryValueKind]::ExpandString)
                    $env:Path = "$env:Path;$binDir"
                    Send-EnvironmentChange
                    Write-Host "Added $binDir to your user PATH. A new terminal picks it up."
                }
            } finally {
                $key.Close()
            }
            if ($already) {
                Write-Host "Wiki Renderer $version is already installed. Run: wiki-renderer"
            } else {
                Write-Host "Installed Wiki Renderer $version. Run: wiki-renderer"
            }
            return $true
        } finally {
            if (Test-Path -LiteralPath $tmpDir) { Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    # Tells running programs (Explorer, so new terminals) that the user environment changed. Failure is harmless: a new
    # sign-in picks the PATH up anyway.
    function Send-EnvironmentChange {
        try {
            Add-Type -Namespace WikiRenderer -Name Native -MemberDefinition '[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
            $result = [UIntPtr]::Zero
            # HWND_BROADCAST, WM_SETTINGCHANGE, "Environment", SMTO_ABORTIFHUNG, 5 s
            [void][WikiRenderer.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
        } catch {
        }
    }

    # The shim has no symlink (they need privileges): a one-line .cmd that runs the chosen version. Rewritten on every install.
    function Write-WikiRendererShim {
        param([string]$BinDir, [string]$Version)
        New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
        # No `call`: the version's launcher is the last command, so cmd hands control over and its exit code reaches the caller,
        # and the arguments are parsed once (a `call` would expand %VAR% and ^ in them a second time).
        $text = "@echo off`r`n`"%~dp0..\$Version\wiki-renderer.cmd`" %*`r`n"
        $tmp = Join-Path $BinDir 'wiki-renderer.cmd.new'
        [IO.File]::WriteAllText($tmp, $text, (New-Object System.Text.ASCIIEncoding))
        Move-Item -LiteralPath $tmp -Destination (Join-Path $BinDir 'wiki-renderer.cmd') -Force
    }

    $wikiRendererOk = $false
    try {
        $wikiRendererOk = [bool](Install-WikiRenderer)
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
    }
    # Through iex there is no script path and `exit` would close the person's terminal; run as a file, the exit code carries the failure.
    if (-not $wikiRendererOk -and $asFile) { exit 1 }
} ([bool]$MyInvocation.MyCommand.Path)
