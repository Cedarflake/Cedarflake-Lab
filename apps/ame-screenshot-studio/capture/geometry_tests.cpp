#include "capture_geometry.hpp"

#include <iostream>
#include <stdexcept>

namespace {

void require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

void expect_region(const studio::WindowGeometry& geometry, UINT source_width, UINT source_height,
                   bool client_only, studio::PixelRegion expected) {
  const auto actual = studio::capture_region(geometry, source_width, source_height, client_only);
  require(actual.left == expected.left && actual.top == expected.top &&
          actual.width == expected.width && actual.height == expected.height,
          "Unexpected client capture rectangle");
}

}  // namespace

int main() {
  try {
    studio::WindowGeometry geometry{};
    geometry.window_bounds = {93, 100, 1693, 1000};
    geometry.frame_bounds = {100, 100, 1686, 994};
    geometry.client_bounds = {101, 101, 1685, 993};
    geometry.dpi = 96;
    expect_region(geometry, 1586, 894, true, {1, 1, 1584, 892});
    expect_region(geometry, 1586, 894, false, {0, 0, 1586, 894});

    geometry.window_bounds = {-1934, -114, -306, 814};
    geometry.frame_bounds = {-1920, -100, -320, 800};
    geometry.client_bounds = {-1918, -98, -322, 798};
    geometry.dpi = 192;
    expect_region(geometry, 1600, 900, true, {2, 2, 1596, 896});

    geometry.client_bounds = geometry.frame_bounds;
    expect_region(geometry, 1600, 900, true, {0, 0, 1600, 900});
    geometry.client_bounds = {-1928, -108, -312, 808};
    expect_region(geometry, 1600, 900, true, {0, 0, 1600, 900});

    bool rejected = false;
    try { studio::capture_region(geometry, 1601, 900, true); }
    catch (const std::runtime_error&) { rejected = true; }
    require(rejected, "Mismatched WGC geometry must be rejected");

    geometry.client_bounds = {0, 0, 10, 10};
    rejected = false;
    try { studio::capture_region(geometry, 1600, 900, true); }
    catch (const std::runtime_error&) { rejected = true; }
    require(rejected, "Disjoint client geometry must be rejected");

    auto changed = geometry;
    require(studio::same_geometry(geometry, changed), "Identical geometry must match");
    ++changed.client_bounds.left;
    require(!studio::same_geometry(geometry, changed), "Client geometry changes must be detected");
    std::cout << "{\"geometryTests\":\"passed\",\"cases\":8}\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
