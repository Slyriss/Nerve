export function Select({
  label,
  value,
  options,
  suffix,
  onChange,
  labels
}: {
  label: string;
  value: string | number;
  options: Array<string | number>;
  suffix?: string;
  onChange: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <label>
      {label}
      <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={String(option)} key={String(option)}>
            {labels?.[String(option)] ?? option}
            {suffix ? ` ${suffix}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
