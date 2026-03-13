interface FilterDropdownProps {
  readonly label: string
  readonly value: string
  readonly options: readonly string[]
  readonly onChange: (value: string) => void
}

export function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: FilterDropdownProps) {
  const sorted = [...options].sort((a, b) => a.localeCompare(b))

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none transition-colors focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
    >
      <option value="">{label}</option>
      {sorted.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}
