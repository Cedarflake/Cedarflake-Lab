#include "native.hpp"
#include "capture_identity.hpp"
#include "capture_geometry.hpp"

#include <d3d11.h>
#include <dxgi1_6.h>
#include <wincodec.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Metadata.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>

#include <chrono>
#include <cstring>
#include <limits>
#include <optional>
#include <stdexcept>

namespace studio {
namespace {

using namespace winrt;
using namespace winrt::Windows::Graphics;
using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;
using Clock = std::chrono::steady_clock;
constexpr std::uint64_t max_pixels = 64ULL * 1024 * 1024;

class CaptureLifetime {
 public:
  Direct3D11CaptureFramePool pool{nullptr};
  GraphicsCaptureSession session{nullptr};
  ~CaptureLifetime() {
    if (session) { try { session.Close(); } catch (...) {} }
    if (pool) { try { pool.Close(); } catch (...) {} }
  }
};

class FrameLifetime {
 public:
  Direct3D11CaptureFrame frame{nullptr};
  explicit FrameLifetime(Direct3D11CaptureFrame value) : frame(std::move(value)) {}
  ~FrameLifetime() { if (frame) { try { frame.Close(); } catch (...) {} } }
};

class TemporaryFile {
 public:
  explicit TemporaryFile(const std::filesystem::path& destination) {
    GUID identifier{};
    check_hresult(CoCreateGuid(&identifier));
    wchar_t text[40]{};
    StringFromGUID2(identifier, text, static_cast<int>(std::size(text)));
    path = destination;
    path += std::wstring(L".") + text + L".tmp";
    file_handle reservation(CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                                    FILE_ATTRIBUTE_NORMAL, nullptr));
    if (!reservation) throw_last_error();
  }
  ~TemporaryFile() { if (!path.empty()) DeleteFileW(path.c_str()); }
  void publish(const std::filesystem::path& destination) {
    if (!MoveFileExW(path.c_str(), destination.c_str(), MOVEFILE_WRITE_THROUGH)) throw_last_error();
    path.clear();
  }
  std::filesystem::path path;
};

void require_size(SizeInt32 size) {
  if (size.Width <= 0 || size.Height <= 0 || size.Width > 16384 || size.Height > 16384 ||
      static_cast<std::uint64_t>(size.Width) * size.Height > max_pixels) {
    throw std::runtime_error("Capture size is empty or exceeds the 64-megapixel/16384-edge limit");
  }
}

void check_deadline(Clock::time_point deadline) {
  if (Clock::now() >= deadline) throw std::runtime_error("Capture timed out waiting for a complete frame");
}

void wait_for_frame(Clock::time_point deadline) {
  check_deadline(deadline);
  MSG message{};
  while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }
  Sleep(10);
}

void require_same_window(HWND window, DWORD expected_process) {
  DWORD process{};
  GetWindowThreadProcessId(window, &process);
  if (!IsWindow(window) || process != expected_process) {
    throw std::runtime_error("The selected window closed or changed ownership");
  }
  if (!IsWindowVisible(window) || IsIconic(window)) {
    throw std::runtime_error("The selected window must remain visible and not minimized");
  }
}

void require_sdr(HWND window) {
  const HMONITOR monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
  com_ptr<IDXGIFactory1> factory;
  check_hresult(CreateDXGIFactory1(__uuidof(IDXGIFactory1), factory.put_void()));
  for (UINT adapter_index = 0;; ++adapter_index) {
    com_ptr<IDXGIAdapter1> adapter;
    const auto adapter_result = factory->EnumAdapters1(adapter_index, adapter.put());
    if (adapter_result == DXGI_ERROR_NOT_FOUND) break;
    check_hresult(adapter_result);
    for (UINT output_index = 0;; ++output_index) {
      com_ptr<IDXGIOutput> output;
      const auto output_result = adapter->EnumOutputs(output_index, output.put());
      if (output_result == DXGI_ERROR_NOT_FOUND) break;
      check_hresult(output_result);
      DXGI_OUTPUT_DESC info{};
      check_hresult(output->GetDesc(&info));
      if (info.Monitor != monitor) continue;
      DXGI_OUTPUT_DESC1 color{};
      check_hresult(output.as<IDXGIOutput6>()->GetDesc1(&color));
      if (color.ColorSpace != DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709) {
        throw std::runtime_error("The target display is not SDR/sRGB; use an SDR display before capture");
      }
      return;
    }
  }
  throw std::runtime_error("Cannot verify the target display SDR color space");
}

