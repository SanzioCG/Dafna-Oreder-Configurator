import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useI18n } from '../i18n/I18n';
import type { ViewGeometry } from '../state/useConfigurator';
import type { FrameBox } from './CameraRig';
import {
  DIMENSION_MARGIN,
  DimensionLabels,
  buildDimensions,
  midpoint,
  type V3,
} from './Dimensions';
import { MM, Scene } from './Scene';

interface ViewerProps {
  view: ViewGeometry;
  invalid: boolean;
}

/** Detects a double tap (touch or mouse) without interfering with orbit gestures. */
function useDoubleTap(onDoubleTap: () => void) {
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const active = useRef(0);
  return {
    onPointerDown: (e: PointerEvent) => {
      active.current += 1;
      down.current = active.current === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    },
    onPointerUp: (e: PointerEvent) => {
      active.current = Math.max(0, active.current - 1);
      const d = down.current;
      down.current = null;
      if (!d || e.timeStamp - d.t > 300 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) {
        return;
      }
      const tap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      const prev = lastTap.current;
      if (prev && tap.t - prev.t < 400 && Math.hypot(tap.x - prev.x, tap.y - prev.y) < 40) {
        lastTap.current = null;
        onDoubleTap();
      } else {
        lastTap.current = tap;
      }
    },
    onPointerCancel: () => {
      active.current = Math.max(0, active.current - 1);
      down.current = null;
    },
  };
}

/** Root font size / 16: 1 at 1080p, 2 at 4K (see styles.css). Scales pixel line widths. */
function useUiScale(): number {
  const read = () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
  const [scale, setScale] = useState(read);
  useEffect(() => {
    const onResize = () => setScale(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

/** Viewer shell: 3D scene + DOM overlays (dimension labels, buttons, banners). */
export function Viewer({ view, invalid }: ViewerProps) {
  const { t } = useI18n();
  const [resetToken, setResetToken] = useState(0);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const reframe = () => setResetToken((n) => n + 1);
  const tap = useDoubleTap(reframe);
  const { widthMm: W, heightMm: H, depthMm: D } = view;
  const hasDoors = view.result.panels.some((p) => p.role === 'door');

  // World space is metres with the product centred on the origin, standing on the floor (y=0).
  const box = useMemo<FrameBox>(
    () => ({
      min: [(-W / 2) * MM, 0, (-D / 2) * MM],
      max: [(W / 2 + DIMENSION_MARGIN.right) * MM, (H + DIMENSION_MARGIN.top) * MM, (D / 2) * MM],
    }),
    [W, H, D],
  );

  const unit = t('unit.mm');
  const sections = view.result.sections;
  // Closed doors hide the sections, so only overall dimensions are shown then.
  const showSections = !hasDoors || doorsOpen;
  const dims = useMemo(
    () => buildDimensions(W, H, D, sections, unit, showSections),
    [W, H, D, sections, unit, showSections],
  );
  // Label anchors in world metres (same transform as the product group in <Scene>).
  const anchors = useMemo(
    () =>
      dims.map((d) => {
        const [x, y, z] = midpoint(d);
        const world: V3 = [(x - W / 2) * MM, y * MM, (z - D / 2) * MM];
        return { key: d.key, world };
      }),
    [dims, W, D],
  );
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const uiScale = useUiScale();

  return (
    <div className="viewer" {...tap} data-testid="viewer">
      <Scene
        view={view}
        dims={dims}
        anchors={anchors}
        labelRefs={labelRefs}
        lineScale={uiScale}
        box={box}
        resetToken={resetToken}
        doorsOpen={hasDoors && doorsOpen}
      />
      <DimensionLabels dims={dims} labelRefs={labelRefs} />

      <div className="viewer-actions">
        {hasDoors && (
          <button
            type="button"
            className={
              doorsOpen ? 'btn btn-floating btn-doors active' : 'btn btn-floating btn-doors'
            }
            aria-pressed={doorsOpen}
            onClick={() => setDoorsOpen((o) => !o)}
          >
            {doorsOpen ? t('viewer.doorsClose') : t('viewer.doorsOpen')}
          </button>
        )}
        <button type="button" className="btn btn-floating" onClick={reframe}>
          ⤢ {t('viewer.reframe')}
        </button>
      </div>
      <p className="viewer-hint">{t('viewer.hint')}</p>
      {invalid && (
        <div className="viewer-stale" role="alert">
          <p className="viewer-invalid">⚠ {t('viewer.invalid')}</p>
        </div>
      )}
    </div>
  );
}
