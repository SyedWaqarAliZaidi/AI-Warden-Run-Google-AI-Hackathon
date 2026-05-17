import { ARENA_H, ARENA_W, GameEngine } from "./engine";

export function render(ctx: CanvasRenderingContext2D, g: GameEngine) {
  const shakeX = (Math.random() - 0.5) * g.shake;
  const shakeY = (Math.random() - 0.5) * g.shake;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // background grid
  ctx.fillStyle = "#05060e";
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  ctx.strokeStyle = "rgba(0, 240, 255, 0.08)";
  ctx.lineWidth = 1;
  const grid = 40;
  for (let x = 0; x <= ARENA_W; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA_H);
    ctx.stroke();
  }
  for (let y = 0; y <= ARENA_H; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA_W, y);
    ctx.stroke();
  }

  // border glow
  ctx.strokeStyle = "#00f0ff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2);
  ctx.shadowBlur = 0;

  // hazards
  for (const h of g.hazards) {
    if (h.kind === "laser") {
      const t = (h.phase % h.period) / h.period;
      const active = t > 0.55;
      const warn = t > 0.35 && t <= 0.55;
      ctx.fillStyle = active ? "rgba(255, 60, 100, 0.9)" : warn ? "rgba(255,60,100,0.25)" : "rgba(255,60,100,0.1)";
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
    }
  }

  // particles
  for (const p of g.particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // bullets
  for (const b of g.bullets) {
    ctx.fillStyle = b.fromPlayer ? "#00ffaa" : "#ff3b64";
    ctx.shadowColor = b.fromPlayer ? "#00ffaa" : "#ff3b64";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // enemies
  for (const e of g.enemies) {
    ctx.save();
    ctx.translate(e.pos.x, e.pos.y);
    if (e.isBoss) {
      ctx.rotate(g.elapsed * 0.6);
      ctx.strokeStyle = e.hitFlash > 0 ? "#ffffff" : "#ff00cc";
      ctx.shadowColor = "#ff00cc";
      ctx.shadowBlur = 20;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const r = e.radius - i * 8;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // hp bar
      ctx.fillStyle = "#222";
      ctx.fillRect(-40, -e.radius - 14, 80, 6);
      ctx.fillStyle = "#ff00cc";
      ctx.fillRect(-40, -e.radius - 14, 80 * (e.hp / e.maxHp), 6);
    } else {
      ctx.strokeStyle = e.hitFlash > 0 ? "#ffffff" : e.shielded ? "#88ddff" : "#ff5577";
      ctx.fillStyle = e.hitFlash > 0 ? "rgba(255,255,255,0.4)" : "rgba(255,85,119,0.15)";
      ctx.lineWidth = 2;
      ctx.shadowColor = e.shielded ? "#88ddff" : "#ff5577";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      const r = e.radius;
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (e.shielded) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // player
  const p = g.player;
  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);
  ctx.scale(p.scaleX, p.scaleY);
  const flash = p.iFrames > 0 && Math.floor(g.elapsed * 30) % 2 === 0;
  ctx.fillStyle = flash ? "rgba(255,255,255,0.7)" : "#00f0ff";
  ctx.strokeStyle = "#ffffff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 20;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // triangle facing
  const ang = Math.atan2(p.facing.y, p.facing.x);
  ctx.rotate(ang);
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, 9);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-10, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.restore();
}