void save_png(const std::filesystem::path& output, UINT width, UINT height,
              const std::vector<std::uint8_t>& pixels, const AmeCaptureIdentity* identity,
              HWND window, const WindowGeometry& geometry) {
  TemporaryFile temporary(output);
  {
    com_ptr<IWICImagingFactory> factory;
    check_hresult(CoCreateInstance(CLSID_WICImagingFactory2, nullptr, CLSCTX_INPROC_SERVER,
                                   __uuidof(IWICImagingFactory), factory.put_void()));
    com_ptr<IWICStream> stream;
    check_hresult(factory->CreateStream(stream.put()));
    check_hresult(stream->InitializeFromFilename(temporary.path.c_str(), GENERIC_WRITE));
    com_ptr<IWICBitmapEncoder> encoder;
    check_hresult(factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, encoder.put()));
    check_hresult(encoder->Initialize(stream.get(), WICBitmapEncoderNoCache));
    com_ptr<IWICBitmapFrameEncode> frame;
    check_hresult(encoder->CreateNewFrame(frame.put(), nullptr));
    check_hresult(frame->Initialize(nullptr));
    check_hresult(frame->SetSize(width, height));
    check_hresult(frame->SetResolution(96, 96));
    WICPixelFormatGUID format = GUID_WICPixelFormat32bppBGRA;
    check_hresult(frame->SetPixelFormat(&format));
    if (format != GUID_WICPixelFormat32bppBGRA) {
      throw std::runtime_error("The PNG encoder cannot preserve BGRA pixels");
    }
    com_ptr<IWICMetadataQueryWriter> metadata;
    check_hresult(frame->GetMetadataQueryWriter(metadata.put()));
    PROPVARIANT intent{};
    intent.vt = VT_UI1;
    intent.bVal = 1;
    check_hresult(metadata->SetMetadataByName(L"/sRGB/RenderingIntent", &intent));
    check_hresult(frame->WritePixels(height, width * 4, static_cast<UINT>(pixels.size()),
                                     const_cast<BYTE*>(pixels.data())));
    check_hresult(frame->Commit());
    check_hresult(encoder->Commit());
  }
  if (identity) identity->validate();
  if (!same_geometry(geometry, read_window_geometry(window))) {
    throw std::runtime_error("The window geometry changed before PNG publication; capture again");
  }
  temporary.publish(output);
}

std::vector<std::uint8_t> read_pixels(ID3D11Device* device, ID3D11DeviceContext* context,
                                     Direct3D11CaptureFrame const& frame, SizeInt32 size,
                                     const PixelRegion& region, Clock::time_point deadline) {
  auto access = frame.Surface().as<
      ::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
  com_ptr<ID3D11Texture2D> source;
  check_hresult(access->GetInterface(__uuidof(ID3D11Texture2D), source.put_void()));
  D3D11_TEXTURE2D_DESC source_info{};
  source->GetDesc(&source_info);
  if (source_info.Width < static_cast<UINT>(size.Width) ||
      source_info.Height < static_cast<UINT>(size.Height) ||
      source_info.Format != DXGI_FORMAT_B8G8R8A8_UNORM) {
    throw std::runtime_error("Capture surface does not contain the complete SDR frame");
  }
  D3D11_TEXTURE2D_DESC staging_info{};
  staging_info.Width = region.width;
  staging_info.Height = region.height;
  staging_info.MipLevels = 1;
  staging_info.ArraySize = 1;
  staging_info.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
  staging_info.SampleDesc.Count = 1;
  staging_info.Usage = D3D11_USAGE_STAGING;
  staging_info.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
  com_ptr<ID3D11Texture2D> staging;
  check_hresult(device->CreateTexture2D(&staging_info, nullptr, staging.put()));
  D3D11_BOX source_region{region.left, region.top, 0,
                           region.left + region.width, region.top + region.height, 1};
  context->CopySubresourceRegion(staging.get(), 0, 0, 0, 0, source.get(), 0, &source_region);
  context->Flush();
  D3D11_MAPPED_SUBRESOURCE mapped{};
  for (;;) {
    check_deadline(deadline);
    const HRESULT result = context->Map(staging.get(), 0, D3D11_MAP_READ,
                                         D3D11_MAP_FLAG_DO_NOT_WAIT, &mapped);
    if (result != DXGI_ERROR_WAS_STILL_DRAWING) {
      check_hresult(result);
      break;
    }
    wait_for_frame(deadline);
  }
  const std::size_t stride = static_cast<std::size_t>(region.width) * 4;
  std::vector<std::uint8_t> pixels;
  try {
    pixels.resize(stride * region.height);
    for (UINT row = 0; row < region.height; ++row) {
      std::memcpy(pixels.data() + stride * row,
                  static_cast<const BYTE*>(mapped.pData) + mapped.RowPitch * row, stride);
    }
  } catch (...) {
    context->Unmap(staging.get(), 0);
    throw;
  }
  context->Unmap(staging.get(), 0);
  return pixels;
}

}  // namespace

