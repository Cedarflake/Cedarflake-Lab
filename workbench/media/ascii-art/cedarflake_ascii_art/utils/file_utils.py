import os
import sys

from cedarflake_ascii_art.config import logger


def is_valid_file(file_path, valid_extensions):
    """检查文件路径是否有效且后缀名符合要求。"""
    if not os.path.isfile(file_path):
        logger.warning(f"文件不存在：{file_path}")
        return False
    if not file_path.lower().endswith(tuple(valid_extensions)):
        logger.warning(f"文件扩展名不符合要求：{file_path}")
        return False
    return True


def get_next_available_filename(directory, base_name="output", extension=".txt"):
    """原子预留并返回下一个可用的编号文件名。"""
    try:
        os.makedirs(directory, exist_ok=True)
        next_index = 1
        while True:
            file_path = os.path.join(directory, f"{base_name}_{next_index:03d}{extension}")
            try:
                file_descriptor = os.open(
                    file_path,
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                )
            except FileExistsError:
                next_index += 1
                continue

            os.close(file_descriptor)
            return file_path
    except Exception as e:
        logger.error(f"生成文件名失败：{e}")
        raise


def save_to_file(content, directory, filename_prefix="output", extension=".txt"):
    """将内容保存到指定目录和带编号的文件。"""
    file_path = None
    try:
        file_path = get_next_available_filename(
            directory, base_name=filename_prefix, extension=extension
        )
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        logger.info(f"内容已保存至：{file_path}")
    except Exception as e:
        logger.error(f"保存文件失败：{e}")
        if file_path:
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise

    return file_path


def resource_path(relative_path):
    """获取资源文件的路径（适配 PyInstaller 打包后的路径）。"""
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)
