// ============================================================================
// SpecularButton: vanilla WebGL2 port of the React Bits component.
// A glass button with a light that travels its edge, follows the pointer and
// brightens as the pointer comes near.
//
//   const btn = attachSpecularButton(buttonEl, { radius: 10, followMouse: true });
//   btn.update({ tint: "#F59E0B" });   // change options
//   btn.destroy();                      // free WebGL and restore the button
//
// window.syncSpecularButtonsTheme() restyles every attached button for the
// current theme (dark #070A13 or beige #F5EFE6). Without WebGL2,
// attachSpecularButton returns null and the button keeps its normal style.
// ============================================================================

(function () {
  const PAD = 24;
  const TAU = Math.PI * 2;

  const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uRadius;
uniform float uPx;
uniform float uSpot;
uniform vec2 uEntry;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform vec2 uWindow;
uniform float uThickness;
uniform float uGlow;
out vec4 outColor;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float loopPosition(vec2 p, vec2 b, float r) {
  vec2 inner = b - r;
  float arc = 1.5707963 * r;
  float quarter = inner.x + inner.y + arc;
  vec2 a = abs(p);
  vec2 q = a - inner;
  float s = q.x > 0.0 && q.y > 0.0
    ? inner.y + atan(q.y, q.x) * r
    : (q.x > q.y ? min(a.y, inner.y) : inner.y + arc + inner.x - min(a.x, inner.x));
  if (p.x < 0.0) s = p.y >= 0.0 ? 2.0 * quarter - s : 2.0 * quarter + s;
  else if (p.y < 0.0) s = 4.0 * quarter - s;
  return s / max(4.0 * quarter, 0.0001);
}

float lobe(float position, float center) {
  float gap = abs(fract(position - center + 0.5) - 0.5);
  return 1.0 - smoothstep(uWindow.x, uWindow.x + uWindow.y, gap);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = roundedBox(p, uHalf, uRadius);
  float position = loopPosition(p, uHalf, uRadius);
  float key = lobe(position, uSpot);
  float back = lobe(position, uSpot + 0.5);
  float streak = key + back * 0.45;
  float width = max(uThickness * uPx * mix(1.0, max(key, back), 0.6), 0.35);
  float band = smoothstep(-width - 0.6, -width + 0.6, d) * (1.0 - smoothstep(-0.6, 0.6, d));
  float hair = smoothstep(-uPx - 0.6, -uPx + 0.6, d) * (1.0 - smoothstep(-0.6, 0.6, d));
  float inside = 1.0 - smoothstep(-0.6, 0.6, d);
  vec2 pool = (p - uEntry) / (uHalf.y * vec2(1.6, 1.1));
  float glow = streak * 0.2 * exp(-abs(d + width * 0.5) / (5.0 * uPx)) + inside * 0.08 * exp(-dot(pool, pool));
  float light = clamp((band * streak + glow * uGlow) * uIntensity, 0.0, 1.0);
  vec4 base = vec4(uBaseColor, 1.0) * hair * 0.6;
  outColor = vec4(uLineColor, 1.0) * light + base * (1.0 - light);
}`;

  const UNIFORMS = [
    "uCenter", "uHalf", "uRadius", "uPx", "uSpot", "uEntry", "uLineColor", "uBaseColor",
    "uIntensity", "uWindow", "uThickness", "uGlow"
  ];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const wrap = (value) => value - Math.floor(value);

  const loopPosition = (x, y, halfX, halfY, r) => {
    const innerX = halfX - r;
    const innerY = halfY - r;
    const arc = (Math.PI / 2) * r;
    const quarter = innerX + innerY + arc;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const qx = ax - innerX;
    const qy = ay - innerY;
    let s;
    if (qx > 0 && qy > 0) s = innerY + Math.atan2(qy, qx) * r;
    else if (qx > qy) s = Math.min(ay, innerY);
    else s = innerY + arc + innerX - Math.min(ax, innerX);
    if (x < 0) s = y >= 0 ? 2 * quarter - s : 2 * quarter + s;
    else if (y < 0) s = 4 * quarter - s;
    return wrap(s / Math.max(4 * quarter, 0.0001));
  };

  const rimPoint = (position, halfX, halfY, r) => {
    const innerX = halfX - r;
    const innerY = halfY - r;
    const arc = (Math.PI / 2) * r;
    const quarter = innerX + innerY + arc;
    let s = wrap(position) * 4 * quarter;
    let signX = 1;
    let signY = 1;
    if (s > 3 * quarter) {
      s = 4 * quarter - s;
      signY = -1;
    } else if (s > 2 * quarter) {
      s -= 2 * quarter;
      signX = -1;
      signY = -1;
    } else if (s > quarter) {
      s = 2 * quarter - s;
      signX = -1;
    }
    let x = innerX - (s - innerY - arc);
    let y = halfY;
    if (s <= innerY) {
      x = halfX;
      y = s;
    } else if (s <= innerY + arc) {
      const angle = (s - innerY) / Math.max(r, 0.0001);
      x = innerX + Math.cos(angle) * r;
      y = innerY + Math.sin(angle) * r;
    }
    return [x * signX, y * signY];
  };

  const compile = (gl, type, source) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  };

  const link = (gl) => {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
    gl.deleteProgram(program);
    return null;
  };

  const DEFAULTS = {
    size: null,
    radius: 18,
    tint: "#ffffff",
    tintOpacity: 0.04,
    blur: 0,
    textColor: "#f5f5f5",
    lineColor: "#ffffff",
    baseColor: "#525252",
    intensity: 1,
    idleIntensity: 0.35,
    shineSize: 10,
    shineFade: 34,
    thickness: 1.2,
    glow: 1,
    speed: 0.35,
    followMouse: true,
    proximity: 250,
    autoAnimate: false
  };

  const normalize = (o) => {
    const v = Object.assign({}, DEFAULTS, o);
    return {
      size: v.size,
      radius: Math.max(0, v.radius),
      tint: String(v.tint),
      tintOpacity: v.tintOpacity,
      blur: v.blur,
      textColor: String(v.textColor),
      lineColor: String(v.lineColor),
      baseColor: String(v.baseColor),
      intensity: Math.max(0, v.intensity),
      idleIntensity: clamp(v.idleIntensity, 0, 1),
      shineSize: Math.max(0, v.shineSize),
      shineFade: Math.max(0, v.shineFade),
      thickness: Math.max(0, v.thickness),
      glow: Math.max(0, v.glow),
      speed: v.speed,
      followMouse: v.followMouse,
      proximity: Math.max(1, v.proximity),
      autoAnimate: v.autoAnimate
    };
  };

  const registry = new Set();

  function attachSpecularButton(button, options) {
    if (!button || button.__specular) return button && button.__specular || null;
    let opts = Object.assign({}, options || {});
    let s = normalize(opts);

    // Build the DOM: [canvas][label wrapping the original content]
    const canvas = document.createElement("canvas");
    canvas.className = "specular-button__light";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!gl) return null;
    const program = link(gl);
    if (!program) return null;

    const label = document.createElement("span");
    label.className = "specular-button__label";
    while (button.firstChild) label.appendChild(button.firstChild);
    button.classList.add("specular-button");
    if (s.size) button.classList.add("specular-button--" + s.size);
    button.appendChild(canvas);
    button.appendChild(label);

    const applyVars = () => {
      button.style.setProperty("--sb-radius", s.radius + "px");
      button.style.setProperty("--sb-tint", s.tint);
      button.style.setProperty("--sb-tint-opacity", s.tintOpacity);
      button.style.setProperty("--sb-blur", s.blur + "px");
      button.style.setProperty("--sb-text-color", s.textColor);
    };
    applyVars();

    const uniforms = {};
    for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    const colors = new Map();
    const view = { width: 1, height: 1, ratio: 1 };
    const pointer = { x: 0, y: 0, known: false };
    const state = { spot: 0, level: 0, press: 0, ready: false };
    let raf = 0;
    let last = 0;
    let visible = true;
    let alive = true;

    const toRgb = (value) => {
      if (colors.has(value)) return colors.get(value);
      let rgb = [1, 1, 1];
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = "#000000";
        probe.fillStyle = value;
        probe.fillRect(0, 0, 1, 1);
        const d = probe.getImageData(0, 0, 1, 1).data;
        rgb = [d[0] / 255, d[1] / 255, d[2] / 255];
      }
      colors.set(value, rgb);
      return rgb;
    };

    const cornerRadius = () => Math.min(s.radius, view.width / 2, view.height / 2);

    const restSpot = () => {
      const r = cornerRadius();
      const inset = r * (1 - Math.SQRT1_2);
      return loopPosition(inset - view.width / 2, view.height / 2 - inset, view.width / 2, view.height / 2, r);
    };

    const aim = () => {
      if (!s.followMouse || button.disabled || !pointer.known) return null;
      const rect = button.getBoundingClientRect();
      const scale = rect.width / view.width || 1;
      const halfX = view.width / 2;
      const halfY = view.height / 2;
      const x = (pointer.x - rect.left - rect.width / 2) / scale;
      const y = (rect.top + rect.height / 2 - pointer.y) / scale;
      const distance = Math.hypot(Math.max(Math.abs(x) - halfX, 0), Math.max(Math.abs(y) - halfY, 0));
      const t = clamp(1 - distance / s.proximity, 0, 1);
      const near = t * t * (3 - 2 * t);
      const nearest = loopPosition(x, y, halfX, halfY, cornerRadius());
      if (distance > 0) return { spot: nearest, near };
      const depth = clamp(Math.min(halfX - Math.abs(x), halfY - Math.abs(y)) / (halfY * 0.8), 0, 1);
      const sway = restSpot() - (x / halfX) * 0.06 - (y / halfY) * 0.02;
      const offset = sway - nearest - Math.round(sway - nearest);
      return { spot: wrap(nearest + offset * depth * depth * (3 - 2 * depth)), near };
    };

    const draw = () => {
      const { width, height } = view;
      const scaleX = canvas.width / (width + PAD * 2);
      const scaleY = canvas.height / (height + PAD * 2);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uniforms.uCenter, (PAD + width / 2) * scaleX, (PAD + height / 2) * scaleY);
      gl.uniform2f(uniforms.uHalf, (width / 2) * scaleX, (height / 2) * scaleY);
      gl.uniform1f(uniforms.uRadius, Math.min(s.radius, width / 2, height / 2) * scaleX);
      gl.uniform1f(uniforms.uPx, view.ratio);
      const r = Math.min(s.radius, width / 2, height / 2);
      const rim = rimPoint(state.spot, width / 2, height / 2, r);
      const rimX = rim[0];
      const rimY = rim[1];
      const pull = 1 - Math.min(0.35 * (height / 2), Math.hypot(rimX, rimY)) / Math.max(Math.hypot(rimX, rimY), 0.0001);
      gl.uniform1f(uniforms.uSpot, state.spot);
      gl.uniform2f(uniforms.uEntry, rimX * pull * scaleX, rimY * pull * scaleY);
      gl.uniform3fv(uniforms.uLineColor, toRgb(s.lineColor));
      gl.uniform3fv(uniforms.uBaseColor, toRgb(s.baseColor));
      gl.uniform1f(uniforms.uIntensity, s.intensity * (state.level + state.press * 0.8));
      gl.uniform2f(uniforms.uWindow, s.shineSize / 360 + state.press * 0.06, s.shineFade / 360 + 0.0001);
      gl.uniform1f(uniforms.uThickness, s.thickness);
      gl.uniform1f(uniforms.uGlow, s.glow);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    };

    const frame = (now) => {
      raf = 0;
      if (!alive || !visible) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const target = aim();
      const spinning = s.autoAnimate && !reduce;
      const steering = !!target && target.near > 0;
      if (!state.ready) {
        state.spot = restSpot();
        state.level = s.autoAnimate ? 1 : s.idleIntensity;
        state.ready = true;
      }
      let diff = 0;
      if (spinning && !steering) state.spot = wrap(state.spot + (s.speed / TAU) * dt);
      else {
        diff = (steering ? target.spot : restSpot()) - state.spot;
        diff -= Math.round(diff);
        state.spot = wrap(state.spot + diff * (1 - Math.exp(-dt * 8)));
      }
      const level = s.autoAnimate ? 1 : s.idleIntensity + (1 - s.idleIntensity) * (target ? target.near : 0);
      state.level += (level - state.level) * (1 - Math.exp(-dt * 7));
      state.press *= Math.exp(-dt * 5);
      draw();
      const settling = Math.abs(diff) > 0.0002 || Math.abs(level - state.level) > 0.001 || state.press > 0.002;
      if (settling || (spinning && !steering)) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (!raf && alive && visible) raf = requestAnimationFrame(frame);
    };

    const measure = (entry) => {
      const box = entry && entry.borderBoxSize && entry.borderBoxSize[0];
      view.width = Math.max(1, box ? box.inlineSize : button.offsetWidth);
      view.height = Math.max(1, box ? box.blockSize : button.offsetHeight);
      view.ratio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.max(1, Math.round((view.width + PAD * 2) * view.ratio));
      canvas.height = Math.max(1, Math.round((view.height + PAD * 2) * view.ratio));
      if (state.ready) draw();
      wake();
    };

    const onPointerMove = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.known = true;
      wake();
    };
    const onPointerDown = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.known = true;
      if (!button.disabled) state.press = 1;
      wake();
    };
    const onPointerEnd = (event) => {
      if (event.pointerType === "mouse") return;
      pointer.known = false;
      wake();
    };
    const onPointerLeave = () => {
      pointer.known = false;
      wake();
    };

    const resizeObserver = new ResizeObserver((entries) => measure(entries[entries.length - 1]));
    resizeObserver.observe(button);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    });
    intersection.observe(button);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerEnd, { passive: true });
    window.addEventListener("pointercancel", onPointerEnd, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    button.addEventListener("pointerdown", onPointerDown);
    measure();

    const handle = {
      update(next) {
        opts = Object.assign({}, opts, next || {});
        s = normalize(opts);
        applyVars();
        if (state.ready) draw();
        wake();
      },
      destroy() {
        if (!alive) return;
        alive = false;
        registry.delete(handle);
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        intersection.disconnect();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerEnd);
        window.removeEventListener("pointercancel", onPointerEnd);
        document.documentElement.removeEventListener("pointerleave", onPointerLeave);
        button.removeEventListener("pointerdown", onPointerDown);
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
        // restore the button to its original markup
        while (label.firstChild) button.insertBefore(label.firstChild, canvas);
        canvas.remove();
        label.remove();
        button.classList.remove("specular-button");
        if (s.size) button.classList.remove("specular-button--" + s.size);
        ["--sb-radius", "--sb-tint", "--sb-tint-opacity", "--sb-blur", "--sb-text-color"].forEach((p) => button.style.removeProperty(p));
        delete button.__specular;
      }
    };
    button.__specular = handle;
    registry.add(handle);
    return handle;
  }

  // ---- Theme: dark twilight vs beige manuscript -------------------------------
  const THEMES = {
    dark: { tint: "#F59E0B", tintOpacity: 0.18, textColor: "#FCD34D", lineColor: "#FCD34D", baseColor: "#78350F" },
    light: { tint: "#C2410C", tintOpacity: 0.16, textColor: "#261F18", lineColor: "#EA580C", baseColor: "#D6C9B6" }
  };
  const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  const themeOptions = () => THEMES[currentTheme()];

  window.attachSpecularButton = attachSpecularButton;
  window.syncSpecularButtonsTheme = function () {
    const t = themeOptions();
    registry.forEach((h) => h.update(t));
  };

  // ---- GitaSaarthi wiring --------------------------------------------------
  function init() {
    // Send button: light follows the pointer from up to 220px away
    const send = document.getElementById("send-btn");
    if (send) attachSpecularButton(send, Object.assign({ radius: 10, followMouse: true, proximity: 220 }, themeOptions()));

    // "Begin practice": light circles the edge. Attached only while the Breathing
    // pop-up is open, so no WebGL context sits idle behind a closed pop-up.
    const modal = document.getElementById("pranayama-modal");
    const pacer = document.getElementById("pacer-start-btn");
    if (modal && pacer) {
      const sync = () => {
        const open = modal.classList.contains("open");
        if (open && !pacer.__specular) {
          attachSpecularButton(pacer, Object.assign({ size: "md", radius: 10, autoAnimate: true, speed: 0.25 }, themeOptions()));
        } else if (!open && pacer.__specular) {
          pacer.__specular.destroy();
        }
      };
      new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ["class"] });
      sync();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
