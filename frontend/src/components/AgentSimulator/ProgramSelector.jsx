export function ProgramSelector({ programs, value, onChange }) {
  return (
    <label className="program-selector">
      <span className="program-selector__label">Lead Program</span>
      <select
        className="program-selector__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {programs.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </label>
  );
}
