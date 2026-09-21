import Player from './Player.mjs';
import Collectible from './Collectible.mjs';

const socket = io();
const canvas = document.getElementById('game-window');
const context = canvas.getContext('2d');

let currPlayer = null;
let allPlayers = [];
let collectible = null;

socket.on('init', ({ id, players, collectible: item }) => {
  allPlayers = players.map(p => new Player(p));
  currPlayer = allPlayers.find(p => p.id === id);
  if (item) {
    collectible = new Collectible(item);
  }
});

socket.on('new-player', (playerData) => {
  if (!allPlayers.some(p => p.id === playerData.id)) {
    allPlayers.push(new Player(playerData));
  }
});

socket.on('player-moved', (playerData) => {
  const player = allPlayers.find(p => p.id === playerData.id);
  if (player) {
    player.x = playerData.x;
    player.y = playerData.y;
    player.score = playerData.score;
  }
});

socket.on('update-collectible', ({ collectible: newItem, player: updatedPlayer }) => {
  collectible = new Collectible(newItem);
  const player = allPlayers.find(p => p.id === updatedPlayer.id);
  if (player) {
    player.score = updatedPlayer.score;
  }
});

socket.on('remove-player', (id) => {
  allPlayers = allPlayers.filter(p => p.id !== id);
});

const keyMap = {
  ArrowUp: 'up',
  KeyW: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  d: 'right',
  D: 'right'
};

const keysPressed = {};

window.addEventListener('keydown', (e) => {
  const dir = keyMap[e.code] || keyMap[e.key];
  if (dir) {
    keysPressed[dir] = true;
  }
});

window.addEventListener('keyup', (e) => {
  const dir = keyMap[e.code] || keyMap[e.key];
  if (dir) {
    keysPressed[dir] = false;
  }
});

let lastMoveTime = 0;
function handleMovement() {
  if (!currPlayer) return;
  const now = Date.now();
  if (now - lastMoveTime < 30) return; // ~30 fps movement rate limit
  lastMoveTime = now;

  const speed = 5;
  ['up', 'down', 'left', 'right'].forEach(dir => {
    if (keysPressed[dir]) {
      currPlayer.movePlayer(dir, speed);

      const minX = 10;
      const maxX = 600;
      const minY = 60;
      const maxY = 440;

      if (currPlayer.x < minX) currPlayer.x = minX;
      if (currPlayer.x > maxX) currPlayer.x = maxX;
      if (currPlayer.y < minY) currPlayer.y = minY;
      if (currPlayer.y > maxY) currPlayer.y = maxY;

      socket.emit('move-player', dir, speed);
    }
  });
}

function drawPlayer(player, isCurrent) {
  context.save();
  context.fillStyle = isCurrent ? '#4ade80' : '#f87171';
  context.fillRect(player.x, player.y, 30, 30);

  context.strokeStyle = isCurrent ? '#166534' : '#991b1b';
  context.lineWidth = 2;
  context.strokeRect(player.x, player.y, 30, 30);

  context.fillStyle = '#ffffff';
  context.fillRect(player.x + 5, player.y + 6, 6, 6);
  context.fillRect(player.x + 19, player.y + 6, 6, 6);
  context.fillStyle = '#0f172a';
  context.fillRect(player.x + 7, player.y + 8, 3, 3);
  context.fillRect(player.x + 21, player.y + 8, 3, 3);

  context.fillStyle = '#0f172a';
  context.fillRect(player.x + 8, player.y + 20, 14, 3);

  context.fillStyle = '#e2e8f0';
  context.font = '8px "Press Start 2P", monospace';
  context.textAlign = 'center';
  const label = isCurrent ? 'YOU' : `P-${player.id ? player.id.slice(0, 4) : ''}`;
  context.fillText(label, player.x + 15, player.y - 6);
  context.restore();
}

function drawCollectible(item) {
  if (!item) return;
  context.save();
  context.fillStyle = '#fbbf24';
  context.beginPath();
  context.arc(item.x + 7.5, item.y + 7.5, 9, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = '#b45309';
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = '#78350f';
  context.font = '10px "Press Start 2P", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('$', item.x + 7.5, item.y + 8.5);
  context.restore();
}

function render() {
  handleMovement();

  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = '#334155';
  context.lineWidth = 4;
  context.strokeRect(4, 50, canvas.width - 8, canvas.height - 54);

  drawCollectible(collectible);

  allPlayers.forEach(p => {
    drawPlayer(p, currPlayer && p.id === currPlayer.id);
  });

  context.fillStyle = '#1e293b';
  context.fillRect(0, 0, canvas.width, 50);

  context.font = '10px "Press Start 2P", monospace';
  context.textAlign = 'left';
  context.fillStyle = '#38bdf8';

  if (currPlayer) {
    context.fillText(`Controls: WASD / Arrows`, 12, 22);
    context.fillStyle = '#facc15';
    context.fillText(`Score: ${currPlayer.score}`, 12, 38);

    context.textAlign = 'right';
    context.fillStyle = '#4ade80';
    const rankStr = currPlayer.calculateRank(allPlayers);
    context.fillText(rankStr, canvas.width - 12, 22);

    context.fillStyle = '#94a3b8';
    context.fillText(`Players: ${allPlayers.length}`, canvas.width - 12, 38);
  } else {
    context.fillText('Connecting to server...', 12, 30);
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
