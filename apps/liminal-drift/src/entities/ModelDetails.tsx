import { useLayoutEffect, useRef } from "react"

import { Color, Object3D } from "three"
import type { InstancedMesh } from "three"

interface Detail {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  rotation?: [number, number, number]
}

export function ModelDetails({ parts, metalness = 0 }: { parts: Detail[]; metalness?: number }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new Object3D()
    const color = new Color()
    parts.forEach((part, index) => {
      transform.position.set(...part.position)
      transform.scale.set(...part.size)
      transform.rotation.set(...(part.rotation ?? [0, 0, 0]))
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
      mesh.setColorAt(index, color.set(part.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [parts])
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, parts.length]}
      castShadow
      receiveShadow
      userData={{ isDecoration: true }}
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.78} metalness={metalness} />
    </instancedMesh>
  )
}
