#include "capture_identity.hpp"

#include <stdexcept>

namespace studio {

std::uint64_t process_started(HANDLE process) {
  FILETIME created{}, exited{}, kernel{}, user{};
  if (!GetProcessTimes(process, &created, &exited, &kernel, &user)) {
    winrt::throw_last_error();
  }
  return (static_cast<std::uint64_t>(created.dwHighDateTime) << 32) | created.dwLowDateTime;
}

AmeCaptureIdentity::AmeCaptureIdentity(HWND window, ProcessIdentity expected)
    : window_(window), expected_(expected),
      process_(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE,
                           expected.process_id)) {
  if (!expected_.process_id || !expected_.started) {
    throw std::runtime_error("Ame capture requires the enumerated PID and process start identity");
  }
  if (!process_) winrt::throw_last_error();
  validate();
}

void AmeCaptureIdentity::validate() const {
  DWORD owner{};
  if (!IsWindow(window_) || !GetWindowThreadProcessId(window_, &owner) ||
      owner != expected_.process_id || GetProcessId(process_.get()) != expected_.process_id) {
    throw std::runtime_error("The selected Ame window closed or changed process");
  }
  const DWORD state = WaitForSingleObject(process_.get(), 0);
  if (state == WAIT_FAILED) winrt::throw_last_error();
  if (state != WAIT_TIMEOUT || process_started(process_.get()) != expected_.started) {
    throw std::runtime_error("The selected Ame process exited or restarted");
  }
  std::wstring path(32768, L'\0');
  DWORD length = static_cast<DWORD>(path.size());
  if (!QueryFullProcessImageNameW(process_.get(), 0, path.data(), &length)) {
    winrt::throw_last_error();
  }
  path.resize(length);
  if (_wcsicmp(std::filesystem::path(path).filename().c_str(), L"cedarflake_ame.exe") != 0) {
    throw std::runtime_error("Ame capture refuses a non-cedarflake_ame.exe process");
  }
  DWORD current_owner{};
  if (!GetWindowThreadProcessId(window_, &current_owner) || current_owner != owner) {
    throw std::runtime_error("The selected Ame window changed during identity validation");
  }
}

}  // namespace studio
