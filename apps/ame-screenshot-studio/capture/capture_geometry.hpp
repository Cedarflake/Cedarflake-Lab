#pragma once

#include "native.hpp"

namespace studio {

WindowGeometry read_window_geometry(HWND window);
bool same_geometry(const WindowGeometry& first, const WindowGeometry& second);
PixelRegion capture_region(const WindowGeometry& geometry, UINT source_width, UINT source_height,
                           bool client_only);

}  // namespace studio
