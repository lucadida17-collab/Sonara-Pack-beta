(() => {
  "use strict";

  /*
   * Configuration centrale de la mini-cinématique Pre-V1.
   * Livraison finale Pre-V1 : lecture unique + bande-son officielle.
   * Le son suit exactement le runtime de la cinématique (pause/reprise/fin).
   */
  const CINEMATIC_DEV_LOOP = false;
  const CINEMATIC_DEV_CONTROLS = false;
  const CINEMATIC_RECORDING_CONTROLS = false;
  const CINEMATIC_RECORDING_CAPTURE_AUDIO = false;
  const CINEMATIC_AUDIO_ENABLED = true;
  const CINEMATIC_AUDIO_SOURCE = "/assets/son/NEW%20UNIVERSE.wav";
  const PRE_V1_CINEMATIC_VERSION = "PRE_V1_CINEMATIC_4";
  const CINEMATIC_ONCE_STORAGE_KEY = "sonara:preV1CinematicSeen";
  const CINEMATIC_BODY_CLASS = "sonara-cinematic-running";
  const MOBILE_CINEMA_BODY_CLASS = "sonara-cinematic-mobile-frame";
  const MOBILE_CINEMA_ROOT_CLASS = "is-mobile-cinema-frame";

  const CINEMATIC_TIMELINE = Object.freeze({
    start: 0,
    countdownDuration: 5,
    countdownHoldStart: 5,
    countdownEnd: 7,
    blackHoleStart: 7,
    suctionStart: 14,
    travelStart: 23,
    spaceSpiralStart: 23,
    ejectionStart: 38,
    sonaraWorldStart: 44,
    galaxyApproachStart: 44,
    revealStart: 52,
    galaxyArrival: 52,
    preV1Start: 56,
    climaxStart: 58,
    loaderStart: 59,
    end: 60
  });

  const CINEMATIC_CONFIG = Object.freeze({
    devLoop: CINEMATIC_DEV_LOOP,
    devControls: CINEMATIC_DEV_CONTROLS,
    version: PRE_V1_CINEMATIC_VERSION,
    loopHoldSeconds: 0.72,
    loaderFadeSeconds: 0.72,
    reducedMotionDuration: 12,
    recording: Object.freeze({
      controls: CINEMATIC_RECORDING_CONTROLS,
      captureAudio: CINEMATIC_RECORDING_CAPTURE_AUDIO,
      endPaddingMilliseconds: 220
    }),
    audio: Object.freeze({
      enabled: CINEMATIC_AUDIO_ENABLED,
      source: CINEMATIC_AUDIO_SOURCE
    })
  });

  const SCENES = Object.freeze([
    Object.freeze({ key: "countdown", label: "COMPTE À REBOURS", start: 0, end: CINEMATIC_TIMELINE.countdownEnd }),
    Object.freeze({ key: "black-hole", label: "SINGULARITÉ", start: CINEMATIC_TIMELINE.blackHoleStart, end: CINEMATIC_TIMELINE.suctionStart }),
    Object.freeze({ key: "suction", label: "ASPIRATION", start: CINEMATIC_TIMELINE.suctionStart, end: CINEMATIC_TIMELINE.travelStart }),
    Object.freeze({ key: "travel", label: "SPIRALE LUMIÈRE", start: CINEMATIC_TIMELINE.travelStart, end: CINEMATIC_TIMELINE.ejectionStart }),
    Object.freeze({ key: "ejection", label: "ÉJECTION SPATIALE", start: CINEMATIC_TIMELINE.ejectionStart, end: CINEMATIC_TIMELINE.sonaraWorldStart }),
    Object.freeze({ key: "music-world", label: "APPROCHE SONARA", start: CINEMATIC_TIMELINE.sonaraWorldStart, end: CINEMATIC_TIMELINE.revealStart }),
    Object.freeze({ key: "reveal", label: "ARRIVÉE SONARA", start: CINEMATIC_TIMELINE.revealStart, end: CINEMATIC_TIMELINE.preV1Start }),
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

  function isMobileCinematicDevice() {
    const narrowScreen = window.matchMedia("(max-width: 760px)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
    const touchTablet = /Macintosh/i.test(navigator.userAgent || "") && Number(navigator.maxTouchPoints || 0) > 1;
    return narrowScreen || coarsePointer || mobileUserAgent || touchTablet;
  }

  function getDeviceProfile(reducedMotion, mobile) {
    const cores = Number(navigator.hardwareConcurrency || 4);
    const reportedMemory = Number(navigator.deviceMemory || 0);
    const memory = reportedMemory > 0 ? reportedMemory : null;
    const devicePixelRatio = Math.max(1, Number(window.devicePixelRatio || 1));
    const viewportPixels = Math.max(1, window.innerWidth || 1) * Math.max(1, window.innerHeight || 1);
    const lowPower = mobile || cores <= 4 || (memory !== null && memory <= 4);
    const veryLowPower = !mobile && (cores <= 2 || (memory !== null && memory <= 2));
    const largeDesktopSurface = !mobile && viewportPixels * devicePixelRatio * devicePixelRatio > 5200000;

    if (reducedMotion) {
      return Object.freeze({
        mobile,
        lowPower: true,
        particleCount: mobile ? 18 : 24,
        pixelRatio: 1,
        frameInterval: mobile ? 1000 / 30 : 0,
        initialPerformanceTier: mobile ? "mobile" : "low"
      });
    }

    return Object.freeze({
      mobile,
      lowPower,
      particleCount: mobile ? 42 : lowPower ? 76 : 132,
      pixelRatio: mobile ? 1 : Math.min(devicePixelRatio, lowPower ? 1.15 : 1.5),
      // Sur ordinateur, on démarre à la meilleure qualité raisonnable puis le
      // moteur peut descendre d'un cran en temps réel si les FPS décrochent.
      frameInterval: 0,
      initialPerformanceTier: mobile
        ? "mobile"
        : veryLowPower || largeDesktopSurface
          ? "low"
          : lowPower
            ? "balanced"
            : "high"
    });
  }

  class SonaraCinematicRenderer {
    constructor(canvas, reducedMotion, mobile, onPerformanceTierChange = null) {
      this.canvas = canvas;
      this.reducedMotion = reducedMotion;
      this.profile = getDeviceProfile(reducedMotion, mobile);
      this.onPerformanceTierChange = typeof onPerformanceTierChange === "function"
        ? onPerformanceTierChange
        : null;
      this.context = canvas?.getContext?.(
        "2d",
        this.profile.mobile ? { alpha: true } : { alpha: true, desynchronized: true }
      ) || null;
      this.width = 1;
      this.height = 1;
      this.centerX = 0.5;
      this.centerY = 0.5;
      this.landscape = false;
      this.resizeFrameId = 0;
      this.adaptiveFrameInterval = this.profile.frameInterval;
      this.performanceTier = this.profile.initialPerformanceTier;
      this.qualityScale = 1;
      this.slowFrameScore = 0;
      this.performanceSamples = 0;
      this.lastTierChangeAt = 0;
      this.particles = Array.from({ length: this.profile.particleCount }, () => ({}));
      const galaxyStarCount = this.reducedMotion
        ? (this.profile.mobile ? 28 : 40)
        : (this.profile.mobile ? 64 : this.profile.lowPower ? 110 : 190);
      this.galaxyStars = Array.from({ length: galaxyStarCount }, () => ({}));
      const deepSpaceStarCount = this.reducedMotion
        ? (this.profile.mobile ? 20 : 30)
        : (this.profile.mobile ? 46 : this.profile.lowPower ? 78 : 132);
      this.deepSpaceStars = Array.from({ length: deepSpaceStarCount }, () => ({}));
      this.resize = this.resize.bind(this);
      this.scheduleResize = this.scheduleResize.bind(this);
      this.applyPerformanceTier(this.performanceTier, true);
      this.resize(true);
      this.reset();
    }

    getFrameInterval() {
      return this.adaptiveFrameInterval;
    }

    getPerformanceTier() {
      return this.performanceTier;
    }

    getRenderCount(collection) {
      return Math.max(1, Math.ceil(collection.length * this.qualityScale));
    }

    getCompositeOperation() {
      return this.profile.mobile || this.performanceTier !== "high" ? "source-over" : "lighter";
    }

    getCanvasPixelRatio() {
      if (this.profile.mobile) return this.profile.pixelRatio;

      const tierScale = this.performanceTier === "low"
        ? 0.72
        : this.performanceTier === "balanced"
          ? 0.88
          : 1;
      const maximumPixels = this.performanceTier === "low"
        ? 950000
        : this.performanceTier === "balanced"
          ? 1450000
          : 2300000;
      const cssPixels = Math.max(1, this.width * this.height);
      const budgetRatio = Math.sqrt(maximumPixels / cssPixels);

      return Math.max(0.35, Math.min(this.profile.pixelRatio * tierScale, budgetRatio));
    }

    applyPerformanceTier(tier, initial = false) {
      if (this.profile.mobile) {
        this.performanceTier = "mobile";
        this.qualityScale = 1;
        this.adaptiveFrameInterval = this.profile.frameInterval;
        return;
      }

      const safeTier = tier === "low" || tier === "balanced" ? tier : "high";
      const changed = this.performanceTier !== safeTier;
      this.performanceTier = safeTier;

      if (safeTier === "low") {
        this.qualityScale = 0.50;
        this.adaptiveFrameInterval = 1000 / 30;
      } else if (safeTier === "balanced") {
        this.qualityScale = 0.76;
        this.adaptiveFrameInterval = 0;
      } else {
        this.qualityScale = 1;
        this.adaptiveFrameInterval = 0;
      }

      this.slowFrameScore = 0;
      this.performanceSamples = 0;
      this.lastTierChangeAt = performance.now();
      this.onPerformanceTierChange?.(safeTier);

      if (!initial && changed) this.resize(true);
    }

    reportPerformance(frameGap, drawCost) {
      // Le profil mobile est déjà stabilisé séparément. Ce contrôleur ne touche
      // qu'aux ordinateurs afin de ne pas modifier le rendu mobile validé.
      if (
        this.profile.mobile ||
        this.reducedMotion ||
        this.performanceTier === "low" ||
        !Number.isFinite(frameGap) ||
        !Number.isFinite(drawCost) ||
        frameGap <= 0 ||
        frameGap > 180
      ) return;

      this.performanceSamples += 1;
      if (this.performanceSamples < 28) return;

      const severeFrame = frameGap > 36 || drawCost > 15;
      const slowFrame = frameGap > 23 || drawCost > 9.5;

      if (severeFrame) {
        this.slowFrameScore += 2.4;
      } else if (slowFrame) {
        this.slowFrameScore += 1;
      } else {
        this.slowFrameScore = Math.max(0, this.slowFrameScore - 0.42);
      }

      // On ne réagit pas à un petit pic isolé : il faut une vraie série de
      // frames lentes. High -> Balanced garde 60 FPS avec moins de GPU ; si le
      // PC décroche encore, Low verrouille un 30 FPS stable et allège le rendu.
      if (this.slowFrameScore >= 12) {
        this.applyPerformanceTier(this.performanceTier === "high" ? "balanced" : "low");
      }
    }

    resize(force = false) {
      if (!this.canvas || !this.context) return;

      const bounds = this.canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(bounds.width || window.innerWidth || 1));
      const nextHeight = Math.max(1, Math.round(bounds.height || window.innerHeight || 1));
      const nextLandscape = nextWidth > nextHeight;

      if (!force) {
        const orientationChanged = nextLandscape !== this.landscape;
        const widthChanged = Math.abs(nextWidth - this.width) >= (this.profile.mobile ? 48 : 2);
        const heightChanged = Math.abs(nextHeight - this.height) >= 2;

        // Safari mobile modifie continuellement la hauteur du viewport lorsque
        // ses barres apparaissent. Réallouer le Canvas à chaque fois provoque
        // des flashs et peut finir par faire recharger l'onglet.
        if (this.profile.mobile && !orientationChanged && !widthChanged) return;
        if (!this.profile.mobile && !widthChanged && !heightChanged) return;
      }

      this.width = nextWidth;
      this.height = nextHeight;
      this.landscape = nextLandscape;
      this.centerX = this.width / 2;
      this.centerY = this.height / 2;

      const ratio = this.getCanvasPixelRatio();
      this.canvas.width = Math.max(1, Math.round(this.width * ratio));
      this.canvas.height = Math.max(1, Math.round(this.height * ratio));
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.context.imageSmoothingEnabled = true;
    }

    scheduleResize() {
      if (this.resizeFrameId) return;
      this.resizeFrameId = window.requestAnimationFrame(() => {
        this.resizeFrameId = 0;
        this.resize(false);
      });
    }

    cancelScheduledResize() {
      window.cancelAnimationFrame(this.resizeFrameId);
      this.resizeFrameId = 0;
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

      for (let index = 0; index < this.galaxyStars.length; index += 1) {
        const star = this.galaxyStars[index];
        star.arm = index % 4;
        star.radius = Math.pow(random(), 0.62);
        star.jitter = (random() - 0.5) * 0.72;
        star.size = 0.38 + random() * 1.45;
        star.alpha = 0.24 + random() * 0.74;
        star.color = random();
        star.phase = random() * Math.PI * 2;
        star.height = (random() - 0.5) * (0.05 + star.radius * 0.16);
      }

      for (let index = 0; index < this.deepSpaceStars.length; index += 1) {
        const star = this.deepSpaceStars[index];
        star.x = random();
        star.y = random();
        star.depth = 0.04 + random() * 0.96;
        star.size = 0.35 + random() * 1.35;
        star.alpha = 0.25 + random() * 0.70;
        star.color = random();
        star.phase = random() * Math.PI * 2;
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

    getSpaceColor(particle, alpha) {
      if (particle.color < 0.22) return `rgba(239, 252, 255, ${alpha})`;
      if (particle.color < 0.46) return `rgba(74, 230, 255, ${alpha})`;
      if (particle.color < 0.68) return `rgba(91, 126, 255, ${alpha})`;
      if (particle.color < 0.86) return `rgba(164, 92, 255, ${alpha})`;
      return `rgba(255, 73, 196, ${alpha})`;
    }

    drawAmbient(time, intensity = 1) {
      const context = this.context;
      if (!context) return;

      context.save();
      context.globalCompositeOperation = this.getCompositeOperation();

      const particleCount = this.getRenderCount(this.particles);
      for (let index = 0; index < particleCount; index += 1) {
        const particle = this.particles[index];
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
      context.globalCompositeOperation = this.getCompositeOperation();

      const particleCount = this.getRenderCount(this.particles);
      for (let index = 0; index < particleCount; index += 1) {
        const particle = this.particles[index];
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
      const ringCount = this.profile.mobile ? 2 : this.performanceTier === "high" ? 3 : 2;
      for (let ring = 0; ring < ringCount; ring += 1) {
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

    drawTravel(time, travelProgress, intensity = 1) {
      const context = this.context;
      if (!context || intensity <= 0) return;

      const maximumRadius = Math.hypot(this.width, this.height) * 0.76;
      const acceleration = smooth(travelProgress);
      const safeIntensity = clamp(intensity);

      context.save();
      context.globalCompositeOperation = this.getCompositeOperation();
      context.lineCap = "round";

      const particleCount = this.getRenderCount(this.particles);
      for (let index = 0; index < particleCount; index += 1) {
        const particle = this.particles[index];
        let depth = particle.depth - travelProgress * (5.8 + particle.speed * 8.2);
        depth -= Math.floor(depth);
        if (depth < 0) depth += 1;

        const perspective = Math.pow(1 - depth, 1.82);
        const radius = 5 + perspective * maximumRadius;
        const previousRadius = Math.max(0, radius - (16 + perspective * (125 + acceleration * 260)) * particle.speed);
        const spiralRotation = travelProgress * 22 + perspective * (2.1 + acceleration * 3.4) + time * 0.35;
        const angle = particle.angle + spiralRotation + Math.sin(time * 0.78 + particle.phase) * 0.055;
        const previousAngle = angle - (0.08 + perspective * (0.28 + acceleration * 0.64));
        const x = this.centerX + Math.cos(angle) * radius;
        const y = this.centerY + Math.sin(angle) * radius * 0.88;
        const previousX = this.centerX + Math.cos(previousAngle) * previousRadius;
        const previousY = this.centerY + Math.sin(previousAngle) * previousRadius * 0.88;
        const controlRadius = (radius + previousRadius) * 0.5;
        const controlAngle = (angle + previousAngle) * 0.5 - (0.05 + acceleration * 0.09);
        const controlX = this.centerX + Math.cos(controlAngle) * controlRadius;
        const controlY = this.centerY + Math.sin(controlAngle) * controlRadius * 0.88;
        const alpha = clamp((1 - depth) * particle.alpha * (0.48 + acceleration * 1.05) * safeIntensity);

        context.beginPath();
        context.strokeStyle = this.getSpaceColor(particle, alpha);
        context.lineWidth = particle.size * (0.48 + perspective * 2.35);
        context.moveTo(previousX, previousY);
        context.quadraticCurveTo(controlX, controlY, x, y);
        context.stroke();

        if (perspective > 0.52) {
          context.beginPath();
          context.fillStyle = this.getSpaceColor(particle, alpha * 0.96);
          context.arc(x, y, particle.size * (0.58 + perspective * 1.15), 0, Math.PI * 2);
          context.fill();
        }
      }

      const tunnelRingCount = this.profile.mobile ? 3 : this.performanceTier === "high" ? 6 : this.performanceTier === "balanced" ? 4 : 3;
      for (let ring = 0; ring < tunnelRingCount; ring += 1) {
        const cycle = (travelProgress * (3.8 + ring * 0.21) + ring / tunnelRingCount) % 1;
        const ringRadius = lerp(8, Math.min(this.width, this.height) * 0.62, Math.pow(cycle, 1.75));
        const ringAlpha = (1 - cycle) * (0.08 + acceleration * 0.18) * safeIntensity;
        context.beginPath();
        context.strokeStyle = ring % 2
          ? `rgba(255, 74, 202, ${ringAlpha})`
          : `rgba(91, 224, 255, ${ringAlpha})`;
        context.lineWidth = 0.8 + cycle * 2.2;
        context.ellipse(
          this.centerX,
          this.centerY,
          ringRadius,
          ringRadius * 0.48,
          time * 0.16 + ring * 0.44,
          0,
          Math.PI * 1.56
        );
        context.stroke();
      }

      if (!this.profile.mobile && this.performanceTier === "high") {
        const coreGradient = context.createRadialGradient(
          this.centerX,
          this.centerY,
          0,
          this.centerX,
          this.centerY,
          Math.min(this.width, this.height) * 0.18
        );
        coreGradient.addColorStop(0, `rgba(240, 253, 255, ${(0.20 + acceleration * 0.30) * safeIntensity})`);
        coreGradient.addColorStop(0.18, `rgba(121, 93, 255, ${(0.13 + acceleration * 0.22) * safeIntensity})`);
        coreGradient.addColorStop(1, "rgba(61, 95, 255, 0)");
        context.fillStyle = coreGradient;
        context.fillRect(0, 0, this.width, this.height);
      }
      context.restore();
    }

    drawDeepSpace(time, visibility, velocity = 0) {
      const context = this.context;
      const reveal = smooth(visibility);
      if (!context || reveal <= 0) return;

      const speed = clamp(velocity, 0, 1.8);
      context.save();
      context.globalCompositeOperation = this.getCompositeOperation();
      context.lineCap = "round";

      const starCount = this.getRenderCount(this.deepSpaceStars);
      for (let index = 0; index < starCount; index += 1) {
        const star = this.deepSpaceStars[index];
        let depth = star.depth - time * 0.042 * speed;
        depth -= Math.floor(depth);
        if (depth < 0) depth += 1;

        const perspective = 0.48 + Math.pow(1 - depth, 1.45) * 1.32;
        const previousPerspective = Math.max(
          0.42,
          perspective - speed * (0.045 + (1 - depth) * 0.17)
        );
        const dx = (star.x - 0.5) * this.width;
        const dy = (star.y - 0.5) * this.height;
        const driftX = Math.sin(time * 0.08 + star.phase) * 3;
        const driftY = Math.cos(time * 0.07 + star.phase) * 2;
        const x = this.centerX + dx * perspective + driftX;
        const y = this.centerY + dy * perspective + driftY;
        const previousX = this.centerX + dx * previousPerspective + driftX;
        const previousY = this.centerY + dy * previousPerspective + driftY;
        const pulse = 0.72 + Math.sin(time * 1.1 + star.phase) * 0.22;
        const alpha = star.alpha * reveal * pulse * (0.44 + (1 - depth) * 0.56);
        const size = star.size * (0.52 + (1 - depth) * 0.82);

        if (speed > 0.12) {
          context.beginPath();
          context.strokeStyle = this.getSpaceColor(star, alpha * clamp(speed * 0.82));
          context.lineWidth = size * (0.62 + speed * 0.48);
          context.moveTo(previousX, previousY);
          context.lineTo(x, y);
          context.stroke();
        }

        context.beginPath();
        context.fillStyle = this.getSpaceColor(star, alpha);
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
      }

      context.restore();
    }

    drawEjectionPulse(ejectionProgress) {
      const context = this.context;
      if (!context || ejectionProgress <= 0 || ejectionProgress >= 0.72) return;

      const expansion = smooth(range(ejectionProgress, 0, 0.72));
      const pulse = Math.sin(clamp(ejectionProgress / 0.72) * Math.PI);
      const shortestSide = Math.min(this.width, this.height);

      context.save();
      context.globalCompositeOperation = this.getCompositeOperation();
      const ringCount = this.profile.mobile ? 2 : this.performanceTier === "high" ? 4 : this.performanceTier === "balanced" ? 3 : 2;
      for (let ring = 0; ring < ringCount; ring += 1) {
        const radius = shortestSide * lerp(0.025 + ring * 0.012, 0.66 + ring * 0.08, expansion);
        context.beginPath();
        context.strokeStyle = ring % 2
          ? `rgba(255, 91, 210, ${pulse * 0.24})`
          : `rgba(188, 247, 255, ${pulse * 0.42})`;
        context.lineWidth = lerp(4.5, 0.8, expansion);
        context.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }

    drawSonaraGalaxy(time, visibilityProgress, approachProgress, revealProgress, climaxProgress) {
      const context = this.context;
      if (!context || visibilityProgress <= 0) return;

      const visibility = smooth(visibilityProgress);
      const approach = smooth(approachProgress);
      const reveal = smooth(revealProgress);
      const climax = smooth(climaxProgress);
      const shortestSide = Math.min(this.width, this.height);
      const baseRadius = shortestSide * 0.37;
      const distantScale = lerp(0.055, 0.18, visibility);
      const cameraScale = distantScale * (1 + Math.pow(approach, 0.78) * 8.15) * (1 + reveal * 0.20 + climax * 0.08);
      const galaxyOpacity = visibility * (1 - reveal * 0.68) * (1 - climax * 0.18);
      const rotation = (this.reducedMotion ? 0.18 : time * 0.115) + approach * 0.52;
      const cameraX = this.centerX + (1 - approach) * shortestSide * 0.07 + Math.sin(approach * Math.PI) * shortestSide * 0.016;
      const cameraY = this.centerY - (1 - approach) * shortestSide * 0.06;

      context.save();
      context.globalCompositeOperation = this.getCompositeOperation();

      const starCount = this.getRenderCount(this.galaxyStars);
      for (let index = 0; index < starCount; index += 1) {
        const star = this.galaxyStars[index];
        const armAngle = star.arm * (Math.PI / 2);
        const angle = armAngle + star.radius * 6.25 + rotation + star.jitter;
        const radius = baseRadius * star.radius * cameraScale;
        const x = cameraX + Math.cos(angle) * radius;
        const y = cameraY + Math.sin(angle) * radius * 0.47 + star.height * shortestSide * cameraScale;
        const pulse = 0.72 + Math.sin(time * 1.65 + star.phase) * 0.22;
        const edgeFade = clamp(1.18 - star.radius * 0.5);
        const alpha = star.alpha * galaxyOpacity * pulse * edgeFade;
        const size = star.size * (0.56 + cameraScale * 0.52) * (1.08 - star.radius * 0.28);

        context.beginPath();
        context.fillStyle = this.getColor(star, alpha);
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();

        if (!this.profile.lowPower && star.size > 1.28 && approach > 0.28) {
          context.beginPath();
          context.strokeStyle = this.getColor(star, alpha * 0.30);
          context.lineWidth = 0.7;
          context.moveTo(x - size * 3.2, y);
          context.lineTo(x + size * 3.2, y);
          context.stroke();
        }
      }

      const coreRadius = shortestSide * lerp(0.006, 0.12, approach) * (1 + reveal * 0.16);
      if (this.profile.mobile || this.performanceTier !== "high") {
        context.beginPath();
        context.fillStyle = `rgba(232, 252, 255, ${galaxyOpacity * 0.58})`;
        context.arc(cameraX, cameraY, coreRadius * 0.42, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.strokeStyle = `rgba(91, 225, 255, ${galaxyOpacity * 0.42})`;
        context.lineWidth = Math.max(1, coreRadius * 0.16);
        context.arc(cameraX, cameraY, coreRadius, 0, Math.PI * 2);
        context.stroke();
      } else {
        const coreGradient = context.createRadialGradient(
          cameraX,
          cameraY,
          0,
          cameraX,
          cameraY,
          coreRadius * 2.8
        );
        coreGradient.addColorStop(0, `rgba(255, 255, 255, ${galaxyOpacity * 0.88})`);
        coreGradient.addColorStop(0.16, `rgba(111, 239, 255, ${galaxyOpacity * 0.56})`);
        coreGradient.addColorStop(0.48, `rgba(119, 80, 255, ${galaxyOpacity * 0.26})`);
        coreGradient.addColorStop(1, "rgba(255, 50, 204, 0)");
        context.fillStyle = coreGradient;
        context.fillRect(0, 0, this.width, this.height);
      }

      context.beginPath();
      context.strokeStyle = `rgba(99, 226, 255, ${galaxyOpacity * 0.20})`;
      context.lineWidth = 1 + approach * 1.2;
      context.ellipse(
        cameraX,
        cameraY,
        baseRadius * cameraScale * 0.92,
        baseRadius * cameraScale * 0.30,
        rotation * 0.11,
        0,
        Math.PI * 2
      );
      context.stroke();

      context.beginPath();
      context.strokeStyle = `rgba(255, 75, 200, ${galaxyOpacity * 0.16})`;
      context.lineWidth = 0.8 + approach;
      context.ellipse(
        cameraX,
        cameraY,
        baseRadius * cameraScale * 0.72,
        baseRadius * cameraScale * 0.24,
        rotation * 0.11 + 0.42,
        Math.PI * 0.16,
        Math.PI * 1.62
      );
      context.stroke();

      context.beginPath();
      context.strokeStyle = `rgba(141, 96, 255, ${galaxyOpacity * 0.14})`;
      context.lineWidth = 0.7 + approach * 0.8;
      context.ellipse(
        cameraX,
        cameraY,
        baseRadius * cameraScale * 0.55,
        baseRadius * cameraScale * 0.18,
        rotation * 0.11 - 0.36,
        Math.PI * 0.5,
        Math.PI * 1.92
      );
      context.stroke();
      context.restore();
    }

    drawMusicWorld(time, musicProgress, convergence) {
      const context = this.context;
      if (!context) return;

      context.save();
      context.globalCompositeOperation = this.getCompositeOperation();

      const reveal = smooth(musicProgress);
      const gather = smooth(convergence);
      const orbitRadius = Math.min(this.width, this.height) * 0.31;

      const particleCount = this.getRenderCount(this.particles);
      for (let index = 0; index < particleCount; index += 1) {
        const particle = this.particles[index];
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
      context.globalCompositeOperation = this.getCompositeOperation();

      const particleCount = this.getRenderCount(this.particles);
      for (let index = 0; index < particleCount; index += 1) {
        const particle = this.particles[index];
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

      // Pendant le raccord au chargeur, un seul écran GPU reste actif sur
      // mobile. Le chargeur existant prend alors seul le relais visuel.
      if (this.profile.mobile && values.sceneKey === "loader") return;

      if (this.reducedMotion) {
        if (time < CINEMATIC_TIMELINE.travelStart) {
          this.drawAmbient(time, 0.48);
        } else {
          this.drawDeepSpace(time, values.spaceProgress, 0);
        }
        if (time >= CINEMATIC_TIMELINE.ejectionStart) {
          this.drawSonaraGalaxy(
            time,
            values.galaxyVisibility,
            values.galaxyProgress,
            values.revealProgress,
            values.climaxProgress
          );
        }
        return;
      }

      if (time < CINEMATIC_TIMELINE.blackHoleStart) {
        this.drawAmbient(time, 0.72);
      } else if (time < CINEMATIC_TIMELINE.travelStart) {
        this.drawAmbient(time, 0.34 * (1 - values.suctionProgress));
        this.drawSingularity(time, values.blackHoleProgress, values.suctionProgress);
      } else if (time < CINEMATIC_TIMELINE.ejectionStart) {
        this.drawDeepSpace(time, values.spaceProgress, 0.72 + values.travelProgress * 0.70);
        this.drawTravel(time, values.travelProgress);
      } else if (time < CINEMATIC_TIMELINE.sonaraWorldStart) {
        const tunnelFade = 1 - values.ejectionProgress;
        this.drawTravel(time, 1, tunnelFade);
        this.drawDeepSpace(time, 1, 1.65 * tunnelFade + 0.08);
        this.drawEjectionPulse(values.ejectionProgress);
        this.drawSonaraGalaxy(
          time,
          values.galaxyVisibility,
          0,
          values.revealProgress,
          values.climaxProgress
        );
      } else {
        this.drawDeepSpace(time, 1, 0.12 + values.galaxyProgress * 0.70);
        this.drawMusicWorld(time, values.musicProgress, values.musicConvergence);
        this.drawSonaraGalaxy(
          time,
          values.galaxyVisibility,
          values.galaxyProgress,
          values.revealProgress,
          values.climaxProgress
        );
        this.drawClimax(time, values.climaxProgress);
      }
    }
  }

  const state = {
    root: null,
    loader: null,
    sceneLabel: null,
    clock: null,
    countdown: null,
    status: null,
    skipButton: null,
    recordButton: null,
    recordLabel: null,
    recordHint: null,
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
    lastRenderedAt: 0,
    lastAnimationFrameAt: 0,
    lastHudUpdateAt: -Infinity,
    lastCountdownSecond: null,
    loaderSceneVisible: null,
    mobileCinemaFrameActive: false,
    cssValues: Object.create(null),
    mobileOptimized: false,
    completionStarted: false,
    completionResolve: null,
    startPromise: null,
    audio: null,
    audioUnlockPending: false,
    audioUnlockHandler: null,
    playbackGeneration: 0,
    recordingMode: "",
    recordingStream: null,
    mediaRecorder: null,
    recordingChunks: [],
    recordingMimeType: "",
    recordingStopTimer: 0,
    recordingStopScheduled: false,
    recordingFinalizeStarted: false,
    recordingDiscarded: false,
    systemRecordingArmed: false,
    systemRecordingFinished: false,
    recordingDownloadUrl: "",
    recordingFileName: "",
    recordingDownloadConsumed: false,
    listenersAttached: false,
    forceReplay: false
  };

  function getScene(time) {
    return SCENES.find((scene) => time >= scene.start && time < scene.end) || SCENES[SCENES.length - 1];
  }

  function getSceneValues(time) {
    const scene = getScene(time);
    const ejectionProgress = smooth(range(time, CINEMATIC_TIMELINE.ejectionStart, CINEMATIC_TIMELINE.sonaraWorldStart));
    const ejectionFlashPhase = range(time, CINEMATIC_TIMELINE.ejectionStart, CINEMATIC_TIMELINE.ejectionStart + 1.4);
    return {
      scene,
      sceneKey: scene.key,
      sceneProgress: smooth(range(time, scene.start, scene.end)),
      countdownProgress: smooth(range(time, 0, CINEMATIC_TIMELINE.countdownDuration)),
      countdownHoldProgress: smooth(range(time, CINEMATIC_TIMELINE.countdownHoldStart, CINEMATIC_TIMELINE.countdownEnd)),
      blackHoleProgress: smooth(range(time, CINEMATIC_TIMELINE.blackHoleStart, CINEMATIC_TIMELINE.suctionStart)),
      suctionProgress: smooth(range(time, CINEMATIC_TIMELINE.suctionStart, CINEMATIC_TIMELINE.travelStart)),
      colorWarpProgress: time < CINEMATIC_TIMELINE.travelStart
        ? smooth(range(time, CINEMATIC_TIMELINE.suctionStart, CINEMATIC_TIMELINE.travelStart))
        : 1 - smooth(range(time, CINEMATIC_TIMELINE.travelStart, CINEMATIC_TIMELINE.travelStart + 3.2)),
      voidProgress: smooth(range(time, CINEMATIC_TIMELINE.suctionStart, CINEMATIC_TIMELINE.travelStart)),
      spaceProgress: smooth(range(time, CINEMATIC_TIMELINE.travelStart, CINEMATIC_TIMELINE.travelStart + 3.8)),
      tunnelEntryProgress: smooth(range(time, CINEMATIC_TIMELINE.travelStart, CINEMATIC_TIMELINE.travelStart + 1.8)),
      travelProgress: smooth(range(time, CINEMATIC_TIMELINE.travelStart, CINEMATIC_TIMELINE.ejectionStart)),
      ejectionProgress,
      ejectionFlashProgress: Math.sin(ejectionFlashPhase * Math.PI),
      musicProgress: smooth(range(time, CINEMATIC_TIMELINE.sonaraWorldStart, CINEMATIC_TIMELINE.revealStart)),
      galaxyVisibility: smooth(range(time, CINEMATIC_TIMELINE.ejectionStart + 1.1, CINEMATIC_TIMELINE.sonaraWorldStart - 1.0)),
      galaxyProgress: smooth(range(time, CINEMATIC_TIMELINE.galaxyApproachStart, CINEMATIC_TIMELINE.galaxyArrival)),
      musicConvergence: smooth(range(time, CINEMATIC_TIMELINE.sonaraWorldStart + 3.0, CINEMATIC_TIMELINE.revealStart)),
      revealProgress: smooth(range(time, CINEMATIC_TIMELINE.revealStart, CINEMATIC_TIMELINE.preV1Start)),
      climaxProgress: smooth(range(time, CINEMATIC_TIMELINE.climaxStart, CINEMATIC_TIMELINE.loaderStart))
    };
  }

  function setCssNumber(name, value) {
    const formattedValue = clamp(value).toFixed(4);
    if (state.cssValues[name] === formattedValue) return;
    state.cssValues[name] = formattedValue;
    state.root?.style.setProperty(name, formattedValue);
  }

  function formatClock(time) {
    const safeTime = clamp(time, 0, CINEMATIC_TIMELINE.end);
    const minutes = Math.floor(safeTime / 60);
    const seconds = Math.floor(safeTime % 60);
    const milliseconds = Math.floor((safeTime % 1) * 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  }

  function setMobileCinemaFrame(enabled, resizeCanvas = true) {
    const active = Boolean(state.mobileOptimized && enabled);
    if (state.mobileCinemaFrameActive === active) return;

    state.mobileCinemaFrameActive = active;
    state.root?.classList.toggle(MOBILE_CINEMA_ROOT_CLASS, active);
    document.body?.classList.toggle(MOBILE_CINEMA_BODY_CLASS, active);

    // Le changement de ratio n'arrive que deux fois : à 00:00:00 puis au
    // chargement. Une réallocation immédiate évite d'étirer le Canvas.
    if (resizeCanvas && !state.root?.classList.contains("is-inactive")) {
      state.renderer?.resize(true);
    }
  }

  function updateInterface(time, values) {
    const root = state.root;
    if (!root) return;

    setMobileCinemaFrame(
      time >= CINEMATIC_TIMELINE.countdownHoldStart &&
      time < CINEMATIC_TIMELINE.loaderStart
    );

    if (state.lastScene !== values.sceneKey) {
      state.lastScene = values.sceneKey;
      root.dataset.scene = values.sceneKey;
      if (state.sceneLabel) state.sceneLabel.textContent = values.scene.label;
    }

    setCssNumber("--cinematic-progress", time / CINEMATIC_TIMELINE.end);
    setCssNumber("--scene-progress", values.sceneProgress);
    setCssNumber("--countdown-progress", values.countdownProgress);
    setCssNumber("--countdown-hold-progress", values.countdownHoldProgress);
    setCssNumber("--black-hole-progress", values.blackHoleProgress);
    setCssNumber("--suction-progress", values.suctionProgress);
    setCssNumber("--color-warp-progress", values.colorWarpProgress);
    setCssNumber("--void-progress", values.voidProgress);
    setCssNumber("--space-progress", values.spaceProgress);
    setCssNumber("--tunnel-entry-progress", values.tunnelEntryProgress);
    setCssNumber("--travel-progress", values.travelProgress);
    setCssNumber("--ejection-progress", values.ejectionProgress);
    setCssNumber("--ejection-flash-progress", values.ejectionFlashProgress);
    setCssNumber("--music-progress", values.musicProgress);
    setCssNumber("--music-convergence", values.musicConvergence);
    setCssNumber("--galaxy-visibility", values.galaxyVisibility);
    setCssNumber("--approach-progress", values.galaxyProgress);
    setCssNumber("--galaxy-progress", values.galaxyProgress);
    setCssNumber("--reveal-progress", values.revealProgress);
    setCssNumber("--climax-progress", values.climaxProgress);

    // Le compteur de debug est invisible sur mobile et n'a pas besoin d'être
    // recalculé à chaque frame sur desktop.
    const now = performance.now();
    if (!state.mobileOptimized && state.clock && now - state.lastHudUpdateAt >= 90) {
      state.lastHudUpdateAt = now;
      state.clock.textContent = formatClock(time);
    }

    if (state.countdown && time < CINEMATIC_TIMELINE.countdownEnd) {
      const remainingSeconds = Math.max(0, Math.ceil(CINEMATIC_TIMELINE.countdownDuration - time));
      if (remainingSeconds !== state.lastCountdownSecond) {
        state.lastCountdownSecond = remainingSeconds;
        state.countdown.textContent = `00:00:${String(remainingSeconds).padStart(2, "0")}`;
        state.countdown.setAttribute("aria-label", `${remainingSeconds} seconde${remainingSeconds === 1 ? "" : "s"}`);
      }
    }

    const loaderScene = time >= CINEMATIC_TIMELINE.loaderStart;
    if (loaderScene !== state.loaderSceneVisible) {
      state.loaderSceneVisible = loaderScene;
      state.loader?.classList.toggle("is-cinematic-waiting", !loaderScene);
      state.loader?.classList.toggle("is-cinematic-arriving", loaderScene);
      if (loaderScene) {
        state.loader?.removeAttribute("aria-hidden");
      } else {
        state.loader?.setAttribute("aria-hidden", "true");
      }
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

  function hasSeenCinematicOnce() {
    try {
      if (localStorage.getItem(CINEMATIC_ONCE_STORAGE_KEY) === "1") return true;

      // Migration transparente : toute ancienne cinématique déjà vue compte comme
      // vue définitivement. Une nouvelle version du JS ne doit plus provoquer de reboot.
      const profile = getStoredProfile();
      if (profile?.lastSeenCinematicVersion) {
        localStorage.setItem(CINEMATIC_ONCE_STORAGE_KEY, "1");
        return true;
      }

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("sonara:lastSeenCinematicVersion:") && localStorage.getItem(key)) {
          localStorage.setItem(CINEMATIC_ONCE_STORAGE_KEY, "1");
          return true;
        }
      }
    } catch {
      // Si le stockage est indisponible, la cinématique reste fonctionnelle pour cette entrée.
    }

    return false;
  }

  function markCinematicSeenOnce() {
    try {
      localStorage.setItem(CINEMATIC_ONCE_STORAGE_KEY, "1");
      localStorage.setItem(getSeenStorageKey(), CINEMATIC_CONFIG.version);

      const profile = getStoredProfile();
      if (profile) {
        profile.lastSeenCinematicVersion = CINEMATIC_CONFIG.version;
        localStorage.setItem("sonaraProfile", JSON.stringify(profile));
      }
    } catch (error) {
      console.warn("Cinématique vue non mémorisée :", error);
    }
  }

  function isManualReplayRequested() {
    try {
      return new URLSearchParams(window.location.search).get("cinematic") === "replay";
    } catch {
      return false;
    }
  }

  function shouldPlay(forceReplay = false) {
    // Un replay demandé volontairement reste autorisé. Le lancement automatique,
    // lui, ne se produit qu’une seule fois pour ce navigateur, sans dépendre du serveur.
    if (forceReplay || isManualReplayRequested()) return true;
    if (CINEMATIC_CONFIG.devLoop) return true;
    return !hasSeenCinematicOnce();
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
    if (!audio) return true;

    try {
      await audio.play();
      return true;
    } catch (error) {
      console.warn("Lecture audio de la cinématique bloquée :", error);
      return false;
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

  function clearAudioUnlock() {
    if (state.audioUnlockHandler && state.root) {
      state.root.removeEventListener("click", state.audioUnlockHandler);
    }
    state.audioUnlockHandler = null;
    state.audioUnlockPending = false;
  }

  function armAudioUnlock() {
    if (!state.root || state.audioUnlockPending) return;

    // Le navigateur peut bloquer le son automatique, mais il ne doit jamais
    // bloquer la cinématique visuelle. Un toucher ultérieur raccorde simplement
    // l’audio à la position déjà atteinte.
    state.audioUnlockPending = true;
    state.root.classList.remove("is-paused");
    if (state.status) state.status.textContent = "";

    state.audioUnlockHandler = async () => {
      if (!state.audioUnlockPending || !state.started) return;
      const audio = loadCinematicAudio();
      if (!audio) {
        clearAudioUnlock();
        return;
      }

      audio.currentTime = getVisualTime();
      const started = await playCinematicAudio();
      if (!started) return;
      clearAudioUnlock();
    };

    state.root.addEventListener("click", state.audioUnlockHandler, { once: true });
  }

  function updateRecordingControl(label, hint = "", disabled = false) {
    if (state.recordLabel) state.recordLabel.textContent = label;
    if (state.recordButton) state.recordButton.disabled = disabled;
    if (state.recordHint) {
      state.recordHint.textContent = hint;
      state.recordHint.hidden = !hint;
    }
  }

  function supportsIntegratedScreenRecording() {
    return typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
      typeof window.MediaRecorder === "function";
  }

  function getSupportedRecordingMimeType() {
    if (typeof window.MediaRecorder?.isTypeSupported !== "function") return "";

    return [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ].find((mimeType) => window.MediaRecorder.isTypeSupported(mimeType)) || "";
  }

  function clearRecordingStopTimer() {
    if (!state.recordingStopTimer) return;
    window.clearTimeout(state.recordingStopTimer);
    state.recordingStopTimer = 0;
  }

  function stopRecordingStream() {
    const stream = state.recordingStream;
    state.recordingStream = null;
    stream?.getTracks?.().forEach((track) => {
      track.onended = null;
      try {
        track.stop();
      } catch {
        // Le navigateur peut déjà avoir fermé le partage d'écran.
      }
    });
  }

  function revokeRecordingDownload() {
    if (state.recordingDownloadUrl && typeof window.URL?.revokeObjectURL === "function") {
      window.URL.revokeObjectURL(state.recordingDownloadUrl);
    }
    state.recordingDownloadUrl = "";
    state.recordingFileName = "";
    state.recordingDownloadConsumed = false;
  }

  function triggerRecordingDownload() {
    if (!state.recordingDownloadUrl || !state.recordingFileName) return false;

    const link = document.createElement?.("a");
    if (!link) return false;
    link.href = state.recordingDownloadUrl;
    link.download = state.recordingFileName;
    link.hidden = true;
    document.body?.appendChild?.(link);
    link.click?.();
    link.remove?.();
    return true;
  }

  function createRecordingDownload(blob, mimeType) {
    revokeRecordingDownload();
    if (!blob?.size || typeof window.URL?.createObjectURL !== "function") return false;

    const extension = String(mimeType || blob.type).includes("mp4") ? "mp4" : "webm";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    state.recordingDownloadUrl = window.URL.createObjectURL(blob);
    state.recordingFileName = `sonara-pack-pre-v1-cinematic-${timestamp}.${extension}`;
    state.recordingDownloadConsumed = false;
    return triggerRecordingDownload();
  }

  function prepareRecordingAtStart() {
    clearRecordingStopTimer();
    resetRuntime(0, false);
    // resetRuntime place correctement la première image mais une pause préparée
    // doit rester reprenable par le bouton sans relancer la page.
    state.running = true;
    state.paused = true;
    state.pausedAt = performance.now();
    state.root?.classList.add("is-paused");
  }

  function resetRecordingControl() {
    clearRecordingStopTimer();
    state.recordingMode = "";
    state.recordingStopScheduled = false;
    state.recordingFinalizeStarted = false;
    state.recordingDiscarded = false;
    state.systemRecordingArmed = false;
    state.systemRecordingFinished = false;
    state.root?.classList.remove("is-recording-cinematic", "is-system-recording-finished");
    updateRecordingControl("ENREGISTRER");
  }

  function armSystemRecordingFallback(extraHint = "") {
    stopRecordingStream();
    state.mediaRecorder = null;
    state.recordingChunks = [];
    state.recordingMimeType = "";
    state.recordingMode = "";
    state.recordingStopScheduled = false;
    state.recordingFinalizeStarted = false;
    state.recordingDiscarded = false;
    state.systemRecordingArmed = true;
    state.systemRecordingFinished = false;
    state.root?.classList.remove("is-recording-cinematic", "is-system-recording-finished");
    prepareRecordingAtStart();

    const prefix = extraHint ? `${extraHint} ` : "";
    updateRecordingControl(
      "LANCER LA CINÉMATIQUE",
      `${prefix}1. Lance « Enregistrement de l’écran » dans le Centre de contrôle. 2. Reviens ici et appuie sur ce bouton.`
    );
  }

  function finishSystemRecordingGuide() {
    clearRecordingStopTimer();
    state.recordingMode = "";
    state.recordingStopScheduled = false;
    state.systemRecordingFinished = true;

    // Sur mobile, ne pas interrompre la boucle de la cinématique ici.
    // Le tick doit encore atteindre completePromise() pour libérer totalement
    // l'overlay cinématique et démarrer le vrai chargement Sonara.
    // Sinon le loader reste visible à 0 % derrière la cinématique.
    state.root?.classList.remove("is-recording-cinematic");
    state.root?.classList.add("is-system-recording-finished");
    updateRecordingControl(
      "RECOMMENCER",
      "Cinématique terminée : arrête maintenant l’enregistrement depuis le Centre de contrôle."
    );
  }

  function startSystemRecordingReplay() {
    state.systemRecordingArmed = false;
    state.systemRecordingFinished = false;
    state.recordingMode = "system";
    state.recordingStopScheduled = false;
    state.root?.classList.remove("is-system-recording-finished");
    state.root?.classList.add("is-recording-cinematic");
    resetRuntime(0, true);
  }

  function finalizeBrowserRecording() {
    if (state.recordingFinalizeStarted) return;
    state.recordingFinalizeStarted = true;
    clearRecordingStopTimer();
    const chunks = state.recordingChunks.slice();
    const mimeType = state.recordingMimeType || chunks[0]?.type || "video/webm";
    const discarded = state.recordingDiscarded;

    if (state.mediaRecorder) {
      state.mediaRecorder.ondataavailable = null;
      state.mediaRecorder.onstop = null;
      state.mediaRecorder.onerror = null;
    }
    state.mediaRecorder = null;
    state.recordingChunks = [];
    state.recordingMimeType = "";
    state.recordingMode = "";
    state.recordingStopScheduled = false;
    state.recordingDiscarded = false;
    stopRecordingStream();
    state.root?.classList.remove("is-recording-cinematic");

    if (discarded) {
      updateRecordingControl("ENREGISTRER");
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    if (!createRecordingDownload(blob, mimeType)) {
      updateRecordingControl(
        "ENREGISTRER À NOUVEAU",
        "L’enregistrement est terminé, mais le téléchargement automatique a été bloqué."
      );
      return;
    }

    updateRecordingControl(
      "TÉLÉCHARGER",
      "Vidéo enregistrée. Le téléchargement a été lancé automatiquement ; ce bouton permet de le relancer."
    );
  }

  function stopBrowserRecording(discard = false) {
    clearRecordingStopTimer();
    state.recordingDiscarded = state.recordingDiscarded || discard;
    const recorder = state.mediaRecorder;

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
        return;
      } catch {
        // Finalisation de secours juste en dessous.
      }
    }

    finalizeBrowserRecording();
  }

  async function startBrowserRecording() {
    prepareRecordingAtStart();
    revokeRecordingDownload();
    updateRecordingControl(
      "AUTORISATION…",
      "Sélectionne cet onglet ou cet écran dans la fenêtre du navigateur.",
      true
    );

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60, max: 60 } },
        audio: CINEMATIC_CONFIG.recording.captureAudio,
        preferCurrentTab: true
      });

      if (!state.started) {
        stream.getTracks?.().forEach((track) => track.stop());
        return;
      }

      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType
        ? new window.MediaRecorder(stream, { mimeType })
        : new window.MediaRecorder(stream);

      state.recordingStream = stream;
      state.mediaRecorder = recorder;
      state.recordingChunks = [];
      state.recordingMimeType = mimeType;
      state.recordingMode = "browser";
      state.recordingStopScheduled = false;
      state.recordingFinalizeStarted = false;
      state.recordingDiscarded = false;
      state.systemRecordingArmed = false;
      state.systemRecordingFinished = false;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) state.recordingChunks.push(event.data);
      };
      recorder.onstop = finalizeBrowserRecording;
      recorder.onerror = () => stopBrowserRecording(false);
      stream.getTracks?.().forEach((track) => {
        track.onended = () => stopBrowserRecording(false);
      });

      state.root?.classList.remove("is-system-recording-finished");
      state.root?.classList.add("is-recording-cinematic");
      recorder.start(1000);
      resetRuntime(0, true);
    } catch (error) {
      stream?.getTracks?.().forEach((track) => track.stop());
      console.warn("Capture intégrée indisponible, passage au mode téléphone :", error);
      armSystemRecordingFallback("La capture intégrée n’a pas démarré.");
    }
  }

  function scheduleRecordingEnd() {
    if (!state.recordingMode || state.recordingStopScheduled) return;
    state.recordingStopScheduled = true;
    clearRecordingStopTimer();
    state.recordingStopTimer = window.setTimeout(() => {
      state.recordingStopTimer = 0;
      if (state.recordingMode === "browser") {
        stopBrowserRecording(false);
      } else if (state.recordingMode === "system") {
        finishSystemRecordingGuide();
      }
    }, CINEMATIC_CONFIG.recording.endPaddingMilliseconds);
  }

  function abortRecording() {
    clearRecordingStopTimer();
    state.systemRecordingArmed = false;
    state.systemRecordingFinished = false;
    state.root?.classList.remove("is-recording-cinematic", "is-system-recording-finished");

    if (state.recordingMode === "browser" || state.mediaRecorder) {
      stopBrowserRecording(true);
      return;
    }

    state.recordingMode = "";
    state.recordingStopScheduled = false;
    stopRecordingStream();
  }

  function handleRecordingButtonClick() {
    if (!CINEMATIC_CONFIG.recording.controls || !state.started) return;

    if (state.systemRecordingFinished) {
      resetRecordingControl();
      resetRuntime(0, true);
      return;
    }

    if (state.recordingDownloadUrl && !state.recordingDownloadConsumed) {
      triggerRecordingDownload();
      state.recordingDownloadConsumed = true;
      updateRecordingControl(
        "ENREGISTRER À NOUVEAU",
        "La vidéo est téléchargée. Appuie encore une fois pour refaire une prise."
      );
      return;
    }

    if (state.systemRecordingArmed) {
      startSystemRecordingReplay();
      return;
    }

    if (supportsIntegratedScreenRecording()) {
      void startBrowserRecording();
    } else {
      revokeRecordingDownload();
      armSystemRecordingFallback();
    }
  }

  function prepareLoader() {
    state.loader?.classList.add("is-cinematic-waiting");
    state.loader?.classList.remove("is-cinematic-arriving");
    state.loader?.setAttribute("aria-hidden", "true");
    state.loaderSceneVisible = false;
  }

  function revealLoaderImmediately() {
    setMobileCinemaFrame(false, false);
    state.loader?.classList.remove("is-cinematic-waiting", "is-cinematic-arriving");
    state.loader?.removeAttribute("aria-hidden");
    state.loaderSceneVisible = true;
  }

  function resetRuntime(visualTime = 0, autoplay = true) {
    const root = state.root;
    if (!root) return;

    const generation = ++state.playbackGeneration;
    const safeTime = clamp(visualTime, 0, CINEMATIC_TIMELINE.end);
    window.cancelAnimationFrame(state.frameId);
    clearAudioUnlock();
    resetCinematicAudio();
    prepareLoader();
    state.renderer?.reset();

    root.hidden = false;
    root.classList.remove("is-inactive", "is-finishing", "is-paused");
    root.setAttribute("aria-hidden", "false");
    state.lastScene = "";
    state.lastHudUpdateAt = -Infinity;
    state.lastCountdownSecond = null;
    state.completionStarted = false;
    state.paused = !autoplay;
    state.running = autoplay;

    const now = performance.now();
    state.lastRenderedAt = now;
    state.lastAnimationFrameAt = 0;
    state.startAt = now - (safeTime / state.speed) * 1000;
    state.pausedAt = now;

    const values = getSceneValues(safeTime);
    updateInterface(safeTime, values);
    state.renderer?.draw(safeTime, values);

    const audio = loadCinematicAudio();
    if (audio) audio.currentTime = safeTime;

    if (!autoplay) {
      root.classList.add("is-paused");
      return;
    }

    if (!audio) {
      state.frameId = window.requestAnimationFrame(tick);
      return;
    }

    // La vidéo démarre immédiatement. Le son tente de partir en parallèle :
    // s’il est bloqué par Safari/Chrome, la cinématique continue sans attendre.
    state.frameId = window.requestAnimationFrame(tick);

    void playCinematicAudio().then((started) => {
      if (generation !== state.playbackGeneration || !state.started) return;
      if (!started) armAudioUnlock();
    });
  }

  function finishToLoader() {
    if (state.completionStarted) return;
    state.completionStarted = true;

    state.root?.classList.add("is-finishing");
  }

  function completePromise() {
    window.cancelAnimationFrame(state.frameId);
    state.running = false;
    clearAudioUnlock();
    resetCinematicAudio();
    setMobileCinemaFrame(false);
    state.root?.classList.add("is-inactive");
    state.root?.setAttribute("aria-hidden", "true");
    document.body?.classList.remove(CINEMATIC_BODY_CLASS);
    revealLoaderImmediately();
    detachListeners();

    const resolve = state.completionResolve;
    state.completionResolve = null;
    resolve?.({ played: true, version: CINEMATIC_CONFIG.version });
  }

  function tick(now) {
    if (!state.running || state.paused) return;

    const frameGap = state.lastAnimationFrameAt > 0 ? now - state.lastAnimationFrameAt : 0;
    state.lastAnimationFrameAt = now;
    const actualElapsed = Math.max(0, (now - state.startAt) / 1000);
    const visualTime = Math.min(CINEMATIC_TIMELINE.end, actualElapsed * state.speed);
    const frameInterval = state.renderer?.getFrameInterval?.() || 0;
    const finalFrameTime = state.startAt + (CINEMATIC_TIMELINE.end / state.speed) * 1000;
    const finalFramePending = visualTime >= CINEMATIC_TIMELINE.end && state.lastRenderedAt < finalFrameTime;
    const shouldRender = finalFramePending || (
      visualTime < CINEMATIC_TIMELINE.end &&
      (!frameInterval || now - state.lastRenderedAt >= Math.max(0, frameInterval - 2))
    );

    if (shouldRender) {
      state.lastRenderedAt = now;
      const values = getSceneValues(visualTime);
      updateInterface(visualTime, values);
      const drawStartedAt = performance.now();
      state.renderer?.draw(visualTime, values);
      state.renderer?.reportPerformance(frameGap, performance.now() - drawStartedAt);
    }

    if (actualElapsed * state.speed >= CINEMATIC_TIMELINE.end) {
      const holdElapsed = actualElapsed - CINEMATIC_TIMELINE.end / state.speed;
      scheduleRecordingEnd();

      if (CINEMATIC_CONFIG.devLoop) {
        if (
          !state.recordingMode &&
          !state.recordingStopScheduled &&
          holdElapsed >= CINEMATIC_CONFIG.loopHoldSeconds
        ) {
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
    state.lastAnimationFrameAt = 0;
    window.cancelAnimationFrame(state.frameId);
    state.root?.classList.add("is-paused");
    if (state.status) state.status.textContent = "Pause";
    pauseCinematicAudio();
  }

  function resume() {
    if (!state.running || !state.paused) return;
    const now = performance.now();
    state.startAt += now - state.pausedAt;
    state.paused = false;
    state.lastAnimationFrameAt = 0;
    state.root?.classList.remove("is-paused");
    if (state.status) state.status.textContent = "";
    void playCinematicAudio();
    state.frameId = window.requestAnimationFrame(tick);
  }

  function togglePause() {
    if (state.paused) resume();
    else pause();
  }

  function restart() {
    if (!state.started || state.recordingMode || state.systemRecordingArmed) return;
    resetRuntime(0, true);
  }

  function getVisualTime() {
    if (!state.started) return 0;
    const reference = state.paused ? state.pausedAt : performance.now();
    return clamp(((reference - state.startAt) / 1000) * state.speed, 0, CINEMATIC_TIMELINE.end);
  }

  function seekTo(visualTime) {
    if (!state.started || state.recordingMode || state.systemRecordingArmed) return;

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
    if (state.recordingMode || state.systemRecordingArmed || state.systemRecordingFinished) return;
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
    window.addEventListener("resize", state.renderer.scheduleResize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (CINEMATIC_CONFIG.devControls) document.addEventListener("keydown", handleKeydown);
    if (CINEMATIC_CONFIG.recording.controls) {
      state.recordButton?.addEventListener("click", handleRecordingButtonClick);
    state.skipButton?.addEventListener("click", skip);
    }
  }

  function detachListeners() {
    if (!state.listenersAttached) return;
    state.listenersAttached = false;
    window.removeEventListener("resize", state.renderer.scheduleResize);
    state.renderer?.cancelScheduledResize?.();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("keydown", handleKeydown);
    state.recordButton?.removeEventListener("click", handleRecordingButtonClick);
    state.skipButton?.removeEventListener("click", skip);
  }

  function initialise() {
    state.root = document.getElementById("sonaraPreV1Cinematic");
    state.loader = document.getElementById("sonaraEntryLoader");
    state.sceneLabel = document.getElementById("sonaraCinematicScene");
    state.clock = document.getElementById("sonaraCinematicClock");
    state.countdown = document.getElementById("sonaraCinematicCountdown");
    state.status = document.getElementById("sonaraCinematicStatus");
    state.skipButton = document.getElementById("sonaraCinematicSkipButton");
    state.recordButton = document.getElementById("sonaraCinematicRecordButton");
    state.recordLabel = document.getElementById("sonaraCinematicRecordLabel");
    state.recordHint = document.getElementById("sonaraCinematicRecorderHint");
    state.cssValues = Object.create(null);
    if (!state.root) return false;

    document.body?.classList.add(CINEMATIC_BODY_CLASS);

    state.mobileOptimized = isMobileCinematicDevice();
    state.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    state.speed = state.reducedMotion
      && !CINEMATIC_CONFIG.audio.enabled
      ? CINEMATIC_TIMELINE.end / CINEMATIC_CONFIG.reducedMotionDuration
      : 1;

    const canvas = document.getElementById("sonaraCinematicCanvas");
    const applyDesktopPerformanceClass = (tier) => {
      if (!state.root || state.mobileOptimized) return;
      state.root.classList.toggle("is-desktop-performance-balanced", tier === "balanced");
      state.root.classList.toggle("is-desktop-performance-low", tier === "low");
      state.root.dataset.performanceTier = tier;
    };
    state.renderer = new SonaraCinematicRenderer(
      canvas,
      state.reducedMotion,
      state.mobileOptimized,
      applyDesktopPerformanceClass
    );
    state.root.classList.toggle("is-mobile-optimized", state.mobileOptimized);
    if (!state.mobileOptimized) applyDesktopPerformanceClass(state.renderer.getPerformanceTier());
    state.root.classList.toggle("has-dev-controls", CINEMATIC_CONFIG.devControls);
    state.root.classList.toggle("has-recording-controls", CINEMATIC_CONFIG.recording.controls);
    updateRecordingControl("ENREGISTRER");
    attachListeners();
    return true;
  }

  function start(options = {}) {
    if (state.startPromise) return state.startPromise;
    if (!initialise()) return Promise.resolve({ played: false, reason: "missing_dom" });

    state.forceReplay = Boolean(options?.forceReplay);
    state.started = true;
    state.startPromise = (async () => {
      // Aucun appel serveur ici : la décision et le lancement de la cinématique
      // sont entièrement locaux pour qu’elle démarre dès l’ouverture de Sonara.
      if (!shouldPlay(state.forceReplay)) {
        state.root.classList.add("is-inactive");
        state.root.setAttribute("aria-hidden", "true");
        document.body?.classList.remove(CINEMATIC_BODY_CLASS);
        revealLoaderImmediately();
        detachListeners();
        return { played: false, reason: "not_required" };
      }

      const completion = new Promise((resolve) => {
        state.completionResolve = resolve;
      });

      // On mémorise dès le démarrage (et non à la fin) : ouvrir une deuxième
      // fenêtre pendant la lecture ne peut donc jamais relancer automatiquement la cinématique.
      if (!state.forceReplay && !isManualReplayRequested() && !CINEMATIC_CONFIG.devLoop) {
        markCinematicSeenOnce();
      }

      resetRuntime(0, true);
      return completion;
    })();

    return state.startPromise;
  }

  function skip() {
    window.cancelAnimationFrame(state.frameId);
    state.running = false;
    ++state.playbackGeneration;
    clearAudioUnlock();
    abortRecording();
    resetCinematicAudio();
    setMobileCinemaFrame(false);
    state.root?.classList.add("is-inactive");
    state.root?.setAttribute("aria-hidden", "true");
    document.body?.classList.remove(CINEMATIC_BODY_CLASS);
    revealLoaderImmediately();
    detachListeners();

    const resolve = state.completionResolve;
    state.completionResolve = null;
    resolve?.({ played: false, reason: "skipped" });
  }

  function destroy() {
    skip();
    revokeRecordingDownload();
    state.renderer?.clear();
    state.audio = null;
    state.forceReplay = false;
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
    hasSeenCurrentVersion: hasSeenCinematicOnce,
    markCurrentVersionSeen: markCinematicSeenOnce,
    isManualReplayRequested
  });
})();
