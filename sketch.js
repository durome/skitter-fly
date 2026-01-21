// NeuroSynaptic Glass IV – Jazz Cathedral (Definitive Multi-Device Edition)
// Eduardo Romaguera / Durome (2026)
// ✅ MIDI + Keyboard + Mouse + Touch (MultiTouch chords + Drag glide)
// ✅ Overlay disappears ALWAYS
// ✅ Mobile WebGL fixes (pixelDensity + safe lights + no orbitControl)
// ✅ Always visible geometry + strong saturated color

let midiAccess = null;
let midiConnected = false;

let started = false; // audio + interaction unlocked

let cells = [];
let links = [];
let particles = [];

const MAX_CELLS = 90;
const MAX_LINKS = 260;
const MAX_PARTICLES = 1500;

const SHAPE_TYPES = ["regular", "star", "hybrid"];
const FORMS = ["poly", "cube", "pyramid", "sphere"];

let mood = "calm";
let lastMoodChange = 0;
let globalEnergy = 0;

// SOUND
let filterLP, reverb;
let voices = [];
const MAX_VOICES = 10;

// Touch & keyboard states
let activeTouches = new Map(); // id -> note
let lastPrimaryTouchX = null;

const TOUCH_BASE_NOTE = 48; // C3
const TOUCH_RANGE = 36;     // 3 octaves

// Keyboard mapping (two rows)
const keyMap = {
  "a": 48, "s": 50, "d": 52, "f": 53, "g": 55, "h": 57, "j": 59, "k": 60, "l": 62,
  "q": 60, "w": 62, "e": 64, "r": 65, "t": 67, "y": 69, "u": 71, "i": 72, "o": 74, "p": 76,
};
let keyboardHeld = new Set();

// ---------------- UI Helpers ----------------
function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

function hideOverlay() {
  const ov = document.getElementById("overlay");
  if (ov) ov.style.display = "none";
}

// ---------------- Start System (Mobile-safe) ----------------
async function startSystem() {
  if (started) return;

  try {
    await userStartAudio(); // ✅ MUST be inside user gesture
    started = true;
    hideOverlay();
    setStatus("✅ Audio active.");
  } catch (e) {
    console.warn("Audio blocked:", e);
    setStatus("⚠️ Tap again to activate audio.");
    return;
  }
}

// ---------------- p5 Setup ----------------
function setup() {
  // ✅ Mobile WebGL stability
  pixelDensity(1);

  createCanvas(windowWidth, windowHeight, WEBGL);
  colorMode(HSB, 360, 255, 255, 255);
  noStroke();

  // SOUND CHAIN
  filterLP = new p5.LowPass();
  filterLP.freq(1700);
  filterLP.res(9);

  reverb = new p5.Reverb();
  reverb.process(filterLP, 7.2, 0.78);

  // Seed geometry
  for (let i = 0; i < 12; i++) {
    cells.push(new GlassCell(random(-340, 340), random(-220, 220), random(-340, 340)));
  }
  for (let i = 0; i < 20; i++) addRandomLink();

  // MIDI
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
  }

  // ✅ Button starts system (pointerdown works best on mobile)
  const btn = document.getElementById("startBtn");
  if (btn) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startSystem();
    }, { passive: false });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      startSystem();
    }, { passive: false });
  }

  // ✅ Also allow ANY tap/click to start (mobile convenience)
  window.addEventListener("pointerdown", (e) => {
    if (!started) startSystem();
  }, { passive: true });

  setStatus("Tap Start to activate audio.");
}

// ---------------- MIDI ----------------
function onMIDISuccess(midi) {
  midiAccess = midi;
  const inputs = Array.from(midiAccess.inputs.values());
  inputs.forEach(input => input.onmidimessage = handleMIDI);
  midiConnected = inputs.length > 0;
  console.log("✅ MIDI Ready", midiConnected);
}

function onMIDIFailure() {
  console.log("❌ MIDI Access Failed");
}

function handleMIDI(msg) {
  if (!started) return;

  const [cmd, note, vel] = msg.data;
  const isNoteOn = cmd === 144 && vel > 0;
  const isNoteOff = cmd === 128 || (cmd === 144 && vel === 0);

  if (isNoteOn) cathedralImpulse(note, vel);
  if (isNoteOff) globalEnergy *= 0.92;
}

// ---------------- Keyboard ----------------
function keyPressed() {
  if (!started) startSystem();

  const k = key.toLowerCase();
  if (keyMap[k] !== undefined && !keyboardHeld.has(k)) {
    keyboardHeld.add(k);
    cathedralImpulse(keyMap[k], 95);
  }
}

