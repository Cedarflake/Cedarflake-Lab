import path from "node:path"
import { readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"

export function createCaptureService(root, dataRoot = root) {
  const helper = path.join(root, "capture", "out", "ame-capture.exe")
  const wsb = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps", "wsb.exe")
    : "wsb.exe"
  let busy = false

  function run(file, args, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
      let out = "",
        err = ""
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error("采集超时，请确认 Ame 窗口未最小化"))
      }, timeout)
      child.stdout.on("data", (chunk) => {
        out += chunk
        if (out.length > 1024 * 1024) child.kill()
      })
      child.stderr.on("data", (chunk) => {
        err += chunk
        if (err.length > 65536) child.kill()
      })
      child.on("error", (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        if (code === 0) resolve(out)
        else reject(new Error(err.trim() || "窗口采集失败"))
      })
    })
  }

  async function session() {
    try {
      const value = JSON.parse(
        await readFile(path.join(dataRoot, "environment", "session.json"), "utf8"),
      )
      if (value.purpose !== "ame-screenshot-studio" || !/^[0-9a-f-]{36}$/.test(value.id))
        return null
      return value
    } catch (error) {
      if (error.code === "ENOENT") return null
      throw error
    }
  }

  async function localWindows() {
    return JSON.parse(await run(helper, ["enumerate"])).filter(
      (item) => item.process.toLowerCase() === "cedarflake_ame.exe",
    )
  }

  return {
    async windows() {
      const windows = await localWindows()
      if (await session())
        windows.unshift({ id: "sandbox", title: "隔离图库中的 Ame", process: "cedarflake_ame.exe" })
      return windows
    },
    async capture(source) {
      if (busy) throw new Error("正在采集，请稍候")
      busy = true
      try {
        const id = "ame-" + randomUUID() + ".png"
        if (source === "sandbox") {
          const current = await session()
          if (!current) throw new Error("请先启动隔离图库")
          const command = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\\StudioControl\\capture.ps1 -OutputName ${id}`
          const result = JSON.parse(
            await run(
              wsb,
              [
                "exec",
                "--id",
                current.id,
                "--run-as",
                "ExistingLogin",
                "--command",
                command,
                "--raw",
              ],
              25000,
            ),
          )
          if (result.ExitCode !== 0)
            throw new Error("隔离窗口采集失败，请确认 Ame 已打开且没有最小化")
          await readFile(path.join(dataRoot, "captures", id))
        } else {
          const window = (await localWindows()).find((item) => item.id === source)
          if (!window) throw new Error("请选择 Ame 窗口")
          await run(helper, [
            "capture-ame",
            source,
            String(window.pid),
            window.started,
            path.join(dataRoot, "captures", id),
          ])
        }
        return { id }
      } finally {
        busy = false
      }
    },
  }
}
