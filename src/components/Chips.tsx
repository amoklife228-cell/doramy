export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o.value}
          className="chip"
          data-active={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