function keyReleased() {
  const k = key.toLowerCase();
  keyboardHeld.delete(k);
}

// ---------------- Touch / Mouse ----------------
function noteFromX(x) {
  const n = floor(map(x, 0, width, TOUCH_BASE_NOTE, TOUCH_BASE_NOTE + TOUCH_RANGE));
  return constrain(n, 30, 96);
}

function velocityFromSpeed(dx, dy) {
  // speed-based velocity (mobile friendly)
  const sp = sqrt(dx*dx + dy*dy);
  return constrain(floor(map(sp, 0, 60, 50, 120)), 45, 127);
}

function touchStarted() {
  if (!started) startSystem();

  // multitouch chords
  for (let t of touches) {
    const id = t.id ?? `${t.x}_${t.y}`;
    if (!activeTouches.has(id)) {
      const note = noteFromX(t.x);
      activeTouches.set(id, note);
      cathedralImpulse(note, 90);
    }
  }

  if (touches[0]) lastPrimaryTouchX = touches[0].x;
  return false;
}

function touchMoved() {
  if (!started) return false;
  if (!touches[0]) return false;

  // Drag -> glide: fire new impulses smoothly
  const x = touches[0].x;
  const y = touches[0].y;

  if (lastPrimaryTouchX !== null) {
    const dx = x - lastPrimaryTouchX;
    if (abs(dx) > 10) {
      const note = noteFromX(x);
      const vel = velocityFromSpeed(dx, 0);
      cathedralImpulse(note, vel);
      lastPrimaryTouchX = x;
    }
  }
  return false;
}

function touchEnded() {
  activeTouches.clear();
  lastPrimaryTouchX = null;
  globalEnergy *= 0.9;
  return false;
}

// Mouse fallback = random chord hit
function mousePressed() {
  if (!started) startSystem();

  const n = noteFromX(mouseX);
  cathedralImpulse(n, 95);

  // extra random harmonic spark
  if (random() < 0.35) cathedralImpulse(n + random([3, 4, 7, 10, 12]), 80);
}

// ---------------- Core Engine ----------------
function cathedralImpulse(note, vel) {
  if (!started) return;

  let freq = midiToFreq(note);
  let amp = map(vel, 0, 127, 0.04, 0.20);

  globalEnergy = min(1.4, globalEnergy + amp * 0.85);
  updateMood(freq, vel);

  // USER VOICE
  playVoice(freq, amp * 0.75, "triangle", 0.01, 0.55);

  // Build cell
  let c = new GlassCell(random(-420, 420), random(-280, 280), random(-420, 420));

  c.hue = (map(note, 24, 96, 180, 360) + random(-25, 25) + frameCount * 0.2) % 360;
  c.alpha = map(vel, 0, 127, 85, 200);

  c.R = map(vel, 0, 127, 40, 130);
  c.r = c.R * random(0.35, 0.85);
  c.n = constrain(floor(map(note, 24, 96, 5, 13)), 5, 13);
  c.kind = random(SHAPE_TYPES);

  if (note < 45) c.form = "cube";
  else if (note < 62) c.form = "poly";
  else if (note < 78) c.form = "pyramid";
  else c.form = "sphere";

  cells.push(c);

  // Link density
  let density = floor(map(vel, 0, 127, 1, 5));
  for (let i = 0; i < density; i++) addLinkTo(c);

  emitParticles(c.pos.copy(), freq, amp);

  // prune
  if (cells.length > MAX_CELLS) cells.splice(0, 1);
  if (links.length > MAX_LINKS) links.splice(0, 12);

  // AI response
  setTimeout(() => aiJazzAnswer(note, vel), responseDelay(vel));
}

function responseDelay(vel) {
  return floor(map(vel, 0, 127, 220, 70));
}

function aiJazzAnswer(note, vel) {
  let voicing = chooseVoicing(note, mood);
  let baseAmp = map(vel, 0, 127, 0.045, 0.16);

  for (let i = 0; i < voicing.length; i++) {
    let n = voicing[i];
    while (n < 36) n += 12;
    while (n > 92) n -= 12;

    let f = midiToFreq(n);
    let wave = (i === 0) ? "sine" : (random() < 0.5 ? "triangle" : "sine");
    playVoice(f * random(0.994, 1.006), baseAmp * random(0.55, 1.0), wave, 0.02, random(0.85, 1.4));
  }

  for (let k = 0; k < floor(map(vel, 0, 127, 1, 3)); k++) {
    addRandomLink(true);
  }
}

