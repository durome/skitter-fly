// NeuroSynaptic Glass IV – Jazz Cathedral
// Eduardo Romaguera / Durome (2026)
// MIDI → stained-glass polyhedra + AI jazz response + cathedral beams (3D)
// Experimental generative art system (non-medical)
// + FALLBACK INPUT: Keyboard letters + Touch + Mouse (no MIDI needed)

let started = false;
let activeTouches = new Map(); // id -> note
let keyboardHeld = new Set();
let lastTouchX = null;

// rango base de notas para touch/teclado
const TOUCH_BASE_NOTE = 60; // C4
const TOUCH_RANGE = 24;     // 2 octavas


let midiAccess;
let midiAvailable = false;

let cells = [];
let links = [];
let particles = [];

const MAX_CELLS = 90;
const MAX_LINKS = 260;

const SHAPE_TYPES = ["regular", "star", "hybrid"];
const FORMS = ["poly", "cube", "pyramid", "sphere"];

let mood = "calm";
let lastMoodChange = 0;
let globalEnergy = 0;

// ---------- SOUND (poly-like) ----------
let filterLP, reverb;
let voices = [];
const MAX_VOICES = 12;

// ---------- FALLBACK INPUT ----------
let audioReady = false;

// keyboard mapping -> MIDI notes
const keyboardMap = {
  // lower row = left hand vibe
  "a": 48, "s": 50, "d": 52, "f": 53, "g": 55, "h": 57, "j": 59,
  // middle row = right hand
  "k": 60, "l": 62,
  // upper row = melodic
  "q": 60, "w": 62, "e": 64, "r": 65, "t": 67, "y": 69, "u": 71,
  "i": 72, "o": 74, "p": 76
};

let pressedKeys = {};        // prevent repeats
let pointerIdToNote = {};    // keep note per finger/click
const randomNotesPool = [36,38,40,43,45,48,50,52,55,57,60,62,64,67,69,71,72,74,76,79];

// =====================================================
// SETUP
// =====================================================
function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  colorMode(HSB, 360, 255, 255, 255);

  // ⚠️ Important: userStartAudio() must be triggered by interaction on mobile.
  // We'll call it here but also ensure it runs on pointer/key action.
  userStartAudio();

  filterLP = new p5.LowPass();
  filterLP.freq(1400);

  reverb = new p5.Reverb();
  reverb.process(filterLP, 8.2, 0.78);

  // Seed cathedral space
  for (let i = 0; i < 10; i++) {
    cells.push(new GlassCell(random(-340, 340), random(-220, 220), random(-340, 340)));
  }
  for (let i = 0; i < 18; i++) addRandomLink();

  // MIDI
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
  } else {
    console.log("⚠️ WebMIDI not supported. Fallback keyboard/touch enabled.");
  }

  // Fallback input always available
  attachUniversalPointerEvents();
}

// =====================================================
// MIDI
// =====================================================
function onMIDISuccess(midi) {
  midiAccess = midi;
  midiAvailable = true;

  Array.from(midiAccess.inputs.values()).forEach(input => {
    input.onmidimessage = handleMIDI;
  });

  console.log("✅ MIDI Connected");
}

function onMIDIFailure() {
  midiAvailable = false;
  console.log("❌ MIDI Access Failed (fallback active)");
}

function handleMIDI(msg) {
  const [cmd, note, vel] = msg.data;

  // NoteOn
  if (cmd === 144 && vel > 0) {
    cathedralImpulse(note, vel);
  }
}

// =====================================================
// FALLBACK INPUT: keyboard letters
// =====================================================
function keyPressed() {
  const k = key.toLowerCase();

  if (!(k in keyboardMap)) return;
  if (pressedKeys[k]) return;

  pressedKeys[k] = true;

  // ensure audio
  activateAudioIfNeeded();

  const note = keyboardMap[k];
  const vel = 96; // fixed velocity for keyboard
  cathedralImpulse(note, vel);
}

function keyReleased() {
  const k = key.toLowerCase();
  if (!(k in keyboardMap)) return;
  pressedKeys[k] = false;

  // (optional) if you want NoteOff behaviour later,
  // we can add a release system here.
}

