import { brandItem, hingesForDoor, type Panel, type Rail } from '@dafna/engine';
import { Edges } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { MeshBasicMaterial, MeshStandardMaterial, type Group, type Mesh } from 'three';
import { edgeColorFor, materialFor } from './materials';
import { DOOR_OPEN_DEG, openAngles } from './doorSwing';
import {
  DOOR_CLEAR,
  DRAWER_IN_MM,
  DRAWER_SHOW_PULL,
  MECH_COLOR,
  demoProgress,
  doorCoverage,
  drawerGroups,
  hingeOffsets,
  panelBox,
  type MechanismView,
  type MotionState,
} from './mechanisms';

const DEG = Math.PI / 180;
export const DOOR_ANIM_SECONDS = 0.4;

/** The board itself. Engine local frame: length X, thickness Y, width Z (mm). */
function Board({ panel, position }: { panel: Panel; position: [number, number, number] }) {
  const [rx, ry, rz] = panel.rotation;
  return (
    <mesh
      position={position}
      rotation={[rx * DEG, ry * DEG, rz * DEG]}
      material={materialFor(panel.material, panel.lengthMm, panel.widthMm)}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[panel.lengthMm, panel.thicknessMm, panel.widthMm]} />
      <Edges color={edgeColorFor(panel.material)} threshold={15} />
    </mesh>
  );
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/**
 * A door leaf that swings around its hinge edge. The pivot is the hinge-side edge of the
 * door's FRONT face, so the leaf's thickness turns away from a neighbour on the same partition:
 * two leaves on one partition never intersect up to 90° (they open to 85°). Left-hinged doors
 * rotate by -angle, right-hinged by +angle around Y, towards the viewer (+Z).
 */
function DoorLeaf({
  panel,
  open,
  angleDeg,
  override,
  demo,
  children,
  motion,
  covers,
}: {
  panel: Panel;
  open: boolean;
  angleDeg: number;
  /** scripted progress (presentation reveal), null = follow `open` */
  override?: MutableRefObject<number | null>;
  /** D-10: closing demo of the hinge ("Ko'rish"), null = none */
  demo?: MutableRefObject<number | null>;
  /** D-10: hinge glyphs (pivot-local coordinates) */
  children?: ReactNode;
  /** shared door / drawer state: the leaf stays open while a drawer behind it is out */
  motion?: MotionState;
  /** drawers behind this leaf */
  covers?: string[];
}) {
  const pivot = useRef<Group>(null);
  const progress = useRef(open ? 1 : 0);
  const [x, y, z] = panel.position;
  const sign = panel.hingeSide === 'right' ? 1 : -1;
  const half = panel.lengthMm / 2;
  const hingeX = panel.hingeSide === 'right' ? x + half : x - half;
  const frontZ = z + panel.thicknessMm / 2;

  useFrame((_, dt) => {
    // a drawer behind this leaf is still out: the leaf may not close through it
    const blocked = (covers ?? []).some((id) => (motion?.drawer.get(id) ?? 0) > DRAWER_IN_MM);
    let forced = override?.current ?? demo?.current ?? null;
    if (forced !== null && blocked) forced = Math.max(forced, progress.current);
    const target = open || blocked ? 1 : 0;
    const p = progress.current;
    if (forced !== null) {
      // the reveal drives the leaf (already eased); keep progress in sync for the hand-back
      progress.current = forced;
      if (pivot.current) pivot.current.rotation.y = sign * angleDeg * DEG * forced;
    } else {
      if (p !== target) {
        const step = Math.min(dt, 0.1) / DOOR_ANIM_SECONDS;
        progress.current = target > p ? Math.min(1, p + step) : Math.max(0, p - step);
      }
      if (pivot.current) {
        pivot.current.rotation.y = sign * angleDeg * DEG * easeInOut(progress.current);
      }
    }
    motion?.door.set(panel.id, progress.current);
  });

  return (
    <group ref={pivot} position={[hingeX, y, frontZ]}>
      <Board panel={panel} position={[-sign * half, 0, -panel.thicknessMm / 2]} />
      {children}
    </group>
  );
}

/** Hanging rail: a metal cylinder along X. */
function RailMesh({ rail }: { rail: Rail }) {
  return (
    <mesh position={rail.position} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[rail.diameterMm / 2, rail.diameterMm / 2, rail.lengthMm, 24]} />
      <meshStandardMaterial color="#b9bdc4" metalness={0.75} roughness={0.3} />
    </mesh>
  );
}

// ---- D-10 mechanisms: cup hinges, drawer slides, closing demo ----

const mechMaterial = new MeshStandardMaterial({
  color: MECH_COLOR,
  emissive: MECH_COLOR,
  emissiveIntensity: 0.35,
  metalness: 0.4,
  roughness: 0.35,
});
const mechFixedMaterial = new MeshStandardMaterial({
  color: '#c9861a',
  metalness: 0.5,
  roughness: 0.4,
});
const damperMaterial = new MeshStandardMaterial({
  color: '#8a9099',
  metalness: 0.7,
  roughness: 0.3,
});

