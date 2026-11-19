/* -------------------------------------------------------------------------
   У ТЕБЯ ЕСТЬ ЗВЕЗДА
   Всё личное — в content.js. Этот файл отвечает за небо, звук и чудеса.
   ------------------------------------------------------------------------- */
(() => {
  "use strict";

  const GIFT = window.GIFT || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const TAU = Math.PI * 2;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const FONT_SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
  const FONT_SANS = '"Manrope", "Segoe UI", Arial, sans-serif';
  const FONT_HAND = '"Caveat", "Segoe Script", cursive';

  const WEEKDAYS = [
    "воскресенье",
    "понедельник",
    "вторник",
    "среда",
    "четверг",
    "пятница",
    "суббота",
  ];
  const MONTHS_GEN = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  const MONTHS_GEN_UPPER = MONTHS_GEN.map((month) => month.toUpperCase());
  const WEEKDAYS_UPPER = WEEKDAYS.map((day) => day.toUpperCase());

  const store = {
    get(key, fallback = null) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch (error) {
        /* приватный режим — просто живём без памяти */
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        /* тихо */
      }
    },
  };

  const pad = (value) => String(value).padStart(2, "0");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function shortDate(date = new Date()) {
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  function hashString(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function moonInfo(date = new Date()) {
    const synodic = 29.530588853;
    const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
    const days = (date.getTime() - knownNewMoon) / 86400000;
    let phase = (days % synodic) / synodic;
    if (phase < 0) phase += 1;

    const illumination = Math.round(((1 - Math.cos(TAU * phase)) / 2) * 100);
    let name = "растущая луна";

    if (phase < 0.025 || phase >= 0.975) name = "новолуние";
    else if (phase < 0.23) name = "молодая луна";
    else if (phase < 0.27) name = "первая четверть";
    else if (phase < 0.48) name = "растущая луна";
    else if (phase < 0.52) name = "полнолуние";
    else if (phase < 0.73) name = "убывающая луна";
    else if (phase < 0.77) name = "последняя четверть";
    else name = "старая луна";

    return { phase, illumination, name, waxing: phase < 0.5 };
  }

  function dailyNoteIndex(date = new Date()) {
    const list = Array.isArray(GIFT.daily) && GIFT.daily.length ? GIFT.daily : [""];
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const base = new Date(2026, 0, 1).getTime();
    const number = Math.round((day - base) / 86400000);
    return ((number % list.length) + list.length) % list.length;
  }

  function dailyNote(date = new Date()) {
    const list = Array.isArray(GIFT.daily) && GIFT.daily.length ? GIFT.daily : [""];
    return list[dailyNoteIndex(date)] || "";
  }

  /* ------------------------------------------------------------------ toast */
  let toastTimer = 0;

  function showToast(message, duration = 2800) {
    const element = $("#toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      element.classList.remove("is-visible");
    }, duration);
  }

  /* ----------------------------------------------------------------- images */
  function loadImage(source) {
    return new Promise((resolve) => {
      if (!source) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = source;
    });
  }

  const moonTexture = loadImage("assets/moon.webp");
  const fontsReady = document.fonts
    ? Promise.resolve(document.fonts.ready).catch(() => null)
    : Promise.resolve(null);

  /* ------------------------------------------------------------------ sound */
  const Sound = (() => {
    const MASTER_LEVEL = 0.5;
    const SCALE = [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25, 739.99, 880];

    let context = null;
    let master = null;
    let reverb = null;
    let ambientTimer = 0;
    let started = false;
    let ducked = false;
    let enabled = store.get("zvezda-sound", "0") === "1";
    let noteCursor = 3;

    function createReverb(audioContext, seconds = 2.8, decay = 2.4) {
      const rate = audioContext.sampleRate;
      const length = Math.max(1, Math.floor(rate * seconds));
      const impulse = audioContext.createBuffer(2, length, rate);

      for (let channel = 0; channel < 2; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let index = 0; index < length; index += 1) {
          const fade = Math.pow(1 - index / length, decay);
          data[index] = (Math.random() * 2 - 1) * fade;
        }
      }
      return impulse;
    }

    function ensure() {
      if (context) {
        if (context.state === "suspended") context.resume();
        return true;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.0001;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 22;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.35;

      master.connect(compressor);
      compressor.connect(context.destination);

      reverb = context.createConvolver();
      reverb.buffer = createReverb(context);
      const wet = context.createGain();
      wet.gain.value = 0.34;
      reverb.connect(wet);
      wet.connect(master);

      if (context.state === "suspended") context.resume();
      return true;
    }

    function note(frequency, when, duration, level, type = "sine") {
      if (!context || !master || !reverb) return;
      const start = when === undefined ? context.currentTime : when;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(Math.max(0.0002, level), start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.2, duration));

      const main = context.createOscillator();
      main.type = type;
      main.frequency.setValueAtTime(frequency, start);

      const overtone = context.createOscillator();
      overtone.type = "sine";
      overtone.frequency.setValueAtTime(frequency * 2.002, start);
      const overtoneGain = context.createGain();
      overtoneGain.gain.value = 0.13;
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);

      main.connect(gain);
      gain.connect(master);
      gain.connect(reverb);

      main.start(start);
      overtone.start(start);
      main.stop(start + duration + 0.1);
      overtone.stop(start + duration + 0.1);
    }

    function scheduleAmbient() {
      window.clearTimeout(ambientTimer);
      if (!enabled || !started || !context || document.hidden) return;

      const now = context.currentTime + 0.06;

      const step = Math.random() < 0.24 ? 0 : Math.random() < 0.62 ? 1 : -1;
      noteCursor = clamp(noteCursor + step, 0, SCALE.length - 1);
      const frequency = SCALE[noteCursor];
      note(frequency, now, 2.8 + Math.random() * 1.4, 0.11 + Math.random() * 0.035);

      if (Math.random() < 0.42) {
        const harmonyIndex = clamp(noteCursor + (Math.random() < 0.55 ? 2 : 3), 0, SCALE.length - 1);
        note(SCALE[harmonyIndex], now + 0.16 + Math.random() * 0.22, 2.2, 0.055);
      }

      if (Math.random() < 0.26) {
        note(frequency / 2, now + 0.04, 3.6, 0.06);
      }

      ambientTimer = window.setTimeout(scheduleAmbient, 1150 + Math.random() * 1950);
    }

    function start() {
      if (started) {
        if (context && context.state === "suspended") context.resume();
        return true;
      }
      if (!ensure()) return false;

      enabled = true;
      started = true;
      store.set("zvezda-sound", "1");

      const now = context.currentTime;
      const target = MASTER_LEVEL * (ducked ? 0.28 : 1);
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(target, now + 2.1);

      scheduleAmbient();
      return true;
    }

    function stop() {
      enabled = false;
      started = false;
      store.set("zvezda-sound", "0");
      window.clearTimeout(ambientTimer);

      if (!context || !master) return;
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.7);
    }

    function toggle() {
      if (started) {
        stop();
        return false;
      }
      return start();
    }

    function duck(on) {
      ducked = on;
      if (!context || !master || !started) return;
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.linearRampToValueAtTime(MASTER_LEVEL * (on ? 0.27 : 1), now + 0.35);
    }

    function chime(index = 0) {
      if (!enabled || !context) return;
      const notes = [659.25, 739.99, 880, 987.77, 1108.73, 1318.51, 1479.98];
      const frequency = notes[Math.abs(index) % notes.length];
      const now = context.currentTime + 0.02;
      note(frequency, now, 1.7, 0.075);
      note(frequency * 1.5, now + 0.08, 1.35, 0.032);
    }

    function complete() {
      if (!enabled || !context) return;
      const now = context.currentTime + 0.05;
      const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51, 1760];
      notes.forEach((frequency, index) => {
        note(frequency, now + index * 0.13, 2.6 - index * 0.08, 0.085);
      });
    }

    function seal() {
      if (!enabled || !context) return;
      const now = context.currentTime + 0.02;
      note(196, now, 1.5, 0.09);
      note(392, now + 0.05, 1.2, 0.045);
      note(587.33, now + 0.12, 0.9, 0.026);
    }

    function meow() {
      if (!enabled || !context || !master || !reverb) return;
      const now = context.currentTime + 0.02;

      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(520, now);
      oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.13);
      oscillator.frequency.exponentialRampToValueAtTime(430, now + 0.46);

      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1700, now);
      filter.Q.value = 2.2;

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.54);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      gain.connect(reverb);
      oscillator.start(now);
      oscillator.stop(now + 0.6);
    }

    function resumeIfNeeded() {
      if (started && context && context.state === "suspended") {
        context.resume();
        scheduleAmbient();
      }
    }

    function suspendForVisibility() {
      if (!context) return;
      if (document.hidden) {
        window.clearTimeout(ambientTimer);
        if (context.state === "running") context.suspend();
      } else {
        resumeIfNeeded();
      }
    }

    document.addEventListener("visibilitychange", suspendForVisibility);

    return {
      start,
      stop,
      toggle,
      duck,
      chime,
      complete,
      seal,
      meow,
      isWanted: () => enabled,
      isPlaying: () => started,
    };
  })();

  /* --------------------------------------------------------------- bindings */
  function getPath(object, path) {
    return path.split(".").reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      return current[key];
    }, object);
  }

  function applyBindings() {
    const data = {
      ...GIFT,
      herUpper: String(GIFT.her || "").toUpperCase(),
      herShortUpper: String(GIFT.herShort || "").toUpperCase(),
      herShortGenitiveUpper: String(GIFT.herShortGenitive || "").toUpperCase(),
      herDativeUpper: String(GIFT.herDative || "").toUpperCase(),
      herGenitiveUpper: String(GIFT.herGenitive || "").toUpperCase(),
      himUpper: String(GIFT.him || "").toUpperCase(),
      himGenitiveUpper: String(GIFT.himGenitive || GIFT.him || "").toUpperCase(),
    };

    $$("[data-bind]").forEach((element) => {
      const value = getPath(GIFT, element.dataset.bind);
      if (value !== undefined && value !== null) element.textContent = String(value);
    });

    $$("[data-bind-template]").forEach((element) => {
      const template = element.dataset.bindTemplate || "";
      element.textContent = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
        const value = data[key] !== undefined ? data[key] : getPath(GIFT, key);
        return value === undefined || value === null ? match : String(value);
      });
    });
  }

  const photoUrlCache = new Map();

  function base64ToBytes(value) {
    const binary = window.atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function photoUrl(photo, quality = "s") {
    if (!photo || !photo.id || !window.__giftMedia?.photos) return "";
    const qualityKey = quality === "f" ? "f" : "s";
    const cacheKey = `${photo.id}:${qualityKey}`;
    const cached = photoUrlCache.get(cacheKey);
    if (cached) return cached;

    const asset = window.__giftMedia.photos[photo.id];
    const encoded = asset && asset[qualityKey];
    if (!encoded) return "";
    try {
      const url = URL.createObjectURL(new Blob([base64ToBytes(encoded)], { type: "image/jpeg" }));
      photoUrlCache.set(cacheKey, url);
      return url;
    } catch (error) {
      return "";
    }
  }

  function protectPhotoButton(element) {
    if (!element) return;
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showToast("Это фото не отсюда. Можно только смотреть.");
    });
    element.addEventListener("dragstart", (event) => event.preventDefault());
    element.addEventListener("selectstart", (event) => event.preventDefault());
  }

  /* ----------------------------------------------------------- page content */
  function renderPhotos() {
    const host = $("#filmFrames");
    if (!host) return;

    const photos = Array.isArray(GIFT.photos) ? GIFT.photos : [];
    host.replaceChildren();

    photos.forEach((photo, index) => {
      const figure = document.createElement("figure");
      figure.className = "frame";
      figure.setAttribute("role", "listitem");
      figure.setAttribute("data-photo-protected", "true");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "frame__open";
      button.dataset.open = "photo";
      button.dataset.photo = String(index);
      button.setAttribute("aria-label", `Рассмотреть фото: ${photo.caption || "любимый кадр"}`);
      protectPhotoButton(button);

      const image = document.createElement("img");
      image.src = photoUrl(photo, "s");
      image.alt = photo.alt || "Любимый кадр";
      image.width = 450;
      image.height = 563;
      image.loading = index > 1 ? "lazy" : "eager";
      image.decoding = "async";
      image.draggable = false;

      const caption = document.createElement("figcaption");
      caption.textContent = photo.caption || "";

      button.appendChild(image);
      figure.append(button, caption);
      host.appendChild(figure);
    });
  }

  function renderLetter() {
    const body = $("#letterBody");
    if (!body) return;
    const letter = GIFT.letter || {};
    body.replaceChildren();

    if (letter.greeting) {
      const greeting = document.createElement("p");
      greeting.textContent = letter.greeting;
      body.appendChild(greeting);
    }

    (Array.isArray(letter.paragraphs) ? letter.paragraphs : []).forEach((text) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      body.appendChild(paragraph);
    });

    const signature = $("#letterSign");
    if (signature && letter.signature) signature.textContent = letter.signature;

    const postscript = $("#letterPs");
    if (postscript) postscript.textContent = letter.ps || "";
  }

  let lastRenderedDate = "";

  function renderToday(force = false) {
    const now = new Date();
    const key = dateKey(now);
    const changed = force || key !== lastRenderedDate;

    const weekday = $("#todayWeekday");
    const day = $("#todayDay");
    const month = $("#todayMonth");
    const time = $("#localTime");
    const phaseName = $("#moonPhaseName");
    const illumination = $("#moonIllumination");

    if (weekday) weekday.textContent = WEEKDAYS[now.getDay()];
    if (day) day.textContent = String(now.getDate());
    if (month) month.textContent = MONTHS_GEN[now.getMonth()];
    if (time) time.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const moon = moonInfo(now);
    if (phaseName) phaseName.textContent = moon.name;
    if (illumination) illumination.textContent = `освещено ${moon.illumination}%`;

    $$("[data-today-short]").forEach((element) => {
      element.textContent = shortDate(now);
    });

    if (changed) {
      lastRenderedDate = key;
      const note = $("#dailyNote");
      if (note) note.textContent = dailyNote(now);
      window.setTimeout(scheduleWallpaper, 180);
    }
  }

  function startClock() {
    renderToday(true);
    window.setInterval(renderToday, 30000);
  }

  /* ----------------------------------------------------------------- reveal */
  function initReveal() {
    const elements = $$(".reveal");
    if (!elements.length) return;

    if (reducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-in"));
      return;
    }

    elements.forEach((element) => {
      const section = element.closest("section") || document.body;
      const siblings = Array.from(section.querySelectorAll(".reveal"));
      const index = Math.max(0, siblings.indexOf(element));
      element.style.transitionDelay = `${Math.min(index * 65, 390)}ms`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -7% 0px" }
    );

    elements.forEach((element) => observer.observe(element));
  }

  function replayHero() {
    const elements = $$("#top .reveal");
    if (!elements.length) return;

    if (reducedMotion) {
      elements.forEach((element) => element.classList.add("is-in"));
      return;
    }

    elements.forEach((element) => element.classList.remove("is-in"));
    window.requestAnimationFrame(() => {
      elements.forEach((element, index) => {
        window.setTimeout(() => element.classList.add("is-in"), 120 + index * 110);
      });
    });
  }

  /* -------------------------------------------------------------------- sky */
  function initSky() {
    const canvas = $("#sky");
    if (!canvas) return { shoot() {} };

    const context = canvas.getContext("2d");
    if (!context) return { shoot() {} };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars = [];
    let meteors = [];
    let frame = 0;
    let running = false;
    let lastTime = 0;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, active: false };

    const starColors = [
      [247, 227, 182],
      [243, 236, 223],
      [185, 205, 234],
      [229, 168, 174],
    ];

    function generateStars() {
      const random = mulberry32(hashString(`sky-${width}x${height}`));
      const count = clamp(Math.round((width * height) / 6200), 120, 430);
      stars = [];

      for (let index = 0; index < count; index += 1) {
        const color = starColors[Math.floor(random() * starColors.length)];
        const bright = random() > 0.92;
        stars.push({
          x: random() * width,
          y: random() * height,
          radius: bright ? 1.3 + random() * 1.25 : 0.35 + random() * 0.95,
          alpha: bright ? 0.55 + random() * 0.4 : 0.12 + random() * 0.5,
          speed: 0.45 + random() * 1.35,
          phase: random() * TAU,
          depth: 0.25 + random() * 0.75,
          color,
          cross: bright && random() > 0.48,
        });
      }
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      generateStars();
      if (reducedMotion) drawStatic();
    }

    function drawStars(time, withMotion) {
      const scroll = withMotion ? window.scrollY : 0;

      stars.forEach((star) => {
        let x = star.x + (withMotion ? pointer.x * star.depth * 23 : 0);
        let y = star.y + (withMotion ? pointer.y * star.depth * 15 - scroll * star.depth * 0.045 : 0);
        x = ((x % width) + width) % width;
        y = ((y % height) + height) % height;

        const twinkle = withMotion
          ? 0.66 + 0.34 * Math.sin(time * 0.001 * star.speed + star.phase)
          : 0.88;
        const alpha = clamp(star.alpha * twinkle, 0.03, 1);
        const [red, green, blue] = star.color;

        context.beginPath();
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        context.arc(x, y, star.radius, 0, TAU);
        context.fill();

        if (star.cross) {
          context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.45})`;
          context.lineWidth = 0.55;
          const length = star.radius * 4.6;
          context.beginPath();
          context.moveTo(x - length, y);
          context.lineTo(x + length, y);
          context.moveTo(x, y - length);
          context.lineTo(x, y + length);
          context.stroke();
        }
      });
    }

    function spawnMeteor() {
      if (reducedMotion || !running) return;
      const startX = width * (0.56 + Math.random() * 0.42);
      const startY = height * (0.06 + Math.random() * 0.32);
      const speed = width * (0.46 + Math.random() * 0.25);
      meteors.push({
        x: startX,
        y: startY,
        vx: -speed,
        vy: speed * (0.42 + Math.random() * 0.18),
        life: 0.9 + Math.random() * 0.5,
        maxLife: 1.4,
        width: 1 + Math.random() * 1.2,
      });
      if (meteors.length > 7) meteors.shift();
    }

    function drawMeteors(delta) {
      for (let index = meteors.length - 1; index >= 0; index -= 1) {
        const meteor = meteors[index];
        meteor.life -= delta;
        if (meteor.life <= 0) {
          meteors.splice(index, 1);
          continue;
        }

        meteor.x += meteor.vx * delta;
        meteor.y += meteor.vy * delta;
        const alpha = clamp(meteor.life / 0.55, 0, 1);
        const tailX = meteor.x - meteor.vx * 0.11;
        const tailY = meteor.y - meteor.vy * 0.11;

        const gradient = context.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(255, 247, 226, ${alpha})`);
        gradient.addColorStop(0.45, `rgba(247, 227, 182, ${alpha * 0.55})`);
        gradient.addColorStop(1, "rgba(247, 227, 182, 0)");

        context.strokeStyle = gradient;
        context.lineWidth = meteor.width;
        context.beginPath();
        context.moveTo(meteor.x, meteor.y);
        context.lineTo(tailX, tailY);
        context.stroke();

        context.beginPath();
        context.fillStyle = `rgba(255, 248, 230, ${alpha * 0.9})`;
        context.arc(meteor.x, meteor.y, 1.4, 0, TAU);
        context.fill();
      }
    }

    function draw(time, withMotion) {
      context.clearRect(0, 0, width, height);
      drawStars(time, withMotion);
    }

    function drawStatic() {
      context.clearRect(0, 0, width, height);
      drawStars(0, false);
    }

    function tick(time) {
      if (!running) return;
      const delta = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0.016;
      lastTime = time;

      pointer.x += (pointer.targetX - pointer.x) * 0.055;
      pointer.y += (pointer.targetY - pointer.y) * 0.055;

      context.clearRect(0, 0, width, height);
      drawStars(time, true);
      drawMeteors(delta);

      frame = window.requestAnimationFrame(tick);
    }

    function startLoop() {
      if (running || reducedMotion) return;
      running = true;
      lastTime = 0;
      frame = window.requestAnimationFrame(tick);
    }

    function stopLoop() {
      running = false;
      window.cancelAnimationFrame(frame);
    }

    function onPointerMove(event) {
      if (!finePointer) return;
      pointer.active = true;
      pointer.targetX = (event.clientX / width - 0.5) * 2;
      pointer.targetY = (event.clientY / height - 0.5) * 2;
    }

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 180);
    });

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (reducedMotion) return;
      if (document.hidden) stopLoop();
      else startLoop();
    });

    resize();
    if (reducedMotion) drawStatic();
    else startLoop();

    return {
      shoot(count = 1) {
        if (reducedMotion) return;
        for (let index = 0; index < count; index += 1) {
          window.setTimeout(spawnMeteor, index * 170);
        }
      },
    };
  }

  /* ----------------------------------------------------------------- cursor */
  function initCursor() {
    const glow = $("#cursorGlow");
    if (!glow || !finePointer || reducedMotion) return;

    document.body.classList.add("has-pointer");
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let frame = 0;

    function animate() {
      currentX += (targetX - currentX) * 0.14;
      currentY += (targetY - currentY) * 0.14;
      glow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      if (Math.abs(targetX - currentX) > 0.4 || Math.abs(targetY - currentY) > 0.4) {
        frame = window.requestAnimationFrame(animate);
      } else {
        frame = 0;
      }
    }

    window.addEventListener(
      "pointermove",
      (event) => {
        targetX = event.clientX;
        targetY = event.clientY;
        if (!frame) frame = window.requestAnimationFrame(animate);
      },
      { passive: true }
    );
  }

  function initCursorSparkles() {
    if (!finePointer || reducedMotion) return;
    let lastTime = 0;
    let lastX = 0;
    let lastY = 0;
    const symbols = ["✦", "·", "♡", "✧"];

    window.addEventListener(
      "pointermove",
      (event) => {
        if (!document.documentElement.classList.contains("entered")) return;
        const now = performance.now();
        const distance = Math.hypot(event.clientX - lastX, event.clientY - lastY);
        if (now - lastTime < 85 || distance < 12 || $$(".cursor-spark").length > 16) return;
        lastTime = now;
        lastX = event.clientX;
        lastY = event.clientY;

        const spark = document.createElement("i");
        const rose = Math.random() < 0.28;
        spark.className = "cursor-spark";
        spark.textContent = symbols[Math.floor(Math.random() * symbols.length)];
        spark.style.setProperty("--particle-x", `${event.clientX}px`);
        spark.style.setProperty("--particle-y", `${event.clientY}px`);
        spark.style.setProperty("--particle-dx", `${-8 + Math.random() * 16}px`);
        spark.style.setProperty("--particle-dy", `${-18 - Math.random() * 24}px`);
        spark.style.setProperty("--particle-size", `${7 + Math.random() * 8}px`);
        spark.style.setProperty("--particle-color", rose ? "#e5a8ae" : "#f7e3b6");
        document.body.appendChild(spark);
        window.setTimeout(() => spark.remove(), 1100);
      },
      { passive: true }
    );
  }

  /* ----------------------------------------------------------------- header */
  function initChrome() {
    const header = $("#siteHeader");
    const progress = $("#pageProgress span");
    const chapter = $("#chapterNow");

    const sections = ["top", "certificate", "photos", "constellation", "today", "letter", "promises", "gift"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    const labels = {
      top: "ЛИЧНОЕ НЕБО",
      certificate: "СВИДЕТЕЛЬСТВО",
      photos: "МОЙ ЛЮБИМЫЙ ВИД",
      constellation: "СОЗВЕЗДИЕ",
      today: "СЕГОДНЯ",
      letter: "ПИСЬМО",
      promises: "ПРО НАС ДВОИХ",
      gift: "НАСТОЯЩЕЕ",
    };

    let lastChapter = "";

    function onScroll() {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = range > 0 ? clamp(scrollTop / range, 0, 1) : 0;

      if (progress) progress.style.transform = `scaleX(${ratio})`;
      if (header) header.classList.toggle("is-scrolled", scrollTop > 26);

      if (!chapter) return;
      const middle = window.innerHeight * 0.45;
      let current = "ЛИЧНОЕ НЕБО";

      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= middle && rect.bottom > middle) {
          current = labels[section.id] || current;
        }
      });

      if (current !== lastChapter) {
        lastChapter = current;
        chapter.textContent = current;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  /* ------------------------------------------------------------------ intro */
  function syncSoundUi() {
    const on = Sound.isWanted();
    const toggle = $("#soundToggle");
    const footer = $("#soundFooter");

    if (toggle) {
      toggle.classList.toggle("is-on", on);
      toggle.setAttribute("aria-pressed", String(on));
      toggle.setAttribute("aria-label", on ? "Выключить звук" : "Включить звук");
      const label = toggle.querySelector(".sound__label");
      if (label) label.textContent = on ? "звук вкл" : "звук";
    }

    if (footer) footer.textContent = on ? "звук вкл" : "звук";
  }

  function initSoundUi() {
    syncSoundUi();

    function toggle() {
      if (Sound.isWanted()) {
        Sound.stop();
        syncSoundUi();
        showToast("Звук выключен. Здесь можно и в тишине.");
        return;
      }

      if (Sound.start()) {
        syncSoundUi();
        showToast("Звук включён. Слушай небо.");
      } else {
        showToast("Браузер не разрешил звук. Попробуй ещё раз.");
      }
    }

    $("#soundToggle")?.addEventListener("click", toggle);
    $("#soundFooter")?.addEventListener("click", toggle);

    if (document.documentElement.classList.contains("entered") && Sound.isWanted()) {
      const startOnce = () => {
        Sound.start();
        document.removeEventListener("pointerdown", startOnce, true);
      };
      document.addEventListener("pointerdown", startOnce, { capture: true, once: true });
    }
  }

  function initIntro() {
    const html = document.documentElement;
    const intro = $("#intro");
    if (!intro) return;

    if (html.classList.contains("entered")) {
      intro.hidden = true;
      return;
    }

    const keepAlive = [$("#siteHeader"), $("#main"), $(".footer")].filter(Boolean);
    keepAlive.forEach((element) => element.setAttribute("inert", ""));
    document.body.classList.add("is-locked");

    intro.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = $$("button, a[href]", intro).filter((element) => !element.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    intro.setAttribute("tabindex", "-1");
    window.setTimeout(() => intro.focus({ preventScroll: true }), 300);

    let leaving = false;

    $$("[data-enter]", intro).forEach((button) => {
      button.addEventListener("click", () => {
        if (leaving) return;
        leaving = true;

        const withSound = button.dataset.enter === "sound";
        if (withSound) Sound.start();
        else Sound.stop();
        syncSoundUi();
        store.set("zvezda-entered", "1");

        intro.classList.add("is-leaving");
        intro.setAttribute("aria-hidden", "true");

        const delay = reducedMotion ? 40 : 840;
        window.setTimeout(() => {
          html.classList.add("entered");
          intro.hidden = true;
          document.body.classList.remove("is-locked");
          keepAlive.forEach((element) => element.removeAttribute("inert"));

          replayHero();
          sky.shoot(2);
          $(".brand")?.focus({ preventScroll: true });
        }, delay);
      });
    });
  }

  /* ------------------------------------------------------------ constellation */
  function initConstellation() {
    const host = $("#starButtons");
    const chipsHost = $("#starChips");
    const path = $("#heartPath");
    const progressPath = $("#heartProgress");
    const stage = $("#constellationStage");
    const panel = $("#starPanel");
    const wordElement = $("#starWord");
    const lineElement = $("#starLine");
    const countElement = $("#starCount");
    const dotsHost = $("#starDots");
    const resetButton = $("#starReset");
    const stageHint = $("#stageHint");

    const config = GIFT.constellation || {};
    const list = Array.isArray(config.stars) ? config.stars : [];
    if (!host || !path || !list.length) return { reset() {} };

    const storedIds = (() => {
      try {
        const raw = store.get("zvezda-stars", "[]");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    })();

    const lit = new Set(storedIds.filter((id) => list.some((star) => star.id === id)));
    const buttons = [];
    const chips = [];
    const dots = [];
    let panelTimer = 0;
    let completeTimer = 0;
    let hasCompleted = false;

    if (stageHint && config.hint) stageHint.textContent = config.hint;
    if (wordElement) wordElement.textContent = config.initialWord || "Выбери первую звезду";
    if (lineElement) lineElement.textContent = config.initialLine || "";

    if (dotsHost) {
      dotsHost.replaceChildren();
      list.forEach(() => {
        const dot = document.createElement("i");
        dotsHost.appendChild(dot);
        dots.push(dot);
      });
    }

    const fractions = [0.05, 0.188, 0.327, 0.465, 0.603, 0.742, 0.88];
    let totalLength = 0;

    try {
      totalLength = path.getTotalLength();
      if (progressPath) {
        progressPath.style.strokeDasharray = `${totalLength}`;
        progressPath.style.strokeDashoffset = `${totalLength}`;
      }
    } catch (error) {
      totalLength = 0;
    }

    function labelSide(x, y) {
      if (x < 230) return "left";
      if (x > 370) return "right";
      if (y > 420) return "top";
      return "top";
    }

    list.forEach((star, index) => {
      let point = { x: 300, y: 280 };
      if (totalLength) {
        try {
          point = path.getPointAtLength(totalLength * fractions[index % fractions.length]);
        } catch (error) {
          /* оставим точку по умолчанию */
        }
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "star-button";
      button.dataset.star = String(index);
      button.dataset.side = labelSide(point.x, point.y);
      button.style.left = `${(point.x / 600) * 100}%`;
      button.style.top = `${(point.y / 560) * 100}%`;
      button.setAttribute("aria-label", `Звезда ${index + 1}: ${star.word}`);
      button.setAttribute("aria-pressed", "false");

      const dot = document.createElement("span");
      dot.className = "star-button__dot";
      const label = document.createElement("span");
      label.className = "star-button__label";
      label.textContent = star.word;

      button.append(dot, label);
      button.addEventListener("click", () => selectStar(index));
      host.appendChild(button);
      buttons.push(button);

      if (chipsHost) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.dataset.chip = String(index);
        chip.setAttribute("aria-pressed", "false");
        chip.textContent = star.word;
        chip.addEventListener("click", () => selectStar(index));
        chipsHost.appendChild(chip);
        chips.push(chip);
      }

      if (lit.has(star.id)) {
        button.classList.add("is-lit");
        button.setAttribute("aria-pressed", "true");
        if (chips[index]) chips[index].setAttribute("aria-pressed", "true");
        if (dots[index]) dots[index].classList.add("is-lit");
      }
    });

    const center = document.createElement("button");
    center.type = "button";
    center.className = "star-button star-button--center";
    center.setAttribute("aria-label", "Моё сердце. Открыть письмо");
    center.innerHTML =
      '<span class="star-button__dot"></span><span class="star-button__label">Моё сердце</span>';
    center.addEventListener("click", () => openLetter(true));
    host.appendChild(center);

    function updateProgress() {
      if (countElement) countElement.textContent = String(lit.size);
      if (progressPath && totalLength) {
        progressPath.style.strokeDashoffset = `${totalLength * (1 - lit.size / list.length)}`;
      }
      buttons.forEach((button, index) => {
        const isLit = lit.has(list[index].id);
        button.classList.toggle("is-lit", isLit);
        button.setAttribute("aria-pressed", String(isLit));
        if (chips[index]) chips[index].setAttribute("aria-pressed", String(isLit));
        if (dots[index]) dots[index].classList.toggle("is-lit", isLit);
      });
      if (resetButton) resetButton.hidden = lit.size === 0;
    }

    function save() {
      const ids = list.filter((star) => lit.has(star.id)).map((star) => star.id);
      store.set("zvezda-stars", JSON.stringify(ids));
    }

    function showStar(star, index, animate = true) {
      window.clearTimeout(completeTimer);
      if (!wordElement || !lineElement) return;

      if (!animate) {
        wordElement.textContent = star.word;
        lineElement.textContent = star.line;
        return;
      }

      window.clearTimeout(panelTimer);
      panel?.classList.add("is-changing");
      panelTimer = window.setTimeout(() => {
        wordElement.textContent = star.word;
        lineElement.textContent = star.line;
        panel?.classList.remove("is-changing");
      }, 150);
    }

    function showComplete(animate = true) {
      if (!wordElement || !lineElement) return;
      if (!animate) {
        wordElement.textContent = config.completeWord || "Моё сердце";
        lineElement.textContent = config.completeLine || "";
        return;
      }
      completeTimer = window.setTimeout(() => {
        panel?.classList.add("is-changing");
        window.setTimeout(() => {
          wordElement.textContent = config.completeWord || "Моё сердце";
          lineElement.textContent = config.completeLine || "";
          panel?.classList.remove("is-changing");
        }, 160);
      }, 1450);
    }

    function setComplete(animate = true) {
      if (hasCompleted) return;
      hasCompleted = true;
      stage?.classList.add("is-complete");
      panel?.classList.add("is-complete");
      if (resetButton) resetButton.hidden = false;
      if (stageHint && config.completeHint) stageHint.textContent = config.completeHint;
      showComplete(animate);

      if (animate) {
        Sound.complete();
        sky.shoot(3);
        showToast("Семь из семи. Небо ответило.", 3800);
      }
    }

    function selectStar(index) {
      const star = list[index];
      if (!star) return;

      const wasLit = lit.has(star.id);
      if (!wasLit) {
        lit.add(star.id);
        save();
        Sound.chime(index);
      }

      updateProgress();
      showStar(star, index);

      if (lit.size === list.length && !hasCompleted) {
        setComplete(true);
      }
    }

    function resetAll(announce = true) {
      lit.clear();
      hasCompleted = false;
      window.clearTimeout(completeTimer);
      window.clearTimeout(panelTimer);
      panel?.classList.remove("is-complete");
      panel?.classList.remove("is-changing");
      stage?.classList.remove("is-complete");
      if (stageHint && config.hint) stageHint.textContent = config.hint;
      if (wordElement) wordElement.textContent = config.initialWord || "Выбери первую звезду";
      if (lineElement) lineElement.textContent = config.initialLine || "";
      if (resetButton) resetButton.hidden = true;
      updateProgress();
      store.remove("zvezda-stars");
      if (announce) showToast("Небо снова чистое. Можно собирать заново.");
    }

    updateProgress();

    const litInOrder = list.filter((star) => lit.has(star.id));
    if (litInOrder.length) {
      const last = litInOrder[litInOrder.length - 1];
      const index = list.indexOf(last);
      showStar(last, index, false);
    }
    if (lit.size === list.length) setComplete(false);
    else if (stageHint && config.hint) stageHint.textContent = config.hint;

    resetButton?.addEventListener("click", () => resetAll(true));
    $("#resetAll")?.addEventListener("click", () => resetAll(true));

    return { reset: resetAll };
  }

  /* --------------------------------------------------------------- promises */
  function initPromises() {
    const buttons = $$("[data-promise]");
    const answerButtons = $$("[data-answer]");
    const final = $("#promiseFinal");
    const finalText = $("#promiseFinalText");
    const togetherCard = $("#togetherCard");
    const togetherResponse = $("#togetherResponse");
    if (!buttons.length || !final || !finalText) return;

    const stored = (() => {
      try {
        const value = JSON.parse(store.get("zvezda-promises", "[]"));
        return Array.isArray(value) ? value : [];
      } catch (error) {
        return [];
      }
    })();
    const opened = new Set(stored.map(Number).filter((index) => index >= 0 && index < buttons.length));
    let celebrated = opened.size === buttons.length;
    let answer = store.get("zvezda-answer", "");

    function burst(event, button) {
      if (reducedMotion) return;
      const rect = button.getBoundingClientRect();
      const x = event?.clientX || rect.left + rect.width / 2;
      const y = event?.clientY || rect.top + rect.height / 2;
      const symbols = ["♡", "✦", "·", "♡", "✧"];

      for (let index = 0; index < 13; index += 1) {
        const particle = document.createElement("i");
        const angle = (index / 13) * TAU + Math.random() * 0.35;
        const distance = 42 + Math.random() * 72;
        particle.className = "cute-particle";
        particle.textContent = symbols[index % symbols.length];
        particle.style.setProperty("--particle-x", `${x}px`);
        particle.style.setProperty("--particle-y", `${y}px`);
        particle.style.setProperty("--particle-dx", `${Math.cos(angle) * distance}px`);
        particle.style.setProperty("--particle-dy", `${Math.sin(angle) * distance}px`);
        particle.style.setProperty("--particle-delay", `${Math.random() * 100}ms`);
        particle.style.setProperty("--particle-size", `${9 + Math.random() * 10}px`);
        particle.style.setProperty(
          "--particle-color",
          index % 3 === 0 ? "#e5a8ae" : "#f7e3b6"
        );
        document.body.appendChild(particle);
        window.setTimeout(() => particle.remove(), 1500);
      }
    }

    function render(animate = false) {
      buttons.forEach((button, index) => {
        const isOpen = opened.has(index);
        button.classList.toggle("is-open", isOpen);
        button.setAttribute("aria-expanded", String(isOpen));
        const hint = $(".promise-card__hint", button);
        if (hint) hint.textContent = isOpen ? "обещание открыто · навсегда" : "коснись, чтобы открыть";
      });

      const complete = opened.size === buttons.length;
      final.classList.toggle("is-complete", complete);
      finalText.textContent = complete
        ? GIFT.promises?.final || "Теперь это обещания про нас двоих. Бессрочно."
        : "Открой все три — и небо запомнит.";

      if (complete && animate && !celebrated) {
        celebrated = true;
        Sound.complete();
        sky.shoot(4);
        showToast("Три обещания сохранены. Бессрочно.", 3800);
      }
    }

    function renderAnswer(animate = false) {
      const messages = GIFT.promises?.answers || {};
      answerButtons.forEach((button) => {
        const selected = button.dataset.answer === answer;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      togetherCard?.classList.toggle("is-answered", Boolean(answer));
      if (togetherResponse) {
        togetherResponse.textContent = answer
          ? messages[answer] || "Теперь это наше общее небо."
          : "Я подожду твой ответ здесь.";
      }
      if (answer && animate) {
        sky.shoot(2);
        showToast("Ответ Амалечки услышан. Теперь это ваше небо.", 3400);
      }
    }

    buttons.forEach((button, index) => {
      button.addEventListener("click", (event) => {
        const firstOpen = !opened.has(index);
        opened.add(index);
        store.set("zvezda-promises", JSON.stringify(Array.from(opened)));
        if (firstOpen) Sound.chime(index + 2);
        burst(event, button);
        render(true);
      });
    });

    answerButtons.forEach((button, index) => {
      button.addEventListener("click", (event) => {
        answer = button.dataset.answer || "";
        store.set("zvezda-answer", answer);
        Sound.chime(index + 5);
        burst(event, button);
        renderAnswer(true);
      });
    });

    $("#resetAll")?.addEventListener("click", () => {
      opened.clear();
      celebrated = false;
      answer = "";
      store.remove("zvezda-promises");
      store.remove("zvezda-answer");
      render(false);
      renderAnswer(false);
    });

    render(false);
    renderAnswer(false);
  }

  /* ----------------------------------------------------------------- dialogs */
  const dialogFocus = new WeakMap();

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    const open = $("dialog[open]");
    if (open && open !== dialog) open.close();

    dialogFocus.set(dialog, document.activeElement);
    dialog.showModal();
    document.body.classList.add("is-locked");
    Sound.duck(true);
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function initDialogs() {
    $$("dialog").forEach((dialog) => {
      dialog.addEventListener("close", () => {
        if (!$("dialog[open]")) {
          document.body.classList.remove("is-locked");
          Sound.duck(false);
        }
        const previous = dialogFocus.get(dialog);
        if (previous && typeof previous.focus === "function" && previous.isConnected) {
          previous.focus({ preventScroll: true });
        }
        dialogFocus.delete(dialog);
      });

      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        if (!inside) dialog.close();
      });
    });
  }

  function openLetter(fromStar = false) {
    const dialog = $("#letterDialog");
    if (!dialog) return;

    if (fromStar) {
      Sound.seal();
      openDialog(dialog);
      return;
    }

    const envelope = $("#envelope");
    if (!envelope) {
      openDialog(dialog);
      return;
    }

    if (envelope.classList.contains("is-opening")) return;
    envelope.classList.add("is-opening");
    Sound.seal();

    window.setTimeout(
      () => {
        openDialog(dialog);
        envelope.classList.remove("is-opening");
      },
      reducedMotion ? 60 : 620
    );
  }

  /* ------------------------------------------------------------ canvas assets */
  function setFont(context, size, family = FONT_SANS, options = {}) {
    const style = options.style || "normal";
    const weight = options.weight || 400;
    context.font = `${style} ${weight} ${size}px ${family}`;
  }

  function wrapText(context, text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width <= maxWidth || !line) {
        line = test;
      } else {
        lines.push(line);
        line = word;
      }
    });

    if (line) lines.push(line);
    return lines;
  }

  function drawTracked(context, text, x, y, options = {}) {
    const size = options.size || 16;
    const family = options.family || FONT_SANS;
    const weight = options.weight || 600;
    const tracking = options.tracking || 0;
    const color = options.color || "#e2c58c";
    const align = options.align || "left";
    const chars = Array.from(String(text));

    context.save();
    setFont(context, size, family, { weight });
    context.fillStyle = color;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";

    let total = 0;
    chars.forEach((char, index) => {
      total += context.measureText(char).width;
      if (index < chars.length - 1) total += tracking;
    });

    let cursor = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    chars.forEach((char, index) => {
      context.fillText(char, cursor, y);
      cursor += context.measureText(char).width;
      if (index < chars.length - 1) cursor += tracking;
    });
    context.restore();
  }

  function drawLine(context, x1, y1, x2, y2, color, width = 1) {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.restore();
  }

  function drawStarField(context, width, height, count, random, options = {}) {
    const maxRadius = options.maxRadius || 1.5;
    const maxAlpha = options.maxAlpha || 0.65;
    const colors = options.colors || ["247, 227, 182", "243, 236, 223", "185, 205, 234"];

    for (let index = 0; index < count; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = random() * maxRadius;
      const alpha = 0.12 + random() * maxAlpha;
      const color = colors[Math.floor(random() * colors.length)];

      context.beginPath();
      context.fillStyle = `rgba(${color}, ${alpha})`;
      context.arc(x, y, radius, 0, TAU);
      context.fill();

      if (radius > maxRadius * 0.72 && random() > 0.7) {
        context.strokeStyle = `rgba(${color}, ${alpha * 0.32})`;
        context.lineWidth = 0.6;
        context.beginPath();
        context.moveTo(x - radius * 4, y);
        context.lineTo(x + radius * 4, y);
        context.moveTo(x, y - radius * 4);
        context.lineTo(x, y + radius * 4);
        context.stroke();
      }
    }
  }

  function drawProceduralMoon(context, size) {
    const radius = size / 2;
    const random = mulberry32(20261119);

    context.save();
    context.beginPath();
    context.arc(radius, radius, radius - 1, 0, TAU);
    context.clip();

    const base = context.createRadialGradient(
      radius * 0.66,
      radius * 0.56,
      radius * 0.06,
      radius,
      radius,
      radius
    );
    base.addColorStop(0, "#f1ebdc");
    base.addColorStop(0.45, "#d8d1c1");
    base.addColorStop(0.8, "#b9b1a2");
    base.addColorStop(1, "#8d877b");
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);

    for (let index = 0; index < 36; index += 1) {
      const x = random() * size;
      const y = random() * size;
      const crater = 2 + random() * radius * 0.18;
      context.beginPath();
      context.fillStyle = `rgba(72, 69, 66, ${0.05 + random() * 0.11})`;
      context.arc(x, y, crater, 0, TAU);
      context.fill();
      context.beginPath();
      context.strokeStyle = `rgba(255, 252, 242, ${0.07 + random() * 0.12})`;
      context.lineWidth = 1.2;
      context.arc(x, y, crater, Math.PI * 0.9, Math.PI * 1.9);
      context.stroke();
    }

    context.restore();
  }

  function drawMoon(context, centerX, centerY, radius, phase, texture) {
    const size = Math.max(64, Math.round(radius * 2));
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const moonContext = offscreen.getContext("2d", { willReadFrequently: true });
    if (!moonContext) return;

    let workingCanvas = offscreen;
    let workingContext = moonContext;
    let imageData = null;

    try {
      if (texture) moonContext.drawImage(texture, 0, 0, size, size);
      else drawProceduralMoon(moonContext, size);
      imageData = moonContext.getImageData(0, 0, size, size);
    } catch (error) {
      const fallback = document.createElement("canvas");
      fallback.width = size;
      fallback.height = size;
      const fallbackContext = fallback.getContext("2d", { willReadFrequently: true });
      if (!fallbackContext) return;
      drawProceduralMoon(fallbackContext, size);
      imageData = fallbackContext.getImageData(0, 0, size, size);
      workingCanvas = fallback;
      workingContext = fallbackContext;
    }

    const data = imageData.data;
    const half = size / 2;
    const sunX = Math.sin(TAU * phase);
    const sunZ = -Math.cos(TAU * phase);

    for (let y = 0; y < size; y += 1) {
      const normalY = (y + 0.5 - half) / half;
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        if (data[offset + 3] === 0) continue;

        const normalX = (x + 0.5 - half) / half;
        const distance = normalX * normalX + normalY * normalY;
        if (distance > 1) {
          data[offset + 3] = 0;
          continue;
        }

        const normalZ = Math.sqrt(Math.max(0, 1 - distance));
        const lambert = normalX * sunX + normalZ * sunZ;
        let light = clamp((lambert + 0.055) / 0.19, 0, 1);
        light = light * light * (3 - 2 * light);

        const shade = 0.075 + 0.925 * light;
        const darkness = 1 - light;
        data[offset] = data[offset] * shade + 5 * darkness;
        data[offset + 1] = data[offset + 1] * shade + 8 * darkness;
        data[offset + 2] = data[offset + 2] * shade + 18 * darkness;
      }
    }

    workingContext.putImageData(imageData, 0, 0);

    const halo = context.createRadialGradient(
      centerX,
      centerY,
      radius * 0.42,
      centerX,
      centerY,
      radius * 1.95
    );
    halo.addColorStop(0, "rgba(247, 227, 182, 0.2)");
    halo.addColorStop(0.45, "rgba(220, 197, 150, 0.075)");
    halo.addColorStop(1, "rgba(220, 197, 150, 0)");
    context.fillStyle = halo;
    context.beginPath();
    context.arc(centerX, centerY, radius * 2, 0, TAU);
    context.fill();

    context.drawImage(workingCanvas, centerX - radius, centerY - radius, radius * 2, radius * 2);
  }

  function drawStarChart(context, centerX, centerY, radius) {
    const points = [
      [186, 62],
      [150, 150],
      [104, 186],
      [78, 122],
      [196, 196],
      [262, 170],
    ];
    const map = ([x, y]) => [((x - 150) / 150) * radius, ((y - 150) / 150) * radius];

    context.save();
    context.translate(centerX, centerY);

    context.strokeStyle = "rgba(226, 197, 140, 0.22)";
    context.lineWidth = 1;
    [1, 0.78, 0.54, 0.28].forEach((scale) => {
      context.beginPath();
      context.arc(0, 0, radius * scale, 0, TAU);
      context.stroke();
    });

    context.strokeStyle = "rgba(226, 197, 140, 0.1)";
    context.beginPath();
    context.moveTo(-radius, 0);
    context.lineTo(radius, 0);
    context.moveTo(0, -radius);
    context.lineTo(0, radius);
    context.stroke();

    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 24) * TAU;
      const inner = radius * (index % 3 === 0 ? 0.94 : 0.97);
      context.beginPath();
      context.strokeStyle = "rgba(226, 197, 140, 0.16)";
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      context.stroke();
    }

    context.strokeStyle = "rgba(226, 197, 140, 0.46)";
    context.lineWidth = 1;
    const lines = [
      [0, 1],
      [1, 2],
      [2, 3],
      [1, 4],
      [4, 5],
    ];
    lines.forEach(([start, end]) => {
      const [x1, y1] = map(points[start]);
      const [x2, y2] = map(points[end]);
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    });

    const glow = context.createRadialGradient(0, 0, 0, 0, 0, radius * 0.3);
    glow.addColorStop(0, "rgba(248, 228, 181, 0.48)");
    glow.addColorStop(1, "rgba(248, 228, 181, 0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, 0, radius * 0.3, 0, TAU);
    context.fill();

    points.forEach((point, index) => {
      const [x, y] = map(point);
      context.beginPath();
      context.fillStyle = index === 1 ? "#fff1ce" : "#f3dcae";
      context.arc(x, y, index === 1 ? 6 : 3.6, 0, TAU);
      context.fill();
    });

    context.beginPath();
    context.fillStyle = "#f8e4b5";
    context.shadowColor = "rgba(247, 227, 182, 0.9)";
    context.shadowBlur = 26;
    context.arc(0, 0, 7.5, 0, TAU);
    context.fill();
    context.shadowBlur = 0;

    drawTracked(context, "VEGA", 24, -4, {
      size: 17,
      tracking: 4,
      color: "rgba(247, 227, 182, 0.9)",
    });
    drawTracked(context, "α LYR", 24, 17, {
      size: 12,
      tracking: 3,
      color: "rgba(226, 197, 140, 0.55)",
    });
    drawTracked(context, "LYRA", 0, radius + 48, {
      size: 15,
      tracking: 8,
      color: "rgba(226, 197, 140, 0.5)",
      align: "center",
    });

    context.restore();
  }

  function drawSeal(context, centerX, centerY, radius, letter) {
    const gradient = context.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius
    );
    gradient.addColorStop(0, "#f9e8bd");
    gradient.addColorStop(0.5, "#d7b272");
    gradient.addColorStop(1, "#b98c50");

    context.beginPath();
    context.fillStyle = gradient;
    context.arc(centerX, centerY, radius, 0, TAU);
    context.fill();

    context.beginPath();
    context.strokeStyle = "rgba(255, 247, 226, 0.55)";
    context.lineWidth = 2;
    context.arc(centerX, centerY, radius * 0.82, 0, TAU);
    context.stroke();

    context.save();
    context.strokeStyle = "rgba(43, 32, 36, 0.28)";
    context.setLineDash([3, 7]);
    context.lineWidth = 1.3;
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.68, 0, TAU);
    context.stroke();
    context.restore();

    context.save();
    context.fillStyle = "#24180e";
    context.font = `400 ${Math.round(radius * 0.8)}px ${FONT_SERIF}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(letter, centerX, centerY + radius * 0.05);
    context.restore();

    context.save();
    context.fillStyle = "rgba(43, 32, 36, 0.62)";
    context.font = `600 ${Math.round(radius * 0.13)}px ${FONT_SANS}`;
    context.textAlign = "center";
    context.fillText("✦", centerX, centerY - radius * 0.55);
    context.restore();
  }

  function drawCertificate(now) {
    const width = 2400;
    const height = 1697;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return canvas;

    const certificate = GIFT.certificate || {};
    const star = GIFT.star || {};
    const random = mulberry32(hashString(`certificate-${dateKey(now)}`));

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#111d33");
    background.addColorStop(0.48, "#09101d");
    background.addColorStop(1, "#0f1a2c");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const glowA = context.createRadialGradient(
      width * 0.78,
      height * 0.34,
      0,
      width * 0.78,
      height * 0.34,
      width * 0.46
    );
    glowA.addColorStop(0, "rgba(226, 197, 140, 0.105)");
    glowA.addColorStop(1, "rgba(226, 197, 140, 0)");
    context.fillStyle = glowA;
    context.fillRect(0, 0, width, height);

    const glowB = context.createRadialGradient(
      width * 0.12,
      height * 0.82,
      0,
      width * 0.12,
      height * 0.82,
      width * 0.4
    );
    glowB.addColorStop(0, "rgba(157, 74, 86, 0.09)");
    glowB.addColorStop(1, "rgba(157, 74, 86, 0)");
    context.fillStyle = glowB;
    context.fillRect(0, 0, width, height);

    drawStarField(context, width, height, 260, random, {
      maxRadius: 1.7,
      maxAlpha: 0.6,
    });

    context.strokeStyle = "rgba(226, 197, 140, 0.55)";
    context.lineWidth = 2;
    context.strokeRect(70, 70, width - 140, height - 140);
    context.strokeStyle = "rgba(226, 197, 140, 0.19)";
    context.lineWidth = 1;
    context.strokeRect(92, 92, width - 184, height - 184);

    const corner = 42;
    const corners = [
      [70, 70, 1, 1],
      [width - 70, 70, -1, 1],
      [70, height - 70, 1, -1],
      [width - 70, height - 70, -1, -1],
    ];
    context.strokeStyle = "rgba(247, 227, 182, 0.72)";
    context.lineWidth = 2;
    corners.forEach(([x, y, dx, dy]) => {
      context.beginPath();
      context.moveTo(x + dx * corner, y);
      context.lineTo(x, y);
      context.lineTo(x, y + dy * corner);
      context.stroke();
    });

    drawTracked(context, "CERTIFICATE OF A STAR", 180, 170, {
      size: 21,
      tracking: 8,
      color: "rgba(163, 172, 189, 0.86)",
    });
    drawTracked(context, star.id || "AMA-01", width - 180, 170, {
      size: 21,
      tracking: 8,
      color: "rgba(226, 197, 140, 0.88)",
      align: "right",
    });
    drawLine(context, 180, 205, width - 180, 205, "rgba(226, 197, 140, 0.2)", 1);

    drawStarChart(context, 1888, 720, 386);

    drawTracked(context, "ЛИЧНОЕ НЕБО · ЛИРА", 180, 288, {
      size: 20,
      tracking: 7,
      color: "#b99055",
    });

    setFont(context, 118, FONT_SERIF);
    context.fillStyle = "#f3ecdf";
    context.textAlign = "left";
    context.fillText(certificate.title || "Свидетельство", 180, 424);

    const titleGradient = context.createLinearGradient(180, 0, 1050, 0);
    titleGradient.addColorStop(0, "#c69756");
    titleGradient.addColorStop(0.36, "#f8e6bb");
    titleGradient.addColorStop(0.68, "#d6b173");
    titleGradient.addColorStop(1, "#f2dca7");
    setFont(context, 118, FONT_SERIF, { style: "italic" });
    context.fillStyle = titleGradient;
    context.fillText(certificate.titleAccent || "о звезде", 180, 542);

    setFont(context, 30, FONT_SANS);
    context.fillStyle = "#aab3c3";
    context.fillText(certificate.lead || "Настоящим подтверждается, что звезда", 180, 642);

    const catalog = certificate.catalog || "AMA-01";
    const constellationLine = certificate.inConstellation || "в созвездии Лиры";
    const bearsName = certificate.bearsName || "носит имя";

    context.fillStyle = "#f3d9a2";
    context.fillText(catalog, 180, 690);
    let cursor = 180 + context.measureText(catalog).width + 11;

    context.fillStyle = "#aab3c3";
    context.fillText(constellationLine, cursor, 690);
    cursor += context.measureText(constellationLine).width + 11;
    context.fillText(bearsName, cursor, 690);

    const nameGradient = context.createLinearGradient(180, 0, 1080, 0);
    nameGradient.addColorStop(0, "#bb8b4d");
    nameGradient.addColorStop(0.28, "#f8e6bc");
    nameGradient.addColorStop(0.6, "#d6b173");
    nameGradient.addColorStop(1, "#f4dfab");
    setFont(context, 152, FONT_SERIF, { style: "italic" });
    context.fillStyle = nameGradient;
    context.fillText(GIFT.her || "Амалечка", 180, 838);

    const underline = context.createLinearGradient(180, 0, 1100, 0);
    underline.addColorStop(0, "rgba(226, 197, 140, 0.62)");
    underline.addColorStop(1, "rgba(226, 197, 140, 0)");
    context.strokeStyle = underline;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(180, 864);
    context.lineTo(1120, 864);
    context.stroke();

    setFont(context, 30, FONT_SANS);
    context.fillStyle = "#aab3c3";
    context.fillText(
      certificate.belongs || "и принадлежит ей одной — во всех возможных вселенных.",
      180,
      924
    );

    drawLine(context, 180, 992, 1440, 992, "rgba(226, 197, 140, 0.19)", 1);

    const meta = [
      ["RA", star.ra || "18h 36m 56s"],
      ["DEC", star.dec || "+38° 47′ 01″"],
      ["DISTANCE", "25 СВ. ЛЕТ"],
      ["ISSUED", shortDate(now)],
    ];
    meta.forEach(([label, value], index) => {
      const x = 180 + index * 322;
      drawTracked(context, label, x, 1034, {
        size: 15,
        tracking: 5,
        color: "rgba(118, 129, 149, 0.92)",
      });
      setFont(context, 27, FONT_SANS);
      context.fillStyle = "#e8dfce";
      context.textAlign = "left";
      context.fillText(value, x, 1074);
    });

    drawTracked(context, `${star.nameFull || "VEGA · α LYRAE"} · ${star.distance || "25 световых лет"} от земли`, 180, 1180, {
      size: 14,
      tracking: 5,
      color: "rgba(185, 144, 85, 0.72)",
    });

    drawLine(context, 180, 1350, 700, 1350, "rgba(226, 197, 140, 0.23)", 1);
    setFont(context, 78, FONT_HAND);
    context.fillStyle = "rgba(247, 227, 182, 0.92)";
    context.textAlign = "left";
    context.fillText(certificate.signature || "Твой Даврон", 180, 1338);
    drawTracked(context, "ПОДПИСЬ", 180, 1412, {
      size: 13,
      tracking: 5,
      color: "rgba(118, 129, 149, 0.78)",
    });

    const legal = String(certificate.noTransfer || "Не подлежит переоформлению. Подлежит любви.")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .split(". ")
      .filter(Boolean);
    legal.forEach((line, index) => {
      drawTracked(context, line.endsWith(".") ? line : `${line}.`, 760, 1390 + index * 38, {
        size: 14,
        tracking: 4.5,
        color: "rgba(163, 172, 189, 0.72)",
      });
    });

    drawSeal(context, 1370, 1392, 88, certificate.seal || "Д");

    drawTracked(
      context,
      `НЕОФИЦИАЛЬНАЯ, НО САМАЯ ЧЕСТНАЯ · ВЫДАНО ${shortDate(now)}`,
      width / 2,
      1584,
      {
        size: 14,
        tracking: 6,
        color: "rgba(118, 129, 149, 0.8)",
        align: "center",
      }
    );

    return canvas;
  }

  function drawTicket() {
    const width = 1800;
    const height = 900;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return canvas;

    const ticket = GIFT.ticket || {};
    const random = mulberry32(hashString(`ticket-${ticket.serial || "AMA-01"}`));

    const paper = context.createLinearGradient(0, 0, width, height);
    paper.addColorStop(0, "#faf3e8");
    paper.addColorStop(0.55, "#f2e7d5");
    paper.addColorStop(1, "#e8d7bf");
    context.fillStyle = paper;
    context.fillRect(0, 0, width, height);

    for (let index = 0; index < 1300; index += 1) {
      context.fillStyle = `rgba(95, 73, 50, ${random() * 0.045})`;
      context.fillRect(random() * width, random() * height, 1, 1);
    }

    context.save();
    context.fillStyle = "rgba(154, 111, 54, 0.055)";
    context.font = `400 470px ${FONT_SERIF}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("✦", 1170, 520);
    context.restore();

    drawTracked(context, "ADMIT TWO", 110, 108, {
      size: 17,
      tracking: 6,
      color: "rgba(43, 32, 36, 0.5)",
    });
    drawTracked(context, ticket.serial || "AMA · 01", 1340, 108, {
      size: 17,
      tracking: 6,
      color: "rgba(43, 32, 36, 0.5)",
      align: "right",
    });
    drawLine(context, 110, 142, 1340, 142, "rgba(43, 32, 36, 0.18)", 1);

    drawTracked(context, "ПРИГЛАСИТЕЛЬНЫЙ БИЛЕТ", 110, 202, {
      size: 17,
      tracking: 5,
      color: "#9a6f36",
    });

    setFont(context, 98, FONT_SERIF);
    context.fillStyle = "#2b2024";
    context.textAlign = "left";
    context.fillText("Под настоящим", 110, 318);

    setFont(context, 110, FONT_SERIF, { style: "italic" });
    context.fillStyle = "#9a6f36";
    context.fillText("небом", 110, 426);

    drawTracked(context, ticket.subtitle || "ОДНА НОЧЬ · БЕЗ ТЕЛЕФОНОВ · ТОЛЬКО МЫ", 110, 478, {
      size: 15,
      tracking: 4,
      color: "rgba(43, 32, 36, 0.56)",
    });

    context.save();
    context.strokeStyle = "rgba(43, 32, 36, 0.23)";
    context.setLineDash([7, 8]);
    context.beginPath();
    context.moveTo(110, 514);
    context.lineTo(1340, 514);
    context.stroke();
    context.restore();

    function detail(label, value, x, labelY, valueY, maxWidth) {
      drawTracked(context, label, x, labelY, {
        size: 13,
        tracking: 5,
        color: "rgba(43, 32, 36, 0.46)",
      });
      setFont(context, 28, FONT_SANS);
      context.fillStyle = "#2b2024";
      context.textAlign = "left";
      const lines = wrapText(context, value || "", maxWidth);
      lines.slice(0, 2).forEach((line, index) => {
        context.fillText(line, x, valueY + index * 34);
      });
    }

    detail("ДЛЯ", ticket.for || "Амалечки и Даврона", 110, 566, 606, 480);
    detail("МЕСТО", ticket.place || "там, где видно звёзды", 650, 566, 606, 660);
    detail("ДАТА", ticket.date || "когда ты скажешь", 110, 664, 704, 480);
    detail("ВКЛЮЧЕНО", ticket.included || "плед, какао, объятия и одно желание на двоих", 650, 664, 704, 660);
    detail("НЕ ВКЛЮЧЕНО", ticket.notIncluded || "телефон", 110, 764, 804, 480);

    setFont(context, 40, FONT_HAND);
    context.fillStyle = "rgba(43, 32, 36, 0.66)";
    context.textAlign = "left";
    const noteLines = wrapText(context, ticket.note || "", 1180);
    noteLines.slice(0, 2).forEach((line, index) => {
      context.fillText(line, 110, 856 + index * 42);
    });

    const stub = context.createLinearGradient(1420, 0, 1800, height);
    stub.addColorStop(0, "#e9dac2");
    stub.addColorStop(1, "#dcc9ad");
    context.fillStyle = stub;
    context.fillRect(1420, 0, 380, height);

    drawTracked(context, "БЕССРОЧНО", 1610, 108, {
      size: 14,
      tracking: 5,
      color: "rgba(43, 32, 36, 0.56)",
      align: "center",
    });
    drawTracked(context, "ПОВТОРЯТЬ МОЖНО БЕСКОНЕЧНО", 1610, 134, {
      size: 9,
      tracking: 3,
      color: "rgba(43, 32, 36, 0.36)",
      align: "center",
    });

    const barcodeRandom = mulberry32(hashString(`barcode-${ticket.serial || "AMA-01"}-${GIFT.her || ""}`));
    let barX = 1462;
    while (barX < 1758) {
      const barWidth = 1 + Math.floor(barcodeRandom() * 8);
      if (barcodeRandom() > 0.24) {
        context.fillStyle = "rgba(43, 32, 36, 0.64)";
        context.fillRect(barX, 202, barWidth, 238);
      }
      barX += barWidth + 2 + Math.floor(barcodeRandom() * 4);
    }
    drawTracked(context, ticket.serial || "AMA · 01", 1610, 478, {
      size: 11,
      tracking: 4,
      color: "rgba(43, 32, 36, 0.46)",
      align: "center",
    });

    drawTracked(context, "РЯДОМ", 1610, 626, {
      size: 17,
      tracking: 5,
      color: "rgba(43, 32, 36, 0.62)",
      align: "center",
    });
    drawTracked(context, "СО МНОЙ", 1610, 660, {
      size: 17,
      tracking: 5,
      color: "rgba(43, 32, 36, 0.62)",
      align: "center",
    });

    context.save();
    context.translate(1610, 806);
    context.rotate(-0.13);
    setFont(context, 86, FONT_HAND);
    context.fillStyle = "#9a6f36";
    context.textAlign = "center";
    context.fillText(ticket.signature || "Д.", 0, 0);
    context.restore();

    context.save();
    context.strokeStyle = "rgba(43, 32, 36, 0.33)";
    context.setLineDash([9, 11]);
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(1420, 28);
    context.lineTo(1420, height - 28);
    context.stroke();
    context.restore();

    context.globalCompositeOperation = "destination-out";
    [0, height].forEach((y) => {
      context.beginPath();
      context.arc(1420, y, 30, 0, TAU);
      context.fill();
    });
    context.globalCompositeOperation = "source-over";

    return canvas;
  }

  function drawWallpaper(now, texture) {
    const width = 1080;
    const height = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return canvas;

    const moon = moonInfo(now);
    const random = mulberry32(hashString(`wallpaper-${dateKey(now)}`));
    const herGenitiveUpper = String(GIFT.herGenitive || GIFT.her || "Амалечки").toUpperCase();
    const note = dailyNote(now);

    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, "#05080f");
    background.addColorStop(0.42, "#081120");
    background.addColorStop(0.76, "#0a1424");
    background.addColorStop(1, "#080d18");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const topGlow = context.createRadialGradient(540, 640, 20, 540, 700, 620);
    topGlow.addColorStop(0, "rgba(48, 68, 105, 0.36)");
    topGlow.addColorStop(0.55, "rgba(27, 42, 69, 0.16)");
    topGlow.addColorStop(1, "rgba(9, 15, 26, 0)");
    context.fillStyle = topGlow;
    context.fillRect(0, 0, width, height);

    const bottomGlow = context.createRadialGradient(540, 1680, 0, 540, 1680, 580);
    bottomGlow.addColorStop(0, "rgba(116, 67, 82, 0.12)");
    bottomGlow.addColorStop(1, "rgba(116, 67, 82, 0)");
    context.fillStyle = bottomGlow;
    context.fillRect(0, 0, width, height);

    drawStarField(context, width, height, 340, random, {
      maxRadius: 1.8,
      maxAlpha: 0.72,
    });

    context.strokeStyle = "rgba(226, 197, 140, 0.13)";
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(540, 800, 355, 160, -0.28, 0, TAU);
    context.stroke();
    context.beginPath();
    context.ellipse(540, 800, 430, 208, 0.34, 0, TAU);
    context.strokeStyle = "rgba(226, 197, 140, 0.07)";
    context.setLineDash([2, 10]);
    context.stroke();
    context.setLineDash([]);

    drawTracked(context, `НЕБО ДЛЯ ${herGenitiveUpper}`, width / 2, 148, {
      size: 16,
      tracking: 6,
      color: "rgba(226, 197, 140, 0.72)",
      align: "center",
    });

    drawTracked(
      context,
      `${pad(now.getDate())} ${MONTHS_GEN_UPPER[now.getMonth()]} · ${WEEKDAYS_UPPER[now.getDay()]}`,
      width / 2,
      414,
      {
        size: 24,
        tracking: 4,
        color: "#f3ecdf",
        align: "center",
      }
    );
    drawTracked(context, "ТВОЯ ЗВЕЗДА · VEGA · AMA-01", width / 2, 456, {
      size: 12,
      tracking: 5,
      color: "rgba(163, 172, 189, 0.72)",
      align: "center",
    });

    drawMoon(context, 540, 812, 226, moon.phase, texture);

    drawTracked(context, `${moon.name.toUpperCase()} · ОСВЕЩЕНО ${moon.illumination}%`, width / 2, 1098, {
      size: 13,
      tracking: 4,
      color: "rgba(247, 227, 182, 0.62)",
      align: "center",
    });

    const divider = context.createLinearGradient(150, 0, 930, 0);
    divider.addColorStop(0, "rgba(226, 197, 140, 0)");
    divider.addColorStop(0.5, "rgba(226, 197, 140, 0.42)");
    divider.addColorStop(1, "rgba(226, 197, 140, 0)");
    context.strokeStyle = divider;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(150, 1162);
    context.lineTo(930, 1162);
    context.stroke();

    drawTracked(context, "СЕГОДНЯШНЯЯ ЗАПИСКА", width / 2, 1228, {
      size: 12,
      tracking: 5,
      color: "rgba(185, 144, 85, 0.88)",
      align: "center",
    });

    setFont(context, 54, FONT_SERIF, { style: "italic" });
    context.fillStyle = "#eee4d2";
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    const lines = wrapText(context, note, 820);
    lines.slice(0, 5).forEach((line, index) => {
      context.fillText(line, width / 2, 1308 + index * 72);
    });

    drawTracked(context, "AMA-01 · ЛИРА", width / 2, 1668, {
      size: 12,
      tracking: 5,
      color: "rgba(163, 172, 189, 0.58)",
      align: "center",
    });

    context.save();
    context.translate(870, 1728);
    context.rotate(-0.05);
    setFont(context, 64, FONT_HAND);
    context.fillStyle = "rgba(247, 227, 182, 0.9)";
    context.textAlign = "center";
    context.fillText(`твой ${GIFT.him || "Даврон"}`, 0, 0);
    context.restore();

    drawTracked(context, "ЛЮБОВЬ · 25 СВ. ЛЕТ · БЕССРОЧНО", width / 2, 1842, {
      size: 11,
      tracking: 5,
      color: "rgba(118, 129, 149, 0.62)",
      align: "center",
    });

    const vignette = context.createRadialGradient(540, 900, 300, 540, 900, 1120);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    return canvas;
  }

  function canvasToAsset(canvas, type, filename, title, quality) {
    const dataUrl =
      type === "image/jpeg"
        ? canvas.toDataURL(type, quality || 0.93)
        : canvas.toDataURL(type);
    const blob = dataUrlToBlob(dataUrl);
    return { dataUrl, blob, filename, title, type };
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(",");
    const header = parts[0] || "";
    const binary = window.atob(parts[1] || "");
    const mime = (header.match(/data:([^;]+)/) || [])[1] || "image/png";
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
  }

  let wallpaperCache = null;
  let wallpaperPending = null;
  let certificateCache = null;
  let certificatePending = null;
  let ticketCache = null;
  let ticketPending = null;

  function ensureWallpaper() {
    const key = dateKey();
    if (wallpaperCache && wallpaperCache.date === key) return Promise.resolve(wallpaperCache);
    if (wallpaperPending) return wallpaperPending;

    wallpaperPending = Promise.all([moonTexture, fontsReady])
      .then(([texture]) => {
        const now = new Date();
        const canvas = drawWallpaper(now, texture);
        const asset = canvasToAsset(
          canvas,
          "image/jpeg",
          `nebo-dlya-amalechki-${dateKey(now)}.jpg`,
          "НЕБО НА СЕГОДНЯ",
          0.93
        );
        const file =
          typeof File !== "undefined"
            ? new File([asset.blob], asset.filename, { type: "image/jpeg" })
            : null;
        wallpaperCache = {
          ...asset,
          date: dateKey(now),
          file,
        };
        wallpaperPending = null;
        updateShareUi();
        return wallpaperCache;
      })
      .catch((error) => {
        wallpaperPending = null;
        console.error("wallpaper", error);
        throw error;
      });

    return wallpaperPending;
  }

  function scheduleWallpaper() {
    ensureWallpaper()
      .then((asset) => {
        const image = $("#wallpaperPreview");
        const screen = $(".phone__screen");
        if (image && image.src !== asset.dataUrl) image.src = asset.dataUrl;
        if (image) {
          const markReady = () => screen?.classList.add("is-ready");
          if (image.complete) markReady();
          else image.addEventListener("load", markReady, { once: true });
        }
      })
      .catch(() => {
        const fallback = $("#wallpaperFallback p");
        if (fallback) fallback.textContent = "небо не открылось — попробуй ещё раз";
      });
  }

  function ensureCertificate() {
    const key = dateKey();
    if (certificateCache && certificateCache.date === key) return Promise.resolve(certificateCache);
    if (certificatePending) return certificatePending;

    certificatePending = fontsReady
      .then(() => {
        const now = new Date();
        const canvas = drawCertificate(now);
        const asset = canvasToAsset(
          canvas,
          "image/png",
          "svidetelstvo-ama-01.png",
          "СВИДЕТЕЛЬСТВО О ЗВЕЗДЕ"
        );
        certificateCache = { ...asset, date: key };
        certificatePending = null;
        return certificateCache;
      })
      .catch((error) => {
        certificatePending = null;
        console.error("certificate", error);
        throw error;
      });

    return certificatePending;
  }

  function ensureTicket() {
    if (ticketCache) return Promise.resolve(ticketCache);
    if (ticketPending) return ticketPending;

    ticketPending = fontsReady
      .then(() => {
        const canvas = drawTicket();
        ticketCache = canvasToAsset(
          canvas,
          "image/png",
          "bilet-pod-zvezdami.png",
          "БИЛЕТ ПОД НАСТОЯЩИМ НЕБОМ"
        );
        ticketPending = null;
        return ticketCache;
      })
      .catch((error) => {
        ticketPending = null;
        console.error("ticket", error);
        throw error;
      });

    return ticketPending;
  }

  function buildAsset(kind) {
    if (kind === "wallpaper") return ensureWallpaper();
    if (kind === "certificate") return ensureCertificate();
    if (kind === "ticket") return ensureTicket();
    return Promise.reject(new Error(`Unknown asset: ${kind}`));
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function triggerLink(href, filename) {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename || "";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  let downloadBusy = false;

  async function downloadAsset(kind) {
    if (downloadBusy) return;
    downloadBusy = true;
    try {
      const asset = await buildAsset(kind);
      triggerDownload(asset.blob, asset.filename);
      if (!$("dialog[open]")) showToast("Готово. Файл уже у тебя.");
    } catch (error) {
      showToast("Не получилось сохранить. Попробуй ещё раз.");
    } finally {
      downloadBusy = false;
    }
  }

  async function printAsset(kind) {
    if (downloadBusy) return;
    if (kind !== "certificate" && kind !== "ticket") return;
    downloadBusy = true;

    try {
      const asset = await buildAsset(kind);
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
      document.body.appendChild(iframe);

      const frameDocument = iframe.contentWindow?.document;
      if (!frameDocument) throw new Error("iframe unavailable");

      frameDocument.open();
      frameDocument.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>${asset.title}</title>` +
          "<style>@page{size:A4 landscape;margin:8mm}html,body{width:100%;height:100%;margin:0;background:#fff}" +
          "body{display:flex;align-items:center;justify-content:center}" +
          "img{width:100%;max-height:100%;object-fit:contain;display:block}</style></head>" +
          `<body><img src="${asset.dataUrl}" alt=""></body></html>`
      );
      frameDocument.close();

      const image = frameDocument.querySelector("img");
      const print = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (error) {
          /* пользователь всё равно может сохранить файл */
        }
        window.setTimeout(() => iframe.remove(), 4000);
      };

      if (image?.complete) window.setTimeout(print, 120);
      else if (image) image.addEventListener("load", () => window.setTimeout(print, 120), { once: true });
      else print();
    } catch (error) {
      showToast("Печать не открылась. Можно просто скачать файл.");
    } finally {
      downloadBusy = false;
    }
  }

  /* ------------------------------------------------------------ asset dialog */
  let currentAsset = null;

  const assetTitles = {
    certificate: "СВИДЕТЕЛЬСТВО О ЗВЕЗДЕ",
    wallpaper: "НЕБО НА СЕГОДНЯ",
    ticket: "БИЛЕТ ПОД НАСТОЯЩИМ НЕБОМ",
  };

  function openAssetDialog(kind, photoIndex) {
    const dialog = $("#assetDialog");
    const body = $("#assetDialogBody");
    const title = $("#assetDialogTitle");
    const download = $("#assetDownload");
    if (!dialog || !body || !title) return;

    currentAsset = null;
    if (download) download.hidden = true;

    if (kind === "photo") {
      const photos = Array.isArray(GIFT.photos) ? GIFT.photos : [];
      const photo = photos[photoIndex];
      if (!photo) return;

      const image = document.createElement("img");
      image.src = photoUrl(photo, "f");
      image.alt = photo.alt || "Любимый кадр";
      image.draggable = false;
      protectPhotoButton(image);
      body.replaceChildren(image);
      title.textContent = `МОЙ ЛЮБИМЫЙ ВИД · ${pad(photoIndex + 1)} / ${pad(photos.length)}`;
      openDialog(dialog);
      return;
    }

    if (!assetTitles[kind]) return;
    title.textContent = assetTitles[kind];
    body.innerHTML = '<div class="asset-dialog__loading">собираю небо...</div>';
    openDialog(dialog);

    buildAsset(kind)
      .then((asset) => {
        if (!dialog.open) return;
        const image = document.createElement("img");
        image.src = asset.dataUrl;
        image.alt = asset.title;
        body.replaceChildren(image);
        currentAsset = asset;
        if (download) download.hidden = false;
      })
      .catch(() => {
        if (!dialog.open) return;
        body.innerHTML = '<div class="asset-dialog__loading">небо не открылось. попробуй ещё раз.</div>';
      });
  }

  function updateShareUi() {
    const button = $("#shareWallpaper");
    if (!button) return;
    if (
      !wallpaperCache?.file ||
      typeof navigator.canShare !== "function" ||
      typeof navigator.share !== "function"
    ) {
      button.hidden = true;
      return;
    }
    try {
      button.hidden = !navigator.canShare({ files: [wallpaperCache.file] });
    } catch (error) {
      button.hidden = true;
    }
  }

  async function shareWallpaper() {
    try {
      const asset = await ensureWallpaper();
      if (!asset.file) {
        triggerDownload(asset.blob, asset.filename);
        return;
      }
      if (
        typeof navigator.canShare === "function" &&
        typeof navigator.share === "function" &&
        navigator.canShare({ files: [asset.file] })
      ) {
        await navigator.share({
          files: [asset.file],
          title: `Небо для ${GIFT.herGenitive || GIFT.her || "Амалечки"}`,
          text: "Сегодняшнее небо — тебе.",
        });
        return;
      }
      triggerDownload(asset.blob, asset.filename);
    } catch (error) {
      if (error && error.name === "AbortError") return;
      try {
        const asset = await ensureWallpaper();
        triggerDownload(asset.blob, asset.filename);
      } catch (fallbackError) {
        showToast("Не получилось поделиться. Попробуй скачать.");
      }
    }
  }

  function initActions() {
    document.addEventListener("click", (event) => {
      const close = event.target.closest("[data-close]");
      if (close) {
        closeDialog(close.closest("dialog"));
        return;
      }

      const gift = event.target.closest("[data-go-gift]");
      if (gift) {
        closeDialog(gift.closest("dialog"));
        window.setTimeout(() => {
          $("#gift")?.scrollIntoView({
            behavior: reducedMotion ? "auto" : "smooth",
            block: "start",
          });
        }, 80);
        return;
      }

      const download = event.target.closest("[data-download]");
      if (download) {
        downloadAsset(download.dataset.download);
        return;
      }

      const print = event.target.closest("[data-print]");
      if (print) {
        printAsset(print.dataset.print);
        return;
      }

      const opener = event.target.closest("[data-open]");
      if (opener) {
        event.preventDefault();
        const kind = opener.dataset.open;
        if (kind === "photo") {
          openAssetDialog("photo", Number(opener.dataset.photo || 0));
        } else {
          openAssetDialog(kind);
        }
      }
    });

    $("#assetDownload")?.addEventListener("click", () => {
      if (!currentAsset) return;
      if (currentAsset.blob) triggerDownload(currentAsset.blob, currentAsset.filename);
      else if (currentAsset.href) triggerLink(currentAsset.href, currentAsset.filename);
    });

    $("#shareWallpaper")?.addEventListener("click", shareWallpaper);
    $("#openLetter")?.addEventListener("click", () => openLetter(false));
  }

  /* -------------------------------------------------------------- hero wish */
  function initWish() {
    const stage = $("#moonStage");
    if (!stage) return;
    let lastWish = 0;

    function createWishBurst(event) {
      if (reducedMotion) return;
      const rect = stage.getBoundingClientRect();
      const x = event?.clientX ? event.clientX - rect.left : rect.width / 2;
      const y = event?.clientY ? event.clientY - rect.top : rect.height / 2;

      for (let index = 0; index < 14; index += 1) {
        const particle = document.createElement("i");
        const angle = (index / 14) * TAU + Math.random() * 0.28;
        const distance = rect.width * (0.12 + Math.random() * 0.18);
        particle.className = "wish-particle";
        particle.style.setProperty("--wish-x", `${x}px`);
        particle.style.setProperty("--wish-y", `${y}px`);
        particle.style.setProperty("--wish-dx", `${Math.cos(angle) * distance}px`);
        particle.style.setProperty("--wish-dy", `${Math.sin(angle) * distance}px`);
        particle.style.setProperty("--wish-delay", `${Math.random() * 120}ms`);
        stage.appendChild(particle);
        window.setTimeout(() => particle.remove(), 1500);
      }
    }

    function makeWish(event) {
      const now = performance.now();
      if (now - lastWish < 3200) return;
      lastWish = now;
      stage.classList.remove("is-wishing");
      void stage.offsetWidth;
      stage.classList.add("is-wishing");
      createWishBurst(event);
      sky.shoot(1);
      Sound.chime(4);
      showToast("Желание принято. Оно уже летит.");
      window.setTimeout(() => stage.classList.remove("is-wishing"), 3100);
    }

    stage.addEventListener("click", makeWish);
    stage.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      makeWish();
    });
  }

  /* --------------------------------------------------------------- cat secret */
  function initSecret() {
    const words = ["котёнок", "котенок", "котик", "мяу"];
    let buffer = "";

    function openSecret() {
      const dialog = $("#secretDialog");
      if (!dialog) return;
      openDialog(dialog);
      Sound.meow();
      sky.shoot(1);
    }

    window.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!document.documentElement.classList.contains("entered")) return;
      if ($("dialog[open]")) return;

      const target = event.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || (target && target.isContentEditable)) return;
      if (typeof event.key !== "string" || event.key.length !== 1) return;

      buffer = (buffer + event.key.toLowerCase()).slice(-26);
      const normalized = buffer.replace(/ё/g, "е");
      const found = words.some((word) => normalized.endsWith(word.replace(/ё/g, "е")));
      if (found) {
        buffer = "";
        openSecret();
      }
    });

    $("#pawSecret")?.addEventListener("click", openSecret);
  }

  /* ------------------------------------------------------------------- tilt */
  function initTilt() {
    if (!finePointer || reducedMotion) return;
    const preview = $(".certificate-preview");
    const card = $("#certificateCard");
    if (!preview || !card) return;

    preview.addEventListener(
      "pointermove",
      (event) => {
        const rect = preview.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `rotateY(${(-7 + x * 8).toFixed(2)}deg) rotateX(${(
          2.5 -
          y * 6
        ).toFixed(2)}deg) rotateZ(-0.5deg) translateY(-4px)`;
      },
      { passive: true }
    );

    preview.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  }

  /* ------------------------------------------------------------------- boot */
  let sky = { shoot() {} };
  let constellation = { reset() {} };

  function init() {
    applyBindings();
    renderPhotos();
    renderLetter();
    renderToday(true);

    sky = initSky();
    initDialogs();
    initActions();
    initSoundUi();
    initChrome();
    initReveal();
    initCursor();
    initCursorSparkles();
    initWish();
    initSecret();
    initTilt();
    initIntro();

    constellation = initConstellation();
    initPromises();

    startClock();
    document.fonts?.ready.then(() => {
      window.setTimeout(scheduleWallpaper, 220);
    });
    window.setTimeout(scheduleWallpaper, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
