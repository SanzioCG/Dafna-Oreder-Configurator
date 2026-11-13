/**
 * D-10b: a picture of each mechanism on its brand option, so the customer sees what goes into the
 * cabinet. Real product photos from Dafna go to apps/web/public/hardware/ and are listed in
 * PHOTOS ("<kind>-<brand>" -> file); until a photo is listed, a drawn sketch of the mechanism
 * type is shown (cup hinge / damper / side-mounted ball-bearing slide / hidden under-mount slide).
 */

export type MechKind = 'hinge' | 'slide';

/** "<kind>-<brand>" -> public path. Add a line when Dafna sends the photo. */
export const PHOTOS: Record<string, string> = {};

export function mechPhotoSrc(kind: MechKind, brand: string): string | null {
  return PHOTOS[`${kind}-${brand}`] ?? null;
}

const AMBER = '#ffad1f';
const METAL = '#9aa3ad';
const DARK = '#4a525b';
const WOOD = '#d9c4a3';

function HingeSketch({ soft }: { soft: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      {/* door edge with the 35 mm cup */}
      <rect x="6" y="10" width="14" height="44" rx="2" fill={WOOD} />
      <circle cx="20" cy="32" r="10" fill={METAL} stroke={DARK} strokeWidth="2" />
      <circle cx="20" cy="32" r="5" fill={DARK} />
      {/* arm to the mounting plate */}
      <rect
        x="22"
        y="27"
        width="28"
        height="10"
        rx="3"
        fill={AMBER}
        stroke={DARK}
        strokeWidth="1.5"
      />
      <rect
        x="46"
        y="20"
        width="10"
        height="24"
        rx="2"
        fill={METAL}
        stroke={DARK}
        strokeWidth="1.5"
      />
      {soft && (
        // the soft-close damper in the arm
        <rect x="27" y="29.5" width="14" height="5" rx="2.5" fill={DARK} />
      )}
    </svg>
  );
}

function SlideSketch({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      {/* drawer box seen from the front: sides + bottom */}
      <rect x="12" y="16" width="40" height="28" rx="2" fill={WOOD} />
      <rect x="16" y="20" width="32" height="22" fill="#fff" opacity="0.7" />
      {hidden ? (
        // under-mount: two runners under the bottom
        <>
          <rect
            x="14"
            y="46"
            width="12"
            height="6"
            rx="1.5"
            fill={AMBER}
            stroke={DARK}
            strokeWidth="1.5"
          />
          <rect
            x="38"
            y="46"
            width="12"
            height="6"
            rx="1.5"
            fill={AMBER}
            stroke={DARK}
            strokeWidth="1.5"
          />
        </>
      ) : (
        // side-mounted ball-bearing runners beside the sides
        <>
          <rect
            x="4"
            y="24"
            width="6"
            height="14"
            rx="1.5"
            fill={AMBER}
            stroke={DARK}
            strokeWidth="1.5"
          />
          <rect
            x="54"
            y="24"
            width="6"
            height="14"
            rx="1.5"
            fill={AMBER}
            stroke={DARK}
            strokeWidth="1.5"
          />
          <circle cx="7" cy="28" r="1.4" fill={DARK} />
          <circle cx="7" cy="34" r="1.4" fill={DARK} />
          <circle cx="57" cy="28" r="1.4" fill={DARK} />
          <circle cx="57" cy="34" r="1.4" fill={DARK} />
        </>
      )}
    </svg>
  );
}

export function MechPhoto({ kind, brand, alt }: { kind: MechKind; brand: string; alt: string }) {
  const src = mechPhotoSrc(kind, brand);
  const soft = brand === 'hettich';
  return (
    <span className="mech-photo" data-testid={`mech-photo-${kind}-${brand}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : kind === 'hinge' ? (
        <HingeSketch soft={soft} />
      ) : (
        <SlideSketch hidden={soft} />
      )}
    </span>
  );
}
