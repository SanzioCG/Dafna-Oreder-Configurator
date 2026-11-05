import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { TOUCH } from 'three';
import type { ViewGeometry } from '../state/useConfigurator';
import { CameraRig, type FrameBox } from './CameraRig';
import {
  DimensionLines,
  LabelProjector,
  type DimSpec,
  type LabelRefs,
  type V3,
} from './Dimensions';
import { cssToken } from '../theme/cssToken';
import { Wardrobe3D } from './Wardrobe3D';

export const MM = 0.001;

export interface SceneProps {
  view: ViewGeometry;
  dims: DimSpec[];
  anchors: { key: string; world: V3 }[];
  labelRefs: LabelRefs;
  lineScale: number;
  box: FrameBox;
  resetToken: number;
  doorsOpen: boolean;
}

/**
 * Everything that needs WebGL. Kept separate from <Viewer> (overlays, buttons, labels) so the
 * viewer shell can be tested in jsdom with this module mocked.
 */
export function Scene({
  view,
  dims,
  anchors,
  labelRefs,
  lineScale,
  box,
  resetToken,
  doorsOpen,
}: SceneProps) {
  const { widthMm: W, depthMm: D } = view;
  const floor = 60; // m — large enough that its edge is always lost in the fog
  // The 3D stage is always a neutral studio (tokens.css --stage-*), never a brand colour.
  const stageBg = cssToken('--stage-bg', '#eef0f3');
  const stageFloor = cssToken('--stage-floor', '#e6e8ec');
  return (
    <Canvas
      dpr={[1, 2]}
      shadows="percentage"
      camera={{ fov: 32, near: 0.05, far: 200, position: [2, 1.6, 5] }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
    >
      <color attach="background" args={[stageBg]} />
      <fog attach="fog" args={[stageBg, 9, 24]} />
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
        <Wardrobe3D panels={view.result.panels} doorsOpen={doorsOpen} />
        <DimensionLines dims={dims} lineScale={lineScale} />
      </group>
      <LabelProjector anchors={anchors} labelRefs={labelRefs} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]} receiveShadow>
        <planeGeometry args={[floor, floor]} />
        <meshStandardMaterial color={stageFloor} roughness={1} />
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
  );
}
