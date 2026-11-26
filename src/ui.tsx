import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";

// The dark counterpart of the light scheme below: the same green seed, as Material 3
// derives it for dark surfaces. Kept as one block because it applies in two situations
// (the device asks for dark, or the player chose it), and both must get identical values.
// Every colour in the app comes from these names, so nothing else needs to know the theme.
const darkScheme = css`
  color-scheme: dark;

  --md-sys-color-primary: #9cd67d;
  --md-sys-color-on-primary: #0d3900;
  --md-sys-color-primary-container: #205107;
  --md-sys-color-on-primary-container: #b7f397;
  --md-sys-color-secondary: #bdcbb0;
  --md-sys-color-on-secondary: #283420;
  --md-sys-color-secondary-container: #3e4a36;
  --md-sys-color-on-secondary-container: #d9e7cb;
  --md-sys-color-tertiary: #a0cfd0;
  --md-sys-color-on-tertiary: #003738;
  --md-sys-color-tertiary-container: #1e4e50;
  --md-sys-color-on-tertiary-container: #bcebec;
  --md-sys-color-error: #ffb4ab;
  --md-sys-color-on-error: #690005;
  --md-sys-color-error-container: #93000a;
  --md-sys-color-on-error-container: #ffdad6;
  --md-sys-color-background: #11140f;
  --md-sys-color-on-background: #e1e4da;
  --md-sys-color-surface: #11140f;
  --md-sys-color-on-surface: #e1e4da;
  --md-sys-color-surface-variant: #424940;
  --md-sys-color-on-surface-variant: #c2c9bc;
  --md-sys-color-outline: #8c9388;
  --md-sys-color-outline-variant: #424940;
  /* These five follow how the app uses them, not Material's dark ordering. In this app
     "lowest" is the card and input surface and "high" is what sits on a card (the own-row
     highlight, chips, the dialog). On a dark page a raised surface has to be lighter than
     what is under it, so the steps climb from the page colour upwards. */
  --md-sys-color-surface-container-lowest: #1d211b;
  --md-sys-color-surface-container-low: #1f231d;
  --md-sys-color-surface-container: #222620;
  --md-sys-color-surface-container-high: #272b25;
  --md-sys-color-surface-container-highest: #32362f;

  --app-warning: #f2be48;
  /* The champion's gold: bright here, where the surfaces are dark. */
  --belt-gold: #ffd54f;
  --belt-gold-container: #4a3a00;
  --on-belt-gold-container: #ffe08a;
  /* The light theme's red and blue are too dark to read on these surfaces. */
  --team-red: #ff8a80;
  --team-blue: #82b1ff;

  --md-state-on-primary-08: rgba(13, 57, 0, 0.08);
  --md-state-on-primary-12: rgba(13, 57, 0, 0.12);
  --md-state-primary-08: rgba(156, 214, 125, 0.08);
  --md-state-primary-12: rgba(156, 214, 125, 0.12);
  --md-state-on-secondary-container-08: rgba(217, 231, 203, 0.08);
  --md-state-on-secondary-container-12: rgba(217, 231, 203, 0.12);
  --md-state-disabled-bg: rgba(225, 228, 218, 0.12);
  --md-state-disabled-content: rgba(225, 228, 218, 0.38);
  --md-pulse: 156, 214, 125;

  /* Shadows barely show on a dark page; the lighter card surfaces do the lifting. */
  --md-elevation-1: 0 1px 2px rgba(0, 0, 0, 0.5), 0 1px 3px 1px rgba(0, 0, 0, 0.3);
  --md-elevation-2: 0 1px 2px rgba(0, 0, 0, 0.5), 0 2px 6px 2px rgba(0, 0, 0, 0.35);
`;

