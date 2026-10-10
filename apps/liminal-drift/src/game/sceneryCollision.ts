import { Box3, Matrix4, Mesh, Vector3 } from "three"
import type { Object3D } from "three"

import type { SolidBox } from "./solidCollision"

export function createSceneryColliders(
  nodes: readonly (Object3D | null)[],
  origin: { x: number; z: number },
  id: string,
) {
  const solids: SolidBox[] = []
  const bounds = new Box3()
  const localBounds = new Box3()
  const inverseYaw = new Matrix4()
  const alignedMatrix = new Matrix4()
  const center = new Vector3()
  const up = new Vector3(0, 1, 0)
  for (const node of nodes) {
    if (!node?.visible) continue
    node.updateWorldMatrix(true, true)
    node.traverse((child) => {
      if (!(child instanceof Mesh) || child.userData.isDecoration) return
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
      const box = child.geometry.boundingBox
      if (!box || box.max.y - box.min.y < 0.03) return
      bounds.copy(box).applyMatrix4(child.matrixWorld)
      if (bounds.min.y > 1.55 || bounds.max.y < 0.15) return
      const matrix = child.matrixWorld.elements
      const heading = Math.atan2(-(matrix[2] ?? 0), matrix[0] ?? 1)
      inverseYaw.makeRotationY(-heading)
      alignedMatrix.multiplyMatrices(inverseYaw, child.matrixWorld)
      localBounds.copy(box).applyMatrix4(alignedMatrix)
      localBounds.getCenter(center).applyAxisAngle(up, heading)
      solids.push({
        id: `prop:${id}:${solids.length}`,
        x: center.x + origin.x,
        z: center.z + origin.z,
        heading,
        halfWidth: Math.max(0.025, (localBounds.max.x - localBounds.min.x) / 2),
        halfDepth: Math.max(0.025, (localBounds.max.z - localBounds.min.z) / 2),
      })
    })
  }
  return solids
}
