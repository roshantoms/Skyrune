(() => {
  /* ------------- Setup & DPI scaling ------------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const overlay = document.getElementById('overlay');
  const finalStats = document.getElementById('finalStats');
  const distEl = document.getElementById('distance');
  const coinsEl = document.getElementById('coins');
  const hsEl = document.getElementById('highScore'); 

  /* ------------- Audio Setup ------------- */
  const jumpSound = new Audio('audio/jump_up.mp3');
  const coinSound = new Audio('audio/retro_coin.mp3');
  const gameOverSound = new Audio('audio/game_over.mp3');
  
  // Configure audio properties
  jumpSound.volume = 0.7;
  coinSound.volume = 0.5;
  gameOverSound.volume = 0.7;

  function cssW(){ return window.innerWidth; }
  function cssH(){ return window.innerHeight; }

  // Function to calculate the fixed center X position
  const getPlayerFixedX = () => Math.round(cssW() * 0.5 - player.w / 2); 

  function fitCanvas(){
    const DPR = window.devicePixelRatio || 1;
    const w = cssW(), h = cssH();
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    // draw in CSS pixels
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  
  // Re-fit and reset when window size changes
  window.addEventListener('resize', () => { 
    fitCanvas(); 
    // On resize, we must reposition the player to the new center
    player.x = getPlayerFixedX();
    resetGame(); 
  });
  fitCanvas();

  /* ------------- Game config (CSS pixels) ------------- */
  let running = true;
  let started = false;     
  // Removed 'intro' flag as player is always fixed in center
  const baseHeight = 100;   
  const gravity = 1.05;     
  const jumpPower = -18;    
  let scrollSpeed = 4;      // Start slower
  let baseScrollSpeed = 4; // Start slower
  let distance = 0;         
  let coinsCollected = 0;
  let lastSpeedIncrease = 0; 
  const speedIncreaseInterval = 700; // Speed increases every 700m
  let particles = [];
  let coinParticles = [];
  const SAFE_ZONE_DISTANCE = 40; // No obstacles or coins for the first 40 meters

  /* ------------- Player (CSS pixels) ------------- */
  const player = {
    x: 0, // Calculated on reset
    y: 0, // Calculated on reset
    w: 48,
    h: 48,
    vy: 0,
    onGround: true,
    prevY: 0,
    // Eye offset for black player with white eye (as per raw.png)
    eyeOffset: { x: 32, y: 10 },
    // Animation properties
    squish: 0,
    rotation: 0
  };

  function groundTopBase(){ return cssH() - baseHeight; }

  /* ------------- World: segments & coins (CSS coords) ------------- */
  let segments = [];
  let coins = [];
  let lastSegmentType = 'solid'; // Track last segment to avoid repetition

  function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

  function generateWorld(initial=true){
    let x = initial ? -200 : (segments.length ? (segments[segments.length-1].x + segments[segments.length-1].w) : -200);
    const target = cssW() * 2;
    
    // Reset last segment type if initial generation
    if (initial) lastSegmentType = 'solid';
    
    while (x < target) {
      // Check if we're still in the safe zone (first 40 meters)
      // We need to calculate the distance at which this segment will appear
      const segmentAppearDistance = distance + (x / scrollSpeed) * 0.08;
      const inSafeZone = segmentAppearDistance < SAFE_ZONE_DISTANCE;
      
      if (inSafeZone) {
        // Safe zone: only generate solid segments, no obstacles or coins
        const w = rand(100, 200);
        segments.push({ x, w, type: 'solid', h: 0 });
        x += w;
        lastSegmentType = 'solid';
      } else {
        // Normal generation after safe zone
        const r = Math.random();
        
        // More balanced terrain generation
        if (r < 0.08 && lastSegmentType !== 'hole') {
          // hole - less frequent and smaller
          const w = rand(40, 80); // Smaller holes
          segments.push({ x, w, type: 'hole', h: 0 });
          x += w;
          lastSegmentType = 'hole';
        } else if (r < 0.35 && lastSegmentType !== 'bump') {
          // bump (obstacle) - less frequent and lower
          const w = rand(30, 70);
          const h = rand(20, 60); // Lower bumps
          segments.push({ x, w, type: 'bump', h });
          if (Math.random() < 0.3) coins.push({ x: x + Math.floor(w/2), y: groundTopBase() - h - 28, r: 12 });
          x += w;
          lastSegmentType = 'bump';
        } else {
          // flat solid - more common
          const w = rand(100, 200); // Wider platforms
          segments.push({ x, w, type: 'solid', h: 0 });
          if (Math.random() < 0.25) coins.push({ x: x + rand(40, Math.max(40, w-40)), y: groundTopBase() - 36, r: 12 });
          x += w;
          lastSegmentType = 'solid';
        }
        
        // Ensure minimum platform length between obstacles
        if (lastSegmentType !== 'solid' && Math.random() < 0.7) {
          const safeW = rand(60, 120);
          segments.push({ x, w: safeW, type: 'solid', h: 0 });
          x += safeW;
          lastSegmentType = 'solid';
        }
      }
    }
  }

  function loadHighScore() {
      const hs = localStorage.getItem('squareRootHighScore') || 0;
      hsEl.textContent = `High Score: ${hs} m`;
      return parseInt(hs, 10);
  }
  let highScore = loadHighScore();

  function resetGame(){
    segments = [];
    coins = [];
    distance = 0;
    coinsCollected = 0;
    particles = [];
    coinParticles = [];
    
    // Player is FIXED in the center (Per requirement)
    player.x = getPlayerFixedX(); 
    player.y = groundTopBase() - player.h;
    player.vy = 0;
    player.onGround = true;
    player.prevY = player.y;
    player.squish = 0;
    player.rotation = 0;
    running = true;
    started = false;
    
    scrollSpeed = baseScrollSpeed; 
    lastSpeedIncrease = 0; 
    overlay.style.display = 'none';
    distEl.textContent = 'Distance: 0 m';
    coinsEl.textContent = 'Coins: 0';
    loadHighScore(); 
    generateWorld(true);
  }

  // Initial call to set up the game state and fixed position
  resetGame(); 

  /* ------------- Input ------------- */
  function doJump(){
    if (!running) { resetGame(); return; }
    if (!started) { started = true; } // Start immediately on jump/tap
    if (player.onGround) {
      player.vy = jumpPower;
      player.onGround = false;
      
      // Play jump sound
      jumpSound.currentTime = 0;
      jumpSound.play().catch(e => console.log("Audio play failed:", e));
      
      // Add jump particles
      for (let i = 0; i < 8; i++) {
        particles.push({
          x: player.x + player.w/2,
          y: player.y + player.h,
          vx: (Math.random() - 0.5) * 4,
          vy: Math.random() * 2 + 1,
          life: 20,
          maxLife: 20,
          size: Math.random() * 3 + 2,
          color: '#333'
        });
      }
    }
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); doJump(); }
  }, { passive:false });
  window.addEventListener('touchstart', (e) => {
    e.preventDefault();
    doJump();
  }, { passive:false });
  window.addEventListener('mousedown', (e) => { doJump(); });

  /* ------------- Game loop ------------- */
  let last = performance.now();
  function frame(now){
    const dt = Math.min(40, now - last); 
    update(dt / 16.666); 
    render();
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------- Update logic (css pixels) ------------- */
  function update(dt) {
    if (!running || !started) return;

    // Player position remains fixed here, only world moves
    for (let s of segments) s.x -= scrollSpeed * dt;
    for (let c of coins) c.x -= scrollSpeed * dt;

    // keep world filled on the right
    const rightEdge = segments.length ? (segments[segments.length - 1].x + segments[segments.length - 1].w) : -200;
    if (rightEdge < cssW() * 2) generateWorld(false);

    // remove far-left segments
    while (segments.length && segments[0].x + segments[0].w < -300) segments.shift();

    // remove far-left coins
    coins = coins.filter(c => c.x + 60 > -300);

    // distance updates - more accurate calculation
    const distanceTraveled = scrollSpeed * dt * 0.08;
    distance += distanceTraveled;
    distEl.textContent = `Distance: ${Math.floor(distance)} m`;

    // Progression: Speed increases gradually after every 700m
    const currentSpeedLevel = Math.floor(distance / speedIncreaseInterval);
    if (currentSpeedLevel > lastSpeedIncrease) {
        // Increase speed by 0.8 for every 700m milestone
        baseScrollSpeed += 0.9;
        scrollSpeed = baseScrollSpeed;
        lastSpeedIncrease = currentSpeedLevel;
        
        // Visual feedback for speed increase
        for (let i = 0; i < 15; i++) {
          particles.push({
            x: Math.random() * cssW(),
            y: Math.random() * cssH(),
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 40,
            maxLife: 40,
            size: Math.random() * 2 + 1,
            color: '#ff6600'
          });
        }
    }

    // Save prev pos for landing checks
    player.prevY = player.y;

    // Physics
    if (!player.onGround) {
      player.vy += gravity * dt;
      player.y += player.vy * dt;
      
      // Squish effect when falling
      if (player.vy > 0) {
        player.squish = Math.min(1, player.vy * 0.02);
      }
    } else {
      player.vy = 0;
      player.y = groundTopBase() - player.h; 
      // Return to normal shape when on ground
      player.squish = Math.max(0, player.squish - 0.1);
    }

    // Collision handling
    const cx = player.x + player.w / 2;
    let seg = null;
    for (let s of segments) {
      if (cx >= s.x && cx <= s.x + s.w) { seg = s; break; }
    }

    if (!seg || seg.type === 'hole') {
      if (player.onGround) {
        player.onGround = false;
        player.vy = 0.8; 
      } else {
        if (player.y > cssH() + 60) doGameOver('You fell into a hole');
      }
    } else {
      const top = groundTopBase() - (seg.h || 0);
      const prevBottom = player.prevY + player.h;
      const curBottom = player.y + player.h;

      // Landing condition
      if (prevBottom <= top + 2 && curBottom >= top - 2 && player.vy >= -6) {
        player.y = top - player.h;
        player.onGround = true;
        player.vy = 0;
        
        // Landing particles
        for (let i = 0; i < 12; i++) {
          particles.push({
            x: player.x + player.w/2,
            y: player.y + player.h,
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 3,
            life: 25,
            maxLife: 25,
            size: Math.random() * 4 + 2,
            color: '#333'
          });
        }
      } else {
        if (seg.type === 'bump') {
          // Only lose if hitting the front of the obstacle, not landing on top
          const horizontalOverlap = player.x + player.w > seg.x && player.x < seg.x + seg.w;
          const verticalOverlap = player.y + player.h > top && player.y < top + seg.h;
          
          // Check if player is hitting the front of the obstacle (not landing on top)
          if (horizontalOverlap && verticalOverlap && player.y + player.h > top + 10) {
            doGameOver('You hit an obstacle');
          }
        } else {
          // snap to top to prevent sinking
          if (curBottom > top + 10 && player.vy > 0) {
            player.y = top - player.h;
            player.onGround = true;
            player.vy = 0;
          }
        }
      }
    }

    // Coin collection
    for (let i = coins.length - 1; i >= 0; --i) {
      const c = coins[i];
      const dx = c.x - (player.x + player.w / 2);
      const dy = c.y - (player.y + player.h / 2);
      const d2 = dx*dx + dy*dy;
      const rad = c.r + Math.max(player.w, player.h) / 2 - 6;
      if (d2 < rad*rad) {
        coins.splice(i, 1);
        coinsCollected++;
        coinsEl.textContent = `Coins: ${coinsCollected}`;
        
        // Play coin collection sound
        coinSound.currentTime = 0;
        coinSound.play().catch(e => console.log("Audio play failed:", e));
        
        // Coin collection particles
        for (let j = 0; j < 15; j++) {
          coinParticles.push({
            x: c.x,
            y: c.y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 30,
            maxLife: 30,
            size: Math.random() * 4 + 2,
            color: '#f6c431'
          });
        }
      }
    }
    
    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // gravity for particles
      p.life--;
      
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
    
    for (let i = coinParticles.length - 1; i >= 0; i--) {
      const p = coinParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // lighter gravity for coin particles
      p.life--;
      
      if (p.life <= 0) {
        coinParticles.splice(i, 1);
      }
    }
  }

  function doGameOver(reason) {
    running = false;
    started = false;
    
    // Play game over sound
    gameOverSound.currentTime = 0;
    gameOverSound.play().catch(e => console.log("Audio play failed:", e));
    
    // Update High Score
    if (distance > highScore) {
        highScore = Math.floor(distance);
        localStorage.setItem('squareRootHighScore', highScore);
    }

    overlay.style.display = 'flex';
    document.getElementById('finalTitle').textContent = 'GAME OVER';
    finalStats.innerHTML = 
        `<div style="opacity:0.95">Distance: <span class="score-badge">${Math.floor(distance)} m</span></div>
         <div style="opacity:0.95;margin-top:6px">Coins: <span class="score-badge">${coinsCollected}</span></div>
         <div style="opacity:0.95;margin-top:10px;font-weight:bold;color:#f6c431">High Score: <span class="score-badge">${highScore} m</span></div>
         <div style="opacity:0.7;margin-top:8px;font-size:13px">${reason}</div>`;
  }

  /* ------------- Rendering (CSS pixels) ------------- */
  function render() {
    const W = cssW(), H = cssH();
    // clear
    ctx.clearRect(0,0,W,H);

    // sky (gradient-like fill)
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, getComputedStyle(document.documentElement).getPropertyValue('--sky-top') || '#d94f00');
    g.addColorStop(1, getComputedStyle(document.documentElement).getPropertyValue('--sky-bottom') || '#df6a00');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // ground pieces: draw each segment's rectangle (skip holes)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ground') || '#111';
    for (let s of segments) {
      if (s.type === 'hole') continue;
      const top = groundTopBase() - (s.h || 0);
      const height = baseHeight + (s.h || 0);
      ctx.fillRect(Math.round(s.x), Math.round(top), Math.round(s.w), Math.round(height));
      
      // Bumps now have the same color as the ground
      // No special rendering for obstacles
    }

    // coins
    for (let c of coins) {
      ctx.beginPath();
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--coin') || '#f6c431';
      ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      ctx.fill();
      // small sheen
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,214,120,0.9)';
      ctx.arc(c.x - c.r*0.28, c.y - c.r*0.26, Math.max(3, c.r*0.34), 0, Math.PI*2);
      ctx.fill();
    }

    // Render particles
    for (const p of particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    for (const p of coinParticles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // player shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(Math.round(player.x + 6), Math.round(groundTopBase() + 6), 40, 8);

    // player (black square + white eye) - Matches raw.png
    ctx.save();
    // Apply squish transformation
    ctx.translate(player.x + player.w/2, player.y + player.h/2);
    ctx.scale(1, 1 - player.squish * 0.3);
    
    // 1. Player Body (Black Square)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--player-color') || '#000';
    ctx.fillRect(-player.w/2, -player.h/2, player.w, player.h);
    
    // 2. Player Eye (White Dot)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--player-eye') || '#fff';
    ctx.beginPath();
    ctx.arc(player.eyeOffset.x - player.w/2, player.eyeOffset.y - player.h/2, 6, 0, Math.PI*2);
    ctx.fill();
    
    ctx.restore();

    // hint text before start
    if (!started && running) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Tap or Press Space to jump and start', W/2, 40);
      ctx.textAlign = 'left';
    }
  }

  /* ------------- Restart after gameover (space/tap) ------------- */
  window.addEventListener('keydown', (e) => {
    if (!running && e.code === 'Space') resetGame();
  });
  window.addEventListener('touchstart', (e) => {
    if (!running) resetGame();
  }, { passive:false });

})();