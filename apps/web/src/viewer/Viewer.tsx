import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Confetti, type ConfettiHandle } from '../presentation/Confetti';
import { RevealDirector, type RevealEvent, type RevealKind } from '../presentation/reveal';
import { useI18n } from '../i18n/I18n';
import { useTheme } from '../theme/ThemeProvider';
import { ReframeIcon, SuccessIcon } from '../ui/icons';
import { StatusMessage } from '../ui/StatusMessage';
import type { CameraApi } from './CameraRig';
import type { ViewGeometry } from '../state/useConfigurator';
import type { FrameBox } from './CameraRig';
import type { Mode } from '../mode';
import { DimensionSvg, type DimElements } from './DimensionOverlay';
import {
  DIMENSION_MARGIN,
  buildDimensions,
  dimensionVisibility,
  formatLength,
  unitSystemFor,
  type V3,
} from './dimensions';
import type { CameraCommand, CameraRequest } from './cameraCommands';
import { MM, Scene } from './Scene';
import type { SectionBox } from './SectionPicker';

interface ViewerProps {
  view: ViewGeometry;
  /** customer sees cm, staff mm */
  mode?: Mode;
  invalid: boolean;
  /** current wizard step: 'interior' opens the doors and enables section picking */
  activeStep?: string;
  /** selected section on the interior step (null elsewhere) */
  selectedSection?: number | null;
  onSelectSection?: (index: number) => void;
  /** increments on every explicit section selection (tab or 3D tap): frames that section */
  selectionSeq?: number;
  /** presentation mode ("Ko'rib chiqish"): the reveal to play; null = configurator */
  presentation?: { kind: RevealKind; runId: number } | null;
  /** discrete reveal events (doors closed, title, done) */
  onRevealEvents?: (events: RevealEvent[]) => void;
  /** stable-state content (summary, confirm / edit), shown as soon as the doors have closed */
  presentationContent?: ReactNode;
}

interface RevealUi {
  running: boolean;
  title: boolean;
  doorsClosed: boolean;
}

const REVEAL_IDLE: RevealUi = { running: false, title: false, doorsClosed: false };

/**
 * Detects a double tap (touch or mouse) without interfering with orbit gestures, and tracks
 * whether a pointer is down on the 3D zone (`pointerDown`): camera moves wait for release.
 */
