(() => {
  const video = document.getElementById("heroIntroVideo");
  const button = document.getElementById("heroSoundToggle");
  if (!video || !button) return;

  const setButtonState = () => {
    const playingVoice = !video.muted;
    button.textContent = playingVoice ? "Mute intro voice" : "Hear intro voice";
    button.setAttribute("aria-pressed", String(playingVoice));
  };

  // Background video can autoplay silently; browsers require a user gesture for audio.
  video.muted = true;
  video.loop = true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.removeAttribute("autoplay");
    video.pause();
  }
  setButtonState();

  button.addEventListener("click", async () => {
    if (!video.muted) {
      video.muted = true;
      video.loop = true;
      if (video.ended) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
      setButtonState();
      return;
    }

    video.pause();
    video.currentTime = 0;
    video.loop = false;
    video.muted = false;
    try {
      await video.play();
      setButtonState();
    } catch {
      video.muted = true;
      video.loop = true;
      setButtonState();
      button.textContent = "Tap to hear intro voice";
    }
  });

  video.addEventListener("ended", () => {
    if (video.muted) return;
    video.muted = true;
    video.loop = true;
    video.currentTime = 0;
    setButtonState();
    video.play().catch(() => {});
  });
})();