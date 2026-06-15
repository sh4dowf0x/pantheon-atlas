const { execFile } = require('node:child_process');

function runPowerShellJson(script) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        resolve({
          ok: false,
          error: error.message,
          stdout: stdout || ''
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout || '[]');
        resolve({
          ok: true,
          rows: Array.isArray(parsed) ? parsed : [parsed]
        });
      } catch {
        resolve({
          ok: false,
          error: 'Invalid JSON from PowerShell memory probe',
          stdout: stdout || ''
        });
      }
    });
  });
}

function escapeForPowerShellSingleQuotes(value) {
  return String(value || '').replace(/'/g, "''");
}

async function sampleProcessMemoryStrings(pid, options = {}) {
  const processId = Number(pid);
  if (!Number.isFinite(processId) || processId <= 0) return [];

  const processName = String(options.processName || 'Pantheon.exe');
  const maxRegionsPerSweep = Math.max(1, Math.min(256, Number(options.maxRegionsPerSweep) || 32));
  const maxBytesPerRegion = Math.max(1024, Math.min(1024 * 1024, Number(options.maxBytesPerRegion) || 65536));
  const minStringLength = Math.max(4, Math.min(64, Number(options.minStringLength) || 6));
  const startAddress = Number.isFinite(Number(options.startAddress)) && Number(options.startAddress) > 0
    ? Math.max(0, Math.floor(Number(options.startAddress)))
    : 0;
  const keywords = Array.isArray(options.keywords) ? options.keywords.filter(Boolean).slice(0, 64) : [];
  const escapedKeywords = keywords.map(escapeForPowerShellSingleQuotes);
  const escapedProcessName = escapeForPowerShellSingleQuotes(processName);

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class MemoryRegionObservation {
  public string baseAddress { get; set; }
  public long regionSize { get; set; }
  public List<string> strings { get; set; }
}

public class MemoryScanResult {
  public long nextAddress { get; set; }
  public List<MemoryRegionObservation> observations { get; set; }
}

public static class MemoryScanner {
  [Flags]
  private enum ProcessAccess : uint {
    QueryInformation = 0x0400,
    VmRead = 0x0010
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct MEMORY_BASIC_INFORMATION {
    public IntPtr BaseAddress;
    public IntPtr AllocationBase;
    public uint AllocationProtect;
    public UIntPtr RegionSize;
    public uint State;
    public uint Protect;
    public uint Type;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr OpenProcess(ProcessAccess dwDesiredAccess, bool bInheritHandle, int dwProcessId);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr hObject);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr VirtualQueryEx(IntPtr hProcess, IntPtr lpAddress, out MEMORY_BASIC_INFORMATION lpBuffer, UIntPtr dwLength);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, UIntPtr nSize, out UIntPtr lpNumberOfBytesRead);

  private const uint MEM_COMMIT = 0x1000;
  private const uint PAGE_NOACCESS = 0x01;
  private const uint PAGE_GUARD = 0x100;

  private static bool IsReadable(uint protect) {
    if ((protect & PAGE_GUARD) != 0) return false;
    if ((protect & PAGE_NOACCESS) != 0) return false;
    return protect == 0x02 || protect == 0x04 || protect == 0x08 || protect == 0x20 || protect == 0x40 || protect == 0x80
      || protect == 0x12 || protect == 0x22 || protect == 0x42 || protect == 0x82 || protect == 0x102 || protect == 0x120 || protect == 0x140 || protect == 0x180;
  }

  private static void AddAsciiStrings(List<string> output, byte[] buffer, int minLength, HashSet<string> seen, Func<string, bool> accept) {
    var current = new StringBuilder();
    for (int i = 0; i < buffer.Length; i++) {
      byte b = buffer[i];
      if (b >= 32 && b <= 126) {
        current.Append((char)b);
      } else {
        if (current.Length >= minLength) {
          var value = current.ToString().Trim();
          if (value.Length >= minLength && accept(value) && seen.Add(value)) output.Add(value);
        }
        current.Clear();
      }
    }
    if (current.Length >= minLength) {
      var value = current.ToString().Trim();
      if (value.Length >= minLength && accept(value) && seen.Add(value)) output.Add(value);
    }
  }

  private static void AddUtf16Strings(List<string> output, byte[] buffer, int minLength, HashSet<string> seen, Func<string, bool> accept) {
    var current = new StringBuilder();
    for (int i = 0; i + 1 < buffer.Length; i += 2) {
      byte lo = buffer[i];
      byte hi = buffer[i + 1];
      if (hi == 0 && lo >= 32 && lo <= 126) {
        current.Append((char)lo);
      } else {
        if (current.Length >= minLength) {
          var value = current.ToString().Trim();
          if (value.Length >= minLength && accept(value) && seen.Add(value)) output.Add(value);
        }
        current.Clear();
      }
    }
    if (current.Length >= minLength) {
      var value = current.ToString().Trim();
      if (value.Length >= minLength && accept(value) && seen.Add(value)) output.Add(value);
    }
  }

  public static MemoryScanResult Scan(int pid, int maxRegionsPerSweep, int maxBytesPerRegion, int minStringLength, long startAddress, string[] keywords) {
    var handle = OpenProcess(ProcessAccess.QueryInformation | ProcessAccess.VmRead, false, pid);
    if (handle == IntPtr.Zero) {
      return new MemoryScanResult {
        nextAddress = startAddress,
        observations = new List<MemoryRegionObservation>()
      };
    }

    try {
      var output = new List<MemoryRegionObservation>();
      var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      int regions = 0;
      ulong address = (ulong)Math.Max(0, startAddress);
      int keywordCount = keywords == null ? 0 : keywords.Length;
      Func<string, bool> accept = (value) => {
        if (keywordCount == 0) return true;
        for (int i = 0; i < keywordCount; i++) {
          var keyword = keywords[i];
          if (!string.IsNullOrWhiteSpace(keyword) && value.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0) return true;
        }
        return false;
      };

      while (regions < maxRegionsPerSweep) {
        MEMORY_BASIC_INFORMATION mbi;
        var query = VirtualQueryEx(handle, (IntPtr)address, out mbi, (UIntPtr)Marshal.SizeOf(typeof(MEMORY_BASIC_INFORMATION)));
        if (query == IntPtr.Zero) break;

        ulong regionSize = mbi.RegionSize.ToUInt64();
        ulong nextAddress = (ulong)mbi.BaseAddress.ToInt64() + regionSize;
        address = nextAddress;

        if (mbi.State != MEM_COMMIT || !IsReadable(mbi.Protect) || regionSize == 0) continue;

        int bytesToRead = (int)Math.Min((ulong)maxBytesPerRegion, regionSize);
        if (bytesToRead <= 0) continue;

        var buffer = new byte[bytesToRead];
        UIntPtr bytesRead;
        if (!ReadProcessMemory(handle, mbi.BaseAddress, buffer, (UIntPtr)bytesToRead, out bytesRead) || bytesRead.ToUInt64() == 0) continue;

        var actual = (int)Math.Min((ulong)bytesRead.ToUInt64(), (ulong)buffer.Length);
        if (actual <= 0) continue;
        if (actual < buffer.Length) Array.Resize(ref buffer, actual);

        var strings = new List<string>();
        AddAsciiStrings(strings, buffer, minStringLength, seen, accept);
        AddUtf16Strings(strings, buffer, minStringLength, seen, accept);
        if (strings.Count == 0) {
          regions++;
          continue;
        }

        output.Add(new MemoryRegionObservation {
          baseAddress = "0x" + mbi.BaseAddress.ToInt64().ToString("X"),
          regionSize = (long)Math.Min(regionSize, (ulong)int.MaxValue),
          strings = strings
        });
        regions++;
      }

      return new MemoryScanResult {
        nextAddress = (long)Math.Min(address, (ulong)long.MaxValue),
        observations = output
      };
    } finally {
      CloseHandle(handle);
    }
  }
}
"@;
[MemoryScanner]::Scan(${processId}, ${maxRegionsPerSweep}, ${maxBytesPerRegion}, ${minStringLength}, ${startAddress}, @(${escapedKeywords.map((keyword) => `'${keyword}'`).join(', ')})) | ConvertTo-Json -Compress -Depth 4
  `;

  const result = await runPowerShellJson(script);
  if (!result.ok) {
    throw new Error(result.error || 'PowerShell memory probe failed');
  }
  const payload = Array.isArray(result.rows) ? result.rows[0] : result.rows;
  const observations = payload?.observations || [];
  return {
    nextAddress: Number(payload?.nextAddress || startAddress || 0) || 0,
    observations: observations.map((row) => ({
      baseAddress: row.baseAddress || null,
      regionSize: Number(row.regionSize || 0) || null,
      strings: Array.isArray(row.strings) ? row.strings.map((text) => String(text)).filter(Boolean) : []
    })).filter((row) => row.strings.length > 0)
  };
}

module.exports = {
  sampleProcessMemoryStrings
};
