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

//For FCC testing purposes and enables user to connect from outside the hosting platform
app.use(cors({origin: '*'})); 

// Index page (static HTML)
app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  }); 

//For FCC testing purposes
fccTestingRoutes(app);
    
// 404 Not Found Middleware
app.use(function(req, res, next) {
  res.status(404)
    .type('text')
    .send('Not Found');
});

const portNum = process.env.PORT || 3000;

// Set up server and tests
const server = app.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);
  if (process.env.NODE_ENV==='test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (error) {
        console.log('Tests are not valid:');
        console.error(error);
      }
    }, 1500);
  }
});

const io = socket(server);

let players = [];

function generateCollectible() {
  const minX = 50;
  const maxX = 590;
  const minY = 80;
  const maxY = 430;
  const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
  const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
  return new Collectible({ x, y, value: 1, id: Date.now().toString() });
}

let collectible = generateCollectible();

io.on('connection', (socket) => {
  const startX = Math.floor(Math.random() * 500) + 50;
  const startY = Math.floor(Math.random() * 350) + 80;
  const newPlayer = new Player({ x: startX, y: startY, score: 0, id: socket.id });

  players.push(newPlayer);

  socket.emit('init', {
    id: socket.id,
    players: players,
    collectible: collectible
  });

  socket.broadcast.emit('new-player', newPlayer);

  socket.on('move-player', (dir, speed = 5) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.movePlayer(dir, speed);

      const minX = 10;
      const maxX = 600;
      const minY = 60;
      const maxY = 440;

      if (player.x < minX) player.x = minX;
      if (player.x > maxX) player.x = maxX;
      if (player.y < minY) player.y = minY;
      if (player.y > maxY) player.y = maxY;

      if (player.collision(collectible)) {
        player.score += collectible.value;
        collectible = generateCollectible();

        io.emit('update-collectible', {
          collectible: collectible,
          player: player
        });
      }

      io.emit('player-moved', player);
    }
  });

  socket.on('disconnect', () => {
    players = players.filter(p => p.id !== socket.id);
    io.emit('remove-player', socket.id);
  });
});

module.exports = app; // For testing
