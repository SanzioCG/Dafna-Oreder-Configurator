import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { TOUCH } from 'three';
import { useI18n } from '../i18n/I18n';
import type { ViewGeometry } from '../state/useConfigurator';
import { CameraRig, type FrameBox } from './CameraRig';
import {
  DIMENSION_MARGIN,
  DimensionLabels,
  DimensionLines,
  LabelProjector,
  buildDimensions,
  midpoint,
  type V3,
} from './Dimensions';
import { Wardrobe3D } from './Wardrobe3D';

interface ViewerProps {
  view: ViewGeometry;
  invalid: boolean;
}

const MM = 0.001;

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

export function Viewer({ view, invalid }: ViewerProps) {
  const { t } = useI18n();
  const [resetToken, setResetToken] = useState(0);
  const reframe = () => setResetToken((n) => n + 1);
  const tap = useDoubleTap(reframe);
  const { widthMm: W, heightMm: H, depthMm: D } = view;

  // World space is metres with the product centred on the origin, standing on the floor (y=0).
  const box = useMemo<FrameBox>(
    () => ({
      min: [(-W / 2) * MM, 0, (-D / 2) * MM],
      max: [(W / 2 + DIMENSION_MARGIN.right) * MM, (H + DIMENSION_MARGIN.top) * MM, (D / 2) * MM],
    }),
    [W, H, D],
  );
  const floor = 60; // m — large enough that its edge is always lost in the fog

  const unit = t('unit.mm');
  const sections = view.result.sections;
  const dims = useMemo(() => buildDimensions(W, H, D, sections, unit), [W, H, D, sections, unit]);
  // Label anchors in world metres (same transform as the product group below).
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
      <Canvas
        dpr={[1, 2]}
        shadows="percentage"
        camera={{ fov: 32, near: 0.05, far: 200, position: [2, 1.6, 5] }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
      >
        <color attach="background" args={['#eef0f3']} />
        <fog attach="fog" args={['#eef0f3', 9, 24]} />
        <hemisphereLight args={['#ffffff', '#c9ccd2', 1.25]} />
        <directionalLight
          position={[2.5, 5, 4]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-4}
          shadow-camera-right={4}
          shadow-camera-top={4}
          shadow-camera-bottom={-4}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-3, 2, -2]} intensity={0.35} />

        <group scale={MM} position={[(-W / 2) * MM, 0, (-D / 2) * MM]}>
          <Wardrobe3D panels={view.result.panels} />
          <DimensionLines dims={dims} lineScale={uiScale} />
        </group>
        <LabelProjector anchors={anchors} labelRefs={labelRefs} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]} receiveShadow>
          <planeGeometry args={[floor, floor]} />
          <meshStandardMaterial color="#e6e8ec" roughness={1} />
        </mesh>
        <ContactShadows
          position={[0, 0.0005, 0]}
          scale={Math.max(W, D) * MM * 2.2}
          opacity={0.5}
          blur={2.2}
          far={1.2}
          resolution={512}
        />

        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.7}
          maxPolarAngle={Math.PI / 2 - 0.04}
          touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
        />
        <CameraRig box={box} resetToken={resetToken} />
      </Canvas>
      <DimensionLabels dims={dims} labelRefs={labelRefs} />

      <button type="button" className="btn btn-floating reframe" onClick={reframe}>
        ⤢ {t('viewer.reframe')}
      </button>
      <p className="viewer-hint">{t('viewer.hint')}</p>
      {invalid && <p className="viewer-invalid">{t('viewer.invalid')}</p>}
    </div>
  );
}
