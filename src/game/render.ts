import { VIEW_W, VIEW_H, GameEngine, CAMERA_ZOOM } from "./engine";
import type { Enemy, Player } from "./types";

export function render(ctx: CanvasRenderingContext2D, g: GameEngine) {
  drawBackground(ctx, g);

  const zoom = CAMERA_ZOOM;
  const shakeX = (Math.random() - 0.5) * g.shake;
  const shakeY = (Math.random() - 0.5) * g.shake;

  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-g.cam.x + shakeX / zoom, -g.cam.y + shakeY / zoom);

  drawWorldGrid(ctx, g);
  drawWalls(ctx, g);
  drawExitGate(ctx, g);
  drawHazards(ctx, g);
  drawPickups(ctx, g);
  drawChests(ctx, g);
  drawGrenades(ctx, g);
  drawParticles(ctx, g);
  drawBullets(ctx, g);
  drawEnemies(ctx, g);
  drawPlayer(ctx, g);
  drawFloats(ctx, g);
  if (g.freezeActive > 0) drawFreezeOverlay(ctx, g);
  // stun warning telegraph
  if (g.stunWarn > 0) drawStunWarning(ctx, g);

  ctx.restore();

  // Draw circular localized high-tech radar mini-map overlay in screen-space
  drawMiniMap(ctx, g);

  // blind vignette overlay
  if (g.blindActive > 0) drawBlindVignette(ctx, g);

  if (g.state === "countdown") {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, g: GameEngine) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#070b1d");
  grad.addColorStop(0.6, "#0a0f24");
  grad.addColorStop(1, "#04060f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const px = -g.cam.x * 0.15;
  const py = -g.cam.y * 0.15;
  ctx.strokeStyle = "rgba(60, 140, 200, 0.08)";
  ctx.lineWidth = 1;
  const step = 90;
  const ox = ((px % step) + step) % step;
  const oy = ((py % step) + step) % step;
  for (let x = ox - step; x < VIEW_W + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW_H);
    ctx.stroke();
  }
  for (let y = oy - step; y < VIEW_H + step; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
  const t = performance.now() / 1000;
  ctx.fillStyle = "rgba(0, 200, 255, 0.18)";
  for (let i = 0; i < 14; i++) {
    const sx =
      ((((i * 173 - g.cam.x * 0.3) % (VIEW_W + 200)) + VIEW_W + 200) % (VIEW_W + 200)) - 100;
    const sy =
      ((((i * 271 - g.cam.y * 0.3) % (VIEW_H + 200)) + VIEW_H + 200) % (VIEW_H + 200)) - 100;
    const r = 2 + (Math.sin(t * 2 + i) * 0.5 + 0.5) * 2;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWorldGrid(ctx: CanvasRenderingContext2D, g: GameEngine) {
  ctx.strokeStyle = "rgba(0, 240, 255, 0.07)";
  ctx.lineWidth = 1;
  const grid = 60;
  const zoom = CAMERA_ZOOM;
  const sx = Math.floor(g.cam.x / grid) * grid;
  const sy = Math.floor(g.cam.y / grid) * grid;
  for (let x = sx; x < g.cam.x + VIEW_W / zoom + grid; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, g.cam.y - 10);
    ctx.lineTo(x, g.cam.y + VIEW_H / zoom + 10);
    ctx.stroke();
  }
  for (let y = sy; y < g.cam.y + VIEW_H / zoom + grid; y += grid) {
    ctx.beginPath();
    ctx.moveTo(g.cam.x - 10, y);
    ctx.lineTo(g.cam.x + VIEW_W / zoom + 10, y);
    ctx.stroke();
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const w of g.walls) {
    if (w.kind === "gate") {
      ctx.fillStyle = "rgba(160, 80, 255, 0.12)";
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = "#b070ff";
      ctx.shadowColor = "#b070ff";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(w.x, w.y, w.w, w.h);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    } else if (w.kind === "pillar") {
      ctx.save();
      // Outer plasma glow
      ctx.fillStyle = "rgba(0, 240, 255, 0.08)";
      ctx.beginPath();
      ctx.arc(w.x + w.w / 2, w.y + w.h / 2, w.w / 2 + 8, 0, Math.PI * 2);
      ctx.fill();

      // Core radial gradient
      const radGrad = ctx.createRadialGradient(
        w.x + w.w / 2,
        w.y + w.h / 2,
        5,
        w.x + w.w / 2,
        w.y + w.h / 2,
        w.w / 2,
      );
      radGrad.addColorStop(0, "#00f0ff");
      radGrad.addColorStop(0.3, "#0d3b66");
      radGrad.addColorStop(1, "#050b18");
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(w.x + w.w / 2, w.y + w.h / 2, w.w / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#00f0ff";
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w.x + w.w / 2, w.y + w.h / 2, w.w / 2 - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (w.kind === "server") {
      ctx.save();
      // Dark slate server rack container
      ctx.fillStyle = "#0c1020";
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = "#1e294b";
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x, w.y, w.w, w.h);

      // Blinking lines
      ctx.strokeStyle = "rgba(0, 255, 200, 0.22)";
      ctx.lineWidth = 1;
      const spacing = 12;
      for (let y = w.y + 8; y < w.y + w.h - 4; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(w.x + 8, y);
        ctx.lineTo(w.x + w.w - 8, y);
        ctx.stroke();
      }

      // Server status lights flashing
      const t = performance.now() / 1000;
      ctx.fillStyle = Math.sin(t * 7.5) > 0 ? "#00ffaa" : "#005533";
      ctx.beginPath();
      ctx.arc(w.x + 10, w.y + 10, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = Math.cos(t * 5.2 + 1) > 0 ? "#ff7700" : "#552200";
      ctx.beginPath();
      ctx.arc(w.x + 18, w.y + 10, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = Math.sin(t * 3.8 + 2) > 0 ? "#00aaff" : "#003355";
      ctx.beginPath();
      ctx.arc(w.x + w.w - 10, w.y + 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (w.kind === "puzzle_terminal") {
      ctx.save();
      // Console pedestal base
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(w.x + 6, w.y + w.h - 14, w.w - 12, 10);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w.x + 6, w.y + w.h - 14, w.w - 12, 10);

      // Pedestal stand
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(w.x + w.w / 2 - 5, w.y + w.h - 26, 10, 12);

      // Glowing Monitor screen
      ctx.fillStyle = "#020617";
      ctx.fillRect(w.x + 4, w.y + 4, w.w - 8, w.h - 30);
      ctx.strokeStyle = "#00d6ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x + 4, w.y + 4, w.w - 8, w.h - 30);

      ctx.fillStyle = "rgba(0, 240, 255, 0.12)";
      ctx.fillRect(w.x + 8, w.y + 8, w.w - 16, w.h - 38);

      const t = performance.now() / 1000;
      if (g.decryptionComplete) {
        ctx.fillStyle = "#00ffaa";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("BYPASSED", w.x + w.w / 2, w.y + 20);
      } else {
        ctx.fillStyle = Math.sin(t * 6) > 0 ? "#00ffff" : "rgba(0,255,255,0.4)";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.fillText("DECRYPT", w.x + w.w / 2, w.y + 18);

        // Progress bar ring
        if (g.decryptionProgress > 0) {
          ctx.strokeStyle = "#00ffff";
          ctx.shadowColor = "#00ffff";
          ctx.shadowBlur = 6;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(
            w.x + w.w / 2,
            w.y + w.h / 2 - 4,
            30,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * g.decryptionProgress,
          );
          ctx.stroke();

          ctx.fillStyle = "#00ffff";
          ctx.font = "bold 9px monospace";
          ctx.fillText(`${Math.round(g.decryptionProgress * 100)}%`, w.x + w.w / 2, w.y + 28);
        }
      }
      ctx.restore();
    } else if (w.kind === "locked_barrier") {
      ctx.save();
      // Hazard striped pillars on endpoints
      ctx.fillStyle = "#334155";
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w.x, w.y, w.w, w.h);

      // Laser bars crossing
      const t = performance.now() / 1000;
      const alpha = 0.55 + Math.sin(t * 22) * 0.25;
      ctx.strokeStyle = `rgba(255, 59, 100, ${alpha})`;
      ctx.shadowColor = "#ff3b64";
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;

      if (w.w > w.h) {
        // Draw vertical laser grids inside horizontal wall aspect
        for (let x = w.x + 8; x < w.x + w.w; x += 16) {
          ctx.beginPath();
          ctx.moveTo(x, w.y);
          ctx.lineTo(x, w.y + w.h);
          ctx.stroke();
        }
      } else {
        // Draw horizontal laser grids inside vertical wall aspect
        for (let y = w.y + 8; y < w.y + w.h; y += 16) {
          ctx.beginPath();
          ctx.moveTo(w.x, y);
          ctx.lineTo(w.x + w.w, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else {
      const grad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
      grad.addColorStop(0, "#1a2340");
      grad.addColorStop(1, "#0a0f24");
      ctx.fillStyle = grad;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = "#00d6ff";
      ctx.shadowColor = "#00d6ff";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(0, 214, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x + 4, w.y + 4, w.w - 8, w.h - 8);
    }
  }
}

function drawExitGate(ctx: CanvasRenderingContext2D, g: GameEngine) {
  if (g.level === 4) return; // boss-only victory
  const gate = g.exitGate;
  const open = gate.open;
  const t = performance.now() / 1000;
  const pulse = 0.5 + Math.sin(t * (open ? 6 : 2)) * 0.5;
  const color = open ? "#00ffaa" : "#ff66aa";
  ctx.save();
  ctx.translate(gate.x, gate.y);
  // outer ring
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20 + pulse * 20;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, gate.r + pulse * 6, 0, Math.PI * 2);
  ctx.stroke();
  // inner ring
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(0, 0, gate.r - 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // arch
  ctx.fillStyle = open ? "rgba(0,255,170,0.18)" : "rgba(255,80,160,0.12)";
  ctx.fillRect(-gate.r * 0.6, -gate.r, gate.r * 1.2, gate.r * 2);
  // label
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.fillText(open ? "EXIT" : "LOCKED", 0, -gate.r - 14);
  ctx.restore();
}

function drawHazards(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const h of g.hazards) {
    if (h.kind === "laser") {
      const t = (h.phase % h.period) / h.period;
      const active = t > 0.55;
      const warn = t > 0.35 && t <= 0.55;
      ctx.fillStyle = active
        ? "rgba(255, 60, 100, 0.9)"
        : warn
          ? "rgba(255,60,100,0.25)"
          : "rgba(255,60,100,0.1)";
      if (active) {
        ctx.shadowColor = "#ff3b64";
        ctx.shadowBlur = 20;
      }
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.shadowBlur = 0;
    } else if (h.kind === "conveyor") {
      ctx.fillStyle = "rgba(120,180,255,0.08)";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = "rgba(120,180,255,0.5)";
      ctx.lineWidth = 1;
      const offset = (g.elapsed * h.vx) % 30;
      for (let i = -30; i < h.w; i += 30) {
        ctx.beginPath();
        ctx.moveTo(h.x + i + offset, h.y);
        ctx.lineTo(h.x + i + offset + 15, h.y + h.h / 2);
        ctx.lineTo(h.x + i + offset, h.y + h.h);
        ctx.stroke();
      }
    } else if (h.kind === "phase") {
      const t = (h.phase % h.period) / h.period;
      const solid = t < 0.6;
      ctx.fillStyle = solid ? "rgba(180, 100, 255, 0.7)" : "rgba(180,100,255,0.12)";
      ctx.strokeStyle = "rgba(180,100,255,0.9)";
      ctx.lineWidth = 2;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    } else if (h.kind === "stun_pylon") {
      const charging = h.cooldown < 0.4;
      ctx.strokeStyle = charging ? "#ffcc00" : "rgba(255,204,0,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = charging ? "#ffcc00" : "rgba(255,204,0,0.6)";
      ctx.beginPath();
      ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (h.kind === "anti_dash") {
      ctx.strokeStyle = "rgba(255, 80, 200, 0.6)";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (h.kind === "spike") {
      const armed = h.armed;
      ctx.fillStyle = armed ? "rgba(255,60,80,0.35)" : "rgba(255,180,60,0.12)";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = armed ? "#ff3b64" : "rgba(255,180,60,0.6)";
      ctx.lineWidth = 2;
      ctx.shadowColor = armed ? "#ff3b64" : "#ffaa44";
      ctx.shadowBlur = armed ? 14 : 4;
      ctx.strokeRect(h.x + 1, h.y + 1, h.w - 2, h.h - 2);
      ctx.shadowBlur = 0;
      if (armed) {
        ctx.fillStyle = "#ff3b64";
        const cx = h.x + h.w / 2,
          cy = h.y + h.h / 2;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
          ctx.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
          ctx.lineTo(cx + Math.cos(a + 0.3) * 14, cy + Math.sin(a + 0.3) * 14);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "rgba(255,180,60,0.5)";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText("⚠ PLATE", h.x + h.w / 2, h.y + h.h / 2 + 3);
      }
    } else if (h.kind === "shock") {
      const on = Math.sin(h.phase * 3) > 0.4;
      ctx.fillStyle = on ? "rgba(120,200,255,0.35)" : "rgba(120,200,255,0.08)";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = on ? "#88ddff" : "rgba(120,200,255,0.4)";
      ctx.shadowColor = "#88ddff";
      ctx.shadowBlur = on ? 14 : 2;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
      ctx.shadowBlur = 0;
      if (on) {
        ctx.strokeStyle = "#cceeff";
        ctx.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          const x1 = h.x + Math.random() * h.w;
          const x2 = h.x + Math.random() * h.w;
          ctx.moveTo(x1, h.y);
          ctx.lineTo(h.x + h.w / 2 + (Math.random() - 0.5) * 20, h.y + h.h / 2);
          ctx.lineTo(x2, h.y + h.h);
          ctx.stroke();
        }
      }
    }
  }
}

function drawPickups(ctx: CanvasRenderingContext2D, g: GameEngine) {
  const t = performance.now() / 1000;
  for (const pk of g.pickups) {
    if (pk.kind !== "heal") continue;
    ctx.save();
    ctx.translate(pk.pos.x, pk.pos.y);
    const pulse = 0.5 + Math.sin(t * 4) * 0.5;
    // outer halo
    ctx.shadowColor = "#00ffaa";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "rgba(0,255,170,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, pk.r + 8 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    // body
    ctx.fillStyle = "#04201a";
    ctx.beginPath();
    ctx.arc(0, 0, pk.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#00ffaa";
    ctx.lineWidth = 2;
    ctx.stroke();
    // cross
    ctx.fillStyle = "#00ffaa";
    ctx.shadowBlur = 14;
    ctx.fillRect(-3, -10, 6, 20);
    ctx.fillRect(-10, -3, 20, 6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,255,170,0.9)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("MED-CORE", 0, pk.r + 16);
    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const p of g.particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBullets(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const b of g.bullets) {
    ctx.fillStyle = b.fromPlayer ? "#00ffaa" : "#ff3b64";
    ctx.shadowColor = b.fromPlayer ? "#00ffaa" : "#ff3b64";
    ctx.shadowBlur = b.big ? 18 : 12;
    const ang = Math.atan2(b.vel.y, b.vel.x);
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, b.big ? 12 : 9, b.big ? 4 : 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.shadowBlur = 0;
}

function drawStunWarning(ctx: CanvasRenderingContext2D, g: GameEngine) {
  const t = performance.now() / 1000;
  const pulse = 0.5 + Math.sin(t * 10) * 0.5;
  ctx.save();
  ctx.translate(g.player.pos.x, g.player.pos.y);
  ctx.strokeStyle = "rgba(255,204,0," + (0.5 + pulse * 0.5) + ")";
  ctx.shadowColor = "#ffcc00";
  ctx.shadowBlur = 16;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, 70 + pulse * 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffcc00";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillText("⚠ LOCKDOWN " + Math.ceil(g.stunWarn) + "s", 0, -90);
  ctx.restore();
}

function drawBlindVignette(ctx: CanvasRenderingContext2D, g: GameEngine) {
  const px = g.player.pos.x - g.cam.x;
  const py = g.player.pos.y - g.cam.y;
  const inner = 110;
  const outer = 190;
  const grad = ctx.createRadialGradient(px, py, inner, px, py, outer);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.4, "rgba(0,0,0,0.7)");
  grad.addColorStop(1, "rgba(0,0,0,0.97)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // chromatic blue edge
  ctx.strokeStyle = "rgba(0,200,255,0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, inner, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEnemies(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const e of g.enemies) {
    if (e.isBoss) drawBoss(ctx, e);
    else if (e.cls === "shooter") drawShooter(ctx, e);
    else if (e.cls === "sniper") drawSniper(ctx, e);
    else if (e.cls === "slasher") drawSlasher(ctx, e);
    else if (e.cls === "shield") drawShield(ctx, e);
    else if (e.cls === "node") drawNode(ctx, e, g);
    else drawDrone(ctx, e);
  }
}

function drawChests(ctx: CanvasRenderingContext2D, g: GameEngine) {
  const t = performance.now() / 1000;
  for (const pk of g.pickups) {
    if (pk.kind !== "chest") continue;
    const color =
      pk.rarity === "legendary"
        ? "#ff00cc"
        : pk.rarity === "epic"
          ? "#ffaa44"
          : pk.rarity === "rare"
            ? "#c08bff"
            : "#00ffaa";
    const opened = !!pk.opened;
    ctx.save();
    ctx.translate(pk.pos.x, pk.pos.y);
    const pulse = 0.5 + Math.sin(t * 3) * 0.5;
    if (!opened) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14 + pulse * 8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, pk.r + 6 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = opened ? "#1a1a24" : "#1a1f30";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillRect(-16, -12, 32, 22);
    ctx.strokeRect(-16, -12, 32, 22);
    // lid
    const lidAng = opened ? -0.6 : 0;
    ctx.save();
    ctx.translate(-16, -12);
    ctx.rotate(lidAng);
    ctx.fillStyle = "#0d1020";
    ctx.strokeStyle = color;
    ctx.fillRect(0, -8, 32, 10);
    ctx.strokeRect(0, -8, 32, 10);
    ctx.restore();
    // lock / glow core
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.shadowBlur = 0;
    if (!opened) {
      ctx.fillStyle = color;
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText((pk.rarity ?? "normal").toUpperCase(), 0, 24);
    }
    ctx.restore();
  }
}

function drawGrenades(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const gr of g.grenades) {
    const blink = gr.fuse < 0.5 ? Math.floor(performance.now() / 80) % 2 === 0 : false;
    ctx.save();
    ctx.translate(gr.pos.x, gr.pos.y);
    ctx.fillStyle = blink ? "#fff" : "#ffaa44";
    ctx.shadowColor = "#ffaa44";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ff5522";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    // blast radius hint
    ctx.fillStyle = "rgba(255, 85, 34, 0.07)";
    ctx.beginPath();
    ctx.arc(0, 0, gr.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 120, 50, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, gr.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function drawFloats(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const f of g.floats) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = f.color;
    ctx.font = `bold ${f.size}px monospace`;
    ctx.textAlign = "center";
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 8;
    ctx.fillText(f.text, f.pos.x, f.pos.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawFreezeOverlay(ctx: CanvasRenderingContext2D, g: GameEngine) {
  ctx.save();
  ctx.fillStyle = "rgba(136,221,255,0.08)";
  ctx.fillRect(g.cam.x, g.cam.y, VIEW_W, VIEW_H);
  // ice crystals around player
  const t = performance.now() / 1000;
  ctx.strokeStyle = "rgba(136,221,255,0.7)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.5;
    const r = 60 + Math.sin(t * 2 + i) * 8;
    const x = g.player.pos.x + Math.cos(a) * r;
    const y = g.player.pos.y + Math.sin(a) * r;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x - 3, y - 3);
    ctx.lineTo(x + 3, y + 3);
    ctx.moveTo(x - 3, y + 3);
    ctx.lineTo(x + 3, y - 3);
    ctx.stroke();
  }
  ctx.restore();
}

// ============ PLAYER (DARK AI KNIGHT) ============

function drawPlayer(ctx: CanvasRenderingContext2D, g: GameEngine) {
  const p = g.player;
  const ang = Math.atan2(p.facing.y, p.facing.x);
  const faceRight = p.facing.x >= 0;

  if (p.dashTime > 0) {
    // Magenta ghost
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate(p.pos.x - p.vel.x * 0.024, p.pos.y - p.vel.y * 0.024);
    ctx.scale(faceRight ? 1.65 : -1.65, 1.65);
    ctx.shadowColor = "#ff2266";
    ctx.shadowBlur = 10;
    drawKnightBody(ctx, p, true, ang, faceRight);
    ctx.restore();

    // Cyan ghost
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate(p.pos.x - p.vel.x * 0.012, p.pos.y - p.vel.y * 0.012);
    ctx.scale(faceRight ? 1.55 : -1.55, 1.55);
    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 10;
    drawKnightBody(ctx, p, true, ang, faceRight);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);
  ctx.scale(faceRight ? p.scaleX * 1.6 : -p.scaleX * 1.6, p.scaleY * 1.6);
  drawKnightBody(ctx, p, false, ang, faceRight);
  ctx.restore();
}

function drawKnightBody(
  ctx: CanvasRenderingContext2D,
  p: Player,
  ghost: boolean,
  ang: number,
  faceRight: boolean,
) {
  const t = p.animTime;
  const running = p.anim === "run";
  const dashing = p.anim === "dash";
  const hit = p.iFrames > 0 && Math.floor(t * 30) % 2 === 0;
  const victory = p.anim === "victory";
  const attacking = p.anim === "attack" || p.attackSwing > 0.1;

  const bob = running ? Math.sin(t * 16) * 1.8 : 0;
  const legSwing = running ? Math.sin(t * 16) * 5 : 0;
  const armSwing = running ? Math.sin(t * 16 + Math.PI) * 3 : 0;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(0, 13, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // cape (behind body)
  ctx.save();
  ctx.translate(-9, bob);
  const cf = Math.sin(t * 7) * 2.5;
  ctx.fillStyle = ghost ? "rgba(80,0,140,0.4)" : "#160028";
  ctx.strokeStyle = "#7a00ff";
  ctx.shadowColor = "#7a00ff";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-16 + cf, -2);
  ctx.lineTo(-14 + cf, 7);
  ctx.lineTo(-18 + cf, 11);
  ctx.lineTo(-6, 5);
  ctx.lineTo(0, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // legs
  ctx.strokeStyle = "#161620";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-3, 6);
  ctx.lineTo(-5 - legSwing, 15);
  ctx.moveTo(3, 6);
  ctx.lineTo(5 + legSwing, 15);
  ctx.stroke();
  ctx.fillStyle = "#9d4dff";
  ctx.beginPath();
  ctx.arc(-5 - legSwing, 15, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5 + legSwing, 15, 2, 0, Math.PI * 2);
  ctx.fill();

  // body
  const bodyGrad = ctx.createLinearGradient(0, -8 + bob, 0, 8 + bob);
  bodyGrad.addColorStop(0, hit ? "#fff" : "#1a1a24");
  bodyGrad.addColorStop(1, hit ? "#fff" : "#05060e");
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = ghost ? "rgba(157,77,255,0.6)" : "#9d4dff";
  ctx.shadowColor = "#9d4dff";
  ctx.shadowBlur = ghost ? 6 : 12;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-7, -3 + bob);
  ctx.lineTo(-9, 6 + bob);
  ctx.lineTo(9, 6 + bob);
  ctx.lineTo(7, -3 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#00f0ff";
  ctx.beginPath();
  ctx.moveTo(0, -3 + bob);
  ctx.lineTo(3.5, 2 + bob);
  ctx.lineTo(0, 6 + bob);
  ctx.lineTo(-3.5, 2 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // pauldrons
  ctx.fillStyle = "#0a0a14";
  ctx.strokeStyle = "#7a00ff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-8, -1 + bob, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(8, -1 + bob, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // shield arm
  ctx.save();
  ctx.translate(-2, 2 + bob + armSwing * 0.4);
  ctx.rotate(-0.3);
  ctx.fillStyle = "#0d0d1a";
  ctx.strokeStyle = "#00d6ff";
  ctx.shadowColor = "#00d6ff";
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-7, -5);
  ctx.lineTo(0, -7);
  ctx.lineTo(7, -5);
  ctx.lineTo(5, 7);
  ctx.lineTo(0, 9);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // sword
  const swing = victory
    ? Math.sin(t * 8) * 0.2 - 1.1
    : attacking
      ? -1.6 + (1 - p.attackSwing) * 1.6
      : -p.attackSwing * 0.9 - armSwing * 0.05;
  ctx.save();
  ctx.translate(5, bob);

  // Calculate relative sword rotation in local mirrored space
  const swordAng = faceRight ? ang + swing : Math.PI - ang + swing;
  ctx.rotate(swordAng);

  ctx.fillStyle = "#222";
  ctx.fillRect(0, -1, 4, 2);
  ctx.fillStyle = "#9d4dff";
  ctx.fillRect(4, -3, 2, 6);
  const bladeGrad = ctx.createLinearGradient(6, 0, 30, 0);
  bladeGrad.addColorStop(0, "#ffffff");
  bladeGrad.addColorStop(1, "#00f0ff");
  ctx.fillStyle = bladeGrad;
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = dashing || victory || attacking ? 22 : 12;
  ctx.beginPath();
  ctx.moveTo(6, -1.8);
  ctx.lineTo(30, -0.6);
  ctx.lineTo(32, 0);
  ctx.lineTo(30, 0.6);
  ctx.lineTo(6, 1.8);
  ctx.closePath();
  ctx.fill();

  // attack arc trail
  if (attacking || victory) {
    ctx.strokeStyle = "rgba(0,240,255,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 45, -0.6, 0.6);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // helmet
  ctx.save();
  ctx.translate(0, -9 + bob);
  ctx.fillStyle = hit ? "#fff" : "#0a0a14";
  ctx.strokeStyle = "#9d4dff";
  ctx.shadowColor = "#9d4dff";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-7, 4);
  ctx.quadraticCurveTo(-8, -5, 0, -7);
  ctx.quadraticCurveTo(8, -5, 7, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#00f0ff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 10;
  ctx.fillRect(-3.5, -2, 7, 1.6);
  ctx.fillRect(-0.7, -2, 1.4, 4.5);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#7a00ff";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6, -3);
  ctx.lineTo(-9, -8);
  ctx.moveTo(6, -3);
  ctx.lineTo(9, -8);
  ctx.stroke();
  ctx.restore();
}

// ============ ENEMY DRAWERS ============

function drawDrone(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = e.animTime;
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, Math.sin(t * 4) * 1.8);

  // Neon Thruster Flames at the bottom of the drone
  ctx.save();
  const flameH = 8 + Math.sin(t * 18) * 4;
  const flameGrad = ctx.createLinearGradient(0, 10, 0, 10 + flameH);
  flameGrad.addColorStop(0, "#ff5577");
  flameGrad.addColorStop(1, "rgba(255,85,119,0)");
  ctx.fillStyle = flameGrad;
  ctx.shadowColor = "#ff5577";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(0, 8 + flameH);
  ctx.lineTo(6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.rotate(t * 1.2);
  const baseColor = e.hitFlash > 0 ? "#fff" : "#ff5577";
  ctx.strokeStyle = baseColor;
  ctx.fillStyle = e.hitFlash > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,85,119,0.18)";
  ctx.shadowColor = baseColor;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.2;
  const r = e.radius;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.rotate(-t * 2.4);
  ctx.beginPath();
  ctx.rect(-r * 0.4, -r * 0.4, r * 0.8, r * 0.8);
  ctx.stroke();
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawNode(ctx: CanvasRenderingContext2D, e: Enemy, g: GameEngine) {
  const t = performance.now() / 1000;

  // Find linked chest
  let linkedChest = null;
  for (const pk of g.pickups) {
    if (
      pk.kind === "chest" &&
      pk.lockedByNodes &&
      Math.hypot(pk.pos.x - e.pos.x, pk.pos.y - e.pos.y) < 300
    ) {
      linkedChest = pk;
      break;
    }
  }

  // Draw tether
  if (linkedChest) {
    ctx.save();
    ctx.strokeStyle = `rgba(0, 255, 255, ${0.4 + Math.sin(t * 8) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath();
    ctx.moveTo(e.pos.x, e.pos.y);
    ctx.lineTo(linkedChest.pos.x, linkedChest.pos.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);

  // Outer shield ring
  ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + Math.sin(t * 5) * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, e.radius + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Core
  const flash = e.hitFlash > 0;
  ctx.fillStyle = flash ? "#ffffff" : "#04060e";
  ctx.strokeStyle = "#00f0ff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 15;
  ctx.lineWidth = 2;

  ctx.rotate(t * 1.5);
  ctx.beginPath();
  const r = e.radius;
  ctx.moveTo(r, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r, 0);
  ctx.lineTo(0, -r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  drawEnemyHpBar(ctx, e);
}

function drawShooter(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = e.animTime;
  const ang = Math.atan2(e.facing.y, e.facing.x);
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 20, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ang);
  const bob = Math.sin(t * 8) * 1.5;
  const flash = e.hitFlash > 0;
  // body (armored torso)
  ctx.fillStyle = flash ? "#fff" : "#3a0e2e";
  ctx.strokeStyle = "#ff66aa";
  ctx.shadowColor = "#ff66aa";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, -8 + bob);
  ctx.lineTo(12, -8 + bob);
  ctx.lineTo(14, 10 + bob);
  ctx.lineTo(-14, 10 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // helmet visor
  ctx.fillStyle = "#0a0008";
  ctx.fillRect(-8, -16 + bob, 16, 8);
  ctx.fillStyle = "#ff44aa";
  ctx.fillRect(-6, -13 + bob, 12, 2);
  ctx.shadowBlur = 0;
  // gun arm
  ctx.fillStyle = "#1a1a24";
  ctx.fillRect(8, -4 + bob, 18, 5);
  ctx.fillStyle = "#ff66aa";
  ctx.fillRect(24, -3 + bob, 4, 3);
  // dagger (visible when close)
  ctx.strokeStyle = "#00f0ff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  const swing = e.attackTimer > 0 ? Math.sin((0.4 - e.attackTimer) * 14) * 1.0 : 0;
  ctx.save();
  ctx.translate(-12, 2 + bob);
  ctx.rotate(-1 + swing);
  ctx.moveTo(0, 0);
  ctx.lineTo(10, -2);
  ctx.stroke();
  ctx.restore();
  ctx.shadowBlur = 0;
  // legs
  ctx.strokeStyle = "#1a0010";
  ctx.lineWidth = 3;
  const ls = Math.sin(t * 8) * 3;
  ctx.beginPath();
  ctx.moveTo(-6, 10 + bob);
  ctx.lineTo(-7 - ls, 20 + bob);
  ctx.moveTo(6, 10 + bob);
  ctx.lineTo(7 + ls, 20 + bob);
  ctx.stroke();
  ctx.restore();
  drawEnemyHpBar(ctx, e);
}

function drawSniper(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = e.animTime;
  const ang = Math.atan2(e.facing.y, e.facing.x);
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 20, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ang);
  const flash = e.hitFlash > 0;
  // cloaked body
  ctx.fillStyle = flash ? "#fff" : "#0a1428";
  ctx.strokeStyle = "#22d3ee";
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-10, -12);
  ctx.lineTo(10, -12);
  ctx.lineTo(14, 14);
  ctx.lineTo(-14, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // hood
  ctx.fillStyle = "#020616";
  ctx.beginPath();
  ctx.moveTo(-10, -12);
  ctx.quadraticCurveTo(0, -22, 10, -12);
  ctx.closePath();
  ctx.fill();
  // single sniper visor (red dot scope)
  ctx.fillStyle = "#ff0044";
  ctx.shadowColor = "#ff0044";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(2, -10, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // long rifle
  ctx.fillStyle = "#1a1a2a";
  ctx.fillRect(4, -3, 34, 4);
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(34, -2, 4, 2);
  // scope
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(16, -5, 3, 0, Math.PI * 2);
  ctx.stroke();
  // laser sight line (only when ready)
  if (e.shootCd < 0.6) {
    ctx.strokeStyle = "rgba(255,0,68,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(34 + 800, 0);
    ctx.stroke();
  }
  // legs
  ctx.strokeStyle = "#020616";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-5, 14);
  ctx.lineTo(-6, 22);
  ctx.moveTo(5, 14);
  ctx.lineTo(6, 22);
  ctx.stroke();
  ctx.restore();
  drawEnemyHpBar(ctx, e);
  void t;
}

function drawSlasher(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = e.animTime;
  const ang = Math.atan2(e.facing.y, e.facing.x);
  // dash afterimage
  if (e.dashTime > 0) {
    for (let i = 1; i <= 3; i++) {
      ctx.save();
      ctx.globalAlpha = 0.25 * (1 - i / 4);
      ctx.translate(e.pos.x - e.vel.x * 0.015 * i, e.pos.y - e.vel.y * 0.015 * i);
      ctx.rotate(ang);
      drawSlasherBody(ctx, e, t);
      ctx.restore();
    }
  }
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(0, 20, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ang);
  drawSlasherBody(ctx, e, t);
  ctx.restore();
  drawEnemyHpBar(ctx, e);
}

function drawSlasherBody(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
  const flash = e.hitFlash > 0 || e.attackState === "windup";
  const swingPhase =
    e.attackState === "swinging"
      ? (0.2 - e.attackTimer) / 0.2
      : e.attackState === "windup"
        ? -0.2
        : 0;
  const swing =
    swingPhase > 0
      ? Math.sin(swingPhase * Math.PI) * 2.0
      : e.attackState === "windup"
        ? -0.5
        : Math.sin(t * 10) * 0.3;

  // legs sprinting
  const ls = Math.sin(t * 18) * 5;
  ctx.strokeStyle = "#220010";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-4, 8);
  ctx.lineTo(-5 - ls, 18);
  ctx.moveTo(4, 8);
  ctx.lineTo(5 + ls, 18);
  ctx.stroke();

  // sleek body
  ctx.fillStyle = flash ? "#fff" : "#160018";
  ctx.strokeStyle = e.attackState === "windup" ? "#ff0000" : "#ff44ff";
  ctx.shadowColor = e.attackState === "windup" ? "#ff0000" : "#ff44ff";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(10, -10);
  ctx.lineTo(12, 8);
  ctx.lineTo(-12, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // hooded helm with single slit
  ctx.fillStyle = "#0a0010";
  ctx.beginPath();
  ctx.moveTo(-9, -10);
  ctx.quadraticCurveTo(0, -20, 9, -10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = e.attackState === "windup" ? "#ff0000" : "#ff44ff";
  ctx.shadowColor = e.attackState === "windup" ? "#ff0000" : "#ff44ff";
  ctx.shadowBlur = 10;
  ctx.fillRect(-5, -12, 10, 2);
  ctx.shadowBlur = 0;

  // twin claws
  ctx.save();
  ctx.translate(0, 2);
  ctx.rotate(swing);
  ctx.lineWidth = 2;
  if (e.attackState === "windup") {
    ctx.strokeStyle = "#ff0000";
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 15;
  } else {
    ctx.strokeStyle = "#ff66ff";
    ctx.shadowColor = "#ff66ff";
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.moveTo(10, -2);
  ctx.lineTo(24, -6);
  ctx.moveTo(10, 2);
  ctx.lineTo(24, 6);
  ctx.stroke();

  if (e.attackState === "swinging") {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255, 0, 100, ${1 - swingPhase})`;
    ctx.lineWidth = 4 + 4 * Math.sin(swingPhase * Math.PI);
    ctx.arc(0, 0, 30, -Math.PI / 4 + swing, Math.PI / 4 + swing);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawShield(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = e.animTime;
  const ang = Math.atan2(e.facing.y, e.facing.x);
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(0, 24, 24, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ang);
  const flash = e.hitFlash > 0;
  // bulky body
  ctx.fillStyle = flash ? "#fff" : "#0a1828";
  ctx.strokeStyle = "#88ddff";
  ctx.shadowColor = "#88ddff";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-16, -12);
  ctx.lineTo(16, -12);
  ctx.lineTo(20, 14);
  ctx.lineTo(-20, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // dome head
  ctx.fillStyle = "#0a1828";
  ctx.beginPath();
  ctx.arc(0, -14, 10, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#88ddff";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // visor
  ctx.fillStyle = "#88ddff";
  ctx.shadowColor = "#88ddff";
  ctx.shadowBlur = 10;
  ctx.fillRect(-7, -15, 14, 2.5);
  ctx.shadowBlur = 0;
  // giant tower shield in front
  ctx.save();
  ctx.translate(18, 0);
  ctx.fillStyle = "#001a2e";
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(10, -12);
  ctx.lineTo(10, 12);
  ctx.lineTo(0, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.restore();

  // active shield bubble
  if (e.shieldActive) {
    ctx.save();
    ctx.translate(e.pos.x, e.pos.y);
    const r = 50 + Math.sin(t * 6) * 3;
    const grad = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
    grad.addColorStop(0, "rgba(136,221,255,0.05)");
    grad.addColorStop(1, "rgba(136,221,255,0.35)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Rotating holographic cyber spoke lines inside the shield
    ctx.strokeStyle = "rgba(136,221,255,0.3)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + t * 0.6;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();

    ctx.strokeStyle = "#88ddff";
    ctx.shadowColor = "#88ddff";
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  drawEnemyHpBar(ctx, e);
}

function drawEnemyHpBar(ctx: CanvasRenderingContext2D, e: Enemy) {
  if (e.hp >= e.maxHp) return;
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y - e.radius - 14);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(-22, 0, 44, 4);
  ctx.fillStyle = e.shieldActive ? "#88ddff" : "#ff66aa";
  ctx.fillRect(-22, 0, 44 * Math.max(0, e.hp / e.maxHp), 4);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-22, 0, 44, 4);
  ctx.restore();
}

// ============ BOSS ============

function drawBoss(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = e.animTime;
  const phase2 = e.bossPhase === 2;
  const scale = phase2 ? 2.0 : 1.7;
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(0, 56, 48 * (scale / 1.7), 10, 0, 0, Math.PI * 2);
  ctx.fill();
  const ang = Math.atan2(e.facing.y, e.facing.x);
  ctx.rotate(ang + Math.PI / 2);
  ctx.scale(scale, scale);
  const bob = Math.sin(t * 4) * 2;
  const flash = e.hitFlash > 0;

  // bullet immunity aura (phase 2)
  if (phase2) {
    const r = 60 + Math.sin(t * 5) * 6;
    ctx.save();
    ctx.strokeStyle = "rgba(255,0,200,0.5)";
    ctx.shadowColor = "#ff00cc";
    ctx.shadowBlur = 20;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // legs
  ctx.strokeStyle = "#1a0010";
  ctx.lineWidth = 7;
  const legS = Math.sin(t * 6) * 4;
  ctx.beginPath();
  ctx.moveTo(-10, 20 + bob);
  ctx.lineTo(-12 - legS, 36 + bob);
  ctx.moveTo(10, 20 + bob);
  ctx.lineTo(12 + legS, 36 + bob);
  ctx.stroke();
  ctx.fillStyle = phase2 ? "#ff00ff" : "#ff00cc";
  ctx.beginPath();
  ctx.arc(-12 - legS, 36 + bob, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(12 + legS, 36 + bob, 3, 0, Math.PI * 2);
  ctx.fill();

  // cape
  ctx.save();
  const cf = Math.sin(t * 3) * 5;
  ctx.fillStyle = phase2 ? "#3d0030" : "#22001a";
  ctx.strokeStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, -12 + bob);
  ctx.lineTo(-28 + cf, 0 + bob);
  ctx.lineTo(-26 + cf, 18 + bob);
  ctx.lineTo(-32 + cf, 32 + bob);
  ctx.lineTo(-7, 20 + bob);
  ctx.lineTo(7, 20 + bob);
  ctx.lineTo(32 - cf, 32 + bob);
  ctx.lineTo(26 - cf, 18 + bob);
  ctx.lineTo(28 - cf, 0 + bob);
  ctx.lineTo(16, -12 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // torso
  const grad = ctx.createLinearGradient(0, -12 + bob, 0, 22 + bob);
  grad.addColorStop(0, flash ? "#fff" : phase2 ? "#4a002e" : "#2a0018");
  grad.addColorStop(1, flash ? "#fff" : "#0a0008");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 18;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-16, -10 + bob);
  ctx.lineTo(-20, 14 + bob);
  ctx.lineTo(-12, 24 + bob);
  ctx.lineTo(12, 24 + bob);
  ctx.lineTo(20, 14 + bob);
  ctx.lineTo(16, -10 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ff66ee";
  for (let i = 0; i < 3; i++) ctx.fillRect(-7, -2 + bob + i * 7, 14, 1.4);
  ctx.shadowBlur = 0;

  // pauldrons
  ctx.fillStyle = "#1a0010";
  ctx.strokeStyle = "#ff00cc";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(-20, -4 + bob, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(20, -4 + bob, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ff66ee";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-24, -12 + bob);
  ctx.lineTo(-30, -22 + bob);
  ctx.moveTo(-20, -16 + bob);
  ctx.lineTo(-20, -26 + bob);
  ctx.moveTo(24, -12 + bob);
  ctx.lineTo(30, -22 + bob);
  ctx.moveTo(20, -16 + bob);
  ctx.lineTo(20, -26 + bob);
  ctx.stroke();

  // shield
  ctx.save();
  ctx.translate(-26, 10 + bob);
  ctx.rotate(-0.2);
  ctx.fillStyle = "#0a0008";
  ctx.strokeStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, -14);
  ctx.lineTo(0, -16);
  ctx.lineTo(12, -14);
  ctx.lineTo(10, 14);
  ctx.lineTo(0, 18);
  ctx.lineTo(-10, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ff00cc";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // sword
  const swing =
    e.attackTimer > 0 ? Math.sin((0.45 - e.attackTimer) * 12) * 1.4 : Math.sin(t * 2) * 0.2;
  ctx.save();
  ctx.translate(26, 8 + bob);
  ctx.rotate(swing);
  ctx.fillStyle = "#222";
  ctx.fillRect(-2, -1, 6, 2);
  ctx.fillStyle = "#ff00cc";
  ctx.fillRect(4, -4, 3, 8);
  const blade = ctx.createLinearGradient(7, 0, 42, 0);
  blade.addColorStop(0, "#fff");
  blade.addColorStop(1, "#ff44dd");
  ctx.fillStyle = blade;
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(7, -2.5);
  ctx.lineTo(42, -0.6);
  ctx.lineTo(44, 0);
  ctx.lineTo(42, 0.6);
  ctx.lineTo(7, 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // helmet
  ctx.save();
  ctx.translate(0, -18 + bob);
  ctx.fillStyle = flash ? "#fff" : phase2 ? "#3a0024" : "#1a0010";
  ctx.strokeStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, 8);
  ctx.quadraticCurveTo(-14, -10, 0, -12);
  ctx.quadraticCurveTo(14, -10, 12, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = phase2 ? "#ff66ff" : "#ff44dd";
  ctx.shadowColor = "#ff44dd";
  ctx.shadowBlur = 12;
  ctx.fillRect(-8, -3, 6, 2.5);
  ctx.fillRect(2, -3, 6, 2.5);
  ctx.shadowBlur = 0;
  // crest
  ctx.fillStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(-2, -26 + Math.sin(t * 6) * 2);
  ctx.lineTo(2, -26 + Math.sin(t * 6 + 1) * 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-1, -10);
  ctx.quadraticCurveTo(-12 + Math.sin(t * 4) * 3, 6, -10 + Math.sin(t * 4) * 3, 16);
  ctx.lineTo(-5, 16);
  ctx.quadraticCurveTo(-2, 6, 1, -10);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.restore();

  // floating hp bar (world space)
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y - 80);
  // outer chrome
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(-80, -4, 160, 16);
  ctx.strokeStyle = "#ff44dd";
  ctx.lineWidth = 1;
  ctx.strokeRect(-80, -4, 160, 16);
  ctx.fillStyle = "#1a0010";
  ctx.fillRect(-76, 0, 152, 8);
  // hp
  const ratio = Math.max(0, e.hp / e.maxHp);
  const halfMark = -76 + 76; // mid
  const fillColor = phase2 ? "#ff00ff" : "#ff00cc";
  ctx.fillStyle = fillColor;
  ctx.fillRect(-76, 0, 152 * ratio, 8);
  // 50% phase line
  ctx.strokeStyle = "#ffcc00";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(halfMark, -4);
  ctx.lineTo(halfMark, 12);
  ctx.stroke();
  // labels
  ctx.fillStyle = "#ff66ee";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("THE WARDEN — " + (phase2 ? "PHASE II" : "PHASE I"), 0, -8);
  ctx.restore();
}

function drawMiniMap(ctx: CanvasRenderingContext2D, g: GameEngine) {
  ctx.save();
  const size = 130;
  const padding = 15;
  const mx = VIEW_W - size - padding;
  const my = padding;
  const cx = mx + size / 2;
  const cy = my + size / 2;
  const radius = size / 2;

  // Glassmorphic Screen
  ctx.fillStyle = "rgba(4, 7, 20, 0.75)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
  ctx.clip();

  // Grid rings and axis lines
  ctx.strokeStyle = "rgba(0, 240, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.35, 0, Math.PI * 2);
  ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
  ctx.stroke();

  // Sweep Animation
  const t = performance.now() / 1000;
  const sweepAng = (t * 2.2) % (Math.PI * 2);
  const sweepGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
  sweepGrad.addColorStop(0, "rgba(0, 240, 255, 0)");
  sweepGrad.addColorStop(1, "rgba(0, 240, 255, 0.08)");
  ctx.fillStyle = sweepGrad;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, sweepAng - 0.4, sweepAng);
  ctx.closePath();
  ctx.fill();

  // Scaling world points centered on player (approx 450px -> 40px)
  const scale = 0.09;
  const px = g.player.pos.x;
  const py = g.player.pos.y;
  const toLocal = (wx: number, wy: number) => ({
    x: cx + (wx - px) * scale,
    y: cy + (wy - py) * scale,
  });

  // Render walls
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  for (const w of g.walls) {
    const loc = toLocal(w.x + w.w / 2, w.y + w.h / 2);
    ctx.fillRect(loc.x - (w.w * scale) / 2, loc.y - (w.h * scale) / 2, w.w * scale, w.h * scale);
  }

  // Exit Gate
  const gateLoc = toLocal(g.exitGate.x, g.exitGate.y);
  ctx.fillStyle = g.exitGate.open ? "rgba(0, 255, 170, 0.85)" : "rgba(255, 59, 100, 0.45)";
  ctx.beginPath();
  ctx.arc(gateLoc.x, gateLoc.y, 4, 0, Math.PI * 2);
  ctx.fill();

  // Chests
  for (const p of g.pickups) {
    if (p.kind === "chest" && !p.taken) {
      const chestLoc = toLocal(p.pos.x, p.pos.y);
      ctx.fillStyle =
        p.rarity === "legendary"
          ? "#ff00cc"
          : p.rarity === "epic"
            ? "#ffd700"
            : p.rarity === "rare"
              ? "#00ffff"
              : "#a1a1aa";
      ctx.beginPath();
      ctx.arc(chestLoc.x, chestLoc.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Decryption Terminal
  for (const w of g.walls) {
    if (w.kind === "puzzle_terminal") {
      const termLoc = toLocal(w.x + w.w / 2, w.y + w.h / 2);
      ctx.fillStyle = g.decryptionComplete ? "#00ffcc" : "#00f0ff";
      ctx.beginPath();
      ctx.moveTo(termLoc.x, termLoc.y - 5);
      ctx.lineTo(termLoc.x + 5, termLoc.y);
      ctx.lineTo(termLoc.x, termLoc.y + 5);
      ctx.lineTo(termLoc.x - 5, termLoc.y);
      ctx.closePath();
      ctx.fill();
      if (!g.decryptionComplete) {
        ctx.strokeStyle = "rgba(0, 240, 255, " + (0.5 + Math.sin(performance.now() / 150) * 0.4) + ")";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  // Enemies
  for (const e of g.enemies) {
    if (e.hp > 0) {
      const eloc = toLocal(e.pos.x, e.pos.y);
      if (e.isBoss) {
        ctx.fillStyle = "#ff0055";
        ctx.beginPath();
        ctx.arc(eloc.x, eloc.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = e.cls === "sniper" ? "#ff00ff" : e.cls === "shield" ? "#38bdf8" : "#ff3366";
        ctx.beginPath();
        ctx.arc(eloc.x, eloc.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();

  // Border ring
  ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Cardinal N indicator
  ctx.fillStyle = "rgba(0, 240, 255, 0.7)";
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("N", cx, my + 9);

  // Centered Player pointer
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(g.player.facing.y, g.player.facing.x));
  ctx.fillStyle = "#00f0ff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}
