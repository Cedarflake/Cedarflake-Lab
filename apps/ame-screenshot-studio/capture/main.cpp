#include "native.hpp"
#include "capture_geometry.hpp"

#include <cerrno>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string_view>
#include <winrt/base.h>

namespace {

class Apartment {
 public:
  Apartment() { winrt::init_apartment(winrt::apartment_type::multi_threaded); }
  ~Apartment() { winrt::uninit_apartment(); }
};

std::uint64_t parse_number(const wchar_t* text, int base) {
  if (!text[0] || text[0] == L'-' || text[0] == L'+') throw std::runtime_error("Invalid unsigned number");
  wchar_t* end{};
  errno = 0;
  const auto value = std::wcstoull(text, &end, base);
  if (errno == ERANGE || !end || *end || end == text) throw std::runtime_error("Invalid unsigned number");
  return value;
}

void write_rect(const RECT& rect) {
  std::cout << '[' << rect.left << ',' << rect.top << ',' << rect.right << ',' << rect.bottom << ']';
}

void write_geometry(const studio::WindowGeometry& geometry) {
  std::cout << "{\"windowBounds\":";
  write_rect(geometry.window_bounds);
  std::cout << ",\"frameBounds\":";
  write_rect(geometry.frame_bounds);
  std::cout << ",\"clientBounds\":";
  write_rect(geometry.client_bounds);
  std::cout << ",\"dpi\":" << geometry.dpi << ",\"visibleFrameBorder\":";
  if (geometry.border_known) std::cout << geometry.visible_frame_border;
  else std::cout << "null";
  std::cout << '}';
}

void write_result(const studio::CaptureResult& result) {
  std::cout << "{\"path\":" << studio::json_string(result.path.wstring())
            << ",\"width\":" << result.width << ",\"height\":" << result.height
            << ",\"dpi\":" << result.dpi << ",\"format\":\"png\",\"colorSpace\":\"sRGB\""
            << ",\"area\":\"" << (result.client_only ? "client" : "window") << '"'
            << ",\"sourceWidth\":" << result.source_width << ",\"sourceHeight\":" << result.source_height
            << ",\"crop\":{\"x\":" << result.region.left << ",\"y\":" << result.region.top
            << ",\"width\":" << result.region.width << ",\"height\":" << result.region.height << '}'
            << ",\"geometry\":";
  write_geometry(result.geometry);
  std::cout << "}\n";
}

int run(int argc, wchar_t** argv) {
  if (argc == 3 && std::wstring_view(argv[1]) == L"geometry") {
    const auto value = parse_number(argv[2], 0);
    if (!value || value > std::numeric_limits<std::uintptr_t>::max()) {
      throw std::runtime_error("Invalid HWND");
    }
    const HWND window = reinterpret_cast<HWND>(static_cast<std::uintptr_t>(value));
    if (!IsWindow(window)) throw std::runtime_error("The selected window no longer exists");
    write_geometry(studio::read_window_geometry(window));
    std::cout << '\n';
    return 0;
  }
  if (argc == 2 && std::wstring_view(argv[1]) == L"enumerate") {
    bool first = true;
    std::cout << '[';
    for (const auto& window : studio::enumerate_windows()) {
      if (!first) std::cout << ',';
      first = false;
      std::cout << "{\"id\":\"" << studio::window_id(window.handle) << "\",\"title\":"
                << studio::json_string(window.title) << ",\"process\":"
                << studio::json_string(window.process) << ",\"pid\":" << window.identity.process_id
                << ",\"started\":\"" << window.identity.started << "\"}";
    }
    std::cout << "]\n";
    return 0;
  }
  if (argc == 3 && std::wstring_view(argv[1]) == L"self-test") {
    studio::TestWindow window;
    write_result(studio::capture_window(window.handle(), argv[2], 8000));
    return 0;
  }
  const bool guarded = argc > 1 && std::wstring_view(argv[1]) == L"capture-ame";
  const bool generic = argc > 1 && std::wstring_view(argv[1]) == L"capture";
  const int output_index = guarded ? 5 : 3;
  if ((guarded || generic) && (argc == output_index + 1 || argc == output_index + 3)) {
    const auto value = parse_number(argv[2], 0);
    if (!value || value > std::numeric_limits<std::uintptr_t>::max()) {
      throw std::runtime_error("Invalid HWND");
    }
    studio::ProcessIdentity identity{};
    if (guarded) {
      const auto pid = parse_number(argv[3], 10);
      if (!pid || pid > std::numeric_limits<DWORD>::max()) throw std::runtime_error("Invalid PID");
      identity = {static_cast<DWORD>(pid), parse_number(argv[4], 10)};
      if (!identity.started) throw std::runtime_error("Invalid process start identity");
    }
    std::uint32_t timeout_ms = 8000;
    if (argc == output_index + 3) {
      if (std::wstring_view(argv[output_index + 1]) != L"--timeout-ms") throw std::runtime_error("Unknown option");
      const auto timeout = parse_number(argv[output_index + 2], 10);
      if (timeout < 100 || timeout > 60000) throw std::runtime_error("Timeout must be between 100 and 60000 ms");
      timeout_ms = static_cast<std::uint32_t>(timeout);
    }
    write_result(studio::capture_window(reinterpret_cast<HWND>(static_cast<std::uintptr_t>(value)),
                                        argv[output_index], timeout_ms, guarded ? &identity : nullptr));
    return 0;
  }
  throw std::runtime_error(
      "Usage: ame-capture enumerate | geometry HWND | capture HWND output.png [--timeout-ms 8000] | "
      "capture-ame HWND PID STARTED output.png [--timeout-ms 8000] | self-test output.png");
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  try {
    if (!SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) {
      winrt::throw_last_error();
    }
    Apartment apartment;
    return run(argc, argv);
  } catch (const winrt::hresult_error& error) {
    std::cerr << "{\"error\":" << studio::json_string(error.message().c_str())
              << ",\"hresult\":" << error.code().value << "}\n";
  } catch (const std::exception& error) {
    std::cerr << "{\"error\":" << studio::json_string(winrt::to_hstring(error.what()).c_str()) << "}\n";
  }
  return 1;
}