function chooseVoicing(root, mood) {
  if (mood === "calm") return [root, root + 4, root + 7, root + 11, root + 14];        // maj9
  if (mood === "mystery") return [root, root + 3, root + 7, root + 10, root + 14, root + 17]; // m11
  if (mood === "tension") return [root, root + 4, root + 10, root + 13, root + 15];     // altered cluster
  if (mood === "joy") return [root, root + 4, root + 6, root + 7, root + 11, root + 14]; // lydian
  return [root, root + 3, root + 7, root + 10, root + 14]; // m9
}

function updateMood(freq, vel) {
  if (millis() - lastMoodChange < 850) return;

  if (freq < 170 && vel < 60) mood = "calm";
  else if (freq < 250 && vel > 85) mood = "mystery";
  else if (freq > 650 && vel > 95) mood = "joy";
  else if (vel > 112) mood = "tension";
  else mood = "expansion";

  lastMoodChange = millis();
}

// ---------------- SOUND VOICE ----------------
function playVoice(freq, amp, wave, attack, release) {
  if (voices.length > MAX_VOICES) {
    let old = voices.shift();
    try { old.osc.stop(); } catch (e) {}
  }

  let osc = new p5.Oscillator(wave);
  osc.disconnect();
  osc.connect(filterLP);

  osc.pan(random(-0.65, 0.65));
  osc.freq(freq);

  // brightness mapping
  let cutoff = map(freq, 80, 1400, 900, 3200);
  filterLP.freq(constrain(cutoff, 500, 3600));

  osc.amp(0);
  osc.start();
  osc.amp(amp, attack);

  setTimeout(() => {
    osc.amp(0, release);
    setTimeout(() => {
      try { osc.stop(); } catch (e) {}
    }, release * 1000 + 60);
  }, 60);

  voices.push({ osc });
}

// ---------------- LINKS ----------------
function addRandomLink(ai = false) {
  let a = random(cells);
  let b = random(cells);
  if (a && b && a !== b) links.push(new GlassLink(a, b, ai));
}

function addLinkTo(cell) {
  if (cells.length < 2) return;
  let target = random(cells);
  if (!target || target === cell) return;
  links.push(new GlassLink(cell, target, false));
}

// ---------------- PARTICLES ----------------
function emitParticles(p, freq, amp) {
  let count = floor(map(amp, 0.04, 0.20, 7, 22));

  for (let i = 0; i < count; i++) {
    particles.push({
      pos: p.copy(),
      vel: p5.Vector.random3D().mult(random(0.6, 3.2)),
      life: random(120, 240),
      hue: (map(freq, 80, 1400, 180, 360) + random(-30, 30)) % 360,
      size: random(1.8, 5.2)
    });
  }

  if (particles.length > MAX_PARTICLES) particles.splice(0, 200);
}

// ---------------- DRAW ----------------
function draw() {
  // ✅ Strong visibility (avoid full black in mobile)
  background(0, 35);

  // ✅ No orbitControl (breaks mobile gestures often)
  // orbitControl();

  rotateY(frameCount * (0.001 + globalEnergy * 0.0016));
  rotateX(sin(frameCount * 0.001) * 0.08);

  // ✅ Keep lights soft but not whitening faces
  ambientLight(70);
  directionalLight(120, 120, 120, -0.3, 0.6, -0.4);

  // Links
  for (let l of links) {
    l.update();
    l.display();
  }
  links = links.filter(l => l.life > 0);

  // Cells
  for (let c of cells) {
    c.update();
    c.display();
  }
  cells = cells.filter(c => c.life > 0);

  // Particles
  for (let p of particles) {
    p.pos.add(p.vel);
    p.life -= 3.1;

    push();
    translate(p.pos.x, p.pos.y, p.pos.z);
    fill(p.hue, 255, 255, p.life);
    sphere(p.size, 7, 5);
    pop();
  }
  particles = particles.filter(p => p.life > 0);

  globalEnergy *= 0.985;
}

// ---------------- GLASS CELL ----------------
class GlassCell {
  constructor(x, y, z) {
    this.pos = createVector(x, y, z);

    this.rot = createVector(random(TWO_PI), random(TWO_PI), random(TWO_PI));
    this.rvel = createVector(random(0.0015, 0.010), random(0.0015, 0.010), random(0.0015, 0.010));

    this.R = random(40, 105);
    this.r = this.R * random(0.35, 0.78);
    this.n = floor(random(5, 11));
    this.h = random(18, 62);

    this.kind = random(SHAPE_TYPES);
    this.form = random(FORMS);

    this.hue = random(180, 360);
    this.alpha = random(90, 200);

    this.life = 255;
  }

