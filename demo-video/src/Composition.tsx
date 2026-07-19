import { loadFont as loadBarlow } from "@remotion/google-fonts/Barlow";
import { loadFont as loadPlexMono } from "@remotion/google-fonts/IBMPlexMono";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

const FPS = 30;
const TOTAL_FRAMES = 165 * FPS;
const SCREENSHOT_WIDTH = 1810;
const SCREENSHOT_HEIGHT = 1018;
const DEEP = "#091624";
const PANEL = "#16304F";
const CHALK = "#DDE9F5";
const FADED = "#7390AD";
const REDLINE = "#E8474F";
const AMBER = "#EFA93B";
const WHITE = "#F5F9FD";

const { fontFamily: barlow } = loadBarlow("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
});
const { fontFamily: plexMono } = loadPlexMono("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
});

type FocusBox = {
  height: string;
  left: string;
  top: string;
  width: string;
};

type CameraTarget = {
  scale: number;
  x: number;
  y: number;
};

type ScreenshotBeatProps = {
  accent?: string;
  cameraFrom?: CameraTarget;
  cameraStart?: number;
  cameraTo: CameraTarget;
  detail: string;
  duration: number;
  focus: FocusBox;
  image: string;
  kicker: string;
  title: string;
};

const WIDE_CAMERA: CameraTarget = { scale: 1, x: 50, y: 50 };

const fadeForScene = (frame: number, duration: number) =>
  interpolate(frame, [0, 14, duration - 18, duration], [0, 1, 1, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const Grid = () => (
  <AbsoluteFill
    style={{
      backgroundColor: DEEP,
      backgroundImage:
        "linear-gradient(rgba(115,144,173,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(115,144,173,.08) 1px, transparent 1px)",
      backgroundSize: "54px 54px",
    }}
  />
);

const Brand = ({ accent = REDLINE }: { accent?: string }) => (
  <div
    style={{
      alignItems: "center",
      display: "flex",
      gap: 16,
      position: "absolute",
      right: 58,
      top: 46,
    }}
  >
    <div style={{ backgroundColor: accent, height: 4, width: 72 }} />
    <div
      style={{
        color: CHALK,
        fontFamily: barlow,
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: 4,
      }}
    >
      STATE GAP MAPPER
    </div>
  </div>
);

const CenteredScene: React.FC<{
  children: React.ReactNode;
  duration: number;
  showBrand?: boolean;
}> = ({ children, duration, showBrand = false }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: DEEP,
        color: CHALK,
        display: "flex",
        justifyContent: "center",
        opacity: fadeForScene(frame, duration),
      }}
    >
      <Grid />
      {showBrand ? <Brand /> : null}
      {children}
    </AbsoluteFill>
  );
};

