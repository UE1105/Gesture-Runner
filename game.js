const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusDiv = document.getElementById("gestureStatus");
const videoElement = document.getElementById("webcam");

// 0. 角色顏色與動態載入
const CHARACTER_COLORS = ["green", "beige", "pink", "purple", "yellow"];
let selectedColorIndex = 0;

const playerImages = {};
CHARACTER_COLORS.forEach(color => {
    playerImages[color] = {
        walkA: new Image(),
        walkB: new Image(),
        jump: new Image(),
        idle: new Image(),
        duck: new Image()
    };
    playerImages[color].walkA.src = `assets/character_${color}_walk_a.png`;
    playerImages[color].walkB.src = `assets/character_${color}_walk_b.png`;
    playerImages[color].jump.src = `assets/character_${color}_jump.png`;
    playerImages[color].idle.src = `assets/character_${color}_idle.png`;
    playerImages[color].duck.src = `assets/character_${color}_duck.png`;
});

// 載入 HUD 分數素材 (數字圖片 0~9 與 Star)
const hudNumbers = [];
for (let i = 0; i <= 9; i++) {
    const img = new Image();
    img.src = `assets/hud_character_${i}.png`;
    hudNumbers.push(img);
}

const starImg = new Image();
starImg.src = "assets/star.png";

// 載入多層背景圖片素材
const bgSky = new Image();
bgSky.src = "assets/background_solid_sky.png";

const bgClouds = new Image();
bgClouds.src = "assets/background_clouds.png";

const bgHills = new Image();
bgHills.src = "assets/background_fade_hills.png";

const bgTrees = new Image();
bgTrees.src = "assets/background_fade_trees.png";

// 載入草叢障礙物與青蛙
const bushImg = new Image();
bushImg.src = "assets/bush.png";

const frogIdleImg = new Image();
frogIdleImg.src = "assets/frog_idle.png";

const frogJumpImg = new Image();
frogJumpImg.src = "assets/frog_jump.png";

const frogRestImg = new Image();
frogRestImg.src = "assets/frog_rest.png";

// 地形素材
const tileSize = 40;
const groundTopY = canvas.height - tileSize * 2;
const groundCenterY = canvas.height - tileSize;

const groundTopImg = new Image();
groundTopImg.src = "assets/terrain_grass_block_top.png";

const groundCenterImg = new Image();
groundCenterImg.src = "assets/terrain_grass_block_center.png";

let groundScrollX = 0;
let bgCloudsX = 0;
let bgHillsX = 0;
let bgTreesX = 0;

const scrollSpeed = 5;

// 1. 遊戲狀態控制 ("HOME", "PLAYING", "GAMEOVER")
let gameState = "HOME";
let isWebcamEnlarged = false; // 控制 AI 視窗是否放大

// 按鈕範圍定義
const startBtn = {
    x: canvas.width / 2 - 70,
    y: 280,
    width: 140,
    height: 45
};

const restartBtn = {
    x: canvas.width / 2 - 80,
    y: 250,
    width: 160,
    height: 48
};

// 選角箭頭點擊範圍（Left/Right Arrow）
const prevCharBtn = { x: canvas.width / 2 - 180, y: 130, width: 40, height: 60 };
const nextCharBtn = { x: canvas.width / 2 + 140, y: 130, width: 40, height: 60 };

// 放大按鈕點擊熱區
let webcamExpandBtnRect = { x: 0, y: 0, width: 24, height: 24 };

// 2. 玩家屬性
let player = {
    x: 100,
    y: groundTopY - 60,
    width: 60,
    height: 60,
    vy: 0,
    gravity: 0.6,
    jumpPower: -12,
    groundY: groundTopY - 60,
    isJumping: false,
    facing: "right",
    facingCooldown: 0,
    color: "green",
    deadFrameImg: null // 記錄死掉瞬間的角色圖片，讓死掉時靜止
};

// 3. 遊戲變數
let obstacles = [];
let frameCount = 0;
let score = 0;
let animationFrameId = null;

let currentHandLandmarks = null;
let currentGestureText = "未偵測到手部";
let gestureCooldown = 0;

// 開始 / 重置遊戲
function resetGame() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    player.color = CHARACTER_COLORS[selectedColorIndex];
    player.x = 100;
    player.y = player.groundY;
    player.vy = 0;
    player.isJumping = false;
    player.facing = "right";
    player.facingCooldown = 0;
    player.deadFrameImg = null;
    
    obstacles = [];
    frameCount = 0;
    score = 0;
    groundScrollX = 0;
    gameState = "PLAYING";
    isWebcamEnlarged = false;

    gameLoop();
}

