import { presets, type Weather } from '../services/environment'

export default function EnvironmentControls({
  weather,
  onChange,
  reduced,
}: {
  weather: Weather
  onChange: (value: Weather) => void
  reduced: boolean
}) {
  const change = (key: 'cloud' | 'rain' | 'wind' | 'direction', value: number) =>
    onChange({
      ...weather,
      [key]: Math.max(0, Math.min(key === 'direction' ? 360 : 100, value)),
      preset: 'Custom',
    })
  return (
    <details className="environment-controls">
      <summary>Environment · {weather.preset}</summary>
      <p>Simulated weather — visual scenarios, not observations or forecasts.</p>
      <div className="weather-presets">
        {Object.entries(presets).map(([name, values]) => (
          <button
            key={name}
            type="button"
            aria-pressed={weather.preset === name}
            onClick={() => onChange({ ...weather, ...values, preset: name })}
          >
            {name}
          </button>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={weather.enabled}
          onChange={(e) => onChange({ ...weather, enabled: e.target.checked })}
        />{' '}
        Weather effects
      </label>
      <label>
        <input
          type="checkbox"
          checked={weather.paused}
          onChange={(e) => onChange({ ...weather, paused: e.target.checked })}
        />{' '}
        Pause weather animation
      </label>
      <label>
        Effects quality
        <select
          value={weather.quality}
          onChange={(e) => onChange({ ...weather, quality: e.target.value as Weather['quality'] })}
        >
          {['Low', 'Medium', 'High'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {reduced && <p>Reduced motion: continuous weather and timeline playback are disabled.</p>}
      <details>
        <summary>Advanced weather controls</summary>
        {(
          [
            ['cloud', 'Cloud coverage'],
            ['rain', 'Rain intensity'],
            ['wind', 'Visual wind strength'],
            ['direction', 'Wind direction (toward, degrees from north)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              aria-label={label}
              min="0"
              max={key === 'direction' ? 360 : 100}
              value={weather[key]}
              onChange={(e) => change(key, Number(e.target.value))}
            />
            <input
              aria-label={`${label} slider`}
              type="range"
              min="0"
              max={key === 'direction' ? 360 : 100}
              value={weather[key]}
              onChange={(e) => change(key, Number(e.target.value))}
            />
          </label>
        ))}
      </details>
      <p>
        Intensity/strength are visual scales (0–100), not physical measurements. Rain is
        camera-relative and has no roof collision. Weather never changes geometric shade or prices.
        No lightning or audio.
      </p>
    </details>
  )
}
