import Player from './Player.mjs';
import Collectible from './Collectible.mjs';

const socket = io();
const canvas = document.getElementById('game-window');
const ctx = canvas.getContext('2d');

const COLS = 60;
const ROWS = 40;
const CELL_SIZE = 10;
const OFFSET_X = 20;
const OFFSET_Y = 60;

let myId = null;
let allPlayers = [];
let grid = new Array(COLS * ROWS).fill(0);
let collectible = null;
let roundTime = 60;
let roundStatus = 'waiting';
let lobbyCountdown = 3;
let minPlayers = 2;
let winnerInfo = null;

socket.on('init', (data) => {
  myId = data.id;
  allPlayers = data.players.map(p => new Player(p));
  if (data.grid) grid = [...data.grid];
  if (data.collectible) collectible = new Collectible(data.collectible);
  roundTime = data.roundTime;
  roundStatus = data.roundStatus;
  lobbyCountdown = data.lobbyCountdown || 3;
  minPlayers = data.minPlayers || 2;
});

socket.on('game-tick', (data) => {
  allPlayers = data.players.map(p => {
    const pl = new Player(p);
    pl.dir = p.dir;
    pl.trail = p.trail || [];
    pl.color = p.color;
    pl.isAlive = p.isAlive;
    return pl;
  });

  if (data.gridChanges && data.gridChanges.length > 0) {
    data.gridChanges.forEach(ch => {
      const idx = ch.r * COLS + ch.c;
      if (idx >= 0 && idx < grid.length) {
        grid[idx] = ch.id;
      }
    });
  }

  roundTime = data.roundTime;
  roundStatus = data.roundStatus;
  if (data.lobbyCountdown !== undefined) lobbyCountdown = data.lobbyCountdown;
});

socket.on('lobby-countdown', (data) => {
  roundStatus = 'starting';
  lobbyCountdown = data.countdown;
});

socket.on('round-waiting', (data) => {
  roundStatus = 'waiting';
  minPlayers = data.minPlayers;
});

socket.on('round-reset', (data) => {
  grid = [...data.grid];
  allPlayers = data.players.map(p => new Player(p));
  if (data.collectible) collectible = new Collectible(data.collectible);
  roundTime = data.roundTime;
  roundStatus = 'running';
  winnerInfo = null;
});

socket.on('round-ended', (data) => {
  roundStatus = 'ended';
  winnerInfo = data.winner;
});

socket.on('update-collectible', (data) => {
  collectible = new Collectible(data.collectible);
});

socket.on('player-cut', (data) => {
  // Visual kill feedback
});

// Controls (WASD / Arrows to steer)
const keyDir = {
  ArrowUp: 'up', KeyW: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', KeyS: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', KeyA: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', KeyD: 'right', d: 'right', D: 'right'
};

window.addEventListener('keydown', (e) => {
  const dir = keyDir[e.code] || keyDir[e.key];
  if (dir) {
    socket.emit('change-dir', dir);
  }
});

// Helper for color shading
function hexToRgba(hex, alpha) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

// 3D Isometric Extrusion Box
function draw3DBox(x, y, w, h, depth, topColor, sideColor, frontColor) {
  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(x + depth, y + depth, w, h);

  // Front face
  ctx.fillStyle = frontColor;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h + depth);
  ctx.lineTo(x, y + h + depth);
  ctx.closePath();
  ctx.fill();

  // Side face (right)
  ctx.fillStyle = sideColor;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + depth, y - depth);
  ctx.lineTo(x + w + depth, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();

  // Top face
  ctx.fillStyle = topColor;
  ctx.fillRect(x, y, w, h);
}

function drawTerritory() {
  const playerMap = {};
  allPlayers.forEach(p => { playerMap[p.id] = p; });

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ownerId = grid[r * COLS + c];
      if (ownerId !== 0) {
        const owner = playerMap[ownerId];
        const color = owner && owner.color ? owner.color.main : '#38bdf8';
        const px = OFFSET_X + c * CELL_SIZE;
        const py = OFFSET_Y + r * CELL_SIZE;

        // 3D cell block
        ctx.fillStyle = hexToRgba(color, 0.45);
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

        ctx.strokeStyle = hexToRgba(color, 0.8);
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
      }
    }
  }
}

function drawTrails() {
  allPlayers.forEach(p => {
    if (!p.isAlive || !p.trail || p.trail.length === 0) return;
    const col = p.color || { main: '#3b82f6', dark: '#1d4ed8', light: '#93c5fd' };

    p.trail.forEach(pt => {
      const px = OFFSET_X + pt.c * CELL_SIZE;
      const py = OFFSET_Y + pt.r * CELL_SIZE;

      // 3D raised neon ribbon/wall
      ctx.fillStyle = col.dark;
      ctx.fillRect(px, py + 2, CELL_SIZE, CELL_SIZE - 2);

      ctx.fillStyle = col.light;
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE - 2);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE - 2);
    });
  });
}

