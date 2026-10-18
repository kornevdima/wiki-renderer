// US-279 R7: static checks on install.ps1. There is no pwsh on the build machine, so the live run is the release
// workflow's "Test the one-line installer" step on windows-latest (Windows PowerShell 5.1) and then the operator's own Windows machine.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const text = readFileSync(path.resolve("install.ps1"), "utf8");
/** The code without comment lines. */
const code = text
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

describe("install.ps1 (static)", () => {
  it("is ASCII only: Windows PowerShell 5.1 reads a file with no BOM as ANSI", () => {
    expect([...text].every((c) => c.charCodeAt(0) < 128)).toBe(true);
  });

  it("downloads the win-x64 zip and SHA256SUMS from the release folder of the chosen tag", () => {
    expect(code).toContain("$platform = 'win-x64'");
    expect(code).toContain('$asset = "wiki-renderer-$version-$platform.zip"');
    expect(code).toContain('$releaseUrl = "$downloadBase/download/v$version"');
    expect(code).toContain('"$releaseUrl/SHA256SUMS"');
    expect(code).toContain("Invoke-WebRequest -UseBasicParsing");
  });

  it("reads the latest tag from the releases API with ConvertFrom-Json, and honours both seams", () => {
    expect(code).toContain('"$apiBase/releases/latest"');
    expect(code).toContain("ConvertFrom-Json");
    expect(code).toContain("$env:WIKI_RENDERER_API_BASE");
    expect(code).toContain("$env:WIKI_RENDERER_DOWNLOAD_BASE");
    expect(code).toContain("https://github.com/kornevdima/wiki-renderer/releases");
    expect(code).toContain("https://api.github.com/repos/kornevdima/wiki-renderer");
  });

  it("compares the archive's SHA-256 to the SHA256SUMS entry and stops on a mismatch before unpacking", () => {
    expect(code).toMatch(/Get-FileHash -Algorithm SHA256 -LiteralPath \$zipPath/);
    expect(code).toMatch(/\$actual -ne \$expected/);
    expect(code.indexOf("$actual -ne $expected")).toBeLessThan(code.indexOf("Expand-Archive"));
    expect(code).toContain("It was deleted and nothing was installed.");
  });

  it("unpacks beside into a temp folder, then moves it to <home>\\<version> and removes the temp folder", () => {
    expect(code).toContain("Expand-Archive -LiteralPath $zipPath -DestinationPath $unpacked");
    expect(code).toContain("Move-Item -LiteralPath (Join-Path $unpacked $top) -Destination $versionDir");
    expect(code).toMatch(/finally \{[^}]*Remove-Item -LiteralPath \$tmpDir -Recurse -Force/);
  });

  it("installs under %LOCALAPPDATA%\\wiki-renderer unless WIKI_RENDERER_HOME says otherwise, with a bin\\wiki-renderer.cmd shim and no symlink", () => {
    expect(code).toContain("$env:WIKI_RENDERER_HOME");
    expect(code).toContain("Join-Path $env:LOCALAPPDATA 'wiki-renderer'");
    expect(code).toContain("Join-Path $installHome 'bin'");
    expect(code).toContain("wiki-renderer.cmd");
    expect(code).not.toMatch(/New-Item[^\n]*-ItemType SymbolicLink|mklink/);
  });

  it("reads the raw user PATH and writes it back as ExpandString, so %VAR% entries survive; no SetEnvironmentVariable", () => {
    expect(code).toContain("[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')");
    expect(code).toContain("[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames");
    expect(code).toContain("[Microsoft.Win32.RegistryValueKind]::ExpandString");
    expect(code).not.toMatch(/SetEnvironmentVariable|GetEnvironmentVariable/);
    expect(code).not.toMatch(/'Machine'|HKLM|EnvironmentVariableTarget/);
    // Existing text is kept as is: the new entry is appended to the raw string.
    expect(code).toContain("$newPath = $raw + ';' + $binDir");
  });

  it("matches an existing entry case-insensitively, ignoring a trailing backslash, raw or expanded, and writes only when missing", () => {
    expect(code).toContain("$plain -ieq $binDir.TrimEnd('\\')");
    expect(code).toContain("[Environment]::ExpandEnvironmentVariables($entry).TrimEnd('\\')");
    expect(code).toContain("if (-not $onPath)");
    expect(code.indexOf("if (-not $onPath)")).toBeLessThan(code.indexOf(".SetValue($valueName"));
    expect(code).toContain("A new terminal picks it up.");
  });

  it("creates the value as ExpandString when there is none, and takes the value name from the test seam (default Path)", () => {
    expect(code).toContain("if ($raw -eq '') { $newPath = $binDir }");
    expect(code).toContain("$env:WIKI_RENDERER_PATH_VALUE_NAME");
    expect(code).toContain("$valueName = 'Path'");
  });

  it("broadcasts WM_SETTINGCHANGE with SendMessageTimeout, not a dummy variable write", () => {
    expect(code).toContain("SendMessageTimeout");
    expect(code).toContain("0xffff, 0x1A");
    expect(code).toContain("'Environment'");
    expect(code).toContain("Send-EnvironmentChange");
  });

  it("writes a shim with no call: the version's launcher is the last command, so its exit code and unexpanded arguments pass through", () => {
    expect(code).toContain('"@echo off`r`n`"%~dp0..\\$Version\\wiki-renderer.cmd`" %*`r`n"');
    expect(code).not.toMatch(/call `"|exit \/b/);
    expect(text).toContain("No `call`");
  });

  it("refuses an existing <home>\\<version> that is not a working install, and checks the launcher after the move", () => {
    expect(code.match(/exists but is not a Wiki Renderer install\. Move it away and run this again\./g)).toHaveLength(2);
    expect(code.indexOf("exists but is not")).toBeLessThan(code.indexOf("Invoke-WebRequest -UseBasicParsing -Uri \"$releaseUrl/$asset\""));
    const move = code.indexOf("Move-Item -LiteralPath (Join-Path $unpacked $top)");
    expect(code.lastIndexOf("exists but is not", move)).toBeGreaterThan(code.indexOf("Expand-Archive"));
    expect(code.indexOf("has no wiki-renderer.cmd, so nothing was linked.")).toBeGreaterThan(move);
  });

  it("keeps nothing in the person's session: the whole body is a script block, and exit uses the path captured outside it", () => {
    expect(code).toMatch(/^& \{\s+param\(\$asFile\)/m);
    expect(code.trimEnd().endsWith("} ([bool]$MyInvocation.MyCommand.Path)")).toBe(true);
    expect(code).toContain("if (-not $wikiRendererOk -and $asFile) { exit 1 }");
    expect(code.match(/^function /gm)).toBeNull();
  });

  it("requires https unless the URL is under a test seam, and gives the small requests a timeout but the archive none", () => {
    expect(code).toContain("if ($Url.StartsWith('https://')) { return }");
    expect(code).toContain("foreach ($seam in @($env:WIKI_RENDERER_DOWNLOAD_BASE, $env:WIKI_RENDERER_API_BASE))");
    expect(code).toContain('Assert-Https "$releaseUrl/$asset"');
    expect(code).toContain('Invoke-WebRequest -UseBasicParsing -Uri "$releaseUrl/$asset" -OutFile $zipPath');
    expect(code).toContain("-TimeoutSec 60 -Uri \"$releaseUrl/SHA256SUMS\"");
  });

  it("forces TLS 1.2 for Windows PowerShell 5.1", () => {
    expect(code).toContain("[Net.SecurityProtocolType]::Tls12");
    expect(code.indexOf("Tls12")).toBeLessThan(code.indexOf("Invoke-WebRequest"));
  });

  it("checks the version text before it goes into a path or URL, and ends with the contract's last line", () => {
    expect(code).toContain("'\\A[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?\\z'");
    expect(code).not.toMatch(/-notmatch '\^/);
    expect(code).toContain('Write-Host "Installed Wiki Renderer $version. Run: wiki-renderer"');
    expect(code).toContain('Write-Host "Wiki Renderer $version is already installed. Run: wiki-renderer"');
  });

  it("never calls exit inside the function and exits non-zero only when run as a file, so `irm | iex` cannot close the terminal", () => {
    const lastLines = code.slice(code.indexOf("$wikiRendererOk = $false"));
    expect(code.replace(lastLines, "")).not.toMatch(/\bexit\b/);
    expect(lastLines).toContain("$MyInvocation.MyCommand.Path");
    expect(lastLines).toContain("exit 1");
  });

  it("uses no PowerShell 7-only syntax", () => {
    expect(code).not.toMatch(/\?\?|\?\.|\s\?\s.+\s:\s|&&|\|\||-Parallel|\$IsWindows|\$IsLinux|\$IsMacOS|ForEach-Object\s+-Parallel|Get-Content[^\n]*-AsByteStream|-SkipHttpErrorCheck|-Encoding utf8NoBOM|-Resolve\b/);
  });

  it("never touches the config folder, an rc file or the machine PATH", () => {
    expect(code).not.toMatch(/APPDATA\\wiki-renderer|config\.json|\$PROFILE/);
    expect(code.replace(/\$env:LOCALAPPDATA/g, "")).not.toMatch(/\$env:APPDATA/);
  });
});