// 水平拼接背景
function drawSeamlessBackgroundLayer(img, scrollX, alignBottomY, layerHeight) {
    if (!img.complete || img.naturalWidth === 0) return;

    const aspect = img.naturalWidth / img.naturalHeight;
    const drawWidth = layerHeight * aspect;
    const drawY = alignBottomY - layerHeight;

    const offset = scrollX % drawWidth;

    for (let x = -offset; x < canvas.width + drawWidth; x += drawWidth) {
        ctx.drawImage(img, x, drawY, drawY > canvas.height ? drawWidth : drawWidth, layerHeight);
    }
}

// 繪製視差背景
function drawParallaxBackground() {
    if (gameState === "PLAYING") {
        bgCloudsX += 0.3;
        bgHillsX += 1.0;
        bgTreesX += 2.0;
        groundScrollX = (groundScrollX + scrollSpeed) % tileSize;
    }

    // Layer 1: 天空
    if (bgSky.complete && bgSky.naturalWidth !== 0) {
        ctx.drawImage(bgSky, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#AEE2FF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Layer 2: 雲朵
    if (bgClouds.complete && bgClouds.naturalWidth !== 0) {
        const aspect = bgClouds.naturalWidth / bgClouds.naturalHeight;
        const cloudDrawHeight = 220;
        const cloudDrawWidth = cloudDrawHeight * aspect;
        const offset = bgCloudsX % cloudDrawWidth;

        for (let x = -offset; x < canvas.width + cloudDrawWidth; x += cloudDrawWidth) {
            ctx.drawImage(bgClouds, x, 0, cloudDrawWidth, cloudDrawHeight);
        }
    }

    // Layer 3: 遠山
    drawSeamlessBackgroundLayer(bgHills, bgHillsX, groundTopY, 160);

    // Layer 4: 近樹
    drawSeamlessBackgroundLayer(bgTrees, bgTreesX, groundTopY, 110);

    // Layer 5: 最上層 - 草地與泥土
    for (let x = -groundScrollX; x < canvas.width + tileSize; x += tileSize) {
        if (groundTopImg.complete && groundTopImg.naturalWidth !== 0) {
            ctx.drawImage(groundTopImg, x, groundTopY, tileSize, tileSize);
        } else {
            ctx.fillStyle = "#55AA55";
            ctx.fillRect(x, groundTopY, tileSize, tileSize);
        }

        if (groundCenterImg.complete && groundCenterImg.naturalWidth !== 0) {
            ctx.drawImage(groundCenterImg, x, groundCenterY, tileSize, tileSize);
        } else {
            ctx.fillStyle = "#8B5A2B";
            ctx.fillRect(x, groundCenterY, tileSize, tileSize);
        }
    }
}

// 繪製 HUD 分數
function drawHUDScore(scoreVal, startX, startY) {
    let currentX = startX;

    if (starImg.complete && starImg.naturalWidth !== 0) {
        const starSize = 32;
        ctx.drawImage(starImg, currentX, startY, starSize, starSize);
        currentX += starSize + 4;
    }

    const scoreStr = scoreVal.toString();
    const numHeight = 28;

    for (let char of scoreStr) {
        const num = parseInt(char, 10);
        const img = hudNumbers[num];

        if (img && img.complete && img.naturalWidth !== 0) {
            const numWidth = (img.naturalWidth / img.naturalHeight) * numHeight;
            ctx.drawImage(img, currentX, startY + 2, numWidth, numHeight);
            currentX += numWidth - 2;
        } else {
            ctx.fillStyle = "#FFD700";
            ctx.font = "bold 26px Arial";
            ctx.fillText(char, currentX, startY + 24);
            currentX += 14;
        }
    }
}

// 繪製首頁
function drawHomeScreen() {
    drawParallaxBackground();

    // 上方選角提示文字
    ctx.save();
    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("💡 按 ◄ / ► 箭頭或舉左右手切換角色", canvas.width / 2, 70);
    ctx.restore();

    const total = CHARACTER_COLORS.length;
    const prevIdx = (selectedColorIndex - 1 + total) % total;
    const currIdx = selectedColorIndex;
    const nextIdx = (selectedColorIndex + 1) % total;

    const displayList = [
        { idx: prevIdx, posX: canvas.width / 2 - 110, size: 55, alpha: 0.5 },
        { idx: currIdx, posX: canvas.width / 2,       size: 90, alpha: 1.0 },
        { idx: nextIdx, posX: canvas.width / 2 + 110, size: 55, alpha: 0.5 }
    ];

    const breathOffset = Math.sin(frameCount * 0.1) * 3;
    const isDuckFrame = Math.floor(frameCount / 20) % 2 === 0;

    displayList.forEach(item => {
        const color = CHARACTER_COLORS[item.idx];
        const isSelected = item.idx === currIdx;

        ctx.save();
        ctx.globalAlpha = item.alpha;

        const charSize = item.size;
        const centerX = item.posX;
        const centerY = 160;

        let img = playerImages[color].idle;
        let renderY = centerY - charSize / 2;
        let renderHeight = charSize;

        if (isSelected) {
            img = isDuckFrame ? playerImages[color].idle : playerImages[color].duck;
            renderHeight = charSize + breathOffset;
            renderY = centerY - charSize / 2 - breathOffset / 2;
        }

        if (img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, centerX - charSize / 2, renderY, charSize, renderHeight);
        }

        ctx.restore();
    });

    // ✨ 繪製明顯的左右切換箭頭按鈕
    ctx.save();
    ctx.fillStyle = "#FFD700";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 左箭頭
    ctx.beginPath();
    ctx.roundRect(prevCharBtn.x, prevCharBtn.y, prevCharBtn.width, prevCharBtn.height, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1E293B";
    ctx.fillText("◄", prevCharBtn.x + prevCharBtn.width / 2, prevCharBtn.y + prevCharBtn.height / 2);

    // 右箭頭
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.roundRect(nextCharBtn.x, nextCharBtn.y, nextCharBtn.width, nextCharBtn.height, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1E293B";
    ctx.fillText("►", nextCharBtn.x + nextCharBtn.width / 2, nextCharBtn.y + nextCharBtn.height / 2);
    ctx.restore();

    // START 按鈕
    ctx.save();
    ctx.fillStyle = "#FFD700";
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    ctx.roundRect(startBtn.x, startBtn.y, startBtn.width, startBtn.height, 22);
    ctx.fill();

    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText("START", canvas.width / 2, startBtn.y + 30);
    ctx.restore();

    ctx.textAlign = "left";
    drawWebcamPreview();
}

// 繪製角色
function drawPlayer() {
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

    const currentImages = playerImages[player.color];
    let currentImg = currentImages.walkA;

    // ✨ 死亡狀態下保持定格，不繼續播放動畫
    if (gameState === "GAMEOVER" && player.deadFrameImg) {
        currentImg = player.deadFrameImg;
    } else if (player.isJumping) {
        currentImg = currentImages.jump;
    } else {
        if (Math.floor(frameCount / 10) % 2 === 0) {
            currentImg = currentImages.walkA;
        } else {
            currentImg = currentImages.walkB;
        }
    }

    // 當撞到障礙物死掉時，紀錄死掉瞬間的圖片
    if (gameState === "GAMEOVER" && !player.deadFrameImg) {
        player.deadFrameImg = currentImg;
    }

    ctx.save();

    if (player.facing === "left") {
        ctx.translate(player.x + player.width, player.y);
        ctx.scale(-1, 1);
        if (currentImg.complete && currentImg.naturalWidth !== 0) {
            ctx.drawImage(currentImg, 0, 0, player.width, player.height);
        } else {
            ctx.fillStyle = "blue";
            ctx.fillRect(0, 0, player.width, player.height);
        }
    } else {
        if (currentImg.complete && currentImg.naturalWidth !== 0) {
            ctx.drawImage(currentImg, player.x, player.y, player.width, player.height);
        } else {
            ctx.fillStyle = "blue";
            ctx.fillRect(player.x, player.y, player.width, player.height);
        }
    }

    ctx.restore();
}

// 物理與動態更新
function updatePlayer() {
    player.y += player.vy;
    player.vy += player.gravity;

    if (player.y >= player.groundY) {
        player.y = player.groundY;
        player.vy = 0;
        player.isJumping = false;
    }

    // 朝向轉回右方的倒數邏輯
    if (player.facingCooldown > 0) {
        player.facingCooldown--;
        if (player.facingCooldown === 0) {
            player.facing = "right";
        }
    }
}

// 隨機產生障礙物
function spawnObstacle() {
    if (frameCount % 110 === 0) {
        const isFrog = Math.random() < 0.5;
        const obsSize = 45;

        if (isFrog) {
            obstacles.push({
                type: "frog",
                x: canvas.width,
                y: groundTopY - obsSize,
                width: obsSize,
                height: obsSize,
                speed: scrollSpeed + 1,
                vy: 0,
                gravity: 0.5,
                jumpPower: -13,
                groundY: groundTopY - obsSize,
                jumpTimer: 0
            });
        } else {
            obstacles.push({
                type: "bush",
                x: canvas.width,
                y: groundTopY - obsSize,
                width: obsSize,
                height: obsSize,
                speed: scrollSpeed
            });
        }
    }
}

// 碰撞偵測
function checkCollision(rect1, rect2) {
    const padding = 6;
    return (
        rect1.x + padding < rect2.x + rect2.width - padding &&
        rect1.x + rect1.width - padding > rect2.x + padding &&
        rect1.y + padding < rect2.y + rect2.height - padding &&
        rect1.y + rect1.height - padding > rect2.y + padding
    );
}

// 繪製與更新障礙物
function updateObstacles() {
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];

        if (gameState === "PLAYING") {
            obs.x -= obs.speed;
        }

        if (obs.type === "frog") {
            if (gameState === "PLAYING") {
                obs.y += obs.vy;
                obs.vy += obs.gravity;

                if (obs.y >= obs.groundY) {
                    obs.y = obs.groundY;
                    obs.vy = 0;
                    obs.jumpTimer++;
                    
                    if (obs.jumpTimer > 15) {
                        obs.vy = obs.jumpPower;
                        obs.jumpTimer = 0;
                    }
                }
            }

            let currentFrogImg = frogIdleImg;
            if (obs.y < obs.groundY) {
                currentFrogImg = frogJumpImg;
            } else if (obs.jumpTimer > 10) {
                currentFrogImg = frogIdleImg;
            } else {
                currentFrogImg = frogRestImg;
            }

            if (currentFrogImg.complete && currentFrogImg.naturalWidth !== 0) {
                ctx.drawImage(currentFrogImg, obs.x, obs.y, obs.width, obs.height);
            } else {
                ctx.fillStyle = "green";
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            }
        } else {
            if (bushImg.complete && bushImg.naturalWidth !== 0) {
                ctx.drawImage(bushImg, obs.x, obs.y, obs.width, obs.height);
            } else {
                ctx.fillStyle = "darkgreen";
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            }
        }

        if (gameState === "PLAYING" && checkCollision(player, obs)) {
            gameState = "GAMEOVER";
        }

        if (obs.x + obs.width < 0) {
            obstacles.splice(i, 1);
            score += 10;
        }
    }
}

// 繪製 AI 視窗（置中放大模式）
function drawWebcamPreview() {
    let webcamWidth = 160;
    let webcamHeight = 120;
    let webcamX = canvas.width - webcamWidth - 15;
    let webcamY = 15;

    if (isWebcamEnlarged && (gameState === "HOME" || gameState === "GAMEOVER")) {
        webcamWidth = 480;
        webcamHeight = 360;
        webcamX = (canvas.width - webcamWidth) / 2;
        webcamY = (canvas.height - webcamHeight) / 2;

        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (videoElement.readyState >= 2) {
        ctx.save();

        ctx.beginPath();
        ctx.rect(webcamX, webcamY, webcamWidth, webcamHeight);
        ctx.clip();

        ctx.translate(webcamX + webcamWidth, webcamY);
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, 0, 0, webcamWidth, webcamHeight);
        ctx.restore();

        if (currentHandLandmarks) {
            ctx.save();
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = isWebcamEnlarged ? 4 : 2;

            HAND_CONNECTIONS.forEach(([i, j]) => {
                const lm1 = currentHandLandmarks[i];
                const lm2 = currentHandLandmarks[j];

                const x1 = webcamX + (1 - lm1.x) * webcamWidth;
                const y1 = webcamY + lm1.y * webcamHeight;
                const x2 = webcamX + (1 - lm2.x) * webcamWidth;
                const y2 = webcamY + lm2.y * webcamHeight;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            });

            ctx.fillStyle = '#FF0000';
            currentHandLandmarks.forEach(lm => {
                const x = webcamX + (1 - lm.x) * webcamWidth;
                const y = webcamY + lm.y * webcamHeight;

                ctx.beginPath();
                ctx.arc(x, y, isWebcamEnlarged ? 6 : 3, 0, 2 * Math.PI);
                ctx.fill();
            });

            ctx.restore();
        }

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = isWebcamEnlarged ? 3 : 2;
        ctx.strokeRect(webcamX, webcamY, webcamWidth, webcamHeight);

        // 放大/縮小按鈕
        if (gameState === "HOME" || gameState === "GAMEOVER") {
            const btnSize = isWebcamEnlarged ? 28 : 24;
            const btnX = webcamX + 6;
            const btnY = webcamY + webcamHeight - btnSize - 6;

            webcamExpandBtnRect = { x: btnX, y: btnY, width: btnSize, height: btnSize };

            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
            ctx.beginPath();
            ctx.roundRect(btnX, btnY, btnSize, btnSize, 4);
            ctx.fill();

            ctx.fillStyle = "#FFFFFF";
            ctx.font = isWebcamEnlarged ? "bold 16px Arial" : "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(isWebcamEnlarged ? "⛶" : "🔍", btnX + btnSize / 2, btnY + btnSize / 2 + 1);
            ctx.restore();
        }
    }
}

// 繪製 GameOver 畫面
function drawGameOverScreen() {
    drawParallaxBackground();
    drawPlayer();
    updateObstacles();

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.font = "bold 38px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Game Over!", canvas.width / 2, 130);

    drawHUDScore(score, canvas.width / 2 - 30, 175);

    // RESTART 按鈕
    ctx.save();
    ctx.fillStyle = "#FFD700";
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    ctx.roundRect(restartBtn.x, restartBtn.y, restartBtn.width, restartBtn.height, 24);
    ctx.fill();

    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("RESTART", canvas.width / 2, restartBtn.y + 31);
    ctx.restore();

    ctx.textAlign = "left";
    drawWebcamPreview();
}