// a soft glowing halo around each mechanism, pulsing, so the customer spots it at a glance
const haloMaterial = new MeshBasicMaterial({
  color: MECH_COLOR,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

function Halo({ radius, position }: { radius: number; position?: [number, number, number] }) {
  const mesh = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (mesh.current) mesh.current.scale.setScalar(1 + 0.25 * Math.sin(clock.elapsedTime * 4));
  });
  return (
    <mesh ref={mesh} position={position} material={haloMaterial}>
      <sphereGeometry args={[radius, 20, 14]} />
    </mesh>
  );
}

/**
 * Cup hinges of one leaf (pivot-local: x = 0 is the hinge edge, z = 0 the front face): a 35 mm
 * cup drilled 22.5 mm from the edge plus the arm going back into the carcass; Hettich (soft
 * close) also shows its damper. Count by leaf height (the same rule as the bill of materials).
 */
function DoorHinges({ panel, sign, brand }: { panel: Panel; sign: number; brand: string }) {
  const h = panel.widthMm;
  const t = panel.thicknessMm;
  const offsets = hingeOffsets(h, hingesForDoor(panel));
  return (
    <>
      {offsets.map((o) => {
        const y = o - h / 2;
        return (
          <group key={o} position={[-sign * 22.5, y, -t]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -2]} material={mechMaterial}>
              <cylinderGeometry args={[17.5, 17.5, 5, 24]} />
            </mesh>
            <Halo radius={40} position={[0, 0, -45]} />
            <mesh position={[sign * 2, 0, -28]} material={mechMaterial}>
              <boxGeometry args={[12, 22, 50]} />
            </mesh>
            {brandItem('hinge', brand)?.softClose === true && (
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                position={[-sign * 10, 15, -20]}
                material={damperMaterial}
              >
                <cylinderGeometry args={[5, 5, 30, 12]} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

interface SlideBar {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
}

/**
 * Slides of one drawer in product mm: `moving` members travel with the drawer, `fixed` ones
 * stay on the carcass. Strax ball slides are side-mounted (on the drawer sides); Hettich
 * Quadro runners are concealed under the drawer bottom.
 */
export function slideBars(
  parts: Panel[],
  brand: string,
): { moving: SlideBar[]; fixed: SlideBar[] } {
  const sides = parts.filter((p) => p.role === 'drawer_side').map(panelBox);
  const bottom = parts.find((p) => p.role === 'drawer_bottom');
  const moving: SlideBar[] = [];
  const fixed: SlideBar[] = [];
  const cx = sides.reduce((s, b) => s + (b.min[0] + b.max[0]) / 2, 0) / Math.max(1, sides.length);
  sides.forEach((b, i) => {
    const left = (b.min[0] + b.max[0]) / 2 < cx;
    const len = b.max[2] - b.min[2] - 10;
    const z = (b.min[2] + b.max[2]) / 2;
    // D-28: hidden (under-mount) slides: Hettich Quadro, Samet Smart Slide / Slidea
    if (brandItem('slide', brand)?.slideMount === 'under') {
      const y0 = Math.min(b.min[1], bottom ? panelBox(bottom).min[1] : b.min[1]);
      const x = left ? b.max[0] : b.min[0];
      moving.push({ key: `m${i}`, position: [x, y0 - 6, z], size: [18, 12, len] });
      fixed.push({ key: `f${i}`, position: [x, y0 - 16, z], size: [18, 8, len] });
    } else {
      const y = (b.min[1] + b.max[1]) / 2;
      const face = left ? b.min[0] : b.max[0];
      const out = left ? -1 : 1;
      moving.push({ key: `m${i}`, position: [face + out * 4, y, z], size: [8, 30, len] });
      fixed.push({ key: `f${i}`, position: [face + out * 10.5, y, z], size: [5, 38, len] });
    }
  });
  return { moving, fixed };
}

function Bars({ bars, material }: { bars: SlideBar[]; material: MeshStandardMaterial }) {
  return (
    <>
      {bars.map((b) => (
        <mesh key={b.key} position={b.position} material={material}>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
    </>
  );
}

/** A drawer that slides out along +Z (hardware step / closing demo). */
function Drawer({
  id,
  parts,
  mech,
  demo,
  motion,
  doors,
}: {
  id: string;
  parts: Panel[];
  mech?: MechanismView;
  demo: MutableRefObject<number | null>;
  motion: MotionState;
  /** doors in front of this drawer: it waits until they are open */
  doors: string[];
}) {
  const group = useRef<Group>(null);
  const offset = useRef(0);
  const sides = parts.filter((p) => p.role === 'drawer_side').map(panelBox);
  const depth = sides[0] ? sides[0].max[2] - sides[0].min[2] : 400;
  const pull = DRAWER_SHOW_PULL * depth;
  const show = mech?.show ?? false;
  const slideBrand = mech?.slideBrand ?? 'strax';
  const bars = useMemo(
    () => (show ? slideBars(parts, slideBrand) : null),
    [parts, show, slideBrand],
  );
  useFrame((_, dt) => {
    const forced = demo.current;
    // behind doors: out only once every door in front of it is open (and not during the
    // hinge demo, which closes those doors)
    const clear =
      doors.length === 0 ||
      (!motion.holdDrawers && doors.every((d) => (motion.door.get(d) ?? 0) >= DOOR_CLEAR));
    if (forced !== null && clear) offset.current = pull * forced;
    else {
      const target = show && clear ? pull : 0;
      const step = (Math.min(dt, 0.1) / DOOR_ANIM_SECONDS) * pull;
      const d = target - offset.current;
      offset.current += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }
    if (group.current) group.current.position.z = offset.current;
    motion.drawer.set(id, offset.current);
  });
  return (
    <>
      <group ref={group}>
        {parts.map((p) => (
          <Board
            key={`${p.id}:${p.lengthMm}:${p.widthMm}:${p.thicknessMm}:${p.material}`}
            panel={p}
            position={p.position}
          />
        ))}
        {bars && <Bars bars={bars.moving} material={mechMaterial} />}
      </group>
      {bars && <Bars bars={bars.fixed} material={mechFixedMaterial} />}
    </>
  );
}

/** Plays the "Ko'rish" demo: writes the door or drawer progress refs in the render loop. */
function DemoDriver({
  mech,
  doorDemo,
  drawerDemo,
  motion,
}: {
  mech?: MechanismView;
  doorDemo: MutableRefObject<number | null>;
  drawerDemo: MutableRefObject<number | null>;
  motion: MotionState;
}) {
  const start = useRef<number | null>(null);
  const demo = mech?.show ? mech.demo : null;
  useEffect(() => {
    start.current = null;
    doorDemo.current = null;
    drawerDemo.current = null;
    // the hinge demo closes the doors: the drawers behind them go in first
    motion.holdDrawers = demo?.kind === 'hinge';
  }, [demo, doorDemo, drawerDemo, motion]);
  useFrame(({ clock }) => {
    if (!demo) return;
    if (start.current === null) {
      if (demo.kind === 'hinge' && [...motion.drawer.values()].some((v) => v > DRAWER_IN_MM))
        return; // wait until every drawer is back in
      start.current = clock.elapsedTime;
    }
    const p = demoProgress(demo.brand, clock.elapsedTime - start.current);
    const target = demo.kind === 'hinge' ? doorDemo : drawerDemo;
    target.current = p;
    if (p === null) motion.holdDrawers = false; // finished: the drawers may come out again
  });
  return null;
}

/** Renders panels and rails in product millimetre coordinates (parent group scales to metres). */
export function Wardrobe3D({
  panels,
  rails = [],
  doorsOpen,
  doorOverride,
  mech,
}: {
  panels: Panel[];
  rails?: Rail[];
  doorsOpen: boolean;
  doorOverride?: MutableRefObject<number | null>;
  /** D-10: hardware step (open / pull out / highlight) and the closing demo */
  mech?: MechanismView;
}) {
  const angles = useMemo(() => openAngles(panels), [panels]);
  const drawers = useMemo(() => drawerGroups(panels), [panels]);
  const inDrawer = useMemo(() => new Set([...drawers.values()].flat().map((p) => p.id)), [drawers]);
  const doorDemo = useRef<number | null>(null);
  const drawerDemo = useRef<number | null>(null);
  const show = mech?.show ?? false;
  // doors open before the drawers behind them come out; drawers go in before doors close
  const coverage = useMemo(() => doorCoverage(panels), [panels]);
  const doorsOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [door, list] of coverage)
      for (const d of list) m.set(d, [...(m.get(d) ?? []), door]);
    return m;
  }, [coverage]);
  const motion = useRef<MotionState>({ door: new Map(), drawer: new Map(), holdDrawers: false });
  return (
    <>
      <DemoDriver mech={mech} doorDemo={doorDemo} drawerDemo={drawerDemo} motion={motion.current} />
      {[...drawers].map(([id, parts]) => (
        <Drawer
          key={id}
          id={id}
          parts={parts}
          mech={mech}
          demo={drawerDemo}
          motion={motion.current}
          doors={doorsOf.get(id) ?? []}
        />
      ))}
      {rails.map((r) => (
        <RailMesh key={`${r.id}:${r.lengthMm}:${r.position.join(',')}`} rail={r} />
      ))}
      {panels.map((p) => {
        if (inDrawer.has(p.id)) return null;
        // Re-mount on size/material change so geometry and edges are rebuilt together.
        const key = `${p.id}:${p.lengthMm}:${p.widthMm}:${p.thicknessMm}:${p.material}`;
        return p.role === 'door' ? (
          <DoorLeaf
            key={key}
            panel={p}
            open={doorsOpen}
            angleDeg={angles.get(p.id) ?? DOOR_OPEN_DEG}
            override={doorOverride}
            demo={doorDemo}
            motion={motion.current}
            covers={coverage.get(p.id) ?? []}
          >
            {show && (
              <DoorHinges
                panel={p}
                sign={p.hingeSide === 'right' ? 1 : -1}
                brand={mech?.hingeBrand ?? 'strax'}
              />
            )}
          </DoorLeaf>
        ) : (
          <Board key={key} panel={p} position={p.position} />
        );
      })}
    </>
  );
}
