import { Suspense, useEffect, useMemo } from "react"
import type { RefObject } from "react"

import { useLoader, useThree } from "@react-three/fiber"
import { DoubleSide, MeshBasicMaterial, SRGBColorSpace, TextureLoader, Vector3 } from "three"
import type { Group } from "three"

import {
  createPictureLayout,
  obscuresPicture,
  overlapsPictureSpace,
  PictureApparition,
} from "@/game/apparitions"
import type { PictureAnchor } from "@/game/apparitions"
import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { environmentTileSize } from "@/game/environment"
import { dreamPalette, sceneryConfig } from "@/game/gameConfig"
import { useRoadWorld } from "@/game/roadWorld"
import { useGameStore } from "@/game/useGameStore"

import { ModelDetails } from "../ModelDetails"

import { useWorldScenery } from "./useWorldScenery"

interface PictureFramesProps {
  distanceRef: RefObject<number>
}

interface PictureFrameNodeProps {
  index: number
  scale: number
  nodeRef: (node: Group | null) => void
}

interface PictureApparitionState {
  motion: PictureApparition
  anchor: PictureAnchor | null
}

const pictureFrameTextureAspect = 235 / 286
const pictureFrameVisualHeight = 2.92
const pictureFrameVisualWidth = pictureFrameVisualHeight * pictureFrameTextureAspect
const pictureFrameOuterWidth = pictureFrameVisualWidth + 0.44
const pictureFrameOuterHeight = pictureFrameVisualHeight + 0.44
const pictureFrameRailThickness = 0.16
const { pictureFrames } = sceneryConfig

function PictureFrameImage() {
  const texture = useLoader(TextureLoader, "/image/image.png")
  const material = useMemo(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true

    return new MeshBasicMaterial({
      depthWrite: true,
      map: texture,
      opacity: 1,
      side: DoubleSide,
      toneMapped: false,
    })
  }, [texture])

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  return (
    <mesh position={[0, 0, 0.08]} scale={[pictureFrameVisualWidth, pictureFrameVisualHeight, 1]}>
      <planeGeometry args={[1, 1]} />
      <primitive attach="material" object={material} />
    </mesh>
  )
}

function PictureFramePlaceholder() {
  return (
    <mesh position={[0, 0, 0.06]} scale={[pictureFrameVisualWidth, pictureFrameVisualHeight, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#6e5960" depthWrite={false} transparent opacity={0.82} />
    </mesh>
  )
}

function PictureFrameChrome({ index }: { index: number }) {
  const frameTint = index % 2 === 0 ? dreamPalette.ruin : dreamPalette.ruinDark

  return (
    <>
      <ModelDetails
        parts={[-1, 1].flatMap((side): Parameters<typeof ModelDetails>[0]["parts"] => [
          {
            position: [side * (pictureFrameOuterWidth / 2 - 0.1), 0, 0.08],
            size: [0.035, pictureFrameOuterHeight, 0.1],
            color: "#b9a18f",
          },
          {
            position: [0, side * (pictureFrameOuterHeight / 2 - 0.1), 0.08],
            size: [pictureFrameOuterWidth, 0.035, 0.1],
            color: "#b9a18f",
          },
          {
            position: [
              (side * pictureFrameOuterWidth) / 2,
              -pictureFrameOuterHeight / 2 + 0.05,
              -0.05,
            ],
            size: [0.38, 0.12, 0.62],
            color: frameTint,
          },
        ])}
      />
      <mesh position={[0, pictureFrameOuterHeight / 2, 0]}>
        <boxGeometry
          args={[
            pictureFrameOuterWidth + pictureFrameRailThickness,
            pictureFrameRailThickness,
            0.1,
          ]}
        />
        <meshStandardMaterial color={frameTint} roughness={0.78} />
      </mesh>
      <mesh position={[0, -pictureFrameOuterHeight / 2, 0]}>
        <boxGeometry
          args={[
            pictureFrameOuterWidth + pictureFrameRailThickness,
            pictureFrameRailThickness,
            0.1,
          ]}
        />
        <meshStandardMaterial color={frameTint} roughness={0.8} />
      </mesh>
      <mesh position={[-pictureFrameOuterWidth / 2, 0, 0]}>
        <boxGeometry
          args={[
            pictureFrameRailThickness,
            pictureFrameOuterHeight - pictureFrameRailThickness,
            0.1,
          ]}
        />
        <meshStandardMaterial color={frameTint} roughness={0.82} />
      </mesh>
      <mesh position={[pictureFrameOuterWidth / 2, 0, 0]}>
        <boxGeometry
          args={[
            pictureFrameRailThickness,
            pictureFrameOuterHeight - pictureFrameRailThickness,
            0.1,
          ]}
        />
        <meshStandardMaterial color={frameTint} roughness={0.82} />
      </mesh>
      <mesh
        position={[0, 0, -0.045]}
        scale={[pictureFrameVisualWidth + 0.12, pictureFrameVisualHeight + 0.12, 1]}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#5a454b" depthWrite={false} transparent opacity={0.58} />
      </mesh>
      <mesh position={[-0.46, 0.42, 0.1]}>
        <boxGeometry args={[0.5, 0.06, 0.035]} />
        <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.44} />
      </mesh>
      <mesh position={[0.34, -0.52, 0.1]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.68, 0.06, 0.035]} />
        <meshBasicMaterial color={dreamPalette.mint} transparent opacity={0.38} />
      </mesh>
    </>
  )
}

