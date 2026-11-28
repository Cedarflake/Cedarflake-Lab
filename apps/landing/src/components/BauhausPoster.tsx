import { siteConfig } from "../config/site"
import { labStats } from "../lib/projectCatalog"

// Studio core.py SHAPE_PATH, scaled to the original 132px counter with both contours intact.
const brandOuterCutoutPath =
  "M466 182C472.219 182 478.096 184.498 483.305 188.937C486.734 191.86 491.036 193.642 495.528 194C502.349 194.544 508.271 196.933 512.669 201.331C517.067 205.729 519.457 211.651 520 218.472C520.358 222.964 522.14 227.266 525.063 230.695C529.502 235.903 532 241.781 532 248C532 254.219 529.502 260.096 525.063 265.305C522.14 268.734 520.358 273.036 520 277.527C519.457 284.349 517.067 290.271 512.669 294.669C508.271 299.067 502.349 301.457 495.527 302C491.036 302.358 486.734 304.14 483.305 307.063C478.096 311.502 472.219 314 466 314C459.781 314 453.903 311.502 448.695 307.063C445.266 304.14 440.964 302.358 436.472 302C429.651 301.457 423.729 299.067 419.331 294.669C414.933 290.271 412.544 284.349 412 277.527C411.642 273.036 409.86 268.734 406.937 265.305C402.498 260.096 400 254.219 400 248C400 241.781 402.498 235.904 406.937 230.695C409.86 227.266 411.642 222.964 412 218.472C412.544 211.651 414.933 205.729 419.331 201.331C423.729 196.933 429.651 194.544 436.472 194C440.964 193.642 445.266 191.86 448.696 188.937C453.904 184.498 459.781 182 466 182Z"
const brandInnerCutoutPath =
  "M466.038 224.999C462.681 224.999 459.61 227.081 457.244 230.529C456.789 231.193 456.054 231.617 455.251 231.68C451.083 232.004 447.744 233.623 446.065 236.53C444.387 239.437 444.654 243.138 446.458 246.91C446.805 247.637 446.805 248.485 446.458 249.211C444.655 252.984 444.387 256.685 446.065 259.592C447.744 262.5 451.083 264.118 455.251 264.443C456.054 264.505 456.789 264.929 457.244 265.593C459.61 269.041 462.681 271.123 466.038 271.123C469.394 271.123 472.466 269.041 474.831 265.593C475.286 264.929 476.021 264.505 476.824 264.443C480.992 264.118 484.332 262.5 486.01 259.592C487.689 256.685 487.421 252.984 485.617 249.211C485.27 248.485 485.27 247.637 485.617 246.91C487.421 243.138 487.689 239.437 486.01 236.53C484.332 233.623 480.992 232.004 476.824 231.68C476.021 231.617 475.286 231.193 474.831 230.529C472.466 227.081 469.394 224.999 466.038 224.999Z"

function GeometricMark() {
  return (
    <>
      <g className="hero__sun">
        <circle cx="1082" cy="134" r="108" />
        <path d="M1082 26V242M974 134H1190" />
      </g>
      <g className="hero__triangle">
        <path d="M1082 210 1190 390H974Z" />
      </g>
    </>
  )
}

interface LetterpressArtworkProps {
  isCompact?: boolean
}

function LetterpressArtwork({ isCompact = false }: LetterpressArtworkProps) {
  return (
    <svg
      className={`hero__letterpress hero__letterpress--${isCompact ? "compact" : "wide"}`}
      viewBox={isCompact ? "0 0 960 420" : "0 0 1200 420"}
      aria-hidden="true"
    >
      <g className="hero__guides">
        <path
          d={
            isCompact
              ? "M0 390H960M0 26H960M300 0V420M634 0V420"
              : "M0 390H1200M0 26H1200M300 0V420M634 0V420M968 0V420"
          }
        />
      </g>
      <g className="hero__letter hero__letter--l">
        <path d="M30 26H112V308H274V390H30Z" />
      </g>
      <g className="hero__letter hero__letter--a">
        <path
          fillRule="evenodd"
          d={`M466 106a142 142 0 1 0 0 284 142 142 0 0 0 142-142V106H532v17a142 142 0 0 0-66-17Z${brandOuterCutoutPath}${brandInnerCutoutPath}`}
        />
        <path d="M532 246H608V390H532Z" />
      </g>
      <g className="hero__letter hero__letter--b">
        <path
          fillRule="evenodd"
          transform="translate(336 0)"
          d={`M324 26H400V122a142 142 0 1 1-76 126Z${brandOuterCutoutPath}`}
        />
      </g>
      {isCompact ? null : <GeometricMark />}
    </svg>
  )
}

export function BauhausPoster() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title" tabIndex={-1}>
      <div className="hero__masthead">
        <h1 id="hero-title">
          {siteConfig.hero.poster.wordmark}
          <span className="sr-only"> Lab</span>
        </h1>
        <p className="hero__edition">{siteConfig.hero.eyebrow}</p>
      </div>
      <div className="hero__composition" data-reveal>
        <LetterpressArtwork />
        <LetterpressArtwork isCompact />
        <span className="hero__side-note" aria-hidden="true">
          {siteConfig.hero.poster.sideNote}
        </span>
      </div>
      <div className="hero__caption">
        <p className="hero__manifesto">
          {siteConfig.hero.poster.manifesto}
          <br />
          <span>{siteConfig.hero.poster.invitation}</span>
        </p>
        <svg className="hero__mobile-mark" viewBox="968 0 232 420" aria-hidden="true" data-reveal>
          <GeometricMark />
        </svg>
        <p className="hero__description">{siteConfig.hero.description}</p>
        <a className="hero__explore" href={siteConfig.hero.primaryAction.href}>
          <span>{siteConfig.hero.primaryAction.label}</span>
          <span className="hero__explore-symbol" aria-hidden="true">
            +
          </span>
        </a>
      </div>
      <div className="hero__colophon">
        <span className="hero__colophon-label">{siteConfig.hero.poster.collectionLabel}</span>
        <dl className="hero__stats">
          {labStats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
        <span className="hero__swatches" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </section>
  )
}