// =====================================================
// FALLBACK INPUT: pointer (mouse + touch + pen)
// =====================================================
function attachUniversalPointerEvents() {
  const c = document.querySelector("canvas");
  if (!c) return;

  // This improves Android/iOS touch behaviour
  c.style.touchAction = "none";

  c.addEventListener("pointerdown", (e) => {
    activateAudioIfNeeded();

    // choose a note based on screen X (gives structure)
    const note = pickNoteFromPosition(e.clientX, e.clientY);
    const vel = pickVelocityFromPosition(e.clientY);

    pointerIdToNote[e.pointerId] = note;

    cathedralImpulse(note, vel);

    // capture pointer to detect release even if finger moves out
    try { c.setPointerCapture(e.pointerId); } catch (_) {}
  }, { passive: false });

  c.addEventListener("pointerup", (e) => {
    delete pointerIdToNote[e.pointerId];
  }, { passive: false });

  c.addEventListener("pointercancel", (e) => {
    delete pointerIdToNote[e.pointerId];
  }, { passive: false });
}

function pickNoteFromPosition(x, y) {
  // map horizontal axis to a jazz-ish register
  const t = constrain(x / windowWidth, 0, 1);
  const scale = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76];
  const idx = floor(t * (scale.length - 1));
  return scale[idx] ?? random(randomNotesPool);
}

function pickVelocityFromPosition(y) {
  // top = softer, bottom = stronger
  const t = constrain(y / windowHeight, 0, 1);
  return floor(lerp(65, 120, t));
}

function activateAudioIfNeeded() {
  if (audioReady) return;
  userStartAudio();
  audioReady = true;
}

// =====================================================
// CORE IMPULSE
// =====================================================
function cathedralImpulse(note, vel) {
  let freq = midiToFreq(note);
  let amp = map(vel, 0, 127, 0.045, 0.22);

  globalEnergy = min(1, globalEnergy + amp * 0.9);
  updateMood(freq, vel);

  // USER VOICE (clear)
  playVoice(freq, amp * 0.75, "sine", 0.01, 0.60);

  // CONSTRUCT GLASS CELL
  let c = new GlassCell(random(-420, 420), random(-280, 280), random(-420, 420));

  c.hue = map(note, 24, 96, 170, 350);
  c.alpha = map(vel, 0, 127, 60, 155);

  c.R = map(vel, 0, 127, 35, 125);
  c.r = c.R * random(0.35, 0.85);
  c.n = floor(map(note, 24, 96, 5, 13));
  c.n = constrain(c.n, 5, 13);
  c.kind = random(SHAPE_TYPES);

  // register defines architectural family
  if (note < 45) c.form = "cube";
  else if (note < 62) c.form = "poly";
  else if (note < 78) c.form = "pyramid";
  else c.form = "sphere";

  // add + connect
  cells.push(c);

  let density = floor(map(vel, 0, 127, 1, 6));
  for (let i = 0; i < density; i++) addLinkTo(c);

  emitParticles(c.pos.copy(), freq, amp);

  // PRUNE
  if (cells.length > MAX_CELLS) cells.splice(0, 1);
  if (links.length > MAX_LINKS) links.splice(0, 14);

  // AI JAZZ ANSWER (call & response)
  setTimeout(() => aiJazzAnswer(note, vel), responseDelay(vel));
}

function responseDelay(vel) {
  return floor(map(vel, 0, 127, 240, 80));
}

function aiJazzAnswer(note, vel) {
  // Mood-based voicings
  let voicing = chooseVoicing(note, mood);
  let baseAmp = map(vel, 0, 127, 0.05, 0.17);

  // Play harmonic "cathedral reply"
  for (let i = 0; i < voicing.length; i++) {
    let n = voicing[i];
    while (n < 36) n += 12;
    while (n > 92) n -= 12;

    let f = midiToFreq(n);
    let wave = (i === 0) ? "triangle" : (random() < 0.55 ? "sine" : "triangle");
    playVoice(f * random(0.995, 1.006), baseAmp * random(0.55, 1.0), wave, 0.02, random(0.85, 1.65));
  }

  // Build cathedral arches (extra beams)
  for (let k = 0; k < floor(map(vel, 0, 127, 1, 4)); k++) {
    addRandomLink(true);
  }
}

