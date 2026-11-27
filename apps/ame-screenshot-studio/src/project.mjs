export const themes = {
  mist: ["#eaf3ff", "#f2fbff", "#e3faf5"],
  mint: ["#e5f9f5", "#f5fbff", "#e8f2ff"],
  dusk: ["#10232f", "#163542", "#164a52"],
  pearl: ["#f9fcff", "#f2f7fc", "#edf9fb"],
}
const topics = [
  ["gallery", "Every image, in its place", "Browse your library by date and folder", "大图库浏览"],
  [
    "search",
    "Find images with a few words",
    "Search your library by what you remember",
    "语义搜索",
  ],
  [
    "albums",
    "Keep your favorites together",
    "Albums, favorites, and smart collections",
    "相册管理",
  ],
  [
    "duplicates",
    "Find duplicates. Keep your favorites.",
    "Compare similar images and choose what stays",
    "图片去重",
  ],
  ["viewer", "See every detail", "Full-size previews and continuous browsing", "图片预览"],
  ["organize", "Put your files in order", "Organize album files into folders by year", "文件整理"],
]
export function createProject() {
  return {
    format: "ame-studio-v1",
    name: "Ame 商店展示",
    active: "gallery",
    scenes: topics.map(([id, title, subtitle, label], i) => ({
      id,
      title,
      subtitle,
      label,
      layout: "single",
      theme: i === 4 ? "dusk" : "mist",
      titleSize: 56,
      subtitleSize: 26,
      top: 190,
      padding: 72,
      gap: 28,
      shadow: 32,
      cornerRadius: 24,
      alignment: "center",
      showTitle: true,
      images: [],
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    })),
  }
}
const clamp = (value, min, max, fallback) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
const string = (value, fallback, max = 180) =>
  typeof value === "string" ? value.slice(0, max) : fallback
export function normalizeProject(value) {
  if (
    !value ||
    value.format !== "ame-studio-v1" ||
    !Array.isArray(value.scenes) ||
    value.scenes.length < 1 ||
    value.scenes.length > 10
  )
    throw new Error("项目格式不正确")
  const ids = new Set()
  const scenes = value.scenes.map((s, index) => {
    if (
      !s ||
      typeof s !== "object" ||
      typeof s.id !== "string" ||
      !/^[a-z0-9-]{1,48}$/.test(s.id) ||
      ids.has(s.id)
    )
      throw new Error("场景标识不正确")
    ids.add(s.id)
    return {
      id: s.id,
      label: string(s.label, `场景 ${index + 1}`, 40),
      title: string(s.title, ""),
      subtitle: string(s.subtitle, ""),
      layout: ["single", "pair", "detail"].includes(s.layout) ? s.layout : "single",
      theme: Object.hasOwn(themes, s.theme) ? s.theme : "mist",
      titleSize: clamp(s.titleSize, 32, 100, 66),
      subtitleSize: clamp(s.subtitleSize, 18, 44, 28),
      top: clamp(s.top, 120, 400, 258),
      padding: clamp(s.padding, 24, 260, 112),
      gap: clamp(s.gap, 8, 80, 28),
      shadow: clamp(s.shadow, 0, 64, 32),
      cornerRadius: clamp(s.cornerRadius, 0, 48, 24),
      alignment: s.alignment === "left" ? "left" : "center",
      showTitle: s.showTitle !== false,
      images: Array.isArray(s.images)
        ? s.images
            .filter((id) => typeof id === "string" && /^[a-zA-Z0-9_.-]+\.(png|jpg|jpeg)$/i.test(id))
            .slice(0, 2)
        : [],
      offsetX: clamp(s.offsetX, -500, 500, 0),
      offsetY: clamp(s.offsetY, -300, 300, 0),
      scale: clamp(s.scale, 0.5, 1.4, 1),
    }
  })
  return {
    format: "ame-studio-v1",
    name: string(value.name, "Ame 商店展示", 80),
    active: ids.has(value.active) ? value.active : scenes[0].id,
    scenes,
  }
}
export function pngSize(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (buffer.length < 24 || !signature.every((byte, i) => buffer[i] === byte))
    throw new Error("需要 PNG 图片")
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
