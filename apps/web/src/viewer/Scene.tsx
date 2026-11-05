import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { TOUCH } from 'three';
import type { ViewGeometry } from '../state/useConfigurator';
import { CameraRig, type FrameBox } from './CameraRig';
import { DimensionProjector, type DimRegistry } from './DimensionOverlay';
import type { DimSpec, V3 } from './dimensions';
import { cssToken } from '../theme/cssToken';
import { SectionPicker, type SectionBox } from './SectionPicker';
import { SoftFloorShadow } from './SoftFloorShadow';
import { Wardrobe3D } from './Wardrobe3D';

export const MM = 0.001;

export interface SceneProps {
  view: ViewGeometry;
  dims: DimSpec[];
  dimRegistry: DimRegistry;
  toWorld: (p: V3) => V3;
  remPx: number;
  lineScale: number;
  product: FrameBox;
  extent: FrameBox;
  resetToken: number;
  doorsOpen: boolean;
  /** interior step: section hit volumes + selected outline */
  interactive: boolean;
  sectionBoxes: SectionBox[];
  selectedSection: number | null;
  onSectionTap: (index: number) => void;
  /** current UI theme: re-renders the scene so themed colours (edges, shadow) update */
  theme?: string;
}

/**
 * Everything that needs WebGL. Kept separate from <Viewer> (overlays, buttons, labels) so the
 * viewer shell can be tested in jsdom with this module mocked.
 */
export function Scene({
  view,
  dims,
  dimRegistry,
  toWorld,
  remPx,
  lineScale,
  product,
  extent,
  resetToken,
  doorsOpen,
  interactive,
  sectionBoxes,
  selectedSection,
  onSectionTap,
}: SceneProps) {
  const { widthMm: W, depthMm: D } = view;
  // Single-layer layout: the canvas is transparent and sits on the page background
  // (tokens.css --bg); there is no floor plane, so no visible floor edge.
  const shadowColor = cssToken('--stage-shadow', '#2a2928');
  const shadowOpacity = Number(cssToken('--stage-shadow-opacity', '0.8')) || 0.8;
  return (
    <Canvas
      dpr={[1, 2]}
      shadows="percentage"
      camera={{ fov: 32, near: 0.05, far: 200, position: [2, 1.6, 5] }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      {/*
        Lighting for legibility on a light background: ONE directional key light (front-left,
        above) casting shadows into the carcass and door gaps, plus a soft hemisphere ambient
        (sky slightly brighter than ground) so faces facing away stay readable but darker.
      */}
      <hemisphereLight args={['#ffffff', '#b9bcc2', 1.15]} />
      <directionalLight
        position={[-2.2, 4.5, 4]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      <group scale={MM} position={[(-W / 2) * MM, 0, (-D / 2) * MM]}>
        <Wardrobe3D panels={view.result.panels} rails={view.result.rails} doorsOpen={doorsOpen} />
        {interactive && (
          <SectionPicker
            boxes={sectionBoxes}
            selected={selectedSection}
            onTap={onSectionTap}
            lineScale={lineScale}
          />
        )}
      </group>
      <DimensionProjector dims={dims} registry={dimRegistry} toWorld={toWorld} remPx={remPx} />

      {/*
        Floor = soft contact shadow only (no floor plane, no edge). The key light's own floor
        shadow is not used: on a transparent canvas it read as a hard grey slab. The key light
        still shadows the carcass interior and door gaps.
      */}
      <SoftFloorShadow
        widthM={W * MM}
        depthM={D * MM}
        color={shadowColor}
        opacity={shadowOpacity}
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
      <CameraRig product={product} extent={extent} resetToken={resetToken} />
    </Canvas>
  );
}
