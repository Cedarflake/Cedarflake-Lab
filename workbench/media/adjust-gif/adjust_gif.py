import atexit
import os
import signal
import tempfile
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Optional

from PIL import Image


class GifSpeedAdjuster:
    """GIF速度调整器的主类"""

    def __init__(self):
        self.input_path: Optional[str] = None
        self.output_path: Optional[str] = None
        self.target_duration: Optional[float] = None
        self.is_processing = False
        self.processing_thread: Optional[threading.Thread] = None
        self.should_cancel = False
        self._shutdown_initiated = False
        self._temp_output_path: Optional[str] = None
        self._processing_state_lock = threading.Lock()
        self._output_committed = False

        # 注册清理函数
        atexit.register(self._cleanup_on_exit)

        # 设置信号处理器
        self._setup_signal_handlers()

        self.setup_ui()

    def _setup_signal_handlers(self):
        """设置信号处理器"""

        def signal_handler(signum, frame):
            """处理系统信号"""
            print(f"\n接收到信号 {signum}，正在优雅关闭...")
            if hasattr(self, "root") and self.root:
                self.root.after(0, self._graceful_shutdown)

        # 设置SIGINT (Ctrl+C) 处理器
        try:
            signal.signal(signal.SIGINT, signal_handler)
            if hasattr(signal, "SIGTERM"):
                signal.signal(signal.SIGTERM, signal_handler)
        except (ValueError, OSError):
            # 在某些环境下可能无法设置信号处理器
            pass

    def _begin_processing_state(self):
        """重置一次处理任务的取消和提交状态"""
        with self._processing_state_lock:
            self.should_cancel = False
            self._output_committed = False

    def _request_cancel(self) -> bool:
        """在线性化提交前请求取消"""
        with self._processing_state_lock:
            if self._output_committed:
                return False
            self.should_cancel = True
            return True

    def _is_cancel_requested(self) -> bool:
        with self._processing_state_lock:
            return self.should_cancel

    def _is_output_committed(self) -> bool:
        with self._processing_state_lock:
            return self._output_committed

    def _commit_temp_output(self, temp_output_path: str, output_path: str):
        """以取消状态和原子替换为同一个提交临界区"""
        with self._processing_state_lock:
            if self.should_cancel:
                raise InterruptedError("用户取消操作")
            os.replace(temp_output_path, output_path)
            self._output_committed = True

    def _schedule_ui(self, callback, *args):
        """仅在界面仍存活时调度主线程更新"""
        if self._shutdown_initiated:
            return

        try:
            self.root.after(0, callback, *args)
        except (RuntimeError, tk.TclError):
            pass

    def _graceful_shutdown(self):
        """等待工作线程完成清理后关闭应用程序"""
        if self._shutdown_initiated:
            return

        self._shutdown_initiated = True

        if self.is_processing:
            print("正在取消处理任务...")
            self._request_cancel()
            self.status_label.config(text="正在关闭...")

        self._wait_for_processing_before_shutdown()

    def _wait_for_processing_before_shutdown(self):
        if self.processing_thread and self.processing_thread.is_alive():
            try:
                self.root.after(50, self._wait_for_processing_before_shutdown)
            except (RuntimeError, tk.TclError):
                self.processing_thread.join()
                self._finish_shutdown()
            return

        self._finish_shutdown()

    def _finish_shutdown(self):
        self._cleanup_resources()

        try:
            self.root.quit()
        except Exception:
            pass

        try:
            self.root.destroy()
        except Exception:
            pass

    def _cleanup_resources(self):
        """清理资源"""
        self._cleanup_temp_output(getattr(self, "_temp_output_path", None))

    def _cleanup_temp_output(self, temp_output_path: Optional[str]):
        """清理本次处理创建的临时文件"""
        if not temp_output_path:
            return

        try:
            os.remove(temp_output_path)
            print(f"已清理临时文件: {temp_output_path}")
        except FileNotFoundError:
            pass
        except OSError:
            return

        if getattr(self, "_temp_output_path", None) == temp_output_path:
            self._temp_output_path = None

    def _cleanup_on_exit(self):
        """程序退出时的清理函数"""
        self._cleanup_resources()

    def setup_ui(self):
        """初始化用户界面"""
        self.root = tk.Tk()
        self.root.title("GIF 速度调整器")
        self.root.geometry("520x450")
        self.root.resizable(False, False)

        # 设置关闭事件处理
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

        # 设置样式
        style = ttk.Style()
        try:
            style.theme_use("vista")  # 使用更现代的主题
        except Exception:
            style.theme_use("default")

        # 配置强调按钮样式
        style.configure("Accent.TButton", font=("Arial", 10, "bold"), relief="raised")

        # 创建主框架
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 输入文件选择部分
        input_frame = ttk.LabelFrame(main_frame, text="输入文件", padding="10")
        input_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Button(input_frame, text="选择 GIF 文件", command=self.select_input_file).pack(
            anchor=tk.W
        )
        self.input_label = ttk.Label(input_frame, text="未选择文件", foreground="gray")
        self.input_label.pack(anchor=tk.W, pady=(5, 0))

        # 速度设置部分
        speed_frame = ttk.LabelFrame(main_frame, text="速度设置", padding="10")
        speed_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(speed_frame, text="每帧持续时间(秒):").pack(anchor=tk.W)

        # 创建输入框架
        input_speed_frame = ttk.Frame(speed_frame)
        input_speed_frame.pack(fill=tk.X, pady=(5, 0))

        self.speed_var = tk.StringVar()
        self.speed_entry = ttk.Entry(input_speed_frame, textvariable=self.speed_var, width=15)
        self.speed_entry.pack(side=tk.LEFT)

        ttk.Button(input_speed_frame, text="预设值", command=self.show_preset_speeds).pack(
            side=tk.LEFT, padx=(10, 0)
        )

        self.speed_info = ttk.Label(
            speed_frame, text="提示: 0.05=快速, 0.1=正常, 0.5=慢速", foreground="blue"
        )
        self.speed_info.pack(anchor=tk.W, pady=(5, 0))

        # 输出文件选择部分
        output_frame = ttk.LabelFrame(main_frame, text="输出文件", padding="10")
        output_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Button(output_frame, text="选择保存位置", command=self.select_output_file).pack(
            anchor=tk.W
        )
        self.output_label = ttk.Label(output_frame, text="未选择保存位置", foreground="gray")
        self.output_label.pack(anchor=tk.W, pady=(5, 0))

        # 处理按钮和进度条
        process_frame = ttk.Frame(main_frame)
        process_frame.pack(fill=tk.X, pady=(20, 0))

        # 创建一个更突出的处理按钮
        button_frame = ttk.Frame(process_frame)
        button_frame.pack(pady=(0, 15))

        self.process_button = ttk.Button(
            button_frame,
            text="🎬 开始转换 GIF",
            command=self.start_processing,
            style="Accent.TButton",
        )
        self.process_button.pack(pady=5, ipadx=20, ipady=10)

        # 添加快捷键提示
        shortcut_label = ttk.Label(
            button_frame, text="按 Enter 键快速开始", foreground="gray", font=("Arial", 8)
        )
        shortcut_label.pack()

        self.progress = ttk.Progressbar(process_frame, mode="indeterminate")
        self.progress.pack(fill=tk.X, pady=(0, 5))

        self.status_label = ttk.Label(process_frame, text="准备就绪")
        self.status_label.pack()

        # 绑定快捷键
        self.root.bind("<Return>", lambda event: self.start_processing())
        self.root.bind("<KP_Enter>", lambda event: self.start_processing())
        self.root.bind("<Escape>", lambda event: self.cancel_processing())

        # 添加取消按钮
        self.cancel_button = ttk.Button(
            button_frame, text="❌ 取消处理", command=self.cancel_processing, state="disabled"
        )
        self.cancel_button.pack(pady=(5, 0))

    def select_input_file(self):
        """选择输入GIF文件"""
        file_path = filedialog.askopenfilename(
            title="选择 GIF 文件",
            filetypes=[("GIF files", "*.gif"), ("All files", "*.*")],
            parent=self.root,
        )

        if file_path:
            self.input_path = file_path
            filename = os.path.basename(file_path)
            self.input_label.config(text=f"已选择: {filename}", foreground="black")

            # 自动设置输出路径
            if not self.output_path:
                self.auto_set_output_path()

    def auto_set_output_path(self):
        """自动设置输出路径"""
        if self.input_path:
            dir_path = os.path.dirname(self.input_path)
            base_name = os.path.splitext(os.path.basename(self.input_path))[0]
            self.output_path = os.path.join(dir_path, f"{base_name}_adjusted.gif")

            filename = os.path.basename(self.output_path)
            self.output_label.config(text=f"将保存为: {filename}", foreground="black")

    def show_preset_speeds(self):
        """显示预设速度选项"""
        preset_window = tk.Toplevel(self.root)
        preset_window.title("预设速度")
        preset_window.geometry("300x200")
        preset_window.resizable(False, False)

        ttk.Label(preset_window, text="选择预设速度:", font=("Arial", 10, "bold")).pack(pady=10)

        presets = [("极快", 0.03), ("快速", 0.05), ("正常", 0.1), ("慢速", 0.3), ("极慢", 0.5)]

        for name, value in presets:
            btn = ttk.Button(
                preset_window,
                text=f"{name} ({value}秒)",
                command=lambda v=value: self.set_preset_speed(v, preset_window),
            )
            btn.pack(pady=2, padx=20, fill=tk.X)

    def set_preset_speed(self, value: float, window):
        """设置预设速度值"""
        self.speed_var.set(str(value))
        window.destroy()

    def select_output_file(self):
        """选择输出文件路径"""
        initial_file = ""
        if self.input_path:
            base_name = os.path.splitext(os.path.basename(self.input_path))[0]
            initial_file = f"{base_name}_adjusted.gif"

        file_path = filedialog.asksaveasfilename(
            title="保存 GIF 文件",
            defaultextension=".gif",
            initialfile=initial_file,  # 修复：使用 initialfile 而不是 initialname
            filetypes=[("GIF files", "*.gif"), ("All files", "*.*")],
            parent=self.root,
        )

        if file_path:
            self.output_path = file_path
            filename = os.path.basename(file_path)
            self.output_label.config(text=f"将保存为: {filename}", foreground="black")

    def validate_inputs(self) -> bool:
        """验证用户输入"""
        if not self.input_path:
            messagebox.showerror("错误", "请选择输入 GIF 文件", parent=self.root)
            return False

        if not os.path.exists(self.input_path):
            messagebox.showerror("错误", "输入文件不存在", parent=self.root)
            return False

        try:
            speed_text = self.speed_var.get().strip()
            if not speed_text:
                messagebox.showerror("错误", "请输入每帧持续时间", parent=self.root)
                return False

            self.target_duration = float(speed_text)
            if self.target_duration <= 0:
                messagebox.showerror("错误", "持续时间必须大于 0", parent=self.root)
                return False

            if self.target_duration > 10:
                result = messagebox.askyesno(
                    "确认",
                    f"持续时间 {self.target_duration} 秒较长，确定要继续吗？",
                    parent=self.root,
                )
                if not result:
                    return False

        except ValueError:
            messagebox.showerror("错误", "请输入有效的数字", parent=self.root)
            return False

        if not self.output_path:
            messagebox.showerror("错误", "请选择保存位置", parent=self.root)
            return False

        return True

    def start_processing(self):
        """开始处理GIF（在新线程中）"""
        if not self.validate_inputs():
            return

        if self.is_processing:
            messagebox.showwarning("警告", "正在处理中，请等待完成或取消当前操作", parent=self.root)
            return

        self.is_processing = True
        self._begin_processing_state()
        self.process_button.config(state="disabled")
        self.cancel_button.config(state="normal")
        self.progress.start()
        self.status_label.config(text="正在处理...")

        # 在新线程中处理，避免界面冻结
        self.processing_thread = threading.Thread(target=self.process_gif, daemon=False)
        self.processing_thread.start()

    def process_gif(self):
        """处理GIF文件"""
        try:
            self.adjust_gif_speed(self.input_path, self.output_path, self.target_duration)
        except InterruptedError:
            self._schedule_ui(self.processing_completed, False, "操作已取消")
        except Exception as e:
            if self._is_cancel_requested() and not self._is_output_committed():
                self._schedule_ui(self.processing_completed, False, "操作已取消")
            else:
                error_msg = f"处理失败: {str(e)}"
                self._schedule_ui(self.processing_completed, False, error_msg)
        else:
            if self._is_output_committed():
                self._schedule_ui(self.processing_completed, True, "处理完成！")
            else:
                self._schedule_ui(self.processing_completed, False, "处理失败: 输出未提交")

    def processing_completed(self, success: bool, message: str):
        """处理完成后的UI更新"""
        self.is_processing = False
        self._begin_processing_state()
        self.progress.stop()
        self.process_button.config(state="normal")
        self.cancel_button.config(state="disabled")

        if success:
            self.status_label.config(text="处理完成")
            messagebox.showinfo("成功", message, parent=self.root)
        else:
            if "取消" in message:
                self.status_label.config(text="已取消")
            else:
                self.status_label.config(text="处理失败")
            if "取消" not in message:  # 只有在非取消情况下才显示错误
                messagebox.showerror("错误", message, parent=self.root)

    def adjust_gif_speed(self, input_path: str, output_path: str, target_duration: float):
        """调整GIF速度的核心方法"""
        temp_output_path = None
        frames = []
        try:
            with Image.open(input_path) as im:
                if not hasattr(im, "n_frames") or im.n_frames <= 1:
                    raise ValueError("输入文件不是有效的动画GIF")

                durations = []
                disposals = []
                target_duration_ms = max(10, int(target_duration * 1000))

                print(f"处理 {im.n_frames} 帧，目标持续时间: {target_duration_ms}ms")

                loop = im.info.get("loop")

                for i in range(im.n_frames):
                    if self._is_cancel_requested():
                        raise InterruptedError("用户取消操作")

                    im.seek(i)

                    if not self._is_cancel_requested():
                        progress_text = f"正在处理第 {i + 1}/{im.n_frames} 帧..."
                        self._schedule_ui(
                            lambda text=progress_text: self.status_label.config(text=text)
                        )

                    current_frame = im.convert("RGBA")
                    current_frame.load()
                    frames.append(current_frame)
                    durations.append(target_duration_ms)
                    disposals.append(getattr(im, "disposal_method", 0))

            if self._is_cancel_requested():
                raise InterruptedError("用户取消操作")

            if not self._is_cancel_requested():
                self._schedule_ui(lambda: self.status_label.config(text="正在保存文件..."))

            save_kwargs = {
                "save_all": True,
                "append_images": frames[1:] if len(frames) > 1 else [],
                "duration": durations,
                "optimize": False,
                "disposal": disposals,
            }

            if loop is not None:
                save_kwargs["loop"] = loop

            output_directory = os.path.dirname(os.path.abspath(output_path))
            os.makedirs(output_directory, exist_ok=True)
            if self._is_cancel_requested():
                raise InterruptedError("用户取消操作")

            temp_file_descriptor, temp_output_path = tempfile.mkstemp(
                dir=output_directory,
                prefix=f".{os.path.basename(output_path)}.",
                suffix=".gif",
            )
            os.close(temp_file_descriptor)
            self._temp_output_path = temp_output_path

            frames[0].save(temp_output_path, format="GIF", **save_kwargs)

            if self._is_cancel_requested():
                raise InterruptedError("用户取消操作")

            self._commit_temp_output(temp_output_path, output_path)
            if self._temp_output_path == temp_output_path:
                self._temp_output_path = None
            temp_output_path = None

        finally:
            self._cleanup_temp_output(temp_output_path)
            for frame in frames:
                frame.close()

    def on_closing(self):
        """处理窗口关闭事件"""
        if self._shutdown_initiated:
            return

        if self.is_processing:
            result = messagebox.askyesno(
                "确认退出", "正在处理文件中，确定要退出吗？\n退出将取消当前操作。", parent=self.root
            )
            if not result:
                return

        self._graceful_shutdown()

    def cancel_processing(self):
        """取消正在进行的处理"""
        if self.is_processing and self._request_cancel():
            self.status_label.config(text="正在取消...")
            self.cancel_button.config(state="disabled")

    def run(self):
        """运行应用程序"""
        try:
            self.root.mainloop()
        except KeyboardInterrupt:
            print("\n接收到键盘中断，正在优雅关闭...")
            self._graceful_shutdown()
        except Exception as e:
            print(f"应用程序发生错误: {e}")
            self._graceful_shutdown()
        finally:
            if self.processing_thread and self.processing_thread.is_alive():
                self._shutdown_initiated = True
                self._request_cancel()
                self.processing_thread.join()
            self._cleanup_resources()


def main():
    """主函数"""
    try:
        app = GifSpeedAdjuster()
        app.run()
    except KeyboardInterrupt:
        print("\n程序被用户中断")
    except Exception as e:
        print(f"程序发生错误: {e}")
    finally:
        print("程序结束")


if __name__ == "__main__":
    main()
