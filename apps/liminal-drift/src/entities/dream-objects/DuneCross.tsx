interface DuneCrossProps {
  color: string
  rotation: [number, number, number]
  scale: number
}

export function DuneCross({ color, rotation, scale }: DuneCrossProps) {
  return (
    <group rotation={rotation} scale={scale}>
      <mesh castShadow receiveShadow position={[0, 0.235, 0]}>
        <boxGeometry args={[0.12, 0.67, 0.1]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.765, 0]}>
        <boxGeometry args={[0.12, 0.19, 0.1]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.62, 0]}>
        <boxGeometry args={[0.54, 0.1, 0.1]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
    </group>
  )
}