CaptureResult capture_window(HWND window, const std::filesystem::path& destination,
                             std::uint32_t timeout_ms, const ProcessIdentity* ame_identity) {
  const auto deadline = Clock::now() + std::chrono::milliseconds(timeout_ms);
  std::optional<AmeCaptureIdentity> identity;
  if (ame_identity) identity.emplace(window, *ame_identity);
  DWORD process{};
  GetWindowThreadProcessId(window, &process);
  require_same_window(window, process);
  const auto output = std::filesystem::absolute(destination).lexically_normal();
  if (_wcsicmp(output.extension().c_str(), L".png") != 0 ||
      !std::filesystem::is_directory(output.parent_path())) {
    throw std::runtime_error("Output must be a .png path in an existing directory");
  }
  if (std::filesystem::exists(output)) throw std::runtime_error("Output already exists; choose a new path");
  if (!GraphicsCaptureSession::IsSupported()) throw std::runtime_error("Windows Graphics Capture is unavailable");
  require_sdr(window);
  const auto monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
  auto interop = get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
  GraphicsCaptureItem item{nullptr};
  if (identity) identity->validate();
  check_hresult(interop->CreateForWindow(window, guid_of<GraphicsCaptureItem>(), put_abi(item)));
  if (identity) identity->validate();
  SizeInt32 pool_size = item.Size();
  require_size(pool_size);
  com_ptr<ID3D11Device> device;
  com_ptr<ID3D11DeviceContext> context;
  check_hresult(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
                                  D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION,
                                  device.put(), nullptr, context.put()));
  com_ptr<::IInspectable> inspectable;
  check_hresult(CreateDirect3D11DeviceFromDXGIDevice(device.as<IDXGIDevice>().get(),
                                                   inspectable.put()));
  auto direct_device = inspectable.as<IDirect3DDevice>();
  CaptureLifetime capture;
  capture.pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
      direct_device, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, pool_size);
  capture.session = capture.pool.CreateCaptureSession(item);
  capture.session.IsCursorCaptureEnabled(false);
  if (winrt::Windows::Foundation::Metadata::ApiInformation::IsPropertyPresent(
          L"Windows.Graphics.Capture.GraphicsCaptureSession", L"IncludeSecondaryWindows")) {
    capture.session.IncludeSecondaryWindows(false);
  }
  if (identity) identity->validate();
  capture.session.StartCapture();
  for (;;) {
    check_deadline(deadline);
    require_same_window(window, process);
    if (identity) identity->validate();
    FrameLifetime next(capture.pool.TryGetNextFrame());
    if (!next.frame) {
      wait_for_frame(deadline);
      continue;
    }
    const SizeInt32 content = next.frame.ContentSize();
    require_size(content);
    if (content.Width != pool_size.Width || content.Height != pool_size.Height) {
      next.frame.Close();
      next.frame = nullptr;
      pool_size = content;
      capture.pool.Recreate(direct_device, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, pool_size);
      continue;
    }
    const auto geometry = read_window_geometry(window);
    const auto region = capture_region(geometry, static_cast<UINT>(content.Width),
                                       static_cast<UINT>(content.Height), ame_identity != nullptr);
    auto pixels = read_pixels(device.get(), context.get(), next.frame, content, region, deadline);
    if (!same_geometry(geometry, read_window_geometry(window))) {
      throw std::runtime_error("The window geometry changed during GPU readback; capture again");
    }
    require_same_window(window, process);
    if (MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST) != monitor) {
      throw std::runtime_error("The window changed displays during capture; capture again");
    }
    require_sdr(window);
    check_deadline(deadline);
    save_png(output, region.width, region.height, pixels, identity ? &*identity : nullptr,
             window, geometry);
    return {output, region.width, region.height, geometry.dpi,
            static_cast<UINT>(content.Width), static_cast<UINT>(content.Height),
            geometry, region, ame_identity != nullptr};
  }
}

}  // namespace studio