const ScreenshotBeat: React.FC<ScreenshotBeatProps> = ({
  accent = REDLINE,
  cameraFrom = WIDE_CAMERA,
  cameraStart = 38,
  cameraTo,
  detail,
  duration,
  focus,
  image,
  kicker,
  title,
}) => {
  const frame = useCurrentFrame();
  const cameraDuration = 26;
  const cameraProgress = interpolate(
    frame,
    [cameraStart, cameraStart + cameraDuration],
    [0, 1],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const cameraScale = interpolate(cameraProgress, [0, 1], [cameraFrom.scale, cameraTo.scale]);
  const cameraX = interpolate(cameraProgress, [0, 1], [cameraFrom.x, cameraTo.x]);
  const cameraY = interpolate(cameraProgress, [0, 1], [cameraFrom.y, cameraTo.y]);
  const desiredX = SCREENSHOT_WIDTH / 2 - (cameraX / 100) * SCREENSHOT_WIDTH * cameraScale;
  const desiredY = SCREENSHOT_HEIGHT / 2 - (cameraY / 100) * SCREENSHOT_HEIGHT * cameraScale;
  const translateX = Math.max(SCREENSHOT_WIDTH * (1 - cameraScale), Math.min(0, desiredX));
  const translateY = Math.max(SCREENSHOT_HEIGHT * (1 - cameraScale), Math.min(0, desiredY));
  const captionOpacity = interpolate(frame, [0, 15, 40, 58], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const focusOpacity = interpolate(
    frame,
    [14, 28, cameraStart + cameraDuration + 20, duration - 24, duration - 10],
    [0, 1, 0.66, 0.66, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: DEEP,
        opacity: fadeForScene(frame, duration),
      }}
    >
      <Grid />
      <div
        style={{
          border: `1px solid ${FADED}88`,
          borderRadius: 24,
          boxShadow: "0 34px 100px rgba(0, 0, 0, 0.45)",
          height: SCREENSHOT_HEIGHT,
          left: 55,
          overflow: "hidden",
          position: "absolute",
          top: 31,
          width: SCREENSHOT_WIDTH,
        }}
      >
        <div
          style={{
            height: SCREENSHOT_HEIGHT,
            left: 0,
            position: "absolute",
            top: 0,
            transform: `translate(${translateX}px, ${translateY}px) scale(${cameraScale})`,
            transformOrigin: "0 0",
            width: SCREENSHOT_WIDTH,
            willChange: "transform",
          }}
        >
          <Img
            src={staticFile(image)}
            style={{ height: "100%", objectFit: "cover", width: "100%" }}
          />
          <div
            style={{
              border: `3px solid ${accent}`,
              borderRadius: 16,
              boxShadow: `0 0 0 7px ${accent}22, 0 0 34px ${accent}66`,
              height: focus.height,
              left: focus.left,
              opacity: focusOpacity,
              position: "absolute",
              top: focus.top,
              width: focus.width,
            }}
          />
        </div>
        <div
          style={{
            background:
              "linear-gradient(180deg, rgba(9,22,36,.92) 0%, rgba(9,22,36,.3) 48%, transparent 100%)",
            height: 250,
            left: 0,
            opacity: captionOpacity,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />
      </div>

      <div
        style={{
          backgroundColor: "rgba(9, 22, 36, 0.94)",
          border: `1px solid ${FADED}66`,
          borderLeft: `7px solid ${accent}`,
          borderRadius: 14,
          boxShadow: "0 20px 54px rgba(0,0,0,.35)",
          left: 84,
          opacity: captionOpacity,
          padding: "24px 34px 25px",
          position: "absolute",
          top: 62,
          translate: `${interpolate(frame, [0, 20], [-28, 0], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px 0px`,
          width: 850,
        }}
      >
        <div
          style={{
            color: accent,
            fontFamily: plexMono,
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: 2.5,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            color: WHITE,
            fontFamily: barlow,
            fontSize: 52,
            fontWeight: 600,
            letterSpacing: -0.7,
            lineHeight: 1,
            marginTop: 9,
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: CHALK,
            fontFamily: barlow,
            fontSize: 25,
            lineHeight: 1.25,
            marginTop: 12,
          }}
        >
          {detail}
        </div>
      </div>
      <Brand accent={accent} />
    </AbsoluteFill>
  );
};

const Problem = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  return (
    <CenteredScene duration={duration} showBrand>
      <div style={{ maxWidth: 1540, position: "relative", textAlign: "center" }}>
        <div
          style={{
            color: FADED,
            fontFamily: plexMono,
            fontSize: 29,
            letterSpacing: 3.5,
            marginBottom: 36,
          }}
        >
          FEATURE SPECS DESCRIBE WHAT SHOULD HAPPEN
        </div>
        <div
          style={{
            fontFamily: barlow,
            fontSize: 126,
            fontWeight: 600,
            letterSpacing: -3,
            lineHeight: 0.92,
            opacity: interpolate(frame, [4, 28], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `0px ${interpolate(frame, [4, 28], [30, 0], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px`,
          }}
        >
          What happens in the
          <br />
          <span style={{ color: REDLINE }}>states they forgot?</span>
        </div>
        <div
          style={{
            color: CHALK,
            fontFamily: barlow,
            fontSize: 33,
            lineHeight: 1.35,
            margin: "46px auto 0",
            maxWidth: 1080,
          }}
        >
          Turn behavioral prose into an explainable state machine, then redline every missing behavior.
        </div>
      </div>
    </CenteredScene>
  );
};

const Architecture = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const items = [
    {
      accent: AMBER,
      label: "GPT-5.6 / JUDGMENT",
      title: "Understand the prose",
      lines: ["Structured extraction", "Relevance ranking + rationale", "Target and event suggestions"],
    },
    {
      accent: REDLINE,
      label: "TYPESCRIPT / GUARANTEE",
      title: "Protect completeness",
      lines: ["Runtime decode + validation", "Full structural gap matrix", "Evidence, coverage, and test stubs"],
    },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: DEEP,
        color: CHALK,
        opacity: fadeForScene(frame, duration),
        padding: "78px 104px",
      }}
    >
      <Grid />
      <Brand accent={AMBER} />
      <div style={{ position: "relative" }}>
        <div
          style={{
            color: FADED,
            fontFamily: plexMono,
            fontSize: 25,
            letterSpacing: 3,
          }}
        >
          ARCHITECTURE / THE HONESTY MODEL
        </div>
        <div
          style={{
            color: WHITE,
            fontFamily: barlow,
            fontSize: 88,
            fontWeight: 600,
            letterSpacing: -2,
            lineHeight: 1,
            marginTop: 18,
          }}
        >
          AI judgment. Deterministic completeness.
        </div>
        <div style={{ display: "flex", gap: 34, marginTop: 56 }}>
          {items.map((item, index) => (
            <div
              key={item.label}
              style={{
                backgroundColor: PANEL,
                border: `1px solid ${FADED}77`,
                borderTop: `7px solid ${item.accent}`,
                borderRadius: 20,
                flex: 1,
                minHeight: 495,
                opacity: interpolate(frame, [12 + index * 10, 34 + index * 10], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                padding: "42px 48px",
                translate: `0px ${interpolate(
                  frame,
                  [12 + index * 10, 34 + index * 10],
                  [26, 0],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                )}px`,
              }}
            >
              <div
                style={{
                  color: item.accent,
                  fontFamily: plexMono,
                  fontSize: 23,
                  fontWeight: 600,
                  letterSpacing: 2,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  color: WHITE,
                  fontFamily: barlow,
                  fontSize: 55,
                  fontWeight: 600,
                  lineHeight: 1.05,
                  marginTop: 22,
                }}
              >
                {item.title}
              </div>
              <div style={{ display: "grid", gap: 19, marginTop: 38 }}>
                {item.lines.map((line) => (
                  <div
                    key={line}
                    style={{
                      alignItems: "center",
                      color: CHALK,
                      display: "flex",
                      fontFamily: barlow,
                      fontSize: 30,
                      gap: 17,
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: item.accent,
                        borderRadius: "50%",
                        display: "inline-block",
                        height: 10,
                        width: 10,
                      }}
                    />
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            border: `1px solid ${FADED}66`,
            borderRadius: 14,
            color: CHALK,
            fontFamily: plexMono,
            fontSize: 27,
            marginTop: 30,
            padding: "23px 30px",
            textAlign: "center",
          }}
        >
          GPT-5.6 can order Structural Gaps. It can never add or hide one.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CodexStory = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const steps = ["TRACE", "BUILD", "TEST", "HARDEN", "DEPLOY", "VERIFY"];
  return (
    <AbsoluteFill
      style={{
        backgroundColor: DEEP,
        color: CHALK,
        opacity: fadeForScene(frame, duration),
        padding: "88px 106px",
      }}
    >
      <Grid />
      <Brand />
      <div style={{ position: "relative" }}>
        <div
          style={{
            color: REDLINE,
            fontFamily: plexMono,
            fontSize: 25,
            fontWeight: 600,
            letterSpacing: 3,
          }}
        >
          BUILT WITH CODEX + GPT-5.6
        </div>
        <div
          style={{
            color: WHITE,
            fontFamily: barlow,
            fontSize: 92,
            fontWeight: 600,
            letterSpacing: -2.5,
            lineHeight: 0.98,
            marginTop: 24,
            maxWidth: 1500,
          }}
        >
          Codex was the implementation partner,
          <br />
          not a code autocomplete.
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 51 }}>
          {steps.map((step, index) => (
            <div
              key={step}
              style={{
                backgroundColor: index === steps.length - 1 ? REDLINE : PANEL,
                border: `1px solid ${index === steps.length - 1 ? REDLINE : FADED + "77"}`,
                borderRadius: 10,
                color: WHITE,
                flex: 1,
                fontFamily: plexMono,
                fontSize: 25,
                fontWeight: 600,
                letterSpacing: 1.5,
                opacity: interpolate(frame, [10 + index * 6, 24 + index * 6], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                padding: "19px 12px",
                textAlign: "center",
              }}
            >
              {step}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 28, marginTop: 35 }}>
          <div
            style={{
              backgroundColor: PANEL,
              border: `1px solid ${FADED}66`,
              borderRadius: 18,
              flex: 1,
              minHeight: 310,
              padding: "36px 40px",
            }}
          >
            <div style={{ color: AMBER, fontFamily: plexMono, fontSize: 22, letterSpacing: 2 }}>
              HUMAN DIRECTION
            </div>
            <div style={{ fontFamily: barlow, fontSize: 34, lineHeight: 1.42, marginTop: 20 }}>
              Product position, architecture records, two-tier honesty model, and the redline design language.
            </div>
          </div>
          <div
            style={{
              backgroundColor: PANEL,
              border: `1px solid ${FADED}66`,
              borderRadius: 18,
              flex: 1,
              minHeight: 310,
              padding: "36px 40px",
            }}
          >
            <div style={{ color: REDLINE, fontFamily: plexMono, fontSize: 22, letterSpacing: 2 }}>
              CODEX EXECUTION
            </div>
            <div style={{ fontFamily: barlow, fontSize: 34, lineHeight: 1.42, marginTop: 20 }}>
              Domain code, tests, interface, production debugging, deployment, verification, and this Remotion demo.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Close = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  return (
    <CenteredScene duration={duration}>
      <div style={{ maxWidth: 1540, position: "relative", textAlign: "center" }}>
        <div
          style={{
            backgroundColor: REDLINE,
            height: 7,
            margin: "0 auto 43px",
            width: interpolate(frame, [5, 28], [0, 220], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
        <div
          style={{
            color: WHITE,
            fontFamily: barlow,
            fontSize: 116,
            fontWeight: 600,
            letterSpacing: -3,
            lineHeight: 0.95,
          }}
        >
          Prose in. Missing behavior redlined.
        </div>
        <div
          style={{
            color: REDLINE,
            fontFamily: plexMono,
            fontSize: 38,
            fontWeight: 600,
            letterSpacing: 1.5,
            marginTop: 48,
          }}
        >
          EVIDENCE ATTACHED. TESTABLE DECISIONS OUT.
        </div>
        <div
          style={{
            color: CHALK,
            fontFamily: barlow,
            fontSize: 40,
            marginTop: 60,
          }}
        >
          State Gap Mapper
        </div>
        <div
          style={{
            color: FADED,
            fontFamily: plexMono,
            fontSize: 28,
            marginTop: 16,
          }}
        >
          state-gap-mapper-build.vercel.app
        </div>
      </div>
    </CenteredScene>
  );
};

const StateGapMapperDemo = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: DEEP }}>
      <Sequence name="Problem" durationInFrames={510}>
        <Problem duration={510} />
      </Sequence>
      <Sequence name="Input" from={474} durationInFrames={267}>
        <ScreenshotBeat
          cameraStart={22}
          cameraTo={{ scale: 1.34, x: 10.5, y: 66 }}
          detail="Paste prose or load a cached sample."
          duration={267}
          focus={{ height: "12%", left: "1%", top: "60%", width: "19%" }}
          image="screenshots/demo/01-fresh-workspace.jpg"
          kicker="01 / INPUT"
          title="Start with the behavior"
        />
      </Sequence>
      <Sequence name="Map" from={711} durationInFrames={561}>
        <ScreenshotBeat
          cameraStart={22}
          cameraTo={{ scale: 1.18, x: 49, y: 42 }}
          detail="GPT-5.6 extracts. TypeScript finds every structural hole."
          duration={561}
          focus={{ height: "51%", left: "23%", top: "17%", width: "52%" }}
          image="screenshots/demo/02-mapped-checkout.jpg"
          kicker="02 / MAP"
          title="See the whole state machine"
        />
      </Sequence>
      <Sequence name="Evidence" from={1242} durationInFrames={488}>
        <ScreenshotBeat
          cameraFrom={{ scale: 1.18, x: 49, y: 42 }}
          cameraStart={22}
          cameraTo={{ scale: 1.5, x: 87, y: 24.5 }}
          detail="The top gap points back to sentences 2 and 5."
          duration={488}
          focus={{ height: "28%", left: "75.5%", top: "10.5%", width: "23%" }}
          image="screenshots/demo/02-mapped-checkout.jpg"
          kicker="03 / EVIDENCE"
          title="processing × cancel is unexplained"
        />
      </Sequence>
      <Sequence name="Decide" from={1700} durationInFrames={151}>
        <ScreenshotBeat
          cameraStart={22}
          cameraTo={{ scale: 1.45, x: 50, y: 42.5 }}
          detail="You choose the target. Nothing rewrites itself."
          duration={151}
          focus={{ height: "38%", left: "36%", top: "27%", width: "28%" }}
          image="screenshots/demo/03-accept-target-dialog.jpg"
          kicker="04 / DECIDE"
          title="Make the product decision"
        />
      </Sequence>
      <Sequence name="Resolve" from={1821} durationInFrames={296}>
        <ScreenshotBeat
          cameraStart={71}
          cameraTo={{ scale: 1.35, x: 29, y: 89 }}
          detail="Added edge, updated coverage, ready-to-copy test stub."
          duration={296}
          focus={{ height: "17.5%", left: "1.5%", top: "82%", width: "55%" }}
          image="screenshots/demo/04-resolved-edge-test-stub.jpg"
          kicker="05 / OUTPUT"
          title="Turn the answer into engineering"
        />
      </Sequence>
      <Sequence name="Suggested Event" from={2087} durationInFrames={372}>
        <ScreenshotBeat
          accent={AMBER}
          cameraStart={128}
          cameraTo={{ scale: 1.5, x: 87, y: 66 }}
          detail="A separate AI suggestion, with 94% Confidence."
          duration={372}
          focus={{ height: "22%", left: "75.5%", top: "56%", width: "23%" }}
          image="screenshots/demo/05-signup-suggestion-cascade.jpg"
          kicker="06 / SUGGEST"
          title="Add a creative second tier"
        />
      </Sequence>
      <Sequence name="Cascade" from={2429} durationInFrames={280}>
        <ScreenshotBeat
          cameraStart={22}
          cameraTo={{ scale: 1.45, x: 87, y: 28 }}
          detail="One new event reveals three missing transitions."
          duration={280}
          focus={{ height: "38%", left: "75.5%", top: "9%", width: "23%" }}
          image="screenshots/demo/06-suggestion-cascade-result.jpg"
          kicker="07 / CASCADE"
          title="A suggestion feeds the gap engine"
        />
      </Sequence>
      <Sequence name="Live Editor" from={2679} durationInFrames={96}>
        <ScreenshotBeat
          cameraStart={22}
          cameraTo={{ scale: 1.38, x: 64.5, y: 42 }}
          detail="Edits validate before changing the machine."
          duration={96}
          focus={{ height: "70%", left: "54%", top: "7%", width: "21%" }}
          image="screenshots/demo/07-live-machine-editor.jpg"
          kicker="08 / EDIT"
          title="Edit the machine directly"
        />
      </Sequence>
      <Sequence name="Live Edge" from={2745} durationInFrames={302}>
        <ScreenshotBeat
          cameraStart={21}
          cameraTo={{ scale: 1.42, x: 43, y: 35.5 }}
          detail="No model call is required."
          duration={302}
          focus={{ height: "17%", left: "31%", top: "27%", width: "24%" }}
          image="screenshots/demo/08-live-gap-recompute.jpg"
          kicker="09 / RECOMPUTE"
          title="The edge lands immediately"
        />
      </Sequence>
      <Sequence name="Gap Count" from={3017} durationInFrames={116}>
        <ScreenshotBeat
          cameraFrom={{ scale: 1.42, x: 43, y: 35.5 }}
          cameraStart={21}
          cameraTo={{ scale: 1.6, x: 87, y: 7.5 }}
          detail="Deterministic analysis drops 11 → 10."
          duration={116}
          focus={{ height: "8%", left: "75.5%", top: "3.5%", width: "23%" }}
          image="screenshots/demo/08-live-gap-recompute.jpg"
          kicker="10 / VERIFY"
          title="See the result immediately"
        />
      </Sequence>
      <Sequence name="Architecture" from={3103} durationInFrames={734}>
        <Architecture duration={734} />
      </Sequence>
      <Sequence name="Codex" from={3807} durationInFrames={646}>
        <CodexStory duration={646} />
      </Sequence>
      <Sequence name="Close" from={4423} durationInFrames={527}>
        <Close duration={527} />
      </Sequence>
      <Sequence name="Narration" from={36} durationInFrames={4684}>
        <Audio src={staticFile("audio/narration-demo-paced.mp3")} volume={0.96} />
      </Sequence>
      <div
        style={{
          backgroundColor: PANEL,
          bottom: 0,
          height: 8,
          left: 0,
          position: "absolute",
          right: 0,
        }}
      >
        <div
          style={{
            backgroundColor: REDLINE,
            height: "100%",
            width: `${interpolate(frame, [0, TOTAL_FRAMES - 1], [0, 100], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}%`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const DemoComposition = () => (
  <Composition
    id="StateGapMapperDemo"
    component={StateGapMapperDemo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
