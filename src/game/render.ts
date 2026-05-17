import { VIEW_W, VIEW_H, GameEngine } from "./engine";
import type { Enemy, Player, Vec } from "./types";

export function render(ctx: CanvasRenderingContext2D, g: GameEngine) {
  // ---- screen-space pass: background + parallax ----
  drawBackground(ctx, g);

  const shakeX = (Math.random() - 0.5) * g.shake;
  const shakeY = (Math.random() - 0.5) * g.shake;

  ctx.save();
  ctx.translate(-g.cam.x + shakeX, -g.cam.y + shakeY);

  drawWorldGrid(ctx, g);
  drawWalls(ctx, g);
  drawHazards(ctx, g);
  drawParticles(ctx, g);
  drawBullets(ctx, g);
  drawEnemies(ctx, g);
  drawPlayer(ctx, g);

  ctx.restore();

  // dim overlay during countdown
  if (g.state === "countdown") {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, g: GameEngine) {
  // base gradient (deep cyber slate -> indigo)
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#070b1d");
  grad.addColorStop(0.6, "#0a0f24");
  grad.addColorStop(1, "#04060f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // far parallax: faint circuit traces
  const px = -g.cam.x * 0.15;
  const py = -g.cam.y * 0.15;
  ctx.strokeStyle = "rgba(60, 140, 200, 0.08)";
  ctx.lineWidth = 1;
  const step = 90;
  const ox = ((px % step) + step) % step;
  const oy = ((py % step) + step) % step;
  for (let x = ox - step; x < VIEW_W + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, VIEW_H); ctx.stroke();
  }
  for (let y = oy - step; y < VIEW_H + step; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y); ctx.stroke();
  }
  // mid parallax: pulse nodes
  const t = performance.now() / 1000;
  ctx.fillStyle = "rgba(0, 200, 255, 0.18)";
  for (let i = 0; i < 12; i++) {
    const sx = ((i * 173 - g.cam.x * 0.3) % (VIEW_W + 200) + VIEW_W + 200) % (VIEW_W + 200) - 100;
    const sy = ((i * 271 - g.cam.y * 0.3) % (VIEW_H + 200) + VIEW_H + 200) % (VIEW_H + 200) - 100;
    const r = 2 + (Math.sin(t * 2 + i) * 0.5 + 0.5) * 2;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawWorldGrid(ctx: CanvasRenderingContext2D, g: GameEngine) {
  ctx.strokeStyle = "rgba(0, 240, 255, 0.07)";
  ctx.lineWidth = 1;
  const grid = 60;
  const sx = Math.floor(g.cam.x / grid) * grid;
  const sy = Math.floor(g.cam.y / grid) * grid;
  for (let x = sx; x < g.cam.x + VIEW_W + grid; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, g.cam.y - 10); ctx.lineTo(x, g.cam.y + VIEW_H + 10); ctx.stroke();
  }
  for (let y = sy; y < g.cam.y + VIEW_H + grid; y += grid) {
    ctx.beginPath(); ctx.moveTo(g.cam.x - 10, y); ctx.lineTo(g.cam.x + VIEW_W + 10, y); ctx.stroke();
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const w of g.walls) {
    if (w.kind === "gate") {
      // gate: open archway look
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
    } else {
      // metallic block with neon outline
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
      // inner detail
      ctx.strokeStyle = "rgba(0, 214, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x + 4, w.y + 4, w.w - 8, w.h - 8);
    }
  }
}

function drawHazards(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const h of g.hazards) {
    if (h.kind === "laser") {
      const t = (h.phase % h.period) / h.period;
      const active = t > 0.55;
      const warn = t > 0.35 && t <= 0.55;
      ctx.fillStyle = active ? "rgba(255, 60, 100, 0.9)" : warn ? "rgba(255,60,100,0.25)" : "rgba(255,60,100,0.1)";
      if (active) { ctx.shadowColor = "#ff3b64"; ctx.shadowBlur = 20; }
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
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = charging ? "#ffcc00" : "rgba(255,204,0,0.6)";
      ctx.beginPath(); ctx.arc(h.x, h.y, 6, 0, Math.PI * 2); ctx.fill();
    } else if (h.kind === "anti_dash") {
      ctx.strokeStyle = "rgba(255, 80, 200, 0.6)";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const p of g.particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBullets(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const b of g.bullets) {
    ctx.fillStyle = b.fromPlayer ? "#00ffaa" : "#ff3b64";
    ctx.shadowColor = b.fromPlayer ? "#00ffaa" : "#ff3b64";
    ctx.shadowBlur = 12;
    // streak
    const ang = Math.atan2(b.vel.y, b.vel.x);
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.shadowBlur = 0;
}

function drawEnemies(ctx: CanvasRenderingContext2D, g: GameEngine) {
  for (const e of g.enemies) {
    if (e.isBoss) drawBoss(ctx, e);
    else drawDrone(ctx, e);
  }
}

// ============ ANIMATED CHARACTERS ============

function drawPlayer(ctx: CanvasRenderingContext2D, g: GameEngine) {
  const p = g.player;
  const ang = Math.atan2(p.facing.y, p.facing.x);

  // dash afterimages
  if (p.dashTime > 0) {
    for (let i = 1; i <= 3; i++) {
      ctx.save();
      ctx.globalAlpha = 0.25 * (1 - i / 4);
      ctx.translate(p.pos.x - p.vel.x * 0.02 * i, p.pos.y - p.vel.y * 0.02 * i);
      ctx.rotate(ang);
      drawKnightBody(ctx, p, true);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);
  ctx.scale(p.scaleX, p.scaleY);
  ctx.rotate(ang);
  drawKnightBody(ctx, p, false);
  ctx.restore();
}

function drawKnightBody(ctx: CanvasRenderingContext2D, p: Player, ghost: boolean) {
  const t = p.animTime;
  const running = p.anim === "run";
  const dashing = p.anim === "dash";
  const hit = p.iFrames > 0 && Math.floor(t * 30) % 2 === 0;
  const victory = p.anim === "victory";

  // bob / leg swing
  const bob = running ? Math.sin(t * 14) * 1.5 : 0;
  const legSwing = running ? Math.sin(t * 14) * 4 : 0;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 12, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // cape (behind body) - flutters
  ctx.save();
  ctx.translate(-8, bob);
  const cf = Math.sin(t * 6) * 2;
  ctx.fillStyle = ghost ? "rgba(80,0,140,0.4)" : "#160028";
  ctx.strokeStyle = "#7a00ff";
  ctx.shadowColor = "#7a00ff";
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-14 + cf, -2);
  ctx.lineTo(-12 + cf, 6);
  ctx.lineTo(-16 + cf, 10);
  ctx.lineTo(-6, 4);
  ctx.lineTo(0, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // legs
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-2, 6); ctx.lineTo(-4 - legSwing, 14);
  ctx.moveTo(2, 6);  ctx.lineTo(4 + legSwing, 14);
  ctx.stroke();
  // boot glow
  ctx.fillStyle = "#9d4dff";
  ctx.beginPath(); ctx.arc(-4 - legSwing, 14, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4 + legSwing, 14, 1.8, 0, Math.PI * 2); ctx.fill();

  // body (dark plate)
  const bodyGrad = ctx.createLinearGradient(0, -8 + bob, 0, 8 + bob);
  bodyGrad.addColorStop(0, hit ? "#fff" : "#1a1a24");
  bodyGrad.addColorStop(1, hit ? "#fff" : "#05060e");
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = ghost ? "rgba(157,77,255,0.6)" : "#9d4dff";
  ctx.shadowColor = "#9d4dff";
  ctx.shadowBlur = ghost ? 6 : 10;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-6, -2 + bob);
  ctx.lineTo(-8, 6 + bob);
  ctx.lineTo(8, 6 + bob);
  ctx.lineTo(6, -2 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // chest emblem (glowing diamond)
  ctx.fillStyle = "#00f0ff";
  ctx.beginPath();
  ctx.moveTo(0, -2 + bob); ctx.lineTo(3, 2 + bob); ctx.lineTo(0, 6 + bob); ctx.lineTo(-3, 2 + bob);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;

  // shoulder pauldrons
  ctx.fillStyle = "#0a0a14";
  ctx.strokeStyle = "#7a00ff";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-7, -1 + bob, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(7, -1 + bob, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // arms — left arm holds sword, right arm shield
  // shield (back hand side)
  ctx.save();
  ctx.translate(-2, 2 + bob);
  ctx.rotate(-0.3);
  ctx.fillStyle = "#0d0d1a";
  ctx.strokeStyle = "#00d6ff";
  ctx.shadowColor = "#00d6ff";
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, -4); ctx.lineTo(0, -6); ctx.lineTo(6, -4);
  ctx.lineTo(4, 6); ctx.lineTo(0, 8); ctx.lineTo(-4, 6);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // sword — held forward; swings on attackSwing / victory
  const swing = victory ? Math.sin(t * 8) * 0.2 - 1.1 : -p.attackSwing * 0.9;
  ctx.save();
  ctx.translate(4, 0 + bob);
  ctx.rotate(swing);
  // grip
  ctx.fillStyle = "#222";
  ctx.fillRect(0, -1, 4, 2);
  // crossguard
  ctx.fillStyle = "#9d4dff";
  ctx.fillRect(4, -3, 2, 6);
  // blade (glowing energy)
  const bladeGrad = ctx.createLinearGradient(6, 0, 26, 0);
  bladeGrad.addColorStop(0, "#ffffff");
  bladeGrad.addColorStop(1, "#00f0ff");
  ctx.fillStyle = bladeGrad;
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = dashing || victory ? 18 : 10;
  ctx.beginPath();
  ctx.moveTo(6, -1.5); ctx.lineTo(26, -0.5); ctx.lineTo(28, 0); ctx.lineTo(26, 0.5); ctx.lineTo(6, 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // helmet
  ctx.save();
  ctx.translate(0, -8 + bob);
  // helm dome
  ctx.fillStyle = hit ? "#fff" : "#0a0a14";
  ctx.strokeStyle = "#9d4dff";
  ctx.shadowColor = "#9d4dff";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.quadraticCurveTo(-7, -4, 0, -6);
  ctx.quadraticCurveTo(7, -4, 6, 4);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // T-visor (glow slit)
  ctx.fillStyle = "#00f0ff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 8;
  ctx.fillRect(-3, -2, 6, 1.5); // horizontal
  ctx.fillRect(-0.6, -2, 1.2, 4); // vertical
  ctx.shadowBlur = 0;
  // small horns / crest
  ctx.strokeStyle = "#7a00ff";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-5, -3); ctx.lineTo(-8, -7);
  ctx.moveTo(5, -3); ctx.lineTo(8, -7);
  ctx.stroke();
  ctx.restore();
}

function drawDrone(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = e.animTime;
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.ellipse(0, 14, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
  // hover bob
  ctx.translate(0, Math.sin(t * 4) * 1.5);
  ctx.rotate(t * 1.2);
  const baseColor = e.hitFlash > 0 ? "#fff" : e.shielded ? "#88ddff" : "#ff5577";
  ctx.strokeStyle = baseColor;
  ctx.fillStyle = e.hitFlash > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,85,119,0.18)";
  ctx.shadowColor = baseColor;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  // rotating triangle frame
  const r = e.radius;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // inner counter-rotating square
  ctx.rotate(-t * 2.4);
  ctx.beginPath();
  ctx.rect(-r * 0.4, -r * 0.4, r * 0.8, r * 0.8);
  ctx.stroke();
  // central eye
  ctx.fillStyle = baseColor;
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // shield aura
  if (e.shielded) {
    ctx.save();
    ctx.translate(e.pos.x, e.pos.y);
    ctx.strokeStyle = "#88ddff";
    ctx.shadowColor = "#88ddff";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 6 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawBoss(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = e.animTime;
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath(); ctx.ellipse(0, 36, 36, 8, 0, 0, Math.PI * 2); ctx.fill();
  const ang = Math.atan2(e.facing.y, e.facing.x);
  ctx.rotate(ang + Math.PI / 2); // face direction (sprite up)
  const bob = Math.sin(t * 4) * 2;
  const flash = e.hitFlash > 0;

  // legs (cyber greaves)
  ctx.strokeStyle = "#1a0010";
  ctx.lineWidth = 6;
  const legS = Math.sin(t * 6) * 4;
  ctx.beginPath();
  ctx.moveTo(-8, 18 + bob); ctx.lineTo(-10 - legS, 32 + bob);
  ctx.moveTo(8, 18 + bob);  ctx.lineTo(10 + legS, 32 + bob);
  ctx.stroke();
  ctx.fillStyle = "#ff00cc";
  ctx.beginPath(); ctx.arc(-10 - legS, 32 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(10 + legS, 32 + bob, 2.5, 0, Math.PI * 2); ctx.fill();

  // cape
  ctx.save();
  const cf = Math.sin(t * 3) * 4;
  ctx.fillStyle = "#22001a";
  ctx.strokeStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-14, -10 + bob);
  ctx.lineTo(-24 + cf, 0 + bob);
  ctx.lineTo(-22 + cf, 16 + bob);
  ctx.lineTo(-28 + cf, 28 + bob);
  ctx.lineTo(-6, 18 + bob);
  ctx.lineTo(6, 18 + bob);
  ctx.lineTo(28 - cf, 28 + bob);
  ctx.lineTo(22 - cf, 16 + bob);
  ctx.lineTo(24 - cf, 0 + bob);
  ctx.lineTo(14, -10 + bob);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // torso (cuirass)
  const grad = ctx.createLinearGradient(0, -10 + bob, 0, 20 + bob);
  grad.addColorStop(0, flash ? "#fff" : "#2a0018");
  grad.addColorStop(1, flash ? "#fff" : "#0a0008");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 16;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-14, -8 + bob);
  ctx.lineTo(-18, 12 + bob);
  ctx.lineTo(-10, 22 + bob);
  ctx.lineTo(10, 22 + bob);
  ctx.lineTo(18, 12 + bob);
  ctx.lineTo(14, -8 + bob);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // abdominal lights
  ctx.fillStyle = "#ff66ee";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(-6, -2 + bob + i * 6, 12, 1.2);
  }
  ctx.shadowBlur = 0;

  // pauldrons (cyber-gladiator big shoulders)
  ctx.fillStyle = "#1a0010";
  ctx.strokeStyle = "#ff00cc";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(-18, -4 + bob, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(18, -4 + bob, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // pauldron spikes
  ctx.strokeStyle = "#ff66ee";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-22, -10 + bob); ctx.lineTo(-26, -18 + bob);
  ctx.moveTo(-18, -14 + bob); ctx.lineTo(-18, -22 + bob);
  ctx.moveTo(22, -10 + bob); ctx.lineTo(26, -18 + bob);
  ctx.moveTo(18, -14 + bob); ctx.lineTo(18, -22 + bob);
  ctx.stroke();

  // shield (left)
  ctx.save();
  ctx.translate(-22, 8 + bob);
  ctx.rotate(-0.2);
  ctx.fillStyle = "#0a0008";
  ctx.strokeStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -12); ctx.lineTo(0, -14); ctx.lineTo(10, -12);
  ctx.lineTo(8, 12); ctx.lineTo(0, 16); ctx.lineTo(-8, 12);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // crest
  ctx.fillStyle = "#ff00cc";
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // sword (right) — swings on attackTimer
  const swing = e.attackTimer > 0 ? Math.sin((0.45 - e.attackTimer) * 12) * 1.4 : Math.sin(t * 2) * 0.2;
  ctx.save();
  ctx.translate(22, 6 + bob);
  ctx.rotate(swing);
  ctx.fillStyle = "#222"; ctx.fillRect(-2, -1, 6, 2);
  ctx.fillStyle = "#ff00cc"; ctx.fillRect(4, -4, 3, 8);
  const blade = ctx.createLinearGradient(7, 0, 38, 0);
  blade.addColorStop(0, "#fff");
  blade.addColorStop(1, "#ff44dd");
  ctx.fillStyle = blade;
  ctx.shadowColor = "#ff00cc"; ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(7, -2); ctx.lineTo(38, -0.5); ctx.lineTo(40, 0); ctx.lineTo(38, 0.5); ctx.lineTo(7, 2);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // helmet (gladiator crested)
  ctx.save();
  ctx.translate(0, -16 + bob);
  ctx.fillStyle = flash ? "#fff" : "#1a0010";
  ctx.strokeStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, 6);
  ctx.quadraticCurveTo(-12, -8, 0, -10);
  ctx.quadraticCurveTo(12, -8, 10, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // visor with two eyes
  ctx.fillStyle = "#ff44dd";
  ctx.shadowColor = "#ff44dd"; ctx.shadowBlur = 10;
  ctx.fillRect(-7, -2, 5, 2.2);
  ctx.fillRect(2, -2, 5, 2.2);
  ctx.shadowBlur = 0;
  // crest (mohawk) flowing
  ctx.fillStyle = "#ff00cc";
  ctx.shadowColor = "#ff00cc"; ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-2, -22 + Math.sin(t * 6) * 2);
  ctx.lineTo(2, -22 + Math.sin(t * 6 + 1) * 2);
  ctx.closePath(); ctx.fill();
  // crest tail
  ctx.beginPath();
  ctx.moveTo(-1, -8);
  ctx.quadraticCurveTo(-10 + Math.sin(t * 4) * 3, 4, -8 + Math.sin(t * 4) * 3, 14);
  ctx.lineTo(-4, 14);
  ctx.quadraticCurveTo(-2, 4, 1, -8);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.restore();

  // hp bar floating above (in world)
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y - 56);
  ctx.fillStyle = "#222"; ctx.fillRect(-50, 0, 100, 6);
  ctx.fillStyle = "#ff00cc"; ctx.fillRect(-50, 0, 100 * (e.hp / e.maxHp), 6);
  ctx.strokeStyle = "#ff44dd"; ctx.lineWidth = 1; ctx.strokeRect(-50, 0, 100, 6);
  ctx.restore();
}
