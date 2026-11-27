#include "capture_geometry.hpp"

#include <algorithm>
#include <dwmapi.h>
#include <stdexcept>
#include <winrt/base.h>

namespace studio {
namespace {

bool same_rect(const RECT& first, const RECT& second) {
  return first.left == second.left && first.top == second.top &&
         first.right == second.right && first.bottom == second.bottom;
}

}  // namespace

WindowGeometry read_window_geometry(HWND window) {
  WindowGeometry result{};
  if (!GetWindowRect(window, &result.window_bounds)) winrt::throw_last_error();
  winrt::check_hresult(DwmGetWindowAttribute(window, DWMWA_EXTENDED_FRAME_BOUNDS,
                                           &result.frame_bounds, sizeof(result.frame_bounds)));
  RECT client{};
  if (!GetClientRect(window, &client)) winrt::throw_last_error();
  POINT first{client.left, client.top};
  POINT last{client.right, client.bottom};
  if (!ClientToScreen(window, &first) || !ClientToScreen(window, &last)) winrt::throw_last_error();
  result.client_bounds = {first.x, first.y, last.x, last.y};
  result.dpi = GetDpiForWindow(window);
  if (!result.dpi) throw std::runtime_error("Cannot read the selected window DPI");
  result.border_known = SUCCEEDED(DwmGetWindowAttribute(window, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS,
                                                        &result.visible_frame_border,
                                                        sizeof(result.visible_frame_border)));
  return result;
}

bool same_geometry(const WindowGeometry& first, const WindowGeometry& second) {
  return same_rect(first.window_bounds, second.window_bounds) &&
         same_rect(first.frame_bounds, second.frame_bounds) &&
         same_rect(first.client_bounds, second.client_bounds) &&
         first.dpi == second.dpi && first.border_known == second.border_known &&
         first.visible_frame_border == second.visible_frame_border;
}

PixelRegion capture_region(const WindowGeometry& geometry, UINT source_width, UINT source_height,
                           bool client_only) {
  const RECT& frame = geometry.frame_bounds;
  const auto frame_width = static_cast<std::int64_t>(frame.right) - frame.left;
  const auto frame_height = static_cast<std::int64_t>(frame.bottom) - frame.top;
  if (!source_width || !source_height || frame_width != source_width || frame_height != source_height) {
    throw std::runtime_error("WGC ContentSize does not match the physical DWM frame bounds; capture again");
  }
  if (!client_only) return {0, 0, source_width, source_height};
  const RECT& client = geometry.client_bounds;
  const LONG left = std::max(frame.left, client.left);
  const LONG top = std::max(frame.top, client.top);
  const LONG right = std::min(frame.right, client.right);
  const LONG bottom = std::min(frame.bottom, client.bottom);
  if (left >= right || top >= bottom) throw std::runtime_error("The visible client area is empty");
  return {static_cast<UINT>(static_cast<std::int64_t>(left) - frame.left),
          static_cast<UINT>(static_cast<std::int64_t>(top) - frame.top),
          static_cast<UINT>(static_cast<std::int64_t>(right) - left),
          static_cast<UINT>(static_cast<std::int64_t>(bottom) - top)};
}

}  // namespace studio
