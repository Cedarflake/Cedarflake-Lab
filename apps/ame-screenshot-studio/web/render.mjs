import { themes } from "/project.mjs"
import { markPath } from "/brand.mjs"
export const WIDTH = 1920,
  HEIGHT = 1080
const font = '"Segoe UI","Microsoft YaHei UI",sans-serif'
function fitText(ctx, text, maxWidth, size, weight) {
  ctx.font = `${weight} ${size}px ${font}`
  while (ctx.measureText(text).width > maxWidth && size > 24) {
    size -= 1
    ctx.font = `${weight} ${size}px ${font}`
  }
}
export function slots(scene) {
  const left = scene.padding,
    top = scene.showTitle ? scene.top : 72,
    width = WIDTH - left * 2,
    height = HEIGHT - top - 48
  if (scene.layout === "pair")
    return [
      { x: left, y: top, w: (width - scene.gap) / 2, h: height },
      {
        x: left + (width + scene.gap) / 2,
        y: top + 40,
        w: (width - scene.gap) / 2,
        h: height - 40,
      },
    ]
  if (scene.layout === "detail")
    return [
      { x: left, y: top, w: width * 0.86, h: height },
      { x: WIDTH - left - width * 0.33, y: top + height * 0.37, w: width * 0.36, h: height * 0.59 },
    ]
  return [{ x: left, y: top, w: width, h: height }]
}
export function imageBounds(img, slot, scene) {
  const scale = Math.min(slot.w / img.width, slot.h / img.height) * scene.scale
  return {
    x: slot.x + (slot.w - img.width * scale) / 2 + scene.offsetX,
    y: slot.y + (slot.h - img.height * scale) / 2 + scene.offsetY,
    w: img.width * scale,
    h: img.height * scale,
  }
}
const mark = new Path2D(markPath)
function brandShape(ctx, x, y, size, opacity, dark) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 2000, size / 2000)
  ctx.globalAlpha = opacity
  const color = ctx.createLinearGradient(140, 360, 1800, 1700)
  color.addColorStop(0, dark ? "#82b1ff" : "#3181ff")
  color.addColorStop(0.55, dark ? "#43fffe" : "#199aff")
  color.addColorStop(1, "#1ffff3")
  ctx.fillStyle = color
  ctx.fill(mark, "evenodd")
  ctx.restore()
}
function background(ctx, scene) {
  const colors = themes[scene.theme],
    dark = scene.theme === "dusk"
  const base = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  base.addColorStop(0, colors[0])
  base.addColorStop(0.55, colors[1])
  base.addColorStop(1, colors[2])
  ctx.fillStyle = base
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  brandShape(ctx, -340, 380, 1080, dark ? 0.12 : 0.18, dark)
  brandShape(ctx, 1470, -220, 770, dark ? 0.13 : 0.18, dark)
  const light = ctx.createRadialGradient(970, 470, 40, 970, 470, 1060)
  light.addColorStop(0, dark ? "#10252e00" : "#ffffff80")
  light.addColorStop(1, dark ? "#10252e00" : "#ffffff00")
  ctx.fillStyle = light
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
}
export async function drawScene(canvas, scene, assets, { placeholders = true } = {}) {
  const ctx = canvas.getContext("2d", { alpha: false })
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  const dark = scene.theme === "dusk"
  background(ctx, scene)
  if (scene.showTitle) {
    ctx.textAlign = scene.alignment
    ctx.textBaseline = "middle"
    const x = scene.alignment === "left" ? scene.padding : WIDTH / 2
    ctx.fillStyle = dark ? "#f1f6f8" : "#253942"
    fitText(ctx, scene.title, WIDTH - scene.padding * 2, scene.titleSize, 400)
    ctx.fillText(scene.title, x, 77)
    ctx.fillStyle = dark ? "#b6c5cd" : "#74868e"
    fitText(ctx, scene.subtitle, WIDTH - scene.padding * 2, scene.subtitleSize, 400)
    ctx.fillText(scene.subtitle, x, 139)
  }
  const positions = slots(scene),
    result = []
  for (let i = 0; i < positions.length; i++) {
    const slot = positions[i],
      img = assets.get(scene.images[i])
    if (img) {
      const bounds = imageBounds(img, slot, scene)
      result.push({ id: scene.images[i], ...bounds })
      const radius = scene.cornerRadius ?? 24
      ctx.save()
      ctx.shadowColor = dark ? "#00000070" : "#18435b30"
      ctx.shadowBlur = scene.shadow
      ctx.shadowOffsetY = scene.shadow * 0.4
      ctx.fillStyle = dark ? "#17272e" : "#f1f5f9"
      ctx.beginPath()
      ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, radius)
      ctx.fill()
      ctx.restore()
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, radius)
      ctx.clip()
      ctx.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h)
      ctx.restore()
    } else if (placeholders) {
      ctx.save()
      ctx.fillStyle = dark ? "#ffffff08" : "#ffffff77"
      ctx.strokeStyle = dark ? "#ffffff33" : "#9baeb74d"
      ctx.lineWidth = 2
      ctx.setLineDash([8, 8])
      ctx.beginPath()
      ctx.roundRect(slot.x, slot.y, slot.w, slot.h, 16)
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = dark ? "#9eafb8" : "#91a2aa"
      ctx.font = `400 27px ${font}`
      ctx.fillText(
        i === 0 ? "添加真实 Ame 截图" : "添加第二张截图",
        slot.x + slot.w / 2,
        slot.y + slot.h / 2,
      )
      ctx.font = `400 18px ${font}`
      ctx.fillText("从左侧选择，或导入原始 PNG", slot.x + slot.w / 2, slot.y + slot.h / 2 + 44)
      ctx.restore()
    }
  }
  return result
}
