import { normalizeProject } from "/project.mjs"
import { drawScene, slots, WIDTH, HEIGHT } from "/render.mjs"
const $ = (id) => document.getElementById(id)
const canvas = $("canvas"),
  loaded = new Map()
let project,
  assets = [],
  captureSources = [],
  saveTimer,
  toastTimer,
  dragStart,
  saveChain = Promise.resolve(),
  changeVersion = 0,
  exporting = false
const icons = ["▧", "⌕", "▤", "◇", "▣", "↗"]
const scene = () => project.scenes.find((s) => s.id === project.active)
async function api(url, options) {
  const response = await fetch(url, options),
    data = await response.json()
  if (!response.ok) throw new Error(data.error || "操作失败")
  return data
}
function toast(message, link) {
  const element = $("toast")
  element.replaceChildren(document.createTextNode(message))
  if (link) {
    const a = document.createElement("a")
    a.href = link
    a.textContent = "打开图片"
    a.target = "_blank"
    a.rel = "noopener"
    element.append(a)
  }
  element.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (element.hidden = true), 6500)
}
function report(error) {
  toast(error.message)
}
function dirty() {
  changeVersion++
  $("save-state").textContent = "未保存"
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save().catch(report), 550)
}
async function save(snapshot = project, version = changeVersion) {
  clearTimeout(saveTimer)
  const payload = JSON.stringify(snapshot)
  saveChain = saveChain
    .catch(() => {})
    .then(() =>
      api("/api/project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }),
    )
  await saveChain
  if (changeVersion === version) $("save-state").textContent = "已保存到本机"
}
function draw() {
  const s = normalizeProject(project).scenes.find((item) => item.id === project.active)
  drawScene(canvas, s, loaded).then((bounds) => {
    const missing = slots(s).length > s.images.length
    const low = bounds.some((b) => loaded.get(b.id).width < b.w || loaded.get(b.id).height < b.h)
    $("quality-warning").textContent = missing
      ? "添加所需截图后即可导出。"
      : low
        ? "当前布局放大了原图，建议使用更高清的截图或减小图片。"
        : ""
    $("export").disabled = exporting || missing || s.images.some((id) => !loaded.has(id))
    $("image-info").textContent = bounds.length
      ? bounds
          .map((b) => {
            const img = loaded.get(b.id)
            return `${img.width} × ${img.height} 原图`
          })
          .join("  ·  ")
      : "添加一张真实 Ame 截图，开始排版"
  })
}
function renderScenes() {
  $("scene-list").replaceChildren()
  project.scenes.forEach((s, i) => {
    const b = document.createElement("button")
    b.className = "scene-button" + (s.id === project.active ? " active" : "")
    b.setAttribute("aria-current", s.id === project.active ? "page" : "false")
    const icon = document.createElement("span")
    icon.className = "scene-icon"
    icon.textContent = icons[i % icons.length]
    const text = document.createElement("span")
    text.className = "scene-title"
    text.textContent = s.label
    const small = document.createElement("small")
    small.textContent = String(i + 1).padStart(2, "0") + " / AME"
    text.append(small)
    const check = document.createElement("span")
    check.className = "scene-check"
    check.textContent = s.images.length >= slots(s).length ? "✓" : ""
    b.append(icon, text, check)
    b.onclick = () => {
      project.active = s.id
      render()
      dirty()
    }
    $("scene-list").append(b)
  })
}
const textFields = ["title", "subtitle", "alignment"],
  numberFields = [
    "titleSize",
    "subtitleSize",
    "top",
    "padding",
    "gap",
    "shadow",
    "cornerRadius",
    "scale",
  ]
function render() {
  const s = scene()
  renderScenes()
  $("scene-label").textContent = s.label
  $("scene-number").textContent =
    String(project.scenes.indexOf(s) + 1).padStart(2, "0") +
    " / " +
    String(project.scenes.length).padStart(2, "0")
  for (const key of [...textFields, ...numberFields]) $(key).value = s[key]
  $("showTitle").checked = s.showTitle
  document.querySelectorAll("[data-layout]").forEach((b) => {
    b.classList.toggle("active", b.dataset.layout === s.layout)
    b.setAttribute("aria-pressed", b.dataset.layout === s.layout)
  })
  document.querySelectorAll("[data-theme]").forEach((b) => {
    b.classList.toggle("active", b.dataset.theme === s.theme)
    b.setAttribute("aria-pressed", b.dataset.theme === s.theme)
  })
  values()
  assigned()
  draw()
}
function values() {
  for (const key of ["top", "padding", "gap", "shadow", "cornerRadius", "scale"])
    $(key + "-value").textContent =
      key === "scale" ? Math.round(scene()[key] * 100) + "%" : scene()[key] + " px"
}
function assigned() {
  $("assigned-images").replaceChildren()
  scene().images.forEach((id, i) => {
    const row = document.createElement("div")
    row.className = "assigned"
    const text = document.createElement("span")
    text.textContent = i + 1 + ". " + id
    text.title = id
    const remove = document.createElement("button")
    remove.textContent = "×"
    remove.setAttribute("aria-label", "移除第 " + (i + 1) + " 张截图")
    remove.onclick = () => {
      scene().images.splice(i, 1)
      render()
      dirty()
    }
    row.append(text, remove)
    $("assigned-images").append(row)
  })
}
function addAsset(id) {
  const s = scene(),
    count = slots(s).length
  if (s.images.length < count) s.images.push(id)
  else s.images[s.images.length - 1] = id
  render()
  dirty()
}
async function refreshAssets() {
  assets = await api("/api/captures")
  for (const asset of assets)
    if (!loaded.has(asset.id)) {
      const img = new Image()
      img.src = asset.url
      try {
        await img.decode()
        loaded.set(asset.id, img)
      } catch {}
    }
  $("asset-list").replaceChildren()
  for (const asset of assets) {
    if (!loaded.has(asset.id)) continue
    const b = document.createElement("button")
    b.className = "asset"
    b.title = asset.id
    const image = document.createElement("img")
    image.src = asset.url
    image.alt = "原始窗口截图"
    image.loading = "lazy"
    const label = document.createElement("span")
    label.textContent = `${asset.width} × ${asset.height}`
    b.append(image, label)
    b.onclick = () => addAsset(asset.id)
    $("asset-list").append(b)
  }
  if (project) draw()
}
for (const key of [...textFields, ...numberFields])
  $(key).addEventListener("input", () => {
    scene()[key] = numberFields.includes(key) ? Number($(key).value) : $(key).value
    values()
    draw()
    dirty()
  })
$("showTitle").onchange = () => {
  scene().showTitle = $("showTitle").checked
  draw()
  dirty()
}
document.querySelectorAll("[data-layout]").forEach(
  (b) =>
    (b.onclick = () => {
      scene().layout = b.dataset.layout
      scene().images = scene().images.slice(0, slots(scene()).length)
      render()
      dirty()
    }),
)
document.querySelectorAll("[data-theme]").forEach(
  (b) =>
    (b.onclick = () => {
      scene().theme = b.dataset.theme
      render()
      dirty()
    }),
)
$("reset-position").onclick = () => {
  Object.assign(scene(), { offsetX: 0, offsetY: 0, scale: 1 })
  render()
  dirty()
}
$("save-project").onclick = () =>
  save()
    .then(() => toast("项目已保存"))
    .catch(report)
$("refresh-assets").onclick = () => refreshAssets().catch(report)
$("fit").onclick = () => canvas.classList.remove("actual")
$("actual").onclick = () => canvas.classList.add("actual")
$("import-image").onchange = async (event) => {
  try {
    let first
    for (const file of event.target.files) {
      if (file.size >= 50 * 1024 * 1024) throw new Error("PNG 需要小于 50 MB")
      const r = await api("/api/import", {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: file,
      })
      first ??= r.id
    }
    await refreshAssets()
    if (first) addAsset(first)
    toast("已导入原始截图")
  } catch (error) {
    report(error)
  } finally {
    event.target.value = ""
  }
}
$("export").onclick = async () => {
  if (exporting) return
  const snapshot = normalizeProject(structuredClone(project)),
    version = changeVersion
  const s = snapshot.scenes.find((item) => item.id === snapshot.active)
  exporting = true
  $("export").disabled = true
  try {
    await save(snapshot, version)
    await document.fonts.ready
    if (slots(s).length > s.images.length || s.images.some((id) => !loaded.has(id)))
      throw new Error("请先添加所需截图")
    const output = document.createElement("canvas")
    output.width = WIDTH
    output.height = HEIGHT
    await drawScene(output, s, loaded, { placeholders: false })
    const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"))
    if (!blob) throw new Error("图片导出失败")
    const result = await api("/api/export?scene=" + s.id, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: blob,
    })
    toast("已导出 1920 × 1080 PNG", result.url)
  } catch (error) {
    report(error)
  } finally {
    exporting = false
    draw()
  }
}
function download(name, blob) {
  const link = document.createElement("a"),
    url = URL.createObjectURL(blob)
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
$("download-project").onclick = () =>
  download(
    "ame-store-project.json",
    new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
  )
$("load-project").onchange = async (event) => {
  try {
    if (event.target.files[0].size > 1024 * 1024) throw new Error("项目文件过大")
    project = normalizeProject(JSON.parse(await event.target.files[0].text()))
    render()
    dirty()
    toast("已打开项目")
  } catch (error) {
    report(error)
  } finally {
    event.target.value = ""
  }
}
$("open-capture").onclick = async () => {
  $("capture-dialog").showModal()
  $("capture-error").textContent = ""
  $("capture-now").disabled = true
  $("window-list").replaceChildren()
  captureSources = []
  try {
    const windows = await api("/api/windows")
    captureSources = windows
    for (const item of windows) {
      const option = document.createElement("option")
      option.value = item.id
      option.textContent = item.title + " · " + item.process
      $("window-list").append(option)
    }
    const ame = windows.find(
      (item) => /cedarflake_ame\.exe/i.test(item.process) || /^ame$/i.test(item.title),
    )
    if (ame) $("window-list").value = ame.id
    $("capture-now").disabled = windows.length === 0
  } catch (error) {
    $("capture-error").textContent = error.message
  }
}
$("capture-now").onclick = async () => {
  $("capture-now").disabled = true
  $("capture-error").textContent = ""
  try {
    const result = await api("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: captureSources.find((item) => item.id === $("window-list").value),
      }),
    })
    await refreshAssets()
    addAsset(result.id)
    $("capture-dialog").close()
    toast("已保存原始窗口截图")
  } catch (error) {
    $("capture-error").textContent = error.message
  } finally {
    $("capture-now").disabled = false
  }
}
canvas.addEventListener("pointerdown", (event) => {
  if (!scene().images.length) return
  dragStart = {
    x: event.clientX,
    y: event.clientY,
    offsetX: scene().offsetX,
    offsetY: scene().offsetY,
  }
  canvas.setPointerCapture(event.pointerId)
  canvas.classList.add("dragging")
})
canvas.addEventListener("pointermove", (event) => {
  if (!dragStart) return
  const rect = canvas.getBoundingClientRect()
  scene().offsetX = Math.max(
    -500,
    Math.min(500, dragStart.offsetX + ((event.clientX - dragStart.x) * WIDTH) / rect.width),
  )
  scene().offsetY = Math.max(
    -300,
    Math.min(300, dragStart.offsetY + ((event.clientY - dragStart.y) * HEIGHT) / rect.height),
  )
  draw()
})
function finishDrag() {
  if (dragStart) {
    dragStart = null
    canvas.classList.remove("dragging")
    dirty()
  }
}
canvas.addEventListener("pointerup", finishDrag)
canvas.addEventListener("pointercancel", finishDrag)
canvas.addEventListener("keydown", (event) => {
  const move = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[
    event.key
  ]
  if (!move) return
  event.preventDefault()
  scene().offsetX = Math.max(-500, Math.min(500, scene().offsetX + move[0]))
  scene().offsetY = Math.max(-300, Math.min(300, scene().offsetY + move[1]))
  draw()
  dirty()
})
async function refreshLibrary() {
  const library = await api("/api/library")
  const count = (library.admitted ?? 0).toLocaleString()
  const active = ["downloading", "verifying"].includes(library.status)
  $("library-status").textContent = active ? `正在准备素材 · ${count} 张` : `${count} 张已准备素材`
}
try {
  project = normalizeProject(await api("/api/project"))
  await refreshAssets()
  render()
  await refreshLibrary()
  setInterval(() => refreshLibrary().catch(() => {}), 5000)
} catch (error) {
  report(error)
}
