#pragma once

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace studio {

struct ProcessIdentity {
  DWORD process_id{};
  std::uint64_t started{};
};

struct WindowInfo {
  HWND handle{};
  std::wstring title;
  std::wstring process;
  ProcessIdentity identity;
};

struct WindowGeometry {
  RECT window_bounds{};
  RECT frame_bounds{};
  RECT client_bounds{};
  UINT dpi{};
  UINT visible_frame_border{};
  bool border_known{};
};

struct PixelRegion {
  UINT left{};
  UINT top{};
  UINT width{};
  UINT height{};
};

struct CaptureResult {
  std::filesystem::path path;
  std::uint32_t width{};
  std::uint32_t height{};
  UINT dpi{};
  UINT source_width{};
  UINT source_height{};
  WindowGeometry geometry;
  PixelRegion region;
  bool client_only{};
};

std::vector<WindowInfo> enumerate_windows();
CaptureResult capture_window(HWND window, const std::filesystem::path& output,
                             std::uint32_t timeout_ms,
                             const ProcessIdentity* ame_identity = nullptr);

class TestWindow {
 public:
  TestWindow();
  ~TestWindow();
  TestWindow(const TestWindow&) = delete;
  TestWindow& operator=(const TestWindow&) = delete;
  HWND handle() const { return window_; }

 private:
  HWND window_{};
};

std::string utf8(const std::wstring& value);
std::string json_string(const std::wstring& value);
std::string window_id(HWND window);

}  // namespace studio