export const GlobalStyles = () => (
  <Global
    styles={css`
      :root {
        color-scheme: light;

        /* Material 3 color scheme — light, green seed */
        --md-sys-color-primary: #386a20;
        --md-sys-color-on-primary: #ffffff;
        --md-sys-color-primary-container: #b7f397;
        --md-sys-color-on-primary-container: #042100;
        --md-sys-color-secondary: #55624c;
        --md-sys-color-on-secondary: #ffffff;
        --md-sys-color-secondary-container: #d9e7cb;
        --md-sys-color-on-secondary-container: #131f0d;
        --md-sys-color-tertiary: #19686a;
        --md-sys-color-on-tertiary: #ffffff;
        --md-sys-color-tertiary-container: #bcebec;
        --md-sys-color-on-tertiary-container: #002021;
        --md-sys-color-error: #ba1a1a;
        --md-sys-color-on-error: #ffffff;
        --md-sys-color-error-container: #ffdad6;
        --md-sys-color-on-error-container: #410002;
        --md-sys-color-background: #edf1ea;
        --md-sys-color-on-background: #191d17;
        --md-sys-color-surface: #edf1ea;
        --md-sys-color-on-surface: #191d17;
        --md-sys-color-surface-variant: #dde5d8;
        --md-sys-color-on-surface-variant: #424940;
        --md-sys-color-outline: #72796d;
        --md-sys-color-outline-variant: #c2c9bc;
        --md-sys-color-surface-container-lowest: #ffffff;
        --md-sys-color-surface-container-low: #f7faf4;
        --md-sys-color-surface-container: #f1f5ee;
        --md-sys-color-surface-container-high: #ebefe8;
        --md-sys-color-surface-container-highest: #e6eae3;

        /* App accent — amber, used for countdown warnings */
        --app-warning: #815600;
        /* The champion's gold. A true yellow can't be read on a white card, so in this
           theme it is a deep gold: 5.8:1 on a card and 5.0:1 on the grey of a
           highlighted row, where small text needs 4.5:1. The badge and the banner carry
           the brighter gold as their background instead. */
        --belt-gold: #855f00;
        --belt-gold-container: #ffe9a8;
        --on-belt-gold-container: #3d2e00;
        /* The two sides of the table. Deep enough to read as small text on the grey rows
           of the match history (4.8:1 and 4.9:1; the brighter #d32f2f and #1976d2 used
           before fell just short of the 4.5:1 that small text needs). */
        --team-red: #c62828;
        --team-blue: #1565c0;

        /* State layers */
        --md-state-on-primary-08: rgba(255, 255, 255, 0.08);
        --md-state-on-primary-12: rgba(255, 255, 255, 0.12);
        --md-state-primary-08: rgba(56, 106, 32, 0.08);
        --md-state-primary-12: rgba(56, 106, 32, 0.12);
        --md-state-on-secondary-container-08: rgba(19, 31, 13, 0.08);
        --md-state-on-secondary-container-12: rgba(19, 31, 13, 0.12);
        --md-state-disabled-bg: rgba(26, 28, 24, 0.12);
        --md-state-disabled-content: rgba(26, 28, 24, 0.38);
        /* The primary colour as bare red, green, blue, for the pulse's fading ring. */
        --md-pulse: 56, 106, 32;

        /* Elevation */
        --md-elevation-1: 0 1px 2px rgba(0, 0, 0, 0.2), 0 1px 3px 1px rgba(0, 0, 0, 0.1);
        --md-elevation-2: 0 1px 2px rgba(0, 0, 0, 0.2), 0 2px 6px 2px rgba(0, 0, 0, 0.12);

        /* Shape scale */
        --md-shape-small: 8px;
        --md-shape-medium: 12px;
        --md-shape-large: 16px;
        --md-shape-full: 9999px;
      }

      /* Dark when the device asks for it, unless the player picked light; and dark when
         the player picked it, whatever the device says. The choice is the data-theme
         attribute on the root element, set in src/theme.ts. */
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) {
          ${darkScheme}
        }
      }

      :root[data-theme="dark"] {
        ${darkScheme}
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
        color: var(--md-sys-color-on-surface);
        background: var(--md-sys-color-background);
      }

      h2 {
        /* M3 title-large */
        font-size: 1.375rem;
        line-height: 1.75rem;
        font-weight: 500;
        letter-spacing: 0;
        margin: 0 0 0.75rem;
        color: var(--md-sys-color-on-surface);
      }

      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(var(--md-pulse), 0.4);
        }
        70% {
          box-shadow: 0 0 0 9px rgba(var(--md-pulse), 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(var(--md-pulse), 0);
        }
      }

      @keyframes chipIn {
        from {
          opacity: 0;
          transform: translateY(5px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      /* The two teams of a full match arrive from opposite sides. */
      @keyframes slideInLeft {
        from {
          opacity: 0;
          transform: translateX(-110%);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(110%);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes popIn {
        from {
          opacity: 0;
          transform: scale(0);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes riseIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      /* A newcomer's leaderboard place landing in its slot. */
      @keyframes dropIn {
        from {
          opacity: 0;
          transform: translateY(-2.2rem) scale(0.5);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      /* One piece of confetti: thrown from its start point along its own --dx/--dy,
         spinning by --spin, and gone by the time it lands. */
      @keyframes confetti {
        from {
          opacity: 1;
          transform: translate(0, 0) rotate(0);
        }
        to {
          opacity: 0;
          transform: translate(var(--dx), var(--dy)) rotate(var(--spin));
        }
      }

      /* Everything above is decoration: with reduced motion each animation lands on its
         last frame at once, so content appears in place and the confetti is never seen. */
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }
      }
    `}
  />
);