function PictureFrameNode({ index, scale, nodeRef }: PictureFrameNodeProps) {
  return (
    <group ref={nodeRef} name={`dream-picture-${index}`} scale={scale}>
      <PictureFrameChrome index={index} />
      <Suspense fallback={<PictureFramePlaceholder />}>
        <PictureFrameImage />
      </Suspense>
    </group>
  )
}

export function PictureFrames({ distanceRef }: PictureFramesProps) {
  const world = useRoadWorld()
  const camera = useThree((state) => state.camera)
  const pictureFrameItems = useMemo(createPictureLayout, [])
  const apparitions = useMemo<PictureApparitionState[]>(
    () =>
      pictureFrameItems.map(({ index }) => ({
        motion: new PictureApparition(index),
        anchor: null,
      })),
    [pictureFrameItems],
  )
  const viewPoint = useMemo(() => new Vector3(), [])
  const occupiedViewPoint = useMemo(() => new Vector3(), [])
  const viewDirection = useMemo(() => new Vector3(), [])
  const setPictureFrameRef = useWorldScenery({
    isSolid: true,
    cycleDistance: pictureFrames.cycleDistance,
    distanceRef,
    items: pictureFrameItems,
    originDistance: ({ distance }) => distance,
    resolveDistance: ({ index, scale }, defaultDistance) => {
      const apparition = apparitions[index]
      if (!apparition) return defaultDistance
      camera.getWorldDirection(viewDirection)
      const heading = world.road.sample(world.distance).heading
      const direction =
        -Math.sin(heading) * viewDirection.x - Math.cos(heading) * viewDirection.z >= 0 ? 1 : -1
      apparition.anchor = apparition.motion.update(
        world.elapsed,
        useGameStore.getState().integrity,
        world.distance,
        direction,
        (anchor) => {
          if (
            apparitions.some(
              ({ anchor: occupied }) =>
                occupied &&
                Math.hypot(occupied.distance - anchor.distance, occupied.offset - anchor.offset) <
                  10,
            )
          )
            return false
          const pose = world.pose(anchor.distance, anchor.offset)
          viewPoint.set(pose.x, 1.6, pose.z).project(camera)
          if (
            Math.abs(viewPoint.x) >= 0.85 ||
            Math.abs(viewPoint.y) >= 0.75 ||
            viewPoint.z <= -1 ||
            viewPoint.z >= 1
          )
            return false
          const depth = -occupiedViewPoint
            .set(pose.x, 1.6, pose.z)
            .applyMatrix4(camera.matrixWorldInverse).z
          for (const [otherIndex, otherState] of apparitions.entries()) {
            const occupied = otherState.anchor
            if (!occupied || otherIndex === index) continue
            const other = world.pose(occupied.distance, occupied.offset)
            const otherDepth = -occupiedViewPoint
              .set(other.x, 1.6, other.z)
              .applyMatrix4(camera.matrixWorldInverse).z
            if (otherDepth <= 0) continue
            occupiedViewPoint.set(other.x, 1.6, other.z).project(camera)
            const projectedScale =
              scale / depth + (pictureFrameItems[otherIndex]?.scale ?? 1) / otherDepth
            const width =
              pictureFrameOuterWidth *
              0.5 *
              projectedScale *
              (camera.projectionMatrix.elements[0] ?? 1)
            const height =
              pictureFrameOuterHeight *
              0.5 *
              projectedScale *
              (camera.projectionMatrix.elements[5] ?? 1)
            if (
              occupiedViewPoint.z > -1 &&
              occupiedViewPoint.z < 1 &&
              Math.abs(viewPoint.x - occupiedViewPoint.x) < width + 0.008 &&
              Math.abs(viewPoint.y - occupiedViewPoint.y) < height + 0.008
            )
              return false
          }
          const target = { x: pose.x + world.origin.x, y: 1.6, z: pose.z + world.origin.z }
          const viewpoint = {
            x: camera.position.x + world.origin.x,
            y: camera.position.y,
            z: camera.position.z + world.origin.z,
          }
          const minX = Math.floor((Math.min(viewpoint.x, target.x) - 32) / environmentTileSize)
          const maxX = Math.floor((Math.max(viewpoint.x, target.x) + 32) / environmentTileSize)
          const minZ = Math.floor((Math.min(viewpoint.z, target.z) - 32) / environmentTileSize)
          const maxZ = Math.floor((Math.max(viewpoint.z, target.z) + 32) / environmentTileSize)
          for (let tileX = minX; tileX <= maxX; tileX += 1) {
            for (let tileZ = minZ; tileZ <= maxZ; tileZ += 1) {
              const tile = world.environment.tiles.get(`${tileX}:${tileZ}`)
              if (!tile) continue
              for (const part of tile.parts) {
                const rimScale = part.shape === "dune" ? 1.16 : 1
                if (
                  overlapsPictureSpace(target.x, target.z, {
                    x: part.x,
                    z: part.z,
                    heading: part.heading,
                    halfWidth: (part.width * rimScale) / 2,
                    halfDepth: (part.depth * rimScale) / 2,
                  }) ||
                  obscuresPicture(viewpoint, target, part)
                )
                  return false
              }
            }
          }
          for (const solids of world.scenerySolids.values()) {
            if (solids.some((solid) => overlapsPictureSpace(target.x, target.z, solid)))
              return false
          }
          return true
        },
        () => apparitions.flatMap(({ anchor }) => (anchor ? [anchor] : [])),
      )
      return apparition.anchor?.distance ?? defaultDistance
    },
    update: ({ item, node, z }) => {
      const { index } = item
      const anchor = apparitions[index]?.anchor
      const x = anchor?.offset ?? item.offset
      const groundY = resolveDesertGroundHeight(x, -z)

      node.position.set(
        x,
        groundY +
          ((pictureFrameOuterHeight + pictureFrameRailThickness) / 2) * node.scale.y -
          0.015,
        z,
      )
      node.rotation.set(0, anchor?.yaw ?? item.yaw, 0)
    },
  })

  return (
    <>
      {pictureFrameItems.map(({ index, scale }) => (
        <PictureFrameNode
          key={index}
          index={index}
          scale={scale}
          nodeRef={(node) => {
            setPictureFrameRef(index, node)
          }}
        />
      ))}
    </>
  )
}
