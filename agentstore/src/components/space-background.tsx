/**
 * The gethouston.ai space background: the ESO Milky Way panorama (eso0932a,
 * ESO/S. Brunier, CC BY 4.0) plus a readability scrim and a sparse star
 * field, all fixed behind the page. Styles: `src/app/space.css`. Static by
 * design — see the perf note there. Server component, renders once.
 */
export function SpaceBackground() {
  return (
    <>
      <div className="space-bg" aria-hidden="true">
        <picture>
          <source
            type="image/avif"
            sizes="100vw"
            srcSet="/space/milkyway-1280.avif 1280w, /space/milkyway-1920.avif 1920w, /space/milkyway-2560.avif 2560w"
          />
          <source
            type="image/webp"
            sizes="100vw"
            srcSet="/space/milkyway-1280.webp 1280w, /space/milkyway-1920.webp 1920w, /space/milkyway-2560.webp 2560w"
          />
          {/* Raw img (not next/image): the optimizer adds nothing — the srcset
              above already serves right-sized, pre-encoded AVIF/WebP. */}
          <img
            src="/space/milkyway-1920.jpg"
            sizes="100vw"
            srcSet="/space/milkyway-1280.jpg 1280w, /space/milkyway-1920.jpg 1920w, /space/milkyway-2560.jpg 2560w"
            width={2560}
            height={1440}
            alt=""
            decoding="async"
            fetchPriority="high"
          />
        </picture>
      </div>
      <div className="space-scrim" aria-hidden="true" />
      <div className="space-stars" aria-hidden="true" />
    </>
  );
}