function drawPlayerAvatar(player, isMe, isLeader, time) {
  if (!player.isAlive) return;

  const col = player.color || { main: '#3b82f6', dark: '#1d4ed8', light: '#93c5fd' };
  const size = 18;
  const bob = Math.sin(time / 140) * 2;
  const x = player.x - size / 4;
  const y = player.y - size / 4 + bob;

  // 3D Extruded Cube Head
  draw3DBox(x, y, size, size, 4, col.main, col.dark, col.dark);

  // Eyes based on direction
  ctx.fillStyle = '#ffffff';
  let eyeX1 = x + 3, eyeY1 = y + 4, eyeX2 = x + 11, eyeY2 = y + 4;
  let pupilDx = 0, pupilDy = 0;

  if (player.dir === 'right') { eyeX1 += 4; eyeX2 += 4; pupilDx = 1.5; }
  if (player.dir === 'left') { pupilDx = -1.5; }
  if (player.dir === 'up') { eyeY1 -= 2; eyeY2 -= 2; pupilDy = -1.5; }
  if (player.dir === 'down') { eyeY1 += 4; eyeY2 += 4; pupilDy = 1.5; }

  ctx.fillRect(eyeX1, eyeY1, 4, 4);
  ctx.fillRect(eyeX2, eyeY2, 4, 4);

  // Pupils
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(eyeX1 + 1 + pupilDx, eyeY1 + 1 + pupilDy, 2, 2);
  ctx.fillRect(eyeX2 + 1 + pupilDx, eyeY2 + 1 + pupilDy, 2, 2);

  // Floating 3D Golden Crown for Leader
  if (isLeader && player.score > 0) {
    const crownY = y - 10 + Math.sin(time / 120) * 2;
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(x + 2, crownY + 6);
    ctx.lineTo(x + 2, crownY);
    ctx.lineTo(x + 6, crownY + 3);
    ctx.lineTo(x + 9, crownY - 2);
    ctx.lineTo(x + 12, crownY + 3);
    ctx.lineTo(x + 16, crownY);
    ctx.lineTo(x + 16, crownY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Player Name Tag
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = isMe ? '#4ade80' : '#e2e8f0';
  const label = isMe ? 'YOU' : `P-${player.id ? player.id.slice(0, 3) : ''}`;
  ctx.fillText(label, x + size / 2, y - 12);
}

function draw3DCollectible(item, time) {
  if (!item) return;
  const rot = (time / 300) % (Math.PI * 2);
  const cx = item.x + 7.5;
  const cy = item.y + 7.5 + Math.sin(time / 180) * 3;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, item.y + 16, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3D Gem Shape
  ctx.save();
  ctx.translate(cx, cy);

  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(7, -2);
  ctx.lineTo(0, 9);
  ctx.lineTo(-7, -2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(7, -2);
  ctx.lineTo(0, 9);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#854d0e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function render(timestamp) {
  const time = timestamp || Date.now();

  // Background Arena (3D Dark Grid)
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 3D Arena Board
  const boardW = COLS * CELL_SIZE;
  const boardH = ROWS * CELL_SIZE;

  // Board Depth Shadow & Front Edge
  ctx.fillStyle = '#030712';
  ctx.fillRect(OFFSET_X, OFFSET_Y + boardH, boardW, 8);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(OFFSET_X, OFFSET_Y, boardW, boardH);

  // Perspective Grid Lines
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= COLS; c += 5) {
    const gx = OFFSET_X + c * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(gx, OFFSET_Y);
    ctx.lineTo(gx, OFFSET_Y + boardH);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r += 5) {
    const gy = OFFSET_Y + r * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(OFFSET_X, gy);
    ctx.lineTo(OFFSET_X + boardW, gy);
    ctx.stroke();
  }

  // Draw Arena Components
  drawTerritory();
  drawTrails();
  draw3DCollectible(collectible, time);

  // Determine Leader
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const leaderId = sorted[0] ? sorted[0].id : null;

  allPlayers.forEach(p => {
    drawPlayerAvatar(p, p.id === myId, p.id === leaderId, time);
  });

  // HUD Top Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, 50);

  // Center Pill Badge (Timer / Lobby status)
  let timerText = '';
  let timerColor = '#38bdf8';

  if (roundStatus === 'waiting') {
    timerText = `LOBBY (${allPlayers.length}/${minPlayers})`;
    timerColor = '#f59e0b';
  } else if (roundStatus === 'starting') {
    timerText = `START: ${lobbyCountdown}`;
    timerColor = '#10b981';
  } else {
    const timerSec = Math.max(0, roundTime);
    timerColor = timerSec <= 10 ? '#ef4444' : '#38bdf8';
    const min = Math.floor(timerSec / 60);
    const sec = timerSec % 60;
    timerText = `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }

  const pillW = roundStatus === 'waiting' ? 160 : 120;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(canvas.width / 2 - pillW / 2, 8, pillW, 32);
  ctx.strokeStyle = timerColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(canvas.width / 2 - pillW / 2, 8, pillW, 32);

  ctx.font = roundStatus === 'waiting' ? '9px "Press Start 2P", monospace' : '12px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = timerColor;
  ctx.fillText(timerText, canvas.width / 2, 28);

  // Left Info: My Score & Rank
  const me = allPlayers.find(p => p.id === myId);
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textAlign = 'left';

  if (me) {
    const totalCells = COLS * ROWS;
    const pct = ((me.score / totalCells) * 100).toFixed(1);
    ctx.fillStyle = '#4ade80';
    ctx.fillText(`Territory: ${pct}% (${me.score})`, 14, 22);

    ctx.fillStyle = '#facc15';
    ctx.fillText(me.calculateRank(allPlayers), 14, 38);
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Connecting...', 14, 30);
  }

  // Right Info: Leader & Online Count
  ctx.textAlign = 'right';
  if (sorted[0]) {
    const leadPct = ((sorted[0].score / (COLS * ROWS)) * 100).toFixed(1);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`Top: ${leadPct}%`, canvas.width - 14, 22);
  }
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Players: ${allPlayers.length}`, canvas.width - 14, 38);

  // Lobby Overlay: Waiting for 2-3 players
  if (roundStatus === 'waiting') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 3D Lobby Card
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(canvas.width / 2 - 180, canvas.height / 2 - 80, 360, 160);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(canvas.width / 2 - 180, canvas.height / 2 - 80, 360, 160);

    ctx.textAlign = 'center';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('GAME LOBBY', canvas.width / 2, canvas.height / 2 - 45);

    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#facc15';
    ctx.fillText(`PLAYERS JOINED: ${allPlayers.length} / ${minPlayers}`, canvas.width / 2, canvas.height / 2 - 15);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('Waiting for 2 or 3 players to start...', canvas.width / 2, canvas.height / 2 + 15);

    // Render joined player color chips
    allPlayers.forEach((p, idx) => {
      const chipX = canvas.width / 2 - (allPlayers.length * 40) / 2 + idx * 40 + 10;
      const chipY = canvas.height / 2 + 35;
      ctx.fillStyle = p.color ? p.color.main : '#38bdf8';
      ctx.fillRect(chipX, chipY, 20, 20);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(chipX, chipY, 20, 20);
    });
  }

  // Starting Overlay: 3s Countdown
  if (roundStatus === 'starting') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(canvas.width / 2 - 140, canvas.height / 2 - 50, 280, 100);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(canvas.width / 2 - 140, canvas.height / 2 - 50, 280, 100);

    ctx.textAlign = 'center';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('MATCH STARTING IN', canvas.width / 2, canvas.height / 2 - 15);

    ctx.font = '28px "Press Start 2P", monospace';
    ctx.fillStyle = '#4ade80';
    ctx.fillText(`${lobbyCountdown}`, canvas.width / 2, canvas.height / 2 + 25);
  }

  // Round Ended Overlay Banner
  if (roundStatus === 'ended') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(canvas.width / 2 - 170, canvas.height / 2 - 60, 340, 120);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.strokeRect(canvas.width / 2 - 170, canvas.height / 2 - 60, 340, 120);

    ctx.textAlign = 'center';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = '#facc15';
    ctx.fillText('ROUND ENDED!', canvas.width / 2, canvas.height / 2 - 25);

    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    if (winnerInfo) {
      const isWinnerMe = winnerInfo.id === myId;
      const winText = isWinnerMe ? 'YOU WON THE TERRITORY!' : `WINNER: Player ${winnerInfo.id.slice(0, 4)}`;
      ctx.fillText(winText, canvas.width / 2, canvas.height / 2 + 5);
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`Final Territory: ${winnerInfo.score} cells`, canvas.width / 2, canvas.height / 2 + 25);
    } else {
      ctx.fillText('No territory claimed!', canvas.width / 2, canvas.height / 2 + 10);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('New round starting in 5s...', canvas.width / 2, canvas.height / 2 + 45);
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
