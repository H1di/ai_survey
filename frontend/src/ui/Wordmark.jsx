import { useHomeNav } from "./homeNav";
import lockupSvg from "../assets/invector-lockup.svg?raw";
import markSvg from "../assets/invector-mark.svg?raw";
import wordSvg from "../assets/invector-word.svg?raw";
import "./ui.css";

// The Invector logo. `hero` (entry and sign-in) is the stacked lockup, the
// bird above the wordmark; every step header uses the bird mark with the
// wordmark beside it. The SVGs are inlined so their ink follows currentColor;
// the name itself is carried by visually hidden text. When a home handler is
// published (everywhere but the entry screen, which is already home) the mark
// becomes the link back to the start page.
function Svg({ source, className }) {
  // Local, checked-in assets — not user content.
  return <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: source }} />;
}

export default function Wordmark({ tone = "screen" }) {
  const onHome = useHomeNav();

  const mark =
    tone === "hero" ? (
      <>
        <Svg source={lockupSvg} className="wordmark-lockup" />
        <span className="sr-only">Invector</span>
      </>
    ) : (
      <>
        <Svg source={markSvg} className="wordmark-mark" />
        <Svg source={wordSvg} className="wordmark-word" />
        <span className="sr-only">Invector</span>
      </>
    );

  if (!onHome) {
    return <div className={`wordmark wordmark--${tone}`}>{mark}</div>;
  }

  return (
    <button
      type="button"
      className={`wordmark wordmark--${tone} wordmark--link`}
      onClick={onHome}
      title="Back to the start page"
    >
      {mark}
    </button>
  );
}
