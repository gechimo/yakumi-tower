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

const engine = Engine.create({
    positionIterations: 30,
    velocityIterations: 30,
    enableSleeping: false
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

const assets = [
    'assets/1.png',
    'assets/2.png',
    'assets/4.png',
    'assets/5.png',
    'assets/6.png'
];

const vertexCache = {};

const platformWidth = 480;
const ground = Bodies.rectangle(width / 2, height - 30, platformWidth, 60, {
    isStatic: true,
    friction: 1.0,
    frictionStatic: 10,
    render: { fillStyle: '#8B4513' },
    label: 'ground'
});

Composite.add(world, [ground]);

let currentBody = null;
let isDropping = false;
let gameOver = false;
let score = 0;
let gameStarted = false;

const uiScore = document.getElementById('score');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const gameOverContent = document.getElementById('game-over-content');
const finalScoreDisplay = document.getElementById('final-score');
const saveScoreBtn = document.getElementById('save-score-btn');
const rankingList = document.getElementById('ranking-list');
const playerNameInput = document.getElementById('player-name');

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

function getVerticesFromImage(img, samplingStep = 4) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;

    const w = img.width;
    const h = img.height;
    const alphaThreshold = 10;

    function getVal(x, y) {
        if (x < 0 || y < 0 || x >= w || y >= h) return 0;
        const index = (y * w + x) * 4 + 3;
        return data[index] > alphaThreshold ? 1 : 0;
    }

    let startPoint = null;
    for (let y = 0; y < h; y += samplingStep) {
        for (let x = 0; x < w; x += samplingStep) {
            if (getVal(x, y) === 1) {
                startPoint = { x, y };
                break;
            }
        }
        if (startPoint) break;
    }

    if (!startPoint) return null;

    const step = samplingStep;
    const path = [];
    const isSolid = (x, y) => getVal(x, y) === 1;

    let sx = -1, sy = -1;
    outer: for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
            if (isSolid(x, y)) { sx = x; sy = y; break outer; }
        }
    }

    if (sx === -1) return null;

    let cx = sx, cy = sy;
    let dir = 0;
    let maxIter = 5000;

    do {
        path.push({ x: cx, y: cy });
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

        if (!found) break;
        maxIter--;
    } while ((cx !== sx || cy !== sy) && maxIter > 0);

    const simplified = [];
    if (path.length > 0) simplified.push(path[0]);
    for (let i = 1; i < path.length; i++) {
        const p1 = simplified[simplified.length - 1];
        const p2 = path[i];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (dist > 15) {
            simplified.push(p2);
        }
    }

    return simplified.map(p => ({ x: p.x, y: p.y }));
}

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
            const rawVertices = getVerticesFromImage(img, 4);

            const vertices = rawVertices ? rawVertices.map(v => ({ x: v.x * scale, y: v.y * scale })) : null;

            if (vertices && vertices.length > 2) {
                vertexCache[randomAsset] = { vertices, scale, img };
                createBody(startX, startY, randomAsset, vertexCache[randomAsset]);
            } else {
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
        body = Bodies.fromVertices(x, y, [vertices], {
            restitution: 0.0,
            friction: 1.0,
            frictionStatic: 10,
            slop: 0.05,
            density: 0.002,
            label: 'animal',
            render: { visible: false },
            plugin: { sprite: spriteData },
            chamfer: { radius: 4 }
        }, true);

        if (!body) {
            body = Bodies.rectangle(x, y, img.width * scale, img.height * scale, {
                restitution: 0.0,
                friction: 1.0,
                frictionStatic: 10,
                slop: 0.05,
                density: 0.002,
                label: 'animal',
                render: { visible: false },
                plugin: { sprite: spriteData },
                chamfer: { radius: 4 }
            });
        }
    } else {
        body = Bodies.rectangle(x, y, img.width * scale, img.height * scale, {
            restitution: 0.0,
            friction: 1.0,
            frictionStatic: 10,
            slop: 0.05,
            density: 0.002,
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

Events.on(render, 'afterRender', () => {
    const bodies = Composite.allBodies(world);
    const ctx = render.context;

    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.plugin && body.plugin.sprite) {
            const sprite = body.plugin.sprite;
            const img = vertexCache[sprite.texture] ? vertexCache[sprite.texture].img : null;

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
