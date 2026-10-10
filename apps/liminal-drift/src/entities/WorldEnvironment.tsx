import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { useFrame } from "@react-three/fiber"
import { BufferGeometry, Color, Float32BufferAttribute, Object3D } from "three"
import type { Group, InstancedMesh, Mesh } from "three"

import type { EnvironmentPart } from "@/game/environment"
import { environmentTileSize } from "@/game/environment"
import { dreamPalette } from "@/game/gameConfig"
import { useRoadWorld } from "@/game/roadWorld"

function createDuneGeometry() {
  const geometry = new BufferGeometry()
  const positions = [0, 1, 0]
  const indices: number[] = []
  const segments = 20
  const rings = 7
  for (let ring = 1; ring <= rings; ring += 1) {
    const r = ring / rings
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment * Math.PI * 2) / segments
      const edge = 1 + 0.1 * Math.sin(angle * 3) + 0.06 * Math.cos(angle * 5)
      const height = Math.cos((r * Math.PI) / 2) ** 2 * (1 + 0.12 * Math.sin(angle * 2) * r)
      positions.push(Math.cos(angle) * r * edge * 0.5, height, Math.sin(angle) * r * edge * 0.5)
      const current = 1 + (ring - 1) * segments + segment
      const next = 1 + (ring - 1) * segments + ((segment + 1) % segments)
      if (ring === 1) indices.push(0, next, current)
      else
        indices.push(current - segments, next, current, current - segments, next - segments, next)
    }
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function PartBatch({
  shape,
  parts,
  anchorX,
  anchorZ,
}: {
  shape: EnvironmentPart["shape"]
  parts: EnvironmentPart[]
  anchorX: number
  anchorZ: number
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const duneGeometry = useMemo(() => (shape === "dune" ? createDuneGeometry() : null), [shape])
  useEffect(() => () => duneGeometry?.dispose(), [duneGeometry])
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const transform = new Object3D()
    const color = new Color()
    parts.forEach((part, index) => {
      transform.position.set(part.x - anchorX, part.y, part.z - anchorZ)
      transform.rotation.set(0, part.heading, 0)
      transform.scale.set(part.width, part.height, part.depth)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
      mesh.setColorAt(index, color.set(part.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [anchorX, anchorZ, parts])
  if (!parts.length) return null
  return (
    <instancedMesh
      key={parts.length}
      ref={meshRef}
      args={[undefined, undefined, parts.length]}
      receiveShadow
      castShadow={shape !== "dune"}
      name={`landscape-${shape}`}
    >
      {shape === "box" ? (
        <boxGeometry />
      ) : shape === "column" ? (
        <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
      ) : shape === "stone" ? (
        <dodecahedronGeometry args={[0.55, 0]} />
      ) : duneGeometry ? (
        <primitive object={duneGeometry} attach="geometry" />
      ) : null}
      <meshStandardMaterial roughness={0.94} flatShading={shape !== "dune"} />
    </instancedMesh>
  )
}

export function WorldEnvironment() {
  const world = useRoadWorld()
  const groupRef = useRef<Group>(null)
  const groundRef = useRef<Mesh>(null)
  const [revision, setRevision] = useState(world.environment.revision)
  const snapshot = useMemo(() => {
    const parts = [...world.environment.tiles.values()].flatMap((tile) => tile.parts)
    return {
      revision,
      anchorX: world.environment.centerX * environmentTileSize,
      anchorZ: world.environment.centerZ * environmentTileSize,
      groups: (["box", "column", "stone", "dune"] as const).map((shape) => ({
        shape,
        parts: parts.filter((part) => part.shape === shape),
      })),
    }
  }, [world, revision])
  useFrame(() => {
    if (snapshot.revision !== world.environment.revision) setRevision(world.environment.revision)
    groupRef.current?.position.set(
      snapshot.anchorX - world.origin.x,
      0,
      snapshot.anchorZ - world.origin.z,
    )
    groundRef.current?.position.set(
      world.vehicleX - world.origin.x,
      -0.14,
      world.vehicleZ - world.origin.z,
    )
  })
  return (
    <group name="world-environment">
      <mesh ref={groundRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="continuous-ground">
        <planeGeometry args={[1600, 1600]} />
        <meshStandardMaterial color={dreamPalette.sand} roughness={1} />
      </mesh>
      <group ref={groupRef}>
        {snapshot.groups.map(({ shape, parts }) => (
          <PartBatch
            key={shape}
            shape={shape}
            parts={parts}
            anchorX={snapshot.anchorX}
            anchorZ={snapshot.anchorZ}
          />
        ))}
      </group>
    </group>
  )
}
