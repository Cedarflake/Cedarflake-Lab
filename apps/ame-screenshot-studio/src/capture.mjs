import path from "node:path"
import { readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"

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

export function createCaptureService(root, dataRoot = root, execute = run) {
  const helper = path.join(root, "capture", "out", "ame-capture.exe")
  const wsb = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps", "wsb.exe")
    : "wsb.exe"
  let busy = false

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
    return JSON.parse(await execute(helper, ["enumerate"])).filter(
      (item) => item.process.toLowerCase() === "cedarflake_ame.exe",
    )
  }

  return {
    async windows() {
      const windows = await localWindows()
      const current = await session()
      if (current)
        windows.unshift({
          id: "sandbox",
          sessionId: current.id,
          title: "隔离图库中的 Ame",
          process: "cedarflake_ame.exe",
        })
      return windows
    },
    async capture(source) {
      if (busy) throw new Error("正在采集，请稍候")
      busy = true
      try {
        const id = "ame-" + randomUUID() + ".png"
        if (!source || typeof source !== "object") throw new Error("请选择 Ame 窗口")
        if (source.id === "sandbox") {
          const current = await session()
          if (!current) throw new Error("请先启动隔离图库")
          if (source.sessionId !== current.id) throw new Error("隔离图库已更换，请重新选择窗口")
          const command = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\\StudioControl\\capture.ps1 -OutputName ${id}`
          const result = JSON.parse(
            await execute(
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
          if (
            typeof source.id !== "string" ||
            !/^0x[0-9a-f]{1,16}$/i.test(source.id) ||
            !Number.isInteger(source.pid) ||
            source.pid <= 0 ||
            source.pid > 0xffffffff ||
            typeof source.started !== "string" ||
            !/^[1-9][0-9]{0,19}$/.test(source.started)
          )
            throw new Error("窗口信息不完整，请重新选择")
          await execute(helper, [
            "capture-ame",
            source.id,
            String(source.pid),
            source.started,
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
