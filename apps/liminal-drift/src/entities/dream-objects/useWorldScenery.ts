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
  update: (context: SceneryContext<Item>) => void
  isSolid?: boolean
}

export function useWorldScenery<Item extends SideSceneryItem>({
  cycleDistance,
  distanceRef,
  items,
  originDistance,
  update,
  isSolid = false,
}: WorldSceneryOptions<Item>) {
  const world = useRoadWorld()
  const id = useId()
  const nodeRefs = useRef<Array<Group | null>>([])
  const stations = useRef(new Map<number, number>())
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
      const station = resolveSceneryDistance(originDistance(item), distance, cycleDistance)
      node.visible = station >= distance - 640 && station < distance + 800
      if (!node.visible) return
      // Updates describe a prop in the road's local frame. Its world anchor is
      // invariant until it is retired behind the fog and reused far ahead.
      update({ distance: station, elapsedTime: world.elapsed, item, node, z: -station })
      const pose = world.pose(station, node.position.x)
      node.position.x = pose.x
      node.position.z = pose.z
      node.rotation.y += pose.heading
      node.userData = { station, worldX: pose.x + world.origin.x, worldZ: pose.z + world.origin.z }
      if (stations.current.get(item.index) !== station) {
        hasMoved = true
        stations.current.set(item.index, station)
      }
    })
    if (isSolid && hasMoved) {
      world.scenerySolids.set(id, createSceneryColliders(nodeRefs.current, world.origin, id))
    }
  })
  return useCallback((index: number, node: Group | null) => {
    nodeRefs.current[index] = node
    stations.current.delete(index)
  }, [])
}