function chooseVoicing(root, mood) {
  if (mood === "calm") return [root, root + 4, root + 7, root + 11, root + 14]; // maj9
  if (mood === "mystery") return [root, root + 3, root + 7, root + 10, root + 14, root + 17]; // m11
  if (mood === "tension") return [root, root + 4, root + 10, root + 13, root + 15]; // alt-ish
  if (mood === "joy") return [root, root + 4, root + 6, root + 7, root + 11, root + 14]; // lydian-ish
  return [root, root + 3, root + 7, root + 10, root + 14]; // m9
}

function updateMood(freq, vel) {
  if (millis() - lastMoodChange < 900) return;

  if (freq < 170 && vel < 60) mood = "calm";
  else if (freq < 250 && vel > 85) mood = "mystery";
  else if (freq > 600 && vel > 90) mood = "joy";
  else if (vel > 112) mood = "tension";
  else mood = "expansion";

  lastMoodChange = millis();
}

// =====================================================
// SOUND VOICE
// =====================================================
function playVoice(freq, amp, wave, attack, release) {
  if (voices.length > MAX_VOICES) {
    let old = voices.shift();
    try { old.osc.stop(); } catch (e) {}
  }

  let osc = new p5.Oscillator(wave);
  osc.disconnect();
  osc.connect(filterLP);

  osc.pan(random(-0.75, 0.75));
  osc.freq(freq);

  // brightness by frequency
  let cutoff = map(freq, 80, 1200, 700, 2600);
  filterLP.freq(constrain(cutoff, 400, 3400));

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

// =====================================================
// LINKS
// =====================================================
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

// =====================================================
// PARTICLES
// =====================================================
function emitParticles(p, freq, amp) {
  let count = floor(map(amp, 0.05, 0.22, 8, 28));
  for (let i = 0; i < count; i++) {
    particles.push({
      pos: p.copy(),
      vel: p5.Vector.random3D().mult(random(0.8, 4.2)),
      life: random(110, 230),
      hue: map(freq, 80, 1400, 170, 350),
      size: random(1.6, 5.0)
    });
  }
  if (particles.length > 1800) particles.splice(0, 260);
}

// =====================================================
// DRAW
// =====================================================
function draw() {
  background(0, 20);

  // If no MIDI, users still can orbit with mouse/touch
  orbitControl();

  rotateY(frameCount * (0.001 + globalEnergy * 0.002));
  rotateX(frameCount * (0.0007 + globalEnergy * 0.0012));

  // cathedral lights (soft, not bleaching colors)
  ambientLight(40);
  directionalLight(140, 120, 140, -0.2, 1, -0.3);
  pointLight(110, 160, 220, 220, 60, 520);

  // LINKS (cathedral arches)
  for (let l of links) {
    l.update();
    l.display();
  }
  links = links.filter(l => l.life > 0);

  // CELLS (stained glass)
  for (let c of cells) {
    c.update();
    c.display();
  }
  cells = cells.filter(c => c.life > 0);

  // PARTICLES
  for (let p of particles) {
    p.pos.add(p.vel);
    p.life -= 2.8;
    push();
    translate(p.pos.x, p.pos.y, p.pos.z);
    fill(p.hue, 230, 255, p.life);
    noStroke();
    sphere(p.size);
    pop();
  }
  particles = particles.filter(p => p.life > 0);

  globalEnergy *= 0.985;

  // Signature
  push();
  resetMatrix();
  fill(255);
  textAlign(CENTER);
  textSize(14);
  text("NeuroSynaptic Glass IV — Jazz Cathedral", 0, height / 2 - 56);
  textSize(12);
  text("Eduardo Romaguera · Durome · 2026", 0, height / 2 - 34);

  textSize(11);
  if (midiAvailable) {
    text("MIDI Connected · Play your instrument", 0, height / 2 - 14);
  } else {
    text("No MIDI detected · Use keyboard letters or touch/click to play", 0, height / 2 - 14);
  }
  pop();
}

// =====================================================
// GLASS CELL
// =====================================================
class GlassCell {
  constructor(x, y, z) {
    this.pos = createVector(x, y, z);

    this.rot = createVector(random(TWO_PI), random(TWO_PI), random(TWO_PI));
    this.rvel = createVector(random(0.002, 0.012), random(0.002, 0.012), random(0.002, 0.012));

    this.R = random(35, 95);
    this.r = this.R * random(0.35, 0.78);
    this.n = floor(random(5, 11));
    this.h = random(18, 62);

    this.kind = random(SHAPE_TYPES);
    this.form = random(FORMS);

    this.hue = random(170, 340);
    this.alpha = random(70, 150);

    this.life = 255;
  }

  update() {
    this.rot.add(this.rvel);

    this.pos.x += sin(frameCount * 0.01 + this.pos.y * 0.002) * 0.06;
    this.pos.y += cos(frameCount * 0.012 + this.pos.x * 0.002) * 0.04;

    this.life -= 0.22;
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y, this.pos.z);
    rotateX(this.rot.x);
    rotateY(this.rot.y);
    rotateZ(this.rot.z);

    let a = map(this.life, 0, 255, 0, this.alpha);

    // stained glass look (avoid white)
    specularMaterial(this.hue, 230, 255, a);
    shininess(120);
    this.renderForm(false);

    push();
    scale(0.68);
    specularMaterial((this.hue + 28) % 360, 200, 255, a * 0.55);
    shininess(140);
    this.renderForm(true);
    pop();

    pop();
  }

  renderForm(inner) {
    if (this.form === "sphere") {
      sphere(this.R * (inner ? 0.6 : 0.92));
      edgeGlowSphere(this.R * (inner ? 0.62 : 0.94), inner);
      return;
    }

    if (this.form === "cube") {
      box(this.R * (inner ? 0.9 : 1.18));
      edgeGlowCube(this.R * (inner ? 0.9 : 1.18), inner);
      return;
    }

    if (this.form === "pyramid") {
      cone(this.R * (inner ? 0.7 : 0.92), this.R * (inner ? 1.0 : 1.4));
      return;
    }

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

    beginShape();
    for (let p of pts) vertex(p.x, p.y, z1);
    endShape(CLOSE);

    beginShape();
    for (let i = pts.length - 1; i >= 0; i--) vertex(pts[i].x, pts[i].y, z2);
    endShape(CLOSE);

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

    push();
    noFill();
    stroke(0, 0, 255, inner ? 55 : 115);
    strokeWeight(inner ? 0.85 : 1.45);
    beginShape();
    for (let p of pts) vertex(p.x, p.y, z1);
    endShape(CLOSE);
    pop();
  }
}

