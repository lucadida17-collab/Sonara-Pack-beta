(() => {
  "use strict";

  /*
   * Configuration centrale de la mini-cinématique Pre-V1.
   * Pour la livraison avec le son final :
   * 1. passer CINEMATIC_DEV_LOOP à false ;
   * 2. passer CINEMATIC_AUDIO_ENABLED à true ;
   * 3. déposer le fichier dans CINEMATIC_AUDIO_SOURCE ;
   * 4. ajuster uniquement CINEMATIC_TIMELINE si la musique l'exige.
   */
  const CINEMATIC_DEV_LOOP = true;
  const CINEMATIC_DEV_CONTROLS = true;
  const CINEMATIC_AUDIO_ENABLED = false;
  const CINEMATIC_AUDIO_SOURCE = "/assets/audio/cinematic-audio.mp3";
  const PRE_V1_CINEMATIC_VERSION = "PRE_V1_CINEMATIC_1";

  const CINEMATIC_TIMELINE = Object.freeze({
    start: 0,
    countdownEnd: 4.8,
    blackHoleStart: 4.8,
    suctionStart: 10.5,
    travelStart: 17.8,
    sonaraWorldStart: 25.4,
    revealStart: 30.8,
    preV1Start: 33.5,
    climaxStart: 35.7,
    loaderStart: 37.0,
    end: 38.0
  });

  const CINEMATIC_CONFIG = Object.freeze({
    devLoop: CINEMATIC_DEV_LOOP,
    devControls: CINEMATIC_DEV_CONTROLS,
    version: PRE_V1_CINEMATIC_VERSION,
    loopHoldSeconds: 0.72,
    loaderFadeSeconds: 0.72,
    reducedMotionDuration: 8,
    audio: Object.freeze({
      enabled: CINEMATIC_AUDIO_ENABLED,
      source: CINEMATIC_AUDIO_SOURCE
    })
  });

  const SCENES = Object.freeze([
    Object.freeze({ key: "countdown", label: "COMPTE À REBOURS", start: 0, end: CINEMATIC_TIMELINE.countdownEnd }),
    Object.freeze({ key: "black-hole", label: "SINGULARITÉ", start: CINEMATIC_TIMELINE.blackHoleStart, end: CINEMATIC_TIMELINE.suctionStart }),
    Object.freeze({ key: "suction", label: "ASPIRATION", start: CINEMATIC_TIMELINE.suctionStart, end: CINEMATIC_TIMELINE.travelStart }),
    Object.freeze({ key: "travel", label: "TRAVERSÉE", start: CINEMATIC_TIMELINE.travelStart, end: CINEMATIC_TIMELINE.sonaraWorldStart }),
    Object.freeze({ key: "music-world", label: "UNIVERS SONARA", start: CINEMATIC_TIMELINE.sonaraWorldStart, end: CINEMATIC_TIMELINE.revealStart }),
    Object.freeze({ key: "reveal", label: "CONVERGENCE", start: CINEMATIC_TIMELINE.revealStart, end: CINEMATIC_TIMELINE.preV1Start }),
    Object.freeze({ key: "pre-v1", label: "PRE-V1", start: CINEMATIC_TIMELINE.preV1Start, end: CINEMATIC_TIMELINE.climaxStart }),
    Object.freeze({ key: "climax", label: "SIGNAL FINAL", start: CINEMATIC_TIMELINE.climaxStart, end: CINEMATIC_TIMELINE.loaderStart }),
    Object.freeze({ key: "loader", label: "CHARGEMENT SONARA", start: CINEMATIC_TIMELINE.loaderStart, end: CINEMATIC_TIMELINE.end })
  ]);

  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const range = (value, from, to) => clamp((value - from) / Math.max(0.0001, to - from));
  const smooth = (value) => {
    const safe = clamp(value);
    return safe * safe * (3 - 2 * safe);
  };

  function createSeededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getDeviceProfile(reducedMotion) {
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const cores = Number(navigator.hardwareConcurrency || 4);
    const memory = Number(navigator.deviceMemory || 4);
    const lowPower = mobile || cores <= 4 || memory <= 4;

    if (reducedMotion) {
      return Object.freeze({ lowPower: true, particleCount: 24, pixelRatio: 1 });
    }

    return Object.freeze({
      lowPower,
      particleCount: lowPower ? 76 : 148,
      pixelRatio: Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75)
    });
  }

  class SonaraCinematicRenderer {
    constructor(canvas, reducedMotion) {
      this.canvas = canvas;
      this.context = canvas?.getContext?.("2d", { alpha: true, desynchronized: true }) || null;
      this.reducedMotion = reducedMotion;
      this.profile = getDeviceProfile(reducedMotion);
      this.width = 1;
      this.height = 1;
      this.centerX = 0.5;
      this.centerY = 0.5;
      this.particles = Array.from({ length: this.profile.particleCount }, () => ({}));
      this.resize = this.resize.bind(this);
      this.resize();
      this.reset();
    }

    resize() {
      if (!this.canvas || !this.context) return;

      const bounds = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, Math.round(bounds.width || window.innerWidth || 1));
      this.height = Math.max(1, Math.round(bounds.height || window.innerHeight || 1));
      this.centerX = this.width / 2;
      this.centerY = this.height / 2;

      const ratio = this.profile.pixelRatio;
      this.canvas.width = Math.max(1, Math.round(this.width * ratio));
      this.canvas.height = Math.max(1, Math.round(this.height * ratio));
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.context.imageSmoothingEnabled = true;
    }

    reset() {
      const random = createSeededRandom(0x50A4A);

      for (let index = 0; index < this.particles.length; index += 1) {
        const particle = this.particles[index];
        particle.angle = random() * Math.PI * 2;
        particle.radius = 0.12 + random() * 0.9;
        particle.speed = 0.35 + random() * 1.35;
        particle.spin = random() > 0.5 ? 1 : -1;
        particle.size = 0.45 + random() * 1.75;
        particle.alpha = 0.16 + random() * 0.7;
        particle.depth = 0.03 + random() * 0.97;
        particle.x = random();
        particle.y = random();
        particle.phase = random() * Math.PI * 2;
        particle.color = random();
      }

      this.clear();
    }

    clear() {
      this.context?.clearRect(0, 0, this.width, this.height);
    }

    getColor(particle, alpha) {
      if (particle.color < 0.38) return `rgba(78, 239, 255, ${alpha})`;
      if (particle.color < 0.72) return `rgba(74, 137, 255, ${alpha})`;
      if (particle.color < 0.9) return `rgba(139, 89, 255, ${alpha})`;
      return `rgba(255, 65, 204, ${alpha})`;
    }

    drawAmbient(time, intensity = 1) {
      const context = this.context;
      if (!context) return;

      context.save();
      context.globalCompositeOperation = "lighter";

      for (const particle of this.particles) {
        const drift = this.reducedMotion ? 0 : time * particle.speed * 0.18;
        const x = particle.x * this.width + Math.cos(particle.phase + drift) * 5;
        const y = particle.y * this.height + Math.sin(particle.phase + drift * 0.8) * 4;
        const pulse = 0.65 + Math.sin(time * 1.4 + particle.phase) * 0.25;
        const alpha = particle.alpha * pulse * intensity * 0.28;

        context.beginPath();
        context.fillStyle = this.getColor(particle, alpha);
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fill();
      }

      context.restore();
    }

    drawSingularity(time, blackHoleProgress, suctionProgress) {
      const context = this.context;
      if (!context) return;

      const shortestSide = Math.min(this.width, this.height);
      const maximumRadius = Math.max(this.width, this.height) * 0.7;
      const innerRadius = shortestSide * lerp(0.05, 0.14, blackHoleProgress);

      context.save();
      context.globalCompositeOperation = "lighter";

      for (const particle of this.particles) {
        const collapse = smooth(suctionProgress);
        const radius = maximumRadius * particle.radius * (1 - collapse * 0.93) + innerRadius * collapse;
        const rotation = particle.angle + time * particle.speed * 0.32 + collapse * particle.spin * (5.2 + particle.speed);
        const x = this.centerX + Math.cos(rotation) * radius;
        const y = this.centerY + Math.sin(rotation) * radius * lerp(0.82, 0.55, blackHoleProgress);
        const trailAngle = rotation - particle.spin * lerp(0.015, 0.13, collapse);
        const trailRadius = radius + lerp(1, 20, collapse) * particle.speed;
        const previousX = this.centerX + Math.cos(trailAngle) * trailRadius;
        const previousY = this.centerY + Math.sin(trailAngle) * trailRadius * lerp(0.82, 0.55, blackHoleProgress);
        const alpha = particle.alpha * blackHoleProgress * (0.28 + collapse * 0.62);

        context.beginPath();
        context.strokeStyle = this.getColor(particle, alpha);
        context.lineWidth = particle.size * (0.65 + collapse * 0.8);
        context.moveTo(previousX, previousY);
        context.lineTo(x, y);
        context.stroke();
      }

      const ringRadius = shortestSide * lerp(0.035, 0.23, blackHoleProgress);
      for (let ring = 0; ring < 3; ring += 1) {
        const start = time * (0.4 + ring * 0.16) * (ring === 1 ? -1 : 1) + ring;
        context.beginPath();
        context.strokeStyle = ring === 2
          ? `rgba(255, 55, 204, ${0.18 * blackHoleProgress})`
          : `rgba(75, 231, 255, ${0.22 * blackHoleProgress})`;
        context.lineWidth = 1 + ring * 0.7;
        context.ellipse(
          this.centerX,
          this.centerY,
          ringRadius * (1 + ring * 0.13),
          ringRadius * (0.41 + ring * 0.05),
          ring * 0.23,
          start,
          start + Math.PI * (0.82 + ring * 0.19)
        );
        context.stroke();
      }

      context.restore();
    }

    drawTravel(time, travelProgress) {
      const context = this.context;
      if (!context) return;

      const maximumRadius = Math.hypot(this.width, this.height) * 0.7;
      const acceleration = smooth(travelProgress);

      context.save();
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";

      for (const particle of this.particles) {
        let depth = particle.depth - travelProgress * (1.6 + particle.speed * 1.8);
        depth -= Math.floor(depth);
        if (depth < 0) depth += 1;

        const perspective = Math.pow(1 - depth, 2.15);
        const radius = 8 + perspective * maximumRadius;
        const previousRadius = Math.max(0, radius - (5 + perspective * (54 + acceleration * 120)) * particle.speed);
        const angle = particle.angle + Math.sin(time * 0.21 + particle.phase) * 0.025;
        const x = this.centerX + Math.cos(angle) * radius;
        const y = this.centerY + Math.sin(angle) * radius;
        const previousX = this.centerX + Math.cos(angle) * previousRadius;
        const previousY = this.centerY + Math.sin(angle) * previousRadius;
        const alpha = clamp((1 - depth) * particle.alpha * (0.35 + acceleration * 0.85));

        context.beginPath();
        context.strokeStyle = this.getColor(particle, alpha);
        context.lineWidth = particle.size * (0.45 + perspective * 1.9);
        context.moveTo(previousX, previousY);
        context.lineTo(x, y);
        context.stroke();
      }

      const coreGradient = context.createRadialGradient(
        this.centerX,
        this.centerY,
        0,
        this.centerX,
        this.centerY,
        Math.min(this.width, this.height) * 0.18
      );
      coreGradient.addColorStop(0, `rgba(220, 253, 255, ${0.20 + acceleration * 0.22})`);
      coreGradient.addColorStop(0.18, `rgba(72, 224, 255, ${0.12 + acceleration * 0.18})`);
      coreGradient.addColorStop(1, "rgba(61, 95, 255, 0)");
      context.fillStyle = coreGradient;
      context.fillRect(0, 0, this.width, this.height);
      context.restore();
    }

    drawMusicWorld(time, musicProgress, convergence) {
      const context = this.context;
      if (!context) return;

      context.save();
      context.globalCompositeOperation = "lighter";

      const reveal = smooth(musicProgress);
      const gather = smooth(convergence);
      const orbitRadius = Math.min(this.width, this.height) * 0.31;

      for (const particle of this.particles) {
        const ambientX = particle.x * this.width + Math.cos(time * 0.12 * particle.speed + particle.phase) * 12;
        const ambientY = particle.y * this.height + Math.sin(time * 0.15 * particle.speed + particle.phase) * 9;
        const targetRadius = orbitRadius * (0.15 + particle.radius * 0.9) * (1 - gather * 0.72);
        const targetAngle = particle.angle + time * 0.11 * particle.spin;
        const targetX = this.centerX + Math.cos(targetAngle) * targetRadius;
        const targetY = this.centerY + Math.sin(targetAngle) * targetRadius * 0.58;
        const x = lerp(ambientX, targetX, gather);
        const y = lerp(ambientY, targetY, gather);
        const pulse = 0.58 + Math.sin(time * 2 + particle.phase) * 0.32;
        const alpha = particle.alpha * reveal * pulse * (0.32 + gather * 0.52);

        context.beginPath();
        context.fillStyle = this.getColor(particle, alpha);
        context.arc(x, y, particle.size * (0.8 + gather * 0.75), 0, Math.PI * 2);
        context.fill();

        if (!this.profile.lowPower && particle.size > 1.25) {
          context.beginPath();
          context.strokeStyle = this.getColor(particle, alpha * 0.28);
          context.lineWidth = 0.65;
          context.moveTo(x - 10 * (1 - gather), y);
          context.lineTo(x + 10 * (1 - gather), y);
          context.stroke();
        }
      }

      context.restore();
    }

    drawClimax(time, climaxProgress) {
      const context = this.context;
      if (!context || climaxProgress <= 0) return;

      const burst = smooth(climaxProgress);
      const maximumRadius = Math.hypot(this.width, this.height) * 0.44;

      context.save();
      context.globalCompositeOperation = "lighter";

      for (const particle of this.particles) {
        const radius = maximumRadius * particle.radius * (1 - burst * 0.86);
        const angle = particle.angle + burst * particle.spin * 1.2;
        const x = this.centerX + Math.cos(angle) * radius;
        const y = this.centerY + Math.sin(angle) * radius;
        const alpha = particle.alpha * burst * 0.5;

        context.beginPath();
        context.strokeStyle = this.getColor(particle, alpha);
        context.lineWidth = particle.size;
        context.moveTo(x, y);
        context.lineTo(
          lerp(x, this.centerX, 0.12 + burst * 0.28),
          lerp(y, this.centerY, 0.12 + burst * 0.28)
        );
        context.stroke();
      }

      context.restore();
    }

    draw(time, values) {
      this.clear();

      if (this.reducedMotion) {
        this.drawAmbient(time, values.sceneKey === "travel" ? 0.18 : 0.55);
        return;
      }

      if (time < CINEMATIC_TIMELINE.blackHoleStart) {
        this.drawAmbient(time, 0.72);
      } else if (time < CINEMATIC_TIMELINE.travelStart) {
        this.drawAmbient(time, 0.34 * (1 - values.suctionProgress));
        this.drawSingularity(time, values.blackHoleProgress, values.suctionProgress);
      } else if (time < CINEMATIC_TIMELINE.sonaraWorldStart) {
        this.drawTravel(time, values.travelProgress);
      } else {
        this.drawMusicWorld(time, values.musicProgress, values.musicConvergence);
        this.drawClimax(time, values.climaxProgress);
      }
    }
  }

  const state = {
    root: null,
    loader: null,
    renderer: null,
    reducedMotion: false,
    speed: 1,
    started: false,
    running: false,
    paused: false,
    hiddenPause: false,
    frameId: 0,
    startAt: 0,
    pausedAt: 0,
    lastScene: "",
    completionStarted: false,
    completionResolve: null,
    startPromise: null,
    audio: null,
    listenersAttached: false
  };

  function getScene(time) {
    return SCENES.find((scene) => time >= scene.start && time < scene.end) || SCENES[SCENES.length - 1];
  }

  function getSceneValues(time) {
    const scene = getScene(time);
    return {
      scene,
      sceneKey: scene.key,
      sceneProgress: smooth(range(time, scene.start, scene.end)),
      countdownProgress: smooth(range(time, 0, CINEMATIC_TIMELINE.countdownEnd)),
      blackHoleProgress: smooth(range(time, CINEMATIC_TIMELINE.blackHoleStart, CINEMATIC_TIMELINE.suctionStart)),
      suctionProgress: smooth(range(time, CINEMATIC_TIMELINE.suctionStart, CINEMATIC_TIMELINE.travelStart)),
      travelProgress: smooth(range(time, CINEMATIC_TIMELINE.travelStart, CINEMATIC_TIMELINE.sonaraWorldStart)),
      musicProgress: smooth(range(time, CINEMATIC_TIMELINE.sonaraWorldStart, CINEMATIC_TIMELINE.revealStart)),
      musicConvergence: smooth(range(time, CINEMATIC_TIMELINE.sonaraWorldStart + 2.2, CINEMATIC_TIMELINE.revealStart)),
      revealProgress: smooth(range(time, CINEMATIC_TIMELINE.revealStart, CINEMATIC_TIMELINE.preV1Start)),
      climaxProgress: smooth(range(time, CINEMATIC_TIMELINE.climaxStart, CINEMATIC_TIMELINE.loaderStart))
    };
  }

  function setCssNumber(name, value) {
    state.root?.style.setProperty(name, clamp(value).toFixed(4));
  }

  function formatClock(time) {
    const safeTime = clamp(time, 0, CINEMATIC_TIMELINE.end);
    const minutes = Math.floor(safeTime / 60);
    const seconds = Math.floor(safeTime % 60);
    const milliseconds = Math.floor((safeTime % 1) * 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  }

  function updateInterface(time, values) {
    const root = state.root;
    if (!root) return;

    if (state.lastScene !== values.sceneKey) {
      state.lastScene = values.sceneKey;
      root.dataset.scene = values.sceneKey;
      const sceneLabel = document.getElementById("sonaraCinematicScene");
      if (sceneLabel) sceneLabel.textContent = values.scene.label;
    }

    setCssNumber("--cinematic-progress", time / CINEMATIC_TIMELINE.end);
    setCssNumber("--scene-progress", values.sceneProgress);
    setCssNumber("--countdown-progress", values.countdownProgress);
    setCssNumber("--black-hole-progress", values.blackHoleProgress);
    setCssNumber("--suction-progress", values.suctionProgress);
    setCssNumber("--travel-progress", values.travelProgress);
    setCssNumber("--music-progress", values.musicProgress);
    setCssNumber("--music-convergence", values.musicConvergence);
    setCssNumber("--reveal-progress", values.revealProgress);
    setCssNumber("--climax-progress", values.climaxProgress);

    const clock = document.getElementById("sonaraCinematicClock");
    if (clock) clock.textContent = formatClock(time);

    const loaderScene = time >= CINEMATIC_TIMELINE.loaderStart;
    state.loader?.classList.toggle("is-cinematic-waiting", !loaderScene);
    state.loader?.classList.toggle("is-cinematic-arriving", loaderScene);
    if (loaderScene) {
      state.loader?.removeAttribute("aria-hidden");
    } else {
      state.loader?.setAttribute("aria-hidden", "true");
    }
  }

  function getStoredProfile() {
    try {
      return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
    } catch {
      return null;
    }
  }

  function getAccountKey() {
    const profile = getStoredProfile();
    return String(profile?.accountId || profile?.id || "guest").trim() || "guest";
  }

  function getSeenStorageKey() {
    return `sonara:lastSeenCinematicVersion:${getAccountKey()}`;
  }

  function hasSeenCurrentVersion() {
    try {
      const profile = getStoredProfile();
      return profile?.lastSeenCinematicVersion === CINEMATIC_CONFIG.version ||
        localStorage.getItem(getSeenStorageKey()) === CINEMATIC_CONFIG.version;
    } catch {
      return false;
    }
  }

  function markCurrentVersionSeen() {
    try {
      localStorage.setItem(getSeenStorageKey(), CINEMATIC_CONFIG.version);

      const profile = getStoredProfile();
      if (profile) {
        profile.lastSeenCinematicVersion = CINEMATIC_CONFIG.version;
        localStorage.setItem("sonaraProfile", JSON.stringify(profile));
      }
    } catch (error) {
      console.warn("Version de cinématique non mémorisée :", error);
    }
  }

  function isPreV1Mode() {
    return window.SonaraCommercial?.getState?.().mode !== "COMMERCIAL";
  }

  function shouldPlay() {
    if (!isPreV1Mode()) return false;
    if (CINEMATIC_CONFIG.devLoop) return true;
    return !hasSeenCurrentVersion();
  }

  function loadCinematicAudio() {
    if (!CINEMATIC_CONFIG.audio.enabled) return null;
    if (state.audio) return state.audio;

    state.audio = new Audio(CINEMATIC_CONFIG.audio.source);
    state.audio.preload = "auto";
    state.audio.loop = false;
    return state.audio;
  }

  async function playCinematicAudio() {
    const audio = loadCinematicAudio();
    if (!audio) return;

    try {
      await audio.play();
    } catch (error) {
      console.warn("Lecture audio de la cinématique bloquée :", error);
    }
  }

  function pauseCinematicAudio() {
    state.audio?.pause();
  }

  function resetCinematicAudio() {
    if (!state.audio) return;
    state.audio.pause();
    state.audio.currentTime = 0;
  }

  function prepareLoader() {
    state.loader?.classList.add("is-cinematic-waiting");
    state.loader?.classList.remove("is-cinematic-arriving");
    state.loader?.setAttribute("aria-hidden", "true");
  }

  function revealLoaderImmediately() {
    state.loader?.classList.remove("is-cinematic-waiting", "is-cinematic-arriving");
    state.loader?.removeAttribute("aria-hidden");
  }

  function resetRuntime(visualTime = 0, autoplay = true) {
    const root = state.root;
    if (!root) return;

    window.cancelAnimationFrame(state.frameId);
    resetCinematicAudio();
    prepareLoader();
    state.renderer?.reset();

    root.hidden = false;
    root.classList.remove("is-inactive", "is-finishing", "is-paused");
    root.setAttribute("aria-hidden", "false");
    state.lastScene = "";
    state.completionStarted = false;
    state.paused = !autoplay;
    state.running = autoplay;

    const now = performance.now();
    state.startAt = now - (clamp(visualTime, 0, CINEMATIC_TIMELINE.end) / state.speed) * 1000;
    state.pausedAt = now;

    const values = getSceneValues(visualTime);
    updateInterface(visualTime, values);
    state.renderer?.draw(visualTime, values);

    const audio = loadCinematicAudio();
    if (audio) audio.currentTime = clamp(visualTime, 0, CINEMATIC_TIMELINE.end);

    if (autoplay) {
      void playCinematicAudio();
      state.frameId = window.requestAnimationFrame(tick);
    } else {
      root.classList.add("is-paused");
    }
  }

  function finishToLoader() {
    if (state.completionStarted) return;
    state.completionStarted = true;
    markCurrentVersionSeen();
    state.root?.classList.add("is-finishing");
  }

  function completePromise() {
    window.cancelAnimationFrame(state.frameId);
    state.running = false;
    state.root?.classList.add("is-inactive");
    state.root?.setAttribute("aria-hidden", "true");
    revealLoaderImmediately();
    detachListeners();

    const resolve = state.completionResolve;
    state.completionResolve = null;
    resolve?.({ played: true, version: CINEMATIC_CONFIG.version });
  }

  function tick(now) {
    if (!state.running || state.paused) return;

    const actualElapsed = Math.max(0, (now - state.startAt) / 1000);
    const visualTime = Math.min(CINEMATIC_TIMELINE.end, actualElapsed * state.speed);
    const values = getSceneValues(visualTime);

    updateInterface(visualTime, values);
    state.renderer?.draw(visualTime, values);

    if (actualElapsed * state.speed >= CINEMATIC_TIMELINE.end) {
      const holdElapsed = actualElapsed - CINEMATIC_TIMELINE.end / state.speed;

      if (CINEMATIC_CONFIG.devLoop) {
        if (holdElapsed >= CINEMATIC_CONFIG.loopHoldSeconds) {
          resetRuntime(0, true);
          return;
        }
      } else {
        finishToLoader();
        if (holdElapsed >= CINEMATIC_CONFIG.loaderFadeSeconds) {
          completePromise();
          return;
        }
      }
    }

    state.frameId = window.requestAnimationFrame(tick);
  }

  function pause() {
    if (!state.running || state.paused) return;
    state.paused = true;
    state.pausedAt = performance.now();
    window.cancelAnimationFrame(state.frameId);
    state.root?.classList.add("is-paused");
    const status = document.getElementById("sonaraCinematicStatus");
    if (status) status.textContent = "Pause";
    pauseCinematicAudio();
  }

  function resume() {
    if (!state.running || !state.paused) return;
    const now = performance.now();
    state.startAt += now - state.pausedAt;
    state.paused = false;
    state.root?.classList.remove("is-paused");
    const status = document.getElementById("sonaraCinematicStatus");
    if (status) status.textContent = "";
    void playCinematicAudio();
    state.frameId = window.requestAnimationFrame(tick);
  }

  function togglePause() {
    if (state.paused) resume();
    else pause();
  }

  function restart() {
    if (!state.started) return;
    resetRuntime(0, true);
  }

  function getVisualTime() {
    if (!state.started) return 0;
    const reference = state.paused ? state.pausedAt : performance.now();
    return clamp(((reference - state.startAt) / 1000) * state.speed, 0, CINEMATIC_TIMELINE.end);
  }

  function seekTo(visualTime) {
    if (!state.started) return;

    const safeTime = clamp(visualTime, 0, CINEMATIC_TIMELINE.end - 0.02);
    const wasPaused = state.paused;
    resetRuntime(safeTime, !wasPaused);
    if (wasPaused) {
      state.paused = true;
      state.running = true;
      state.root?.classList.add("is-paused");
    }

  }

  function seekBy(seconds) {
    seekTo(getVisualTime() + seconds);
  }

  function handleKeydown(event) {
    if (!CINEMATIC_CONFIG.devControls || !state.started) return;
    const tagName = event.target?.tagName?.toLowerCase();
    if (["input", "textarea", "select", "button"].includes(tagName)) return;

    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
      return;
    }

    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      restart();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekBy(2);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekBy(-2);
    }
  }

  function handleVisibilityChange() {
    if (document.hidden && state.running && !state.paused) {
      state.hiddenPause = true;
      pause();
      return;
    }

    if (!document.hidden && state.hiddenPause) {
      state.hiddenPause = false;
      resume();
    }
  }

  function attachListeners() {
    if (state.listenersAttached) return;
    state.listenersAttached = true;
    window.addEventListener("resize", state.renderer.resize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (CINEMATIC_CONFIG.devControls) document.addEventListener("keydown", handleKeydown);
  }

  function detachListeners() {
    if (!state.listenersAttached) return;
    state.listenersAttached = false;
    window.removeEventListener("resize", state.renderer.resize);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("keydown", handleKeydown);
  }

  function initialise() {
    state.root = document.getElementById("sonaraPreV1Cinematic");
    state.loader = document.getElementById("sonaraEntryLoader");
    if (!state.root) return false;

    state.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    state.speed = state.reducedMotion
      && !CINEMATIC_CONFIG.audio.enabled
      ? CINEMATIC_TIMELINE.end / CINEMATIC_CONFIG.reducedMotionDuration
      : 1;

    const canvas = document.getElementById("sonaraCinematicCanvas");
    state.renderer = new SonaraCinematicRenderer(canvas, state.reducedMotion);
    state.root.classList.toggle("has-dev-controls", CINEMATIC_CONFIG.devControls);
    attachListeners();
    return true;
  }

  function start() {
    if (state.startPromise) return state.startPromise;
    if (!initialise()) return Promise.resolve({ played: false, reason: "missing_dom" });

    state.started = true;
    state.startPromise = (async () => {
      if (!CINEMATIC_CONFIG.devLoop) {
        try {
          await window.SonaraCommercial?.ready?.();
        } catch {
          // La configuration centrale conserve déjà son fallback de sécurité PRE_V1.
        }
      }

      if (!shouldPlay()) {
        state.root.classList.add("is-inactive");
        state.root.setAttribute("aria-hidden", "true");
        revealLoaderImmediately();
        detachListeners();
        return { played: false, reason: "not_required" };
      }

      const completion = new Promise((resolve) => {
        state.completionResolve = resolve;
      });

      resetRuntime(0, true);
      return completion;
    })();

    return state.startPromise;
  }

  function skip() {
    window.cancelAnimationFrame(state.frameId);
    state.running = false;
    resetCinematicAudio();
    state.root?.classList.add("is-inactive");
    state.root?.setAttribute("aria-hidden", "true");
    revealLoaderImmediately();
    detachListeners();

    const resolve = state.completionResolve;
    state.completionResolve = null;
    resolve?.({ played: false, reason: "skipped" });
  }

  function destroy() {
    skip();
    state.renderer?.clear();
    state.audio = null;
    state.started = false;
    state.startPromise = null;
  }

  window.SonaraPreV1Cinematic = Object.freeze({
    config: CINEMATIC_CONFIG,
    timeline: CINEMATIC_TIMELINE,
    scenes: SCENES,
    start,
    pause,
    resume,
    restart,
    seekTo,
    seekBy,
    skip,
    destroy,
    loadCinematicAudio,
    playCinematicAudio,
    pauseCinematicAudio,
    resetCinematicAudio,
    hasSeenCurrentVersion,
    markCurrentVersionSeen
  });
})();
