const COLORS = ['#e17076', '#7bc862', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774'];

export function colorFor(id) {
  const n = Math.abs(Number(id) || 0);
  return COLORS[n % COLORS.length];
}

// Аватарка: фото из Telegram или кружок с первой буквой имени.
export default function Avatar({ id, name, photoUrl, size = 32, className = '' }) {
  const letter = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  const style = { width: size, height: size, fontSize: size * 0.45, background: colorFor(id) };
  return (
    <span className={`avatar ${className}`} style={style} title={name}>
      {photoUrl ? <img src={photoUrl} alt="" onError={(e) => e.currentTarget.remove()} /> : null}
      <span>{letter}</span>
    </span>
  );
}
