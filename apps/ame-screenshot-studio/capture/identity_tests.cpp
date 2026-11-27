#include "capture_identity.hpp"

#include <iostream>
#include <stdexcept>
#include <string_view>

namespace {

class HiddenWindow {
 public:
  HiddenWindow() {
    window_ = CreateWindowExW(0, L"STATIC", L"Capture identity fixture", WS_POPUP,
                              0, 0, 1, 1, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!window_) winrt::throw_last_error();
  }
  ~HiddenWindow() { close(); }
  HWND handle() const { return window_; }
  void close() { if (window_) { DestroyWindow(window_); window_ = nullptr; } }
 private:
  HWND window_{};
};

template <typename Action>
void require_rejection(Action action, const char* expected) {
  try {
    action();
  } catch (const std::runtime_error& error) {
    if (std::string_view(error.what()).find(expected) != std::string_view::npos) return;
    throw;
  }
  throw std::runtime_error("Identity guard unexpectedly accepted an invalid target");
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  try {
    const bool expect_ame = argc == 2 && std::wstring_view(argv[1]) == L"--expect-ame";
    HiddenWindow window;
    const studio::ProcessIdentity own{GetCurrentProcessId(),
                                      studio::process_started(GetCurrentProcess())};
    require_rejection([&] { studio::AmeCaptureIdentity guard(window.handle(), {own.process_id, 0}); },
                      "requires the enumerated PID");
    require_rejection([&] { studio::AmeCaptureIdentity guard(window.handle(), {own.process_id, own.started + 1}); },
                      "exited or restarted");
    if (expect_ame) {
      studio::AmeCaptureIdentity guard(window.handle(), own);
      guard.validate();
      window.close();
      require_rejection([&] { guard.validate(); }, "closed or changed process");
    } else {
      require_rejection([&] { studio::AmeCaptureIdentity guard(window.handle(), own); },
                        "non-cedarflake_ame.exe");
    }
    std::cout << (expect_ame ? "PASS accepted matching identity; rejected invalid start/closed window\n"
                             : "PASS rejected non-Ame process and invalid start identity\n");
    return 0;
  } catch (const winrt::hresult_error& error) {
    std::cerr << winrt::to_string(error.message()) << '\n';
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
  }
  return 1;
}
