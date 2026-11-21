// Индикатор загрузки: дуга, которая «дорисовывается», пока тянешь список,
// и крутится, когда идёт загрузка (progress не задан).
export default function Spinner({ progress, size = 28 }) {
  const r = 10;
  const len = 2 * Math.PI * r;
  const spinning = progress === undefined;
  const dash = spinning ? len * 0.7 : len * progress;
  return (
    <svg className={`spinner ${spinning ? 'is-spinning' : ''}`} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r={r} className="spinner-track" />
      <circle
        cx="12"
        cy="12"
        r={r}
        className="spinner-arc"
        strokeDasharray={`${dash} ${len}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}
