#pragma once

#include "native.hpp"
#include <winrt/base.h>

namespace studio {

std::uint64_t process_started(HANDLE process);

class AmeCaptureIdentity {
 public:
  AmeCaptureIdentity(HWND window, ProcessIdentity expected);
  void validate() const;

 private:
  HWND window_{};
  ProcessIdentity expected_{};
  winrt::handle process_;
};

}  // namespace studio
