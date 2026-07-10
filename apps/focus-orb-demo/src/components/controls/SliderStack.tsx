import type { SliderDefinition } from "../../types/demo"
import { RangeControl } from "./RangeControl"

interface SliderStackProps<Key extends string> {
  definitions: readonly SliderDefinition<Key>[]
  disabled?: boolean
  onChange: (key: Key, value: number) => void
  values: { [Property in Key]: number }
}

export function SliderStack<Key extends string>({
  definitions,
  disabled = false,
  onChange,
  values,
}: SliderStackProps<Key>) {
  return (
    <div className="range-stack">
      {definitions.map((definition) => (
        <RangeControl
          disabled={disabled}
          key={definition.key}
          label={definition.label}
          max={definition.max}
          min={definition.min}
          onChange={(value) => {
            onChange(definition.key, value)
          }}
          step={definition.step}
          value={values[definition.key]}
        />
      ))}
    </div>
  )
}