function useDoubleTap(onDoubleTap: () => void, pointerDown: { current: boolean }) {
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const active = useRef(0);
  const sync = () => {
    pointerDown.current = active.current > 0;
  };
  return {
    onPointerDown: (e: PointerEvent) => {
      active.current += 1;
      sync();
      down.current = active.current === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    },
    onPointerUp: (e: PointerEvent) => {
      active.current = Math.max(0, active.current - 1);
      sync();
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
      sync();
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
export function Viewer({
  view,
  mode = 'customer',
  invalid,
  activeStep = 'size',
  selectedSection = null,
  onSelectSection,
  selectionSeq = 0,
  presentation = null,
  onRevealEvents,
  presentationContent,
}: ViewerProps) {
  const { t } = useI18n();
  const { theme, logoUrl } = useTheme();
  const presenting = presentation !== null;
  const [resetToken, setResetToken] = useState(0);
  const [doorsOpen, setDoorsOpen] = useState(false);
  // Interior step: doors open automatically; leaving the step restores the previous state.
  const savedDoors = useRef<boolean | null>(null);
  const interior = activeStep === 'interior';
  useEffect(() => {
    if (interior && savedDoors.current === null) {
      setDoorsOpen((prev) => {
        savedDoors.current = prev;
        return true;
      });
    } else if (!interior && savedDoors.current !== null) {
      const restore = savedDoors.current;
      savedDoors.current = null;
      setDoorsOpen(restore);
    }
  }, [interior]);
  const reframe = () => setResetToken((n) => n + 1);
  const pointerDown = useRef(false);
  const tap = useDoubleTap(reframe, pointerDown);
  const { widthMm: W, heightMm: H, depthMm: D } = view;
  const hasDoors = view.result.panels.some((p) => p.role === 'door');

  // World space is metres with the product centred on the origin, standing on the floor (y=0).
  const product = useMemo<FrameBox>(
    () => ({ min: [(-W / 2) * MM, 0, (-D / 2) * MM], max: [(W / 2) * MM, H * MM, (D / 2) * MM] }),
    [W, H, D],
  );
  const extent = useMemo<FrameBox>(
    () => ({
      min: [(-W / 2) * MM, 0, (-D / 2) * MM],
      max: [(W / 2 + DIMENSION_MARGIN.right) * MM, (H + DIMENSION_MARGIN.top) * MM, (D / 2) * MM],
    }),
    [W, H, D],
  );

  const sections = view.result.sections;
  // Dimension values come from the engine output only (result.dimensions / sections).
  const units = unitSystemFor(mode);
  const unitLabel = t(units === 'cm' ? 'unit.cm' : 'unit.mm');
  const engineSize = view.result.dimensions ?? { widthMm: W, heightMm: H, depthMm: D };
  const visibility = dimensionVisibility({
    step: activeStep,
    presentation: presenting,
    hasDoors,
    doorsOpen,
  });
  const dims = useMemo(
    () =>
      buildDimensions(engineSize, sections, (mm) => formatLength(mm, units, unitLabel), visibility),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitive deps below
    [
      engineSize.widthMm,
      engineSize.heightMm,
      engineSize.depthMm,
      sections,
      units,
      unitLabel,
      visibility.primary,
      visibility.secondary,
    ],
  );
  // product mm -> world metres (same transform as the product group in <Scene>)
  const toWorld = useMemo(
    () =>
      (p: V3): V3 => [(p[0] - W / 2) * MM, p[1] * MM, (p[2] - D / 2) * MM],
    [W, D],
  );
  const dimRegistry = useRef(new Map<string, DimElements>());
  const uiScale = useUiScale();
  const remPx = uiScale * 16;

  // section inner boxes (mm) for picking / highlighting on the interior step
  const sectionBoxes = useMemo<SectionBox[]>(() => {
    const dimsInfo = view.result.dimensions;
    const t = view.result.panels.find((p) => p.id === 'side-left')?.thicknessMm ?? 16;
    if (!dimsInfo) return [];
    const z0 = dimsInfo.backThicknessMm;
    return sections.map((s) => ({
      index: s.index,
      x0: s.xStartMm,
      x1: s.xStartMm + s.innerWidthMm,
      y0: dimsInfo.plinthHeightMm + t,
      y1: H - t,
      z0,
      z1: z0 + dimsInfo.carcassDepthMm,
    }));
  }, [view.result.dimensions, view.result.panels, sections, H]);

  // ---- smart camera: explicit selections only ----
  const picking = activeStep === 'interior' || activeStep === 'doors';
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const commandSeq = useRef(0);
  const issue = (c: CameraRequest) => {
    commandSeq.current += 1;
    setCameraCommand({ ...c, seq: commandSeq.current });
  };
  // dimensions / colours steps: full-model view (on entering the step, not on first render)
  const prevStep = useRef(activeStep);
  useEffect(() => {
    if (prevStep.current === activeStep) return;
    prevStep.current = activeStep;
    if (activeStep === 'size' || activeStep === 'color') issue({ kind: 'model' });
  }, [activeStep]);
  // a section picked (tab or 3D tap): frame it (interior) or its door(s) (doors step)
  const lastSelectionSeq = useRef(selectionSeq);
  useEffect(() => {
    if (lastSelectionSeq.current === selectionSeq) return;
    lastSelectionSeq.current = selectionSeq;
    const b = sectionBoxes.find((s) => s.index === selectedSection);
    if (!b || !picking) return;
    const t = view.result.panels.find((p) => p.id === 'side-left')?.thicknessMm ?? 16;
    const doorsStep = activeStep === 'doors';
    const mm: [number, number, number, number, number, number] = doorsStep
      ? [b.x0 - t / 2, b.x1 + t / 2, b.y0 - t, b.y1 + t, D - 30, D]
      : [b.x0, b.x1, b.y0, b.y1, b.z0, D];
    const box: FrameBox = {
      min: [(mm[0] - W / 2) * MM, mm[2] * MM, (mm[4] - D / 2) * MM],
      max: [(mm[1] - W / 2) * MM, mm[3] * MM, (mm[5] - D / 2) * MM],
    };
    issue({ kind: 'selection', box, id: `${doorsStep ? 'door' : 'section'}-${b.index}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only an explicit selection moves the camera
  }, [selectionSeq]);

  // ---- presentation reveal (driven in the render loop; React hears discrete events) ----
  const [director] = useState(() => new RevealDirector());
  const [generation, setGeneration] = useState(0);
  const [revealUi, setRevealUi] = useState<RevealUi>(REVEAL_IDLE);
  const doorOverride = useRef<number | null>(null);
  const confettiRef = useRef<ConfettiHandle | null>(null);
  const cameraApi = useRef<CameraApi | null>(null);
  const onRevealEventsRef = useRef(onRevealEvents);
  onRevealEventsRef.current = onRevealEvents;

  const handleRevealEvents = useCallback((events: RevealEvent[]) => {
    if (events.length === 0) return;
    setRevealUi((prev) => ({
      running: prev.running && !events.includes('done'),
      title: prev.title || events.includes('title'),
      doorsClosed: prev.doorsClosed || events.includes('doorsClosed'),
    }));
    onRevealEventsRef.current?.(events);
  }, []);

  const runId = presentation?.runId ?? null;
  useEffect(() => {
    if (!presentation) {
      director.cancel();
      setRevealUi(REVEAL_IDLE);
      return;
    }
    director.cancel();
    director.start(presentation.kind, hasDoors && doorsOpen ? 1 : 0);
    setDoorsOpen(false); // the reveal ends with closed doors; they stay closed afterwards
    setGeneration((g) => g + 1);
    if (director.isRunning) {
      setRevealUi({ running: true, title: false, doorsClosed: false });
    } else {
      // none / instant (reduced motion): final state directly
      setRevealUi(REVEAL_IDLE);
      handleRevealEvents(director.skip());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one start per presentation run
  }, [runId]);

  const skipReveal = () => {
    const events = director.skip();
    setGeneration((g) => g + 1);
    setRevealUi((prev) => ({ ...prev, running: false }));
    handleRevealEvents(events);
  };

  return (
    <div className={presenting ? 'viewer presenting' : 'viewer'} {...tap} data-testid="viewer">
      <Scene
        view={view}
        dims={dims}
        dimRegistry={dimRegistry}
        toWorld={toWorld}
        remPx={remPx}
        lineScale={uiScale}
        product={product}
        extent={extent}
        resetToken={resetToken}
        doorsOpen={hasDoors && doorsOpen}
        interactive={picking}
        cameraCommand={cameraCommand}
        pointerDown={pointerDown}
        sectionBoxes={sectionBoxes}
        selectedSection={selectedSection}
        onSectionTap={(i) => onSelectSection?.(i)}
        theme={theme}
        cameraApi={cameraApi}
        cameraLocked={revealUi.running}
        doorOverride={doorOverride}
        reveal={
          presenting
            ? {
                director,
                generation,
                kind: presentation.kind,
                confetti: confettiRef,
                onEvents: handleRevealEvents,
              }
            : null
        }
      />
      <DimensionSvg dims={dims} registry={dimRegistry} remPx={remPx} />

      {presenting && (
        <>
          <img className="present-logo" src={logoUrl} alt={t('app.brand')} draggable={false} />
          <Confetti ref={confettiRef} />
          {revealUi.title && (
            <div className="present-title" role="status" data-testid="present-title">
              <SuccessIcon className="present-title-icon" />
              <div>
                <h2>{t('present.title')}</h2>
                <p>{t('present.subtitle')}</p>
              </div>
            </div>
          )}
          {revealUi.running && (
            <button type="button" className="btn btn-floating present-skip" onClick={skipReveal}>
              {t('present.skip')}
            </button>
          )}
          {revealUi.doorsClosed && presentationContent}
        </>
      )}

      <div className="viewer-actions" hidden={presenting && revealUi.running}>
        {hasDoors && !presenting && (
          <button
            type="button"
            className="btn btn-floating"
            aria-pressed={doorsOpen}
            onClick={() => setDoorsOpen((o) => !o)}
          >
            {doorsOpen ? t('viewer.doorsClose') : t('viewer.doorsOpen')}
          </button>
        )}
        <button type="button" className="btn btn-floating" onClick={reframe}>
          <ReframeIcon />
          {t('viewer.reframe')}
        </button>
      </div>
      {!presenting && <p className="viewer-hint">{t('viewer.hint')}</p>}
      {invalid && (
        <div className="viewer-stale" role="alert">
          <StatusMessage tone="error" role="note" className="viewer-invalid">
            {t('viewer.invalid')}
          </StatusMessage>
        </div>
      )}
    </div>
  );
}