export const Wrapper = styled.main`
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
`;

export const TopBar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1.75rem;
`;

export const Brand = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  user-select: none;
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--md-sys-color-on-surface);
`;

export const RodMark = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 30 30" fill="none" role="img" aria-label="Foosball">
    <rect x="3" y="6" width="24" height="3" rx="1.5" fill="var(--md-sys-color-primary)" />
    <rect x="6" y="9" width="3.4" height="11" rx="1.7" fill="var(--md-sys-color-primary)" />
    <rect x="13.3" y="9" width="3.4" height="11" rx="1.7" fill="var(--md-sys-color-primary)" />
    <rect x="20.6" y="9" width="3.4" height="11" rx="1.7" fill="var(--md-sys-color-primary)" />
    <circle cx="15" cy="24.5" r="2.4" fill="var(--md-sys-color-tertiary)" />
  </svg>
);

export const Card = styled.section`
  /* M3 elevated card */
  background: var(--md-sys-color-surface-container-lowest);
  border: none;
  border-radius: var(--md-shape-large);
  padding: 1.25rem 1.4rem;
  margin-bottom: 1rem;
  box-shadow: var(--md-elevation-1);
`;

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
`;

export const Input = styled.input`
  /* M3 outlined text field */
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-shape-small);
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface-container-lowest);
  &::placeholder {
    color: var(--md-sys-color-on-surface-variant);
  }
  &:hover:not(:focus):not(:disabled) {
    border-color: var(--md-sys-color-on-surface);
  }
  &:focus {
    outline: none;
    border-color: var(--md-sys-color-primary);
    box-shadow: inset 0 0 0 1px var(--md-sys-color-primary);
  }
`;

export const Select = styled.select`
  /* M3 outlined text field */
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-shape-small);
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface-container-lowest);
  cursor: pointer;
  &:hover:not(:focus):not(:disabled) {
    border-color: var(--md-sys-color-on-surface);
  }
  &:focus {
    outline: none;
    border-color: var(--md-sys-color-primary);
    box-shadow: inset 0 0 0 1px var(--md-sys-color-primary);
  }
`;

export const Button = styled.button`
  /* M3 outlined button */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 40px;
  padding: 0 1.5rem;
  border: 1px solid var(--md-sys-color-outline);
  background: transparent;
  color: var(--md-sys-color-primary);
  border-radius: var(--md-shape-full);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  letter-spacing: 0.1px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, box-shadow 0.15s, color 0.15s;
  &:hover:not(:disabled) {
    background-color: var(--md-state-primary-08);
  }
  &:focus-visible {
    outline: none;
    background-color: var(--md-state-primary-12);
  }
  &:active:not(:disabled) {
    background-color: var(--md-state-primary-12);
  }
  &:disabled {
    cursor: not-allowed;
    color: var(--md-state-disabled-content);
    border-color: var(--md-state-disabled-bg);
    background: transparent;
  }