// =====================================================
// GLASS LINK
// =====================================================
class GlassLink {
  constructor(a, b, ai = false) {
    this.a = a;
    this.b = b;
    this.life = random(180, 560);
    this.hue = random(170, 340);
    this.w = random(0.7, ai ? 4.2 : 2.8);
    this.twist = random(0.004, 0.018);
    this.ai = ai;
  }

  update() {
    this.life -= this.ai ? 0.75 : 0.55;
    if (this.a.life < 12 || this.b.life < 12) this.life -= 1.5;
  }

  display() {
    push();
    let alpha = map(this.life, 0, 560, 0, this.ai ? 220 : 170);
    stroke(this.hue, 210, 255, alpha);
    strokeWeight(this.w);

    let A = this.a.pos;
    let B = this.b.pos;
    let M = p5.Vector.add(A, B).mult(0.5);

    M.x += sin(frameCount * this.twist) * (this.ai ? 32 : 18);
    M.y += cos(frameCount * this.twist) * (this.ai ? 32 : 18);
    M.z += sin(frameCount * this.twist * 0.6) * (this.ai ? 24 : 14);

    beginShape();
    vertex(A.x, A.y, A.z);
    vertex(M.x, M.y, M.z);
    vertex(B.x, B.y, B.z);
    endShape();

    pop();
  }
}

// =====================================================
// EDGE GLOW HELPERS
// =====================================================
function edgeGlowCube(size, inner) {
  push();
  noFill();
  stroke(0, 0, 255, inner ? 45 : 95);
  strokeWeight(inner ? 0.7 : 1.2);
  box(size);
  pop();
}

function edgeGlowSphere(size, inner) {
  push();
  noFill();
  stroke(0, 0, 255, inner ? 35 : 80);
  strokeWeight(inner ? 0.6 : 1.0);
  sphere(size);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

