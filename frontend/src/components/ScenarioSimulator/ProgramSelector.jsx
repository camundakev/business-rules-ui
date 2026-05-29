export function ProgramSelector({ programs, value, onChange }) {
  return (
    <label className="program-selector">
      <span className="program-selector__label">Lead Program</span>
      <select
        className="program-selector__select"
        value={value?.displayName ?? ''}
        onChange={(e) => {
          const next = programs.find((p) => p.displayName === e.target.value);
          if (next) onChange(next);
        }}
      >
        {programs.map((p) => (
          <option key={p.displayName} value={p.displayName}>
            {p.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
