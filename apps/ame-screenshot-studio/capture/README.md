# Native window capture

This independent helper belongs to Ame Screenshot Studio. It does not load or modify Ame's catalog, preferences, binaries, or source media. It has no input injection or window-resizing commands.

## Build

Requires Windows 10 version 2004 or later, Visual Studio C++ x64 Build Tools, and Windows SDK 10.0.26100.0. No .NET SDK, package download, or third-party library is needed.

~~~powershell
& .\build.ps1
# Build and run pure geometry tests without creating any windows:
& .\build.ps1 -TestGeometry
# Build and run hidden-window identity tests:
& .\build.ps1 -TestIdentity
~~~

The optimized x64 binary is written to out\ame-capture.exe. The build is serial and treats compiler warnings as errors.

## Commands

~~~powershell
& .\out\ame-capture.exe enumerate
& .\out\ame-capture.exe geometry 0x123456
& .\out\ame-capture.exe capture 0x123456 '..\captures\gallery.png'
& .\out\ame-capture.exe capture 0x123456 '..\captures\gallery.png' --timeout-ms 12000
& .\out\ame-capture.exe self-test 'out\self-test.png'
~~~

enumerate writes a UTF-8 JSON array to stdout. Each entry has id (hexadecimal HWND string), title, process (executable basename), pid (number), and started (decimal string containing the process creation FILETIME). A zero started value means the identity could not be read. It returns visible, titled, unowned, uncloaked top-level windows. It never reads a window's pixels. Window titles may contain personal information; keep this response local.

For Ame capture, forward the id, pid, and started from the same enumeration entry:

~~~powershell
$selected = & .\out\ame-capture.exe enumerate | ConvertFrom-Json |
  Where-Object { $_.process -ieq 'cedarflake_ame.exe' -and $_.started -ne '0' } |
  Select-Object -First 1
if (-not $selected) { throw 'No Ame window is available.' }
& .\out\ame-capture.exe capture-ame $selected.id $selected.pid $selected.started '..\captures\gallery.png'
~~~

capture-ame uses the exact command signature `capture-ame HWND PID STARTED output.png [--timeout-ms 8000]`. Keep started as a string in JavaScript; converting FILETIME to a Number loses precision. It retains a process handle for the whole operation and checks HWND ownership, process liveness, creation FILETIME, and the case-insensitive executable basename cedarflake_ame.exe before creating the capture item, during capture, and immediately before publishing the encoded PNG. A stale selection or another executable fails without publishing a PNG. This identifies an explicitly selected running process; it does not authenticate the executable's publisher or file contents.

capture-ame copies only the visible client area. Ame's custom titlebar is inside that area and is retained. The generic capture command keeps the full WGC frame for explicitly selected fixtures and pixel comparisons; Studio's Ame capture route must use capture-ame. Both commands write one JSON result:

~~~json
{"path":"..\\captures\\gallery.png","width":1584,"height":892,"dpi":96,"format":"png","colorSpace":"sRGB","area":"client","sourceWidth":1586,"sourceHeight":894,"crop":{"x":1,"y":1,"width":1584,"height":892},"geometry":{"windowBounds":[93,100,1693,1000],"frameBounds":[100,100,1686,994],"clientBounds":[101,101,1685,993],"dpi":96,"visibleFrameBorder":1}}
~~~

The example geometry is illustrative. width and height always match the saved PNG. sourceWidth and sourceHeight report the original WGC ContentSize; crop is the exact copied rectangle in source pixels. The geometry command reads only the requested HWND geometry and creates no capture session. Its rectangles use physical screen coordinates under per-monitor DPI awareness v2; visibleFrameBorder is the DWM-reported border width, or null when unsupported. It is evidence only and never becomes a guessed trim.

Failures return exit code 1 and a JSON error on stderr. A successful command returns 0. Existing outputs are never overwritten, and the parent directory must already exist. The PNG is encoded in a uniquely reserved temporary file beside the destination, then renamed into place. Normal failures remove only that owned temporary file.

The -TestIdentity build option uses hidden windows owned by a dedicated fixture executable. It checks a matching executable identity, a non-Ame executable, invalid creation identities, and a closed window without starting WGC or reading pixels. Its renamed fixture stays under out\\identity-fixture and exits after validation.

self-test briefly displays a synthetic, nonactivating 1920 x 1080 borderless window, captures only that window, and closes it. Its four quadrant colors are RGB (24,38,60), (34,153,136), (245,184,65), and (202,76,98). It never captures another application.

## Capture contract