`;

export const PrimaryButton = styled(Button)`
  /* M3 filled button */
  background-color: var(--md-sys-color-primary);
  border-color: transparent;
  color: var(--md-sys-color-on-primary);
  &:hover:not(:disabled) {
    background-color: var(--md-sys-color-primary);
    background-image: linear-gradient(var(--md-state-on-primary-08), var(--md-state-on-primary-08));
    box-shadow: var(--md-elevation-1);
  }
  &:focus-visible:not(:disabled) {
    background-color: var(--md-sys-color-primary);
    background-image: linear-gradient(var(--md-state-on-primary-12), var(--md-state-on-primary-12));
  }
  &:active:not(:disabled) {
    background-color: var(--md-sys-color-primary);
    background-image: linear-gradient(var(--md-state-on-primary-12), var(--md-state-on-primary-12));
    box-shadow: none;
  }
  &:disabled {
    background-color: var(--md-state-disabled-bg);
    background-image: none;
    border-color: transparent;
    color: var(--md-state-disabled-content);
    box-shadow: none;
  }
`;

export const Hint = styled.p`
  /* M3 body-medium */
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface-variant);
`;

export const Badge = styled.span`
  /* M3 tonal chip */
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: var(--md-shape-full);
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
  letter-spacing: 0.1px;
`;

export const ChampionBadge = styled(Badge)`
  background: var(--belt-gold-container);
  color: var(--on-belt-gold-container);
  white-space: nowrap;
`;

export const TonalButton = styled(Button)`
  /* M3 filled-tonal button */
  background-color: var(--md-sys-color-secondary-container);
  border-color: transparent;
  color: var(--md-sys-color-on-secondary-container);
  &:hover:not(:disabled) {
    background-color: var(--md-sys-color-secondary-container);
    background-image: linear-gradient(
      var(--md-state-on-secondary-container-08),
      var(--md-state-on-secondary-container-08)
    );
    box-shadow: var(--md-elevation-1);
  }
  &:active:not(:disabled) {
    background-image: linear-gradient(
      var(--md-state-on-secondary-container-12),
      var(--md-state-on-secondary-container-12)
    );
    box-shadow: none;
  }
  &:disabled {
    background-color: var(--md-state-disabled-bg);
    background-image: none;
    color: var(--md-state-disabled-content);
  }
`;

export const TextButton = styled(Button)`
  /* M3 text button */
  border-color: transparent;
  padding: 0 0.75rem;
`;

export const Icon = styled.span<{ size?: number; fill?: number }>`
  font-family: "Material Symbols Rounded";
  font-weight: normal;
  font-style: normal;
  font-size: ${(props) => props.size ?? 20}px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
  font-variation-settings: "FILL" ${(props) => props.fill ?? 0}, "wght" 400, "GRAD" 0, "opsz" 24;
`;

// The name of the player who holds the championship belt (see src/belt.ts): gold, with a
// small medal so the colour is not the only thing that says so.
const Gold = styled.span`
  color: var(--belt-gold);
  font-weight: 600;
  & > [aria-hidden] {
    vertical-align: -0.15em;
    margin-right: 0.3em;
  }
`;

const Unseen = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

const Medal = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.05em;
`;

const MedalCount = styled.span`
  font-size: 0.8em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`;

// The medal that marks the champion. Once they have defended the belt, the number of
// times they have done so stands beside it.
export const BeltMedal = ({ defences = 0, size = 15 }: { defences?: number; size?: number }) => (
  <Medal aria-hidden>
    <Icon size={size} fill={1}>
      workspace_premium
    </Icon>
    {defences > 0 && <MedalCount>{defences}</MedalCount>}
  </Medal>
);

const defended = (defences: number): string =>
  defences > 0 ? `, defended ${defences === 1 ? "once" : `${defences} times`}` : "";

// A player's name, in gold if they are the champion. `medal` can be turned off where a
// label right beside the name already says "Champion" and room is short. `defences` is
// how many times the champion has defended the belt, shown beside the medal.
export const PlayerName = ({
  name,
  champion,
  medal = true,
  defences = 0,
}: {
  name: React.ReactNode;
  champion: boolean;
  medal?: boolean;
  defences?: number;
}) =>
  champion ? (
    <Gold title={`Champion: holds the belt${defended(defences)}`}>
      {medal && <BeltMedal defences={defences} />}
      {name}
      {medal && <Unseen> (champion{defended(defences)})</Unseen>}
    </Gold>
  ) : (
    <>{name}</>
  );

