(() => {
  const reel = document.getElementById("ent-reel");
  if (!reel) return;
  const clips = Array.from(reel.querySelectorAll("video"));
  if (!clips.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let current = 0;
  let onScreen = true;

  const play = (clip) => {
    const attempt = clip.play();
    if (attempt) attempt.catch(() => {});
  };

  const show = (index) => {
    clips.forEach((clip, i) => {
      clip.classList.toggle("is-on", i === index);
      if (i !== index) clip.pause();
    });
    current = index;
    const clip = clips[index];
    clip.currentTime = 0;
    if (onScreen && !document.hidden) play(clip);
    clips[(index + 1) % clips.length].preload = "auto";
  };

  const LEAD = 0.9;
  clips.forEach((clip, i) => {
    clip.addEventListener("timeupdate", () => {
      if (i !== current || !clip.duration) return;
      if (clip.duration - clip.currentTime <= LEAD) {
        show((i + 1) % clips.length);
      }
    });
    clip.addEventListener("ended", () => {
      if (i === current) show((i + 1) % clips.length);
    });
  });

  const sync = () => {
    const clip = clips[current];
    if (onScreen && !document.hidden) play(clip);
    else clip.pause();
  };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      sync();
    }).observe(reel);
  }
  document.addEventListener("visibilitychange", sync);

  show(0);
})();