// 遊戲主迴圈
function gameLoop() {
    frameCount++;
    if (gestureCooldown > 0) gestureCooldown--;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === "HOME") {
        drawHomeScreen();
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }

    if (gameState === "GAMEOVER") {
        drawGameOverScreen();
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }

    drawParallaxBackground();
    updatePlayer();
    drawPlayer();

    spawnObstacle();
    updateObstacles();

    drawHUDScore(score, 20, 20);
    drawWebcamPreview();

    animationFrameId = requestAnimationFrame(gameLoop);
}

gameLoop();

// 鍵盤控制
document.addEventListener("keydown", function(event) {
    if (gameState === "HOME") {
        if (event.key === "ArrowLeft") {
            selectedColorIndex = (selectedColorIndex - 1 + CHARACTER_COLORS.length) % CHARACTER_COLORS.length;
        }
        if (event.key === "ArrowRight") {
            selectedColorIndex = (selectedColorIndex + 1) % CHARACTER_COLORS.length;
        }
        if (event.key === "Enter" || event.key === " ") {
            resetGame();
        }
        return;
    }

    if (gameState === "GAMEOVER") {
        if (event.key === "r" || event.key === "R" || event.key === "Enter" || event.key === " ") {
            gameState = "HOME";
            isWebcamEnlarged = false;
        }
        return;
    }

    if (gameState === "PLAYING") {
        if (event.key === "ArrowLeft") {
            player.x -= 15;
            player.facing = "left";
            player.facingCooldown = 15;
        }
        if (event.key === "ArrowRight") {
            player.x += 15;
            player.facing = "right";
            player.facingCooldown = 0;
        }
        if ((event.key === "ArrowUp" || event.key === " ") && !player.isJumping) {
            player.vy = player.jumpPower;
            player.isJumping = true;
        }
    }
});

