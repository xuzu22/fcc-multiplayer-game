class Player {
  constructor({ x, y, score = 0, id }) {
    this.x = x;
    this.y = y;
    this.score = score;
    this.id = id;
    this.dir = 'right';
    this.trail = [];
    this.color = null;
    this.isAlive = true;
  }

  movePlayer(dir, speed = 5) {
    this.dir = dir;
    if (dir === 'up') this.y -= speed;
    if (dir === 'down') this.y += speed;
    if (dir === 'left') this.x -= speed;
    if (dir === 'right') this.x += speed;
  }

  collision(item) {
    const playerWidth = 30;
    const playerHeight = 30;
    const itemWidth = 15;
    const itemHeight = 15;

    return (
      this.x < item.x + itemWidth &&
      this.x + playerWidth > item.x &&
      this.y < item.y + itemHeight &&
      this.y + playerHeight > item.y
    );
  }

  calculateRank(arr) {
    const totalPlayers = arr.length;
    const sorted = [...arr].sort((a, b) => b.score - a.score);
    const currentRanking = sorted.findIndex(p => p.id === this.id) + 1;
    return `Rank: ${currentRanking}/${totalPlayers}`;
  }
}

try {
  module.exports = Player;
} catch(e) {}

export default Player;
