import { useRef, useState } from 'react';
import { useLook } from '../app/look';
import { ICON_IDS, ICON_NAMES, type IconId } from '../render/icons';
import { THEMES } from '../render/theme';
import { PRIVACY_RADII } from '../track/privacy';
import type { ColorBy, RouteColoring } from '../track/colorize';
import { VALUE_RAMP } from '../render/theme';

interface StylePanelProps {
  colorings: ColorBy[];
  legend: RouteColoring['legend'];
  /** Icon picked automatically from the sport, if any. */
  autoIcon: IconId | null;
  /** Warning when the privacy zone could not be applied. */
  privacyNote: string | null;
}

const COLOR_BY_NAMES: Record<ColorBy, string> = {
  solid: 'Theme colour',
  speed: 'Speed',
  heartrate: 'Heart rate',
  elevation: 'Elevation',
};

/** Theme, route colouring, marker icon, privacy zone, labels and music. */
export function StylePanel({ colorings, legend, autoIcon, privacyNote }: StylePanelProps) {
  const look = useLook();
  const iconInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const select =
    'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100';
  const label = 'flex flex-col gap-1 text-sm text-slate-400';

  return (
    <section aria-labelledby="style-title" className="space-y-3">
      <h2 id="style-title" className="font-semibold text-white">
        Style
      </h2>

      <fieldset className="flex items-center gap-2">
        <legend className="sr-only">Colour theme</legend>
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.name}
            aria-label={`${t.name} theme`}
            aria-pressed={look.themeId === t.id}
            onClick={() => look.set({ themeId: t.id })}
            className="h-8 w-8 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{
              background: t.route,
              borderColor: look.themeId === t.id ? '#ffffff' : 'transparent',
            }}
          />
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Route colour
          <select
            className={select}
            value={colorings.includes(look.colorBy) ? look.colorBy : 'solid'}
            onChange={(e) => look.set({ colorBy: e.target.value as ColorBy })}
          >
            {colorings.map((c) => (
              <option key={c} value={c}>
                {COLOR_BY_NAMES[c]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Marker
          <select
            className={select}
            value={look.marker}
            onChange={(e) => {
              const v = e.target.value as typeof look.marker;
              if (v === 'custom' && !look.customIcon) iconInput.current?.click();
              else look.set({ marker: v });
            }}
          >
            <option value="auto">Auto{autoIcon ? ` (${ICON_NAMES[autoIcon]})` : ' (dot)'}</option>
            <option value="dot">Dot</option>
            {ICON_IDS.map((id) => (
              <option key={id} value={id}>
                {ICON_NAMES[id]}
              </option>
            ))}
            <option value="custom">Your picture…</option>
          </select>
        </label>
      </div>
      <input
        ref={iconInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void look.setCustomIcon(file);
          e.target.value = '';
        }}
      />

      {legend && (
        <div className="text-xs text-slate-400">
          <div
            className="h-2 rounded-full"
            style={{ background: `linear-gradient(to right, ${VALUE_RAMP.join(', ')})` }}
          />
          <div className="mt-1 flex justify-between tabular-nums">
            <span>{legend.min}</span>
            <span>{legend.label}</span>
            <span>{legend.max}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Privacy zone
          <select
            className={select}
            value={look.privacyRadius}
            onChange={(e) => look.set({ privacyRadius: Number(e.target.value) })}
          >
            {PRIVACY_RADII.map((r) => (
              <option key={r} value={r}>
                {r === 0 ? 'Off' : `Hide ${r} m around start and finish`}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col justify-end gap-1 text-sm text-slate-300">
          <legend className="sr-only">Labels</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={look.showPeaks}
              onChange={(e) => look.set({ showPeaks: e.target.checked })}
              className="accent-orange-500"
            />
            Peaks and passes
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={look.showHighlights}
              onChange={(e) => look.set({ showHighlights: e.target.checked })}
              className="accent-orange-500"
            />
            Highlights
          </label>
        </fieldset>
      </div>
      {privacyNote && <p className="text-xs text-amber-300">{privacyNote}</p>}

      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Music</span>
          <span className="min-w-0 flex-1 truncate text-slate-200">
            {look.music ? look.music.name : 'None'}
          </span>
          <button
            type="button"
            onClick={() => musicInput.current?.click()}
            className="rounded-md border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800"
          >
            {look.music ? 'Change' : 'Add'}
          </button>
          {look.music && (
            <button
              type="button"
              onClick={() => void look.setMusicFile(null)}
              aria-label="Remove music"
              className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800"
            >
              ×
            </button>
          )}
        </div>
        {look.music && (
          <label className="flex items-center gap-2 text-slate-400">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={look.musicVolume}
              onChange={(e) => look.set({ musicVolume: Number(e.target.value) })}
              className="flex-1 accent-orange-500"
            />
          </label>
        )}
        {musicError && <p className="text-xs text-red-300">{musicError}</p>}
        <input
          ref={musicInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setMusicError(null);
            look.setMusicFile(file).catch(() => setMusicError(`Could not read ${file.name}.`));
          }}
        />
      </div>
    </section>
  );
}