// 滑鼠點擊控制（支援點擊切換角色按鈕）
canvas.addEventListener("click", function(event) {
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    if ((gameState === "HOME" || gameState === "GAMEOVER") && webcamExpandBtnRect) {
        if (
            clickX >= webcamExpandBtnRect.x &&
            clickX <= webcamExpandBtnRect.x + webcamExpandBtnRect.width &&
            clickY >= webcamExpandBtnRect.y &&
            clickY <= webcamExpandBtnRect.y + webcamExpandBtnRect.height
        ) {
            isWebcamEnlarged = !isWebcamEnlarged;
            return;
        }
    }

    if (gameState === "HOME") {
        // 點擊左箭頭切換角色
        if (
            clickX >= prevCharBtn.x &&
            clickX <= prevCharBtn.x + prevCharBtn.width &&
            clickY >= prevCharBtn.y &&
            clickY <= prevCharBtn.y + prevCharBtn.height
        ) {
            selectedColorIndex = (selectedColorIndex - 1 + CHARACTER_COLORS.length) % CHARACTER_COLORS.length;
            return;
        }

        // 點擊右箭頭切換角色
        if (
            clickX >= nextCharBtn.x &&
            clickX <= nextCharBtn.x + nextCharBtn.width &&
            clickY >= nextCharBtn.y &&
            clickY <= nextCharBtn.y + nextCharBtn.height
        ) {
            selectedColorIndex = (selectedColorIndex + 1) % CHARACTER_COLORS.length;
            return;
        }

        // START 按鈕
        if (
            clickX >= startBtn.x &&
            clickX <= startBtn.x + startBtn.width &&
            clickY >= startBtn.y &&
            clickY <= startBtn.y + startBtn.height
        ) {
            resetGame();
        }
    } else if (gameState === "GAMEOVER") {
        if (
            clickX >= restartBtn.x &&
            clickX <= restartBtn.x + restartBtn.width &&
            clickY >= restartBtn.y &&
            clickY <= restartBtn.y + restartBtn.height
        ) {
            gameState = "HOME";
            isWebcamEnlarged = false;
        }
    }
});