- Windows.Graphics.Capture creates an item for the selected HWND. The process opts into per-monitor DPI awareness v2.
- CreateFreeThreaded and bounded TryGetNextFrame polling avoid a UI dispatcher dependency. No frame-arrival callback can outlive the capture owner.
- The BGRA8 frame's ContentSize determines the full source dimensions. A resize recreates the pool within the original deadline. There is no scaling, thumbnailing, wallpaper, or screenshot composition.
- Client capture uses GetClientRect and ClientToScreen, with DWMWA_EXTENDED_FRAME_BOUNDS as the WGC origin. GetWindowRect is recorded only: it may include invisible resize borders and is not the crop origin. Source dimensions must exactly match the physical DWM frame dimensions. A mismatch fails without publishing an image.
- The copied region is the intersection of the screen client rectangle and the DWM frame, translated into frame pixels. This handles a client extending behind invisible frame margins without inventing pixels. Generic capture copies the whole ContentSize. GPU readback copies only that exact region to a CPU staging texture and polls nonblocking Map calls under the same deadline.
- Geometry and DPI must remain unchanged across readback and immediately before PNG publication. A moved or resized window fails cleanly for another explicit capture. A custom frame that draws a border inside its client area may still report zero crop; this helper preserves those pixels and reports the geometry rather than silently shaving content.
- The cursor is disabled. Secondary windows are excluded where that setting is available. The normal Windows capture indicator is retained; no borderless-capture permission is requested.
- The target monitor must report SDR RGB_FULL_G22_NONE_P709. HDR/advanced-color output is rejected, not silently clipped or tone-mapped. Monitor movement is rejected. Windows color settings are never changed.
- WIC encodes PNG with the standard sRGB PNG chunk. Pixel dimensions are authoritative; PNG resolution metadata is 96 dpi and the actual window DPI is reported separately.
- The source window must remain visible, unminimized, and owned by the same process during capture. Occlusion is allowed by WGC; minimized/locked-session, excluded-content, secure desktop, cross-user capture, remote-display and GPU behavior require actual host verification.
- Maximum frame size is 64 megapixels with a 16384-pixel edge limit. There are two GPU frame buffers and one CPU copy; this is intended for single screenshots, not video.
- The default frame/readback deadline is 8000 ms; --timeout-ms permits 100–60000 ms. Native driver/API calls and WIC encoding are synchronous. The caller must additionally apply a process deadline (for example 15 seconds with the default capture deadline) to contain a stalled platform call.
- A hard process termination may leave a uniquely named .tmp file. It never publishes a partial destination PNG. Do not broadly delete temporary files while another capture is running.

## Node integration

Use execFile/spawn with shell disabled, a fixed helper path, explicit argument arrays, and a bounded output buffer. Require the web user to choose the returned window and validate the destination stays under the Studio captures directory. Do not put window titles or untrusted text in a command string. Keep captures serial.

~~~javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const execFileAsync = promisify(execFile);
const { stdout } = await execFileAsync(
  fileURLToPath(new URL("./out/ame-capture.exe", import.meta.url)),
  ["capture-ame", selected.id, String(selected.pid), selected.started, outputPath, "--timeout-ms", "8000"],
  { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, encoding: "utf8" },
);
const capture = JSON.parse(stdout);
~~~

The helper has no service, browser port, authentication, telemetry, network access, background persistence, or target-app integration.

## Dependencies and references

The implementation uses the installed Windows SDK C++/WinRT projection, Direct3D 11, DXGI, WIC, and Win32. It does not vendor or copy third-party screenshot code. C++/WinRT is Microsoft's MIT-licensed projection; the installed Windows SDK and OS libraries retain Microsoft's applicable license terms. No new dependency is distributed separately by this helper.

- https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture
- https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow
- https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.direct3d11captureframepool.createfreethreaded
- https://github.com/microsoft/cppwinrt/blob/master/LICENSE

## Verify a client capture

Run geometry HWND inside the same desktop as the Ame HWND, then use the normal guarded capture-ame command with a fresh destination. Confirm the receipt's frame bounds match sourceWidth/sourceHeight and its crop matches the client intersection. Inspect the straight edges at native zoom, and check that the logo, search field and caption controls remain intact. A generic full-window capture of the same explicitly selected Ame window can be compared against the cropped pixels while the app is stationary.

build.ps1 -TestGeometry validates 1-pixel insets, physical 2-pixel insets at 192 DPI with a negative desktop origin, a borderless client, a client extending beyond the visible frame, full-window preservation, mismatched sizes, empty intersection, and changed geometry. These are pure coordinate fixtures and perform no UI or screen capture.

Geometry references:
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclientrect
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-clienttoscreen
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect
- https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute
