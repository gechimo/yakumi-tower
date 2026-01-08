// Module aliases
const Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Events = Matter.Events,
    Mouse = Matter.Mouse,
    MouseConstraint = Matter.MouseConstraint,
    Common = Matter.Common,
    Vertices = Matter.Vertices,
    Vector = Matter.Vector;

// Game setup
const engine = Engine.create({
    positionIterations: 10,
    velocityIterations: 10
});
const world = engine.world;

const container = document.getElementById('game-container');
const width = window.innerWidth;
const height = window.innerHeight;

const render = Render.create({
    element: container,
    engine: engine,
    options: {
        width: width,
        height: height,
        wireframes: false,
        background: '#87CEEB'
    }
});

// Assets configuration
const assets = [
    'assets/1.png',
    'assets/2.png',
    'assets/3.png',
    'assets/4.png',
    'assets/5.png',
    'assets/6.png'
];

// Cache for generated vertices
const vertexCache = {};

// Platform
const platformWidth = 600;
const ground = Bodies.rectangle(width / 2, height - 30, platformWidth, 60, {
    isStatic: true,
    friction: 1.0,
    frictionStatic: 10,
    render: { fillStyle: '#8B4513' },
    label: 'ground'
});

Composite.add(world, [ground]);

// Game Logic variables
let currentBody = null;
let isDropping = false;
let gameOver = false;
let score = 0;
let gameStarted = false;

// UI Elements
const uiScore = document.getElementById('score');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const gameOverContent = document.getElementById('game-over-content');
const finalScoreDisplay = document.getElementById('final-score');
const saveScoreBtn = document.getElementById('save-score-btn');
const rankingList = document.getElementById('ranking-list');
const playerNameInput = document.getElementById('player-name');

// Run the engine
Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// --- Vertex Generation Logic ---

function getVerticesFromImage(img, samplingStep = 4) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;

    // Marching Squares Algorithm
    const points = [];
    const w = img.width;
    const h = img.height;

    // Threshold for alpha
    const alphaThreshold = 10;

    function getVal(x, y) {
        if (x < 0 || y < 0 || x >= w || y >= h) return 0;
        const index = (y * w + x) * 4 + 3; // Alpha channel
        return data[index] > alphaThreshold ? 1 : 0;
    }

    // Identify contour points using Marching Squares
    // Start finding a starting point
    let startPoint = null;
    for (let y = 0; y < h; y += samplingStep) {
        for (let x = 0; x < w; x += samplingStep) {
            if (getVal(x, y) === 1) {
                // simplified: actually just collecting boundary points is not enough for concave, 
                // we need an ordered path.
                // For simplicity in this constraints, let's use a simpler "scan & simplify" or find convex hull library?
                // No, user wants concave support (poly-decomp).

                // Since implementing full Marching Squares from scratch in one file is error-prone,
                // let's do a simplified "Radial Raycast" or just simple Hull if the shape is blobby?
                // "動物タワーバトル" typically implies convex/concave shapes.

                // Let's implement a basic breakdown:
                // 1. Get all non-transparent pixels.
                // 2. Compute convex hull? No, need concave.
                // 3. Actually poly-decomp handles concave decomposition for finding simpler convex parts.
                // BUT `Vertices.fromPath` or similar needs an ordered set of points.

                // Let's try the "Marching Squares" approach properly but kept simple.
                // Actually, for "illustration shape", usually a simplified hull is fine.
                // Let's assume the user wants "TIGHT" fit.

                // Attempting a simple contour tracer:
                // Scan for first non-transparent pixel.
                // Follow boundary.
                startPoint = { x, y };
                break;
            }
        }
        if (startPoint) break;
    }

    if (!startPoint) return null;

    // Moore-Neighbor Tracing
    let outline = [];
    let cur = { ...startPoint };
    let prev = { x: cur.x, y: cur.y - 1 }; // Entering from above
    // Directions: N, NE, E, SE, S, SW, W, NW
    // We step by 'samplingStep' to reduce vertext count
    // but Moore tracing assumes grid.

    // FALLBACK: Since implementing robust tracer on raw pixel data is heavy,
    // let's use a simplified approach:
    // Create a set of points from boundary pixels (using a grid),
    // then sort them? No, sorting radial only works for star-shaped.

    // Let's go with Hull-ish approach using `Matter.Vertices.hull` initially? 
    // No, user specifically complained about "box" being too big.

    // Better Approach for this context:
    // Use an approx algorithm: "Marching Squares"
    // We will scan grid. For each cell, determine state (0-15).
    // Generate line segments.
    // Connect segments.

    // SIMPLIFICATION:
    // Just use 8 points? No, too simple.
    // Let's iterate and simply find edge pixels at intervals.

    const vertices = [];
    // We will do a radial scan from center? No, assumes star convex.

    // Let's try the "boundary follower" on a downsampled grid.
    const step = samplingStep;
    const path = [];

    // Helper to check pixel
    const isSolid = (x, y) => getVal(x, y) === 1;

    // Find first solid
    let sx = -1, sy = -1;
    outer: for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
            if (isSolid(x, y)) { sx = x; sy = y; break outer; }
        }
    }

    if (sx === -1) return null;

    // Trace
    let cx = sx, cy = sy;
    // Directions: 0:Right, 1:Down, 2:Left, 3:Up
    let dir = 0;
    let maxIter = 5000;

    // Clockwise tracing
    do {
        path.push({ x: cx, y: cy });

        // Look for next solid in direction relative to current dir
        // We want to hug the left wall (or right). Let's hug Right (solid is on right).
        // Turn Left, then scan clockwise
        let found = false;
        const checkDirs = [(dir + 3) % 4, dir, (dir + 1) % 4, (dir + 2) % 4];

        for (let d of checkDirs) {
            let nx = cx, ny = cy;
            if (d === 0) nx += step;
            if (d === 1) ny += step;
            if (d === 2) nx -= step;
            if (d === 3) ny -= step;

            if (isSolid(nx, ny)) {
                cx = nx;
                cy = ny;
                dir = d;
                found = true;
                break;
            }
        }

        if (!found) break; // Stuck / Isolated
        maxIter--;
    } while ((cx !== sx || cy !== sy) && maxIter > 0);

    // Simplify path using Ramer-Douglas-Peucker would be ideal, 
    // but simple "distance filter" is easier.
    const simplified = [];
    if (path.length > 0) simplified.push(path[0]);
    for (let i = 1; i < path.length; i++) {
        const p1 = simplified[simplified.length - 1];
        const p2 = path[i];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (dist > 15) { // Minimum segment length
            simplified.push(p2);
        }
    }

    return simplified.map(p => ({ x: p.x, y: p.y }));
}

// --- Logic ---

function spawnNewBody() {
    if (gameOver) return;

    const startX = width / 2;
    const startY = 100;
    const randomAsset = assets[Math.floor(Math.random() * assets.length)];

    if (vertexCache[randomAsset]) {
        createBody(startX, startY, randomAsset, vertexCache[randomAsset]);
    } else {
        const img = new Image();
        img.src = randomAsset;
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            if (gameOver) return;
            const maxDim = 120;
            const scale = Math.min(maxDim / img.width, maxDim / img.height);
            // We compute vertices on full image then scale them
            const rawVertices = getVerticesFromImage(img, 4); // sampling step 4

            // Scale vertices
            const vertices = rawVertices ? rawVertices.map(v => ({ x: v.x * scale, y: v.y * scale })) : null;

            if (vertices && vertices.length > 2) {
                vertexCache[randomAsset] = { vertices, scale, img };
                createBody(startX, startY, randomAsset, vertexCache[randomAsset]);
            } else {
                // Fallback to Box if generation failed
                vertexCache[randomAsset] = { vertices: null, scale, img };
                createBody(startX, startY, randomAsset, vertexCache[randomAsset]);
            }
        };
    }
}

function createBody(x, y, assetPath, data) {
    let body;
    const { vertices, scale, img } = data;

    const spriteData = {
        texture: assetPath,
        xScale: scale,
        yScale: scale
    };

    if (vertices) {
        // Find center of mass offset potentially?
        // Bodies.fromVertices centers the body.
        // We should just let it center.

        // Ensure vertices are convex/decomposed
        body = Bodies.fromVertices(x, y, [vertices], {
            restitution: 0.0,
            friction: 0.5,
            frictionStatic: 0.5,
            slop: 0.05,
            density: 0.04,
            label: 'animal',
            render: { visible: false },
            plugin: { sprite: spriteData },
            chamfer: { radius: 4 } // Round corners to prevent snagging
        }, true);

        if (!body) {
            // Fallback if decomposition failed
            body = Bodies.rectangle(x, y, img.width * scale, img.height * scale, {
                restitution: 0.0,
                friction: 0.5,
                frictionStatic: 0.5,
                slop: 0.05,
                density: 0.04,
                label: 'animal',
                render: { visible: false },
                plugin: { sprite: spriteData },
                chamfer: { radius: 4 }
            });
        }
    } else {
        body = Bodies.rectangle(x, y, img.width * scale, img.height * scale, {
            restitution: 0.0,
            friction: 0.5,
            frictionStatic: 0.5,
            slop: 0.05,
            density: 0.04,
            label: 'animal',
            render: { visible: false },
            plugin: { sprite: spriteData },
            chamfer: { radius: 4 }
        });
    }

    Matter.Body.setStatic(body, true);
    currentBody = body;
    isDropping = false;
    Composite.add(world, currentBody);
}


function updateRankingDisplay() {
    const ranking = JSON.parse(localStorage.getItem('atb_ranking') || '[]');
    rankingList.innerHTML = '';
    ranking.forEach((entry, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${index + 1}. ${entry.name}</span> <span>${entry.score}</span>`;
        rankingList.appendChild(li);
    });
}

function saveScore() {
    const name = playerNameInput.value.trim() || 'No Name';
    const ranking = JSON.parse(localStorage.getItem('atb_ranking') || '[]');
    ranking.push({ name: name, score: score });
    ranking.sort((a, b) => b.score - a.score);
    const topRanking = ranking.slice(0, 5);
    localStorage.setItem('atb_ranking', JSON.stringify(topRanking));

    updateRankingDisplay();
    gameOverContent.style.display = 'none';
    startBtn.style.display = 'inline-block';
    startBtn.innerText = 'Restart Game';
}

function startGame() {
    gameStarted = true;
    gameOver = false;
    score = 0;
    uiScore.innerText = 'Score: 0';

    const bodies = Composite.allBodies(world);
    bodies.forEach(body => {
        if (body.label === 'animal') {
            Composite.remove(world, body);
        }
    });

    overlay.style.display = 'none';
    gameOverContent.style.display = 'none';
    startBtn.style.display = 'none';

    spawnNewBody();
}

function endGame() {
    if (gameOver) return;
    gameOver = true;
    finalScoreDisplay.innerText = 'Score: ' + score;

    overlay.style.display = 'block';
    gameOverContent.style.display = 'block';
    startBtn.style.display = 'none';
    updateRankingDisplay();
}


// --- Event Listeners ---

startBtn.addEventListener('click', startGame);
saveScoreBtn.addEventListener('click', saveScore);

document.addEventListener('mousemove', (e) => {
    if (gameStarted && currentBody && !isDropping && !gameOver) {
        const x = Math.min(Math.max(e.clientX, 50), width - 50);
        Matter.Body.setPosition(currentBody, { x: x, y: 100 });
    }
});

document.addEventListener('click', (e) => {
    if (e.target.closest('#overlay') || e.target.closest('#ui-layer button') || e.target.closest('input')) return;

    if (gameStarted && currentBody && !isDropping && !gameOver) {
        isDropping = true;
        Matter.Body.setStatic(currentBody, false);

        setTimeout(() => {
            if (!gameOver && gameStarted) {
                score++;
                uiScore.innerText = 'Score: ' + score;
                spawnNewBody();
            }
        }, 2000);
    }
});

document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (gameStarted && currentBody && !isDropping && !gameOver) {
        Matter.Body.rotate(currentBody, Math.PI / 4);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyR') {
        if (gameStarted && currentBody && !isDropping && !gameOver) {
            Matter.Body.rotate(currentBody, Math.PI / 4);
        }
    }
});

// --- Custom Rendering ---

Events.on(render, 'afterRender', () => {
    const bodies = Composite.allBodies(world);
    const ctx = render.context;

    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.plugin && body.plugin.sprite) {
            const sprite = body.plugin.sprite;
            const img = vertexCache[sprite.texture] ? vertexCache[sprite.texture].img : null;

            // Should have image in cache or load it? 
            // In spawnNewBody we pre-load image. Let's assume vertexCache has it.
            // Actually spawnNewBody stores { vertices, scale, img } in vertexCache[assetPath].
            // So we can retrieve it.

            if (img) {
                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);
                ctx.drawImage(
                    img,
                    -img.width * sprite.xScale / 2,
                    -img.height * sprite.yScale / 2,
                    img.width * sprite.xScale,
                    img.height * sprite.yScale
                );
                ctx.restore();
            }
        }
    }
});

Events.on(engine, 'afterUpdate', () => {
    if (!gameStarted || gameOver) return;

    const bodies = Composite.allBodies(world);
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.label !== 'animal') continue;
        if (body === currentBody && !isDropping) continue;

        if (body.position.y > height + 50) {
            endGame();
            break;
        }
    }
});

window.addEventListener('resize', () => {
    render.canvas.width = window.innerWidth;
    render.canvas.height = window.innerHeight;
    Matter.Body.setPosition(ground, { x: window.innerWidth / 2, y: window.innerHeight - 30 });
});

updateRankingDisplay();
