import asyncio
import json
import os
import sys
from urllib.parse import urlparse

import aiohttp

def load_config():
    """加载配置文件 config.json（或 CAMPUSNET_CONFIG 环境变量指定的路径）。

    搜索顺序：
    1) 环境变量 CAMPUSNET_CONFIG 指定的绝对路径
    2) 当前工作目录 ./config.json
    3) 可执行文件所在目录（打包后与 exe 同目录）
    4) 源文件所在目录（开发运行）
    5) PyInstaller 临时目录（仅在将示例一起打包时）
    """
    candidates = []

    env_path = os.getenv("CAMPUSNET_CONFIG")
    if env_path:
        candidates.append(env_path)

    candidates.append(os.path.join(os.getcwd(), "config.json"))

    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        candidates.append(os.path.join(exe_dir, "config.json"))

    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(script_dir, "config.json"))

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(os.path.join(meipass, "config.json"))

    config_path = next((p for p in candidates if p and os.path.exists(p)), None)
    if not config_path:
        searched = " ; ".join(candidates)
        raise FileNotFoundError(
            "未找到配置文件 config.json。请在以下任意位置提供它，或设置 CAMPUSNET_CONFIG：\n"
            + searched
        )

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    return cfg


def build_runtime_from_config(cfg: dict):
    """根据配置组装运行所需的 URL、Headers 与 Cookies。"""
    login_url = cfg.get(
        "login_url",
        "http://10.71.29.181/eportal/InterFace.do?method=login",
    )
    host = urlparse(login_url).hostname or "10.71.29.181"

    # 默认非敏感 Cookie 取值，可被 config["cookies"] 覆盖
    default_cookies = {
        "EPORTAL_COOKIE_DOMAIN": "false",
        "EPORTAL_COOKIE_SAVEPASSWORD": "true",
        "EPORTAL_COOKIE_OPERATORPWD": "",
        "EPORTAL_COOKIE_NEWV": "true",
        # 下面这些通常与用户/学校相关，建议在 config.json 中提供
        # "EPORTAL_COOKIE_USERNAME": "",
        # "EPORTAL_COOKIE_PASSWORD": "",
        # "EPORTAL_COOKIE_SERVER": "",
        # "EPORTAL_COOKIE_SERVER_NAME": "",
        # "EPORTAL_USER_GROUP": "",
        # "JSESSIONID": "",
    }
    user_cookies = cfg.get("cookies", {})
    cookies = {**default_cookies, **user_cookies}

    # Headers：允许在 config.json 的 headers.User-Agent 覆盖 UA
    user_agent = (
        cfg.get("headers", {}).get(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        )
    )
    headers = {
        "Host": host,
        "User-Agent": user_agent,
    }
    jsessionid = cookies.get("JSESSIONID")
    if jsessionid:
        headers["JSESSIONID"] = jsessionid

    service = cfg.get("service", cookies.get("EPORTAL_COOKIE_SERVER", ""))
    user_group = cfg.get("user_group", cookies.get("EPORTAL_USER_GROUP", ""))

    return login_url, headers, cookies, service, user_group

# 检查是否已登录校园网
async def check_network_status(session: aiohttp.ClientSession) -> bool:
    try:
        async with session.get(
            "http://www.baidu.com", allow_redirects=False, timeout=aiohttp.ClientTimeout(total=8)
        ) as resp:
            text = await resp.text(errors="ignore")
        if "top.self.location.href='http://10.71.29.181" in text:
            print("未连接校园网，需要登录")
            return False
        print("已连接校园网，无需登录")
        return True
    except Exception as e:
        print(f"网络请求失败：{e}")
        return False


async def get_query_string(session: aiohttp.ClientSession) -> str:
    async with session.get("http://10.71.29.181/", timeout=aiohttp.ClientTimeout(total=8)) as resp:
        html = await resp.text(errors="ignore")
    st = html.find("index.jsp?")
    if st == -1:
        print("未在门户页面中找到 query_string 入口，请检查门户地址是否正确。")
        return ""
    st += 10
    end = html.find("'</script>", st)
    if end == -1:
        end = len(html)
    query_string = html[st:end]
    print("获取到 query_string:", query_string)
    return query_string


async def do_login(session: aiohttp.ClientSession, login_url: str, headers: dict, cookies: dict, service: str):
    query_string = await get_query_string(session)
    post_data = {
        "userId": cookies.get("EPORTAL_COOKIE_USERNAME", ""),
        "password": cookies.get("EPORTAL_COOKIE_PASSWORD", ""),
        "service": service,
        "queryString": query_string,
        "operatorPwd": "",
        "operatorUserId": "",
        "validcode": "",
        "passwordEncrypt": "true",
    }

    try:
        async with session.post(
            login_url,
            headers=headers,
            data=post_data,
            cookies=cookies,
            allow_redirects=False,  # 避免跳往 https
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            # 尝试解析 JSON
            text = await resp.text(errors="ignore")
            try:
                data = await resp.json(content_type=None)
            except Exception:
                print("登录失败：返回内容不是 JSON，可能门户接口或参数有变动。")
                print("响应状态码:", resp.status)
                print("响应文本片段:", text[:200])
                return

    except Exception as e:
        print("登录请求失败：", e)
        return

    if data.get("result") == "success":
        print("登录成功！")
    else:
        print("登录失败，原因:", data.get("message"))


async def main():
    cfg = load_config()
    login_url, headers, cookies, service, _user_group = build_runtime_from_config(cfg)

    connector = aiohttp.TCPConnector(ssl=False)

    async with aiohttp.ClientSession(connector=connector, headers=headers, cookies=cookies) as sess:
        online = await check_network_status(sess)
        if not online:
            await do_login(sess, login_url, headers, cookies, service)
        else:
            print("跳过登录")

if __name__ == "__main__":
    if os.name == "nt":
        try:
            import asyncio

            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        except Exception:
            pass
    asyncio.run(main())
