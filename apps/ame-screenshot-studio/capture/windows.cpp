#include "native.hpp"
#include "capture_identity.hpp"

#include <dwmapi.h>
#include <exception>
#include <iterator>
#include <sstream>
#include <winrt/base.h>

namespace studio {
namespace {

struct WindowList {
  std::vector<WindowInfo> windows;
  std::exception_ptr error;
};

BOOL CALLBACK append_window(HWND window, LPARAM parameter) noexcept {
  auto& list = *reinterpret_cast<WindowList*>(parameter);
  try {
    if (!IsWindowVisible(window) || GetWindow(window, GW_OWNER) != nullptr) return TRUE;
    DWORD cloaked{};
    if (SUCCEEDED(DwmGetWindowAttribute(window, DWMWA_CLOAKED, &cloaked,
                                       sizeof(cloaked))) && cloaked) return TRUE;
    const auto length = GetWindowTextLengthW(window);
    if (length <= 0) return TRUE;
    std::wstring title(static_cast<std::size_t>(length) + 1, L'\0');
    title.resize(GetWindowTextW(window, title.data(), length + 1));
    DWORD process_id{};
    GetWindowThreadProcessId(window, &process_id);
    winrt::handle process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, process_id));
    std::wstring name = L"unknown";
    std::uint64_t started{};
    if (process) {
      std::wstring path(32768, L'\0');
      DWORD size = static_cast<DWORD>(path.size());
      if (QueryFullProcessImageNameW(process.get(), 0, path.data(), &size)) {
        path.resize(size);
        name = std::filesystem::path(path).filename().wstring();
        try { started = process_started(process.get()); }
        catch (const winrt::hresult_error&) { return TRUE; }
      }
    }
    DWORD current_owner{};
    if (!GetWindowThreadProcessId(window, &current_owner) || current_owner != process_id) return TRUE;
    list.windows.push_back({window, std::move(title), std::move(name), {process_id, started}});
    return TRUE;
  } catch (...) {
    list.error = std::current_exception();
    return FALSE;
  }
}

LRESULT CALLBACK test_window_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  if (message == WM_PAINT) {
    PAINTSTRUCT paint{};
    HDC dc = BeginPaint(window, &paint);
    RECT bounds{};
    GetClientRect(window, &bounds);
    const COLORREF colors[] = {RGB(24, 38, 60), RGB(34, 153, 136),
                              RGB(245, 184, 65), RGB(202, 76, 98)};
    for (int quadrant = 0; quadrant < 4; ++quadrant) {
      RECT region{(quadrant % 2) * bounds.right / 2,
                  (quadrant / 2) * bounds.bottom / 2,
                  ((quadrant % 2) + 1) * bounds.right / 2,
                  ((quadrant / 2) + 1) * bounds.bottom / 2};
      HBRUSH brush = CreateSolidBrush(colors[quadrant]);
      FillRect(dc, &region, brush);
      DeleteObject(brush);
    }
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(255, 255, 255));
    const wchar_t label[] = L"Ame Screenshot Studio - native 1920 x 1080 capture test";
    TextOutW(dc, 48, 48, label, static_cast<int>(std::size(label) - 1));
    EndPaint(window, &paint);
    return 0;
  }
  return DefWindowProcW(window, message, wparam, lparam);
}

}  // namespace

std::vector<WindowInfo> enumerate_windows() {
  WindowList result;
  if (!EnumWindows(append_window, reinterpret_cast<LPARAM>(&result)) && !result.error) {
    winrt::throw_last_error();
  }
  if (result.error) std::rethrow_exception(result.error);
  return result.windows;
}

TestWindow::TestWindow() {
  WNDCLASSW type{};
  type.lpfnWndProc = test_window_proc;
  type.hInstance = GetModuleHandleW(nullptr);
  type.lpszClassName = L"AmeScreenshotStudioCaptureTest";
  if (!RegisterClassW(&type)) winrt::throw_last_error();
  try {
    window_ = CreateWindowExW(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW, type.lpszClassName,
                              L"Ame Screenshot Studio Capture Test", WS_POPUP,
                              0, 0, 1920, 1080, nullptr, nullptr, type.hInstance, nullptr);
    if (!window_) winrt::throw_last_error();
    ShowWindow(window_, SW_SHOWNOACTIVATE);
    UpdateWindow(window_);
    winrt::check_hresult(DwmFlush());
  } catch (...) {
    if (window_) DestroyWindow(window_);
    UnregisterClassW(type.lpszClassName, type.hInstance);
    throw;
  }
}

TestWindow::~TestWindow() {
  if (window_) DestroyWindow(window_);
  UnregisterClassW(L"AmeScreenshotStudioCaptureTest", GetModuleHandleW(nullptr));
}

std::string utf8(const std::wstring& value) {
  if (value.empty()) return {};
  const int size = WideCharToMultiByte(CP_UTF8, 0, value.data(),
                                       static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  if (!size) winrt::throw_last_error();
  std::string result(size, '\0');
  if (!WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
                           result.data(), size, nullptr, nullptr)) winrt::throw_last_error();
  return result;
}

std::string json_string(const std::wstring& value) {
  std::ostringstream json;
  json << '"';
  for (unsigned char byte : utf8(value)) {
    switch (byte) {
      case '"': json << "\\\""; break;
      case '\\': json << "\\\\"; break;
      case '\b': json << "\\b"; break;
      case '\f': json << "\\f"; break;
      case '\n': json << "\\n"; break;
      case '\r': json << "\\r"; break;
      case '\t': json << "\\t"; break;
      default:
        if (byte < 0x20) {
          constexpr char hex[] = "0123456789abcdef";
          json << "\\u00" << hex[byte >> 4] << hex[byte & 15];
        } else {
          json << static_cast<char>(byte);
        }
    }
  }
  json << '"';
  return json.str();
}

std::string window_id(HWND window) {
  std::ostringstream text;
  text << "0x" << std::hex << reinterpret_cast<std::uintptr_t>(window);
  return text.str();
}

}  // namespace studio