export const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--md-shape-full);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  &:hover:not(:disabled) {
    background: var(--md-state-primary-08);
    color: var(--md-sys-color-primary);
  }
  &:active:not(:disabled) {
    background: var(--md-state-primary-12);
  }
  &:disabled {
    color: var(--md-state-disabled-content);
    cursor: not-allowed;
  }
`;

export const Avatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: var(--md-shape-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  font-weight: 600;
  font-size: 0.9rem;
  overflow: hidden;
  flex: none;
  & img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export const FilledCard = styled(Card)`
  /* M3 filled card — lower emphasis, no shadow */
  background: var(--md-sys-color-surface-container-high);
  box-shadow: none;
`;

export const OutlinedCard = styled(Card)`
  /* M3 outlined card — lowest emphasis */
  background: var(--md-sys-color-surface-container-lowest);
  box-shadow: none;
  border: 1px solid var(--md-sys-color-outline-variant);
`;

export const Eyebrow = styled.div`
  /* M3 overline — section label */
  display: flex;
  align-items: center;
  gap: 0.4rem;
  text-transform: uppercase;
  font-size: 0.6875rem;
  line-height: 1rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 0.6rem;
`;

export const Mono = styled.span`
  font-family: "Roboto Mono", ui-monospace, "SFMono-Regular", monospace;
  font-weight: 500;
  letter-spacing: 0.04em;
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  padding: 0.05rem 0.4rem;
  border-radius: 6px;
`;

export const StatValue = styled.div`
  font-size: 2rem;
  line-height: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface);
`;

export const LiveDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  display: inline-block;
  background: var(--md-sys-color-primary);
  animation: pulse 1.8s ease-out infinite;
`;

const RingWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
`;

const RingBox = styled.div`
  position: relative;
  width: 48px;
  height: 48px;
  flex: none;
`;

const RingTime = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface);
`;

const RingLabel = styled.div`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const ringColor = (tone: "primary" | "warning" | "error") =>
  tone === "error"
    ? "var(--md-sys-color-error)"
    : tone === "warning"
      ? "var(--app-warning)"
      : "var(--md-sys-color-primary)";

type CountdownRingProps = {
  remainingMs: number;
  totalMs: number;
  timeText: string;
  label: string;
  tone?: "primary" | "warning" | "error";
};

export const CountdownRing = ({
  remainingMs,
  totalMs,
  timeText,
  label,
  tone = "primary",
}: CountdownRingProps) => {
  const size = 48;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const dashOffset = circumference * (1 - fraction);

  return (
    <RingWrap role="timer">
      <RingBox>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--md-sys-color-surface-container-highest)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor(tone)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.5s linear" }}
          />
        </svg>
        <RingTime>{timeText}</RingTime>
      </RingBox>
      <RingLabel>{label}</RingLabel>
    </RingWrap>
  );
};

export const Dialog = styled.dialog`
  /* M3 basic dialog */
  width: min(24rem, calc(100vw - 2rem));
  padding: 1.5rem;
  border: none;
  border-radius: 28px;
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-elevation-2);
  &::backdrop {
    background: rgba(0, 0, 0, 0.32);
  }
`;

export const Rating = styled.span`
  /* An Elo rating shown beside a name: quiet, and fixed-width so columns line up */
  font-family: "Roboto Mono", ui-monospace, "SFMono-Regular", monospace;
  font-size: 0.75rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface-variant);
`;

export const Delta = styled.span<{ value: number }>`
  /* Rating points gained (green) or lost (red) */
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${(props) =>
    props.value > 0
      ? "var(--md-sys-color-primary)"
      : props.value < 0
        ? "var(--md-sys-color-error)"
        : "var(--md-sys-color-on-surface-variant)"};
`;

// A slim, rounded scroll bar in the app palette, for scroll areas inside a surface.
// Chromium and Safari get the ::-webkit- rules, which allow a rounded thumb with no arrow
// buttons. The standard properties would switch those rules off there, so they are kept
// for browsers without them (Firefox).
export const thinScrollbar = css`
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    border-radius: var(--md-shape-full);
    background: var(--md-sys-color-outline-variant);
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--md-sys-color-outline);
  }
  @supports not selector(::-webkit-scrollbar) {
    scrollbar-width: thin;
    scrollbar-color: var(--md-sys-color-outline-variant) transparent;
  }
`;
