import { useCallback, useEffect, useId, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { useRoadWorld } from "@/game/roadWorld"
import { createSceneryColliders } from "@/game/sceneryCollision"

import { resolveSceneryDistance } from "./shared"
import type { SideSceneryItem } from "./shared"

interface SceneryContext<Item extends SideSceneryItem> {
  distance: number
  elapsedTime: number
  item: Item
  node: Group
  z: number
}

interface WorldSceneryOptions<Item extends SideSceneryItem> {
  cycleDistance: number
  distanceRef: RefObject<number>
  items: readonly Item[]
  originDistance: (item: Item) => number
  resolveDistance?: (item: Item, distance: number) => number
  update: (context: SceneryContext<Item>) => void
  isSolid?: boolean
}

export function useWorldScenery<Item extends SideSceneryItem>({
  cycleDistance,
  distanceRef,
  items,
  originDistance,
  resolveDistance,
  update,
  isSolid = false,
}: WorldSceneryOptions<Item>) {
  const world = useRoadWorld()
  const id = useId()
  const nodeRefs = useRef<Array<Group | null>>([])
  const anchors = useRef(new Map<number, { distance: number; offset: number; heading: number }>())
  useEffect(
    () => () => {
      world.scenerySolids.delete(id)
    },
    [id, world],
  )
  useFrame(() => {
    const distance = distanceRef.current
    let hasMoved = false
    items.forEach((item) => {
      const node = nodeRefs.current[item.index]
      if (!node) return
      const defaultDistance = resolveSceneryDistance(originDistance(item), distance, cycleDistance)
      const station = resolveDistance?.(item, defaultDistance) ?? defaultDistance
      node.visible = station >= distance - 640 && station < distance + 800
      if (!node.visible) {
        if (anchors.current.delete(item.index)) hasMoved = true
        return
      }
      // Model updates use road-local coordinates; rendering and collision share
      // the resulting anchor, including deliberate apparition relocations.
      update({ distance: station, elapsedTime: world.elapsed, item, node, z: -station })
      const offset = node.position.x
      const heading = node.rotation.y
      const pose = world.pose(station, offset)
      node.position.x = pose.x
      node.position.z = pose.z
      node.rotation.y += pose.heading
      Object.assign(node.userData, {
        station,
        offset,
        worldX: pose.x + world.origin.x,
        worldZ: pose.z + world.origin.z,
      })
      const previous = anchors.current.get(item.index)
      if (
        isSolid &&
        (previous?.distance !== station ||
          previous.offset !== offset ||
          previous.heading !== heading)
      ) {
        hasMoved = true
        anchors.current.set(item.index, { distance: station, offset, heading })
      }
    })
    if (isSolid && hasMoved) {
      world.scenerySolids.set(id, createSceneryColliders(nodeRefs.current, world.origin, id))
    }
  })
  return useCallback((index: number, node: Group | null) => {
    nodeRefs.current[index] = node
    anchors.current.delete(index)
  }, [])
}