// 判斷握拳
function isFist(landmarks) {
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20];
    
    let totalDistance = 0;
    fingerTips.forEach(tipIdx => {
        const dx = landmarks[tipIdx].x - wrist.x;
        const dy = landmarks[tipIdx].y - wrist.y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
    });
    
    const avgDistance = totalDistance / fingerTips.length;
    return avgDistance < 0.25;
}

// AI 手勢邏輯處理
function onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        currentHandLandmarks = results.multiHandLandmarks[0];

        const handedness = results.multiHandedness[0].label; 
        const isFistState = isFist(currentHandLandmarks);

        let actionText = "";

        if (gameState === "HOME") {
            if (isFistState) {
                actionText = "握拳 ✊";
                if (!isWebcamEnlarged) resetGame();
            } else if (handedness === "Right") {
                actionText = "舉左手 🖐️";
                if (!isWebcamEnlarged && gestureCooldown === 0) {
                    selectedColorIndex = (selectedColorIndex - 1 + CHARACTER_COLORS.length) % CHARACTER_COLORS.length;
                    gestureCooldown = 45;
                }
            } else if (handedness === "Left") {
                actionText = "舉右手 🖐️";
                if (!isWebcamEnlarged && gestureCooldown === 0) {
                    selectedColorIndex = (selectedColorIndex + 1) % CHARACTER_COLORS.length;
                    gestureCooldown = 45;
                }
            }
        } else if (gameState === "GAMEOVER") {
            if (isFistState) {
                actionText = "握拳 ✊";
            } else if (handedness === "Right") {
                actionText = "舉左手 🖐️";
            } else if (handedness === "Left") {
                actionText = "舉右手 🖐️";
            } else {
                actionText = "偵測到手部";
            }
        } else if (gameState === "PLAYING") {
            if (handedness === "Right") {
                if (isFistState) {
                    actionText = "舉左手 + 握拳 ✊";
                    if (!isWebcamEnlarged) {
                        player.x -= 5;
                        player.facing = "left";
                        player.facingCooldown = 15;
                        if (!player.isJumping) {
                            player.vy = player.jumpPower;
                            player.isJumping = true;
                        }
                    }
                } else {
                    actionText = "舉左手 🖐️";
                    if (!isWebcamEnlarged) {
                        player.x -= 5;
                        player.facing = "left";
                        player.facingCooldown = 15;
                    }
                }
            } else if (handedness === "Left") {
                if (isFistState) {
                    actionText = "舉右手 + 握拳 ✊";
                    if (!isWebcamEnlarged) {
                        player.x += 5;
                        player.facing = "right";
                        player.facingCooldown = 0;
                        if (!player.isJumping) {
                            player.vy = player.jumpPower;
                            player.isJumping = true;
                        }
                    }
                } else {
                    actionText = "舉右手 🖐️";
                    if (!isWebcamEnlarged) {
                        player.x += 5;
                        player.facing = "right";
                        player.facingCooldown = 0;
                    }
                }
            }
        }

        currentGestureText = actionText;
        statusDiv.innerText = "手勢狀態：" + currentGestureText;

    } else {
        currentHandLandmarks = null;
        currentGestureText = "未偵測到手部";
        statusDiv.innerText = "手勢狀態：" + currentGestureText;
    }
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start();