require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const expect = require('chai');
const socket = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');

const Collectible = require('./public/Collectible.mjs').default || require('./public/Collectible.mjs');
const Player = require('./public/Player.mjs').default || require('./public/Player.mjs');

const app = express();

app.use(helmet.noSniff());
app.use(helmet.xssFilter());
app.use(helmet.noCache());
app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' }));

app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cors({ origin: '*' }));

app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  });

fccTestingRoutes(app);

app.use(function (req, res, next) {
  res.status(404).type('text').send('Not Found');
});

const portNum = process.env.PORT || 3000;

const server = app.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);
  if (process.env.NODE_ENV === 'test') {
    setTimeout(function () {
      try {
        runner.run();
      } catch (error) {
        console.error(error);
      }
    }, 1500);
  }
});

const io = socket(server);

// Grid Configuration (Paper.io / Slither style)
const COLS = 60;
const ROWS = 40;
const CELL_SIZE = 10;
const OFFSET_X = 20;
const OFFSET_Y = 60;

const COLORS = [
  { main: '#3b82f6', dark: '#1d4ed8', light: '#93c5fd' }, // Blue
  { main: '#ef4444', dark: '#b91c1c', light: '#fca5a5' }, // Red
  { main: '#10b981', dark: '#047857', light: '#6ee7b7' }, // Emerald
  { main: '#f59e0b', dark: '#b45309', light: '#fde68a' }, // Amber
  { main: '#8b5cf6', dark: '#6d28d9', light: '#c4b5fd' }, // Purple
  { main: '#ec4899', dark: '#be185d', light: '#fbcfe8' }  // Pink
];

const MIN_PLAYERS = 2;
let grid = new Array(COLS * ROWS).fill(0);
let players = [];
let roundTime = 60; // 1-minute countdown
let roundStatus = 'waiting'; // 'waiting' | 'starting' | 'running' | 'ended'
let lobbyCountdown = 3;
let lobbyTimer = null;
let winner = null;
let gridChanges = [];

function generateCollectible() {
  const minX = OFFSET_X + 20;
  const maxX = OFFSET_X + (COLS * CELL_SIZE) - 30;
  const minY = OFFSET_Y + 20;
  const maxY = OFFSET_Y + (ROWS * CELL_SIZE) - 30;
  const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
  const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
  return new Collectible({ x, y, value: 15, id: Date.now().toString() });
}

let collectible = generateCollectible();

function cellIndex(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
  return r * COLS + c;
}

function spawnBase(player) {
  const minC = 5;
  const maxC = COLS - 6;
  const minR = 5;
  const maxR = ROWS - 6;
  const baseC = Math.floor(Math.random() * (maxC - minC + 1)) + minC;
  const baseR = Math.floor(Math.random() * (maxR - minR + 1)) + minR;

  player.x = OFFSET_X + baseC * CELL_SIZE;
  player.y = OFFSET_Y + baseR * CELL_SIZE;
  player.trail = [];
  player.isAlive = true;
  player.dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];

  // Claim 3x3 base
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const idx = cellIndex(baseC + dc, baseR + dr);
      if (idx !== -1) {
        grid[idx] = player.id;
        gridChanges.push({ c: baseC + dc, r: baseR + dr, id: player.id });
      }
    }
  }
}

function clearPlayerTerritory(playerId) {
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === playerId) {
      grid[i] = 0;
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      gridChanges.push({ c, r, id: 0 });
    }
  }
}

function fillTerritory(player) {
  // Convert trail to owned
  player.trail.forEach(pt => {
    const idx = cellIndex(pt.c, pt.r);
    if (idx !== -1) {
      grid[idx] = player.id;
      gridChanges.push({ c: pt.c, r: pt.r, id: player.id });
    }
  });

  // Calculate owned cells count
  let count = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === player.id) count++;
  }
  player.score = count;
  player.trail = [];
}

function checkLobbyStatus() {
  if (players.length >= MIN_PLAYERS) {
    if (roundStatus === 'waiting') {
      roundStatus = 'starting';
      lobbyCountdown = 3;
      if (lobbyTimer) clearInterval(lobbyTimer);
      lobbyTimer = setInterval(() => {
        lobbyCountdown--;
        io.emit('lobby-countdown', { countdown: lobbyCountdown });
        if (lobbyCountdown <= 0) {
          clearInterval(lobbyTimer);
          lobbyTimer = null;
          resetRound();
        }
      }, 1000);
      io.emit('lobby-countdown', { countdown: lobbyCountdown });
    }
  } else {
    if (lobbyTimer) {
      clearInterval(lobbyTimer);
      lobbyTimer = null;
    }
    if (roundStatus !== 'waiting') {
      roundStatus = 'waiting';
      io.emit('round-waiting', {
        minPlayers: MIN_PLAYERS,
        currentPlayers: players.length
      });
    }
  }
}

function resetRound() {
  grid = new Array(COLS * ROWS).fill(0);
  gridChanges = [];
  roundTime = 60;
  roundStatus = 'running';
  winner = null;

  players.forEach((p, idx) => {
    p.color = COLORS[idx % COLORS.length];
    p.score = 9;
    spawnBase(p);
  });

  collectible = generateCollectible();

  io.emit('round-reset', {
    grid: grid,
    players: players,
    collectible: collectible,
    roundTime: roundTime
  });
}