  update() {
    this.rot.add(this.rvel);

    // slow drift
    this.pos.x += sin(frameCount * 0.01 + this.pos.y * 0.002) * 0.06;
    this.pos.y += cos(frameCount * 0.012 + this.pos.x * 0.002) * 0.04;

    this.life -= 0.26;
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y, this.pos.z);
    rotateX(this.rot.x);
    rotateY(this.rot.y);
    rotateZ(this.rot.z);

    // ✅ saturated, NO white faces
    let a = map(this.life, 0, 255, 0, this.alpha);

    // Use emissive-style color feel
    fill(this.hue, 255, 255, a);

    // noStroke keeps it clean
    noStroke();

    // Outer
    this.renderForm(false);

    // Inner core (glow)
    push();
    scale(0.68);
    fill((this.hue + 24) % 360, 255, 255, a * 0.55);
    this.renderForm(true);
    pop();

    pop();
  }

  renderForm(inner) {
    if (this.form === "sphere") {
      sphere(this.R * (inner ? 0.55 : 0.92), 18, 12);
      return;
    }

    if (this.form === "cube") {
      box(this.R * (inner ? 0.82 : 1.15));
      return;
    }

    if (this.form === "pyramid") {
      cone(this.R * (inner ? 0.60 : 0.90), this.R * (inner ? 0.90 : 1.35), 10, 1);
      return;
    }

    // Poly extrusion
    this.drawExtrudedPolygon(inner);
  }

  polygonPoints() {
    let pts = [];
    for (let k = 0; k < this.n; k++) {
      let ang = (TWO_PI * k) / this.n;
      let rad = this.R;

      if (this.kind === "star") rad = (k % 2 === 0) ? this.R : this.r;
      else if (this.kind === "hybrid") rad = this.R * (0.62 + 0.38 * sin(ang * 3.0 + frameCount * 0.012));

      pts.push(createVector(rad * cos(ang), rad * sin(ang)));
    }
    return pts;
  }

  drawExtrudedPolygon(inner) {
    let pts = this.polygonPoints();
    let z1 = +this.h / 2;
    let z2 = -this.h / 2;

    // front
    beginShape();
    for (let p of pts) vertex(p.x, p.y, z1);
    endShape(CLOSE);

    // back
    beginShape();
    for (let i = pts.length - 1; i >= 0; i--) vertex(pts[i].x, pts[i].y, z2);
    endShape(CLOSE);

    // sides
    for (let i = 0; i < pts.length; i++) {
      let a = pts[i];
      let b = pts[(i + 1) % pts.length];

      beginShape();
      vertex(a.x, a.y, z1);
      vertex(b.x, b.y, z1);
      vertex(b.x, b.y, z2);
      vertex(a.x, a.y, z2);
      endShape(CLOSE);
    }
  }
}

// ---------------- GLASS LINK ----------------
class GlassLink {
  constructor(a, b, ai = false) {
    this.a = a;
    this.b = b;
    this.life = random(180, 560);
    this.hue = random(180, 360);
    this.w = random(0.8, ai ? 3.2 : 2.4);
    this.twist = random(0.004, 0.018);
    this.ai = ai;
  }

  update() {
    this.life -= this.ai ? 0.8 : 0.6;
    if (this.a.life < 12 || this.b.life < 12) this.life -= 1.4;
  }

  display() {
    push();
    let alpha = map(this.life, 0, 560, 0, this.ai ? 220 : 165);
    stroke(this.hue, 255, 255, alpha);
    strokeWeight(this.w);

    let A = this.a.pos;
    let B = this.b.pos;
    let M = p5.Vector.add(A, B).mult(0.5);

    M.x += sin(frameCount * this.twist) * (this.ai ? 26 : 14);
    M.y += cos(frameCount * this.twist) * (this.ai ? 26 : 14);
    M.z += sin(frameCount * this.twist * 0.6) * (this.ai ? 20 : 10);

    noFill();
    beginShape();
    vertex(A.x, A.y, A.z);
    vertex(M.x, M.y, M.z);
    vertex(B.x, B.y, B.z);
    endShape();
    pop();
  }
}

// ---------------- Resize ----------------
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}