// 1-Second Round Timer Clock
setInterval(() => {
  if (roundStatus === 'running') {
    roundTime--;
    if (roundTime <= 0) {
      roundStatus = 'ended';
      // Find player with highest territory
      const sorted = [...players].sort((a, b) => b.score - a.score);
      winner = sorted[0] || null;
      io.emit('round-ended', {
        winner: winner ? { id: winner.id, score: winner.score, color: winner.color } : null,
        scores: players.map(p => ({ id: p.id, score: p.score }))
      });

      // Restart after 5 seconds
      setTimeout(() => {
        resetRound();
      }, 5000);
    }
  }
}, 1000);

// Game physics loop (20 ticks per second)
const TICK_RATE = 50;
const SPEED = 5;

setInterval(() => {
  if (roundStatus !== 'running') return;

  players.forEach(player => {
    if (!player.isAlive) return;

    player.movePlayer(player.dir, SPEED);

    // Boundary constraints
    const minX = OFFSET_X;
    const maxX = OFFSET_X + COLS * CELL_SIZE - CELL_SIZE;
    const minY = OFFSET_Y;
    const maxY = OFFSET_Y + ROWS * CELL_SIZE - CELL_SIZE;

    if (player.x < minX) { player.x = minX; player.dir = 'right'; }
    if (player.x > maxX) { player.x = maxX; player.dir = 'left'; }
    if (player.y < minY) { player.y = minY; player.dir = 'down'; }
    if (player.y > maxY) { player.y = maxY; player.dir = 'up'; }

    const c = Math.floor((player.x - OFFSET_X + CELL_SIZE / 2) / CELL_SIZE);
    const r = Math.floor((player.y - OFFSET_Y + CELL_SIZE / 2) / CELL_SIZE);
    const idx = cellIndex(c, r);

    if (idx !== -1) {
      const owner = grid[idx];

      if (owner === player.id) {
        // Returned to own base
        if (player.trail.length > 0) {
          fillTerritory(player);
        }
      } else {
        // Moving outside own territory: add to trail
        const last = player.trail[player.trail.length - 1];
        if (!last || last.c !== c || last.r !== r) {
          // Self-collision: hitting own trail
          const selfCut = player.trail.some(pt => pt.c === c && pt.r === r);
          if (selfCut) {
            player.isAlive = false;
            player.trail = [];
            setTimeout(() => spawnBase(player), 1500);
            return;
          }

          player.trail.push({ c, r });
        }
      }

      // Check trail cutting (combat mechanic: cutting other players' trails)
      players.forEach(other => {
        if (other.id !== player.id && other.isAlive && other.trail.length > 0) {
          const cutIndex = other.trail.findIndex(pt => pt.c === c && pt.r === r);
          if (cutIndex !== -1) {
            // Player cut other's trail! Other is eliminated
            other.isAlive = false;
            other.trail = [];
            clearPlayerTerritory(other.id);
            other.score = 0;
            player.score += 25; // Bonus for cut kill

            io.emit('player-cut', {
              killerId: player.id,
              victimId: other.id
            });

            setTimeout(() => {
              if (players.some(p => p.id === other.id)) {
                spawnBase(other);
              }
            }, 2000);
          }
        }
      });
    }

    // Collectible bonus check
    if (player.collision(collectible)) {
      player.score += collectible.value;
      collectible = generateCollectible();
      io.emit('update-collectible', {
        collectible: collectible,
        player: player
      });
    }
  });

  // Broadcast state diff
  io.emit('game-tick', {
    players: players.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      dir: p.dir,
      score: p.score,
      trail: p.trail,
      color: p.color,
      isAlive: p.isAlive
    })),
    gridChanges: gridChanges,
    roundTime: roundTime,
    roundStatus: roundStatus,
    lobbyCountdown: lobbyCountdown
  });

  gridChanges = [];
}, TICK_RATE);

io.on('connection', (socket) => {
  const colorIndex = players.length % COLORS.length;
  const newPlayer = new Player({ x: 0, y: 0, score: 9, id: socket.id });
  newPlayer.color = COLORS[colorIndex];

  spawnBase(newPlayer);
  players.push(newPlayer);

  socket.emit('init', {
    id: socket.id,
    grid: grid,
    players: players,
    collectible: collectible,
    roundTime: roundTime,
    roundStatus: roundStatus,
    lobbyCountdown: lobbyCountdown,
    minPlayers: MIN_PLAYERS
  });

  socket.broadcast.emit('new-player', newPlayer);
  checkLobbyStatus();

  socket.on('change-dir', (newDir) => {
    const player = players.find(p => p.id === socket.id);
    if (player && player.isAlive) {
      // Prevent 180-degree instant reversal into own neck
      const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (opposites[newDir] !== player.dir) {
        player.dir = newDir;
      }
    }
  });

  socket.on('move-player', (dir, speed = 5) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.movePlayer(dir, speed);
    }
  });

  socket.on('disconnect', () => {
    clearPlayerTerritory(socket.id);
    players = players.filter(p => p.id !== socket.id);
    io.emit('remove-player', socket.id);
    checkLobbyStatus();
  });
});

module.exports = app;
