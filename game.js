// ==========================================
// 1. SUPABASE 雲端連線與常數設定
// ==========================================
const SUPABASE_URL = 'https://ogcscxxiemcjsuxmgrfr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3NjeHhpZW1janN1eG1ncmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NzM5OTIsImV4cCI6MjEwNjE0OTk5Mn0.ZxybKrxdVwNdOZHnhy6tc-Xc7qFQgx7oE8YSFyOiCgs';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PLAYER_ID = 'player_zen_calculus_01'; // 跨裝置同步身分識別碼

// ==========================================
// 2. 遊戲核心狀態與永久歷史紀錄變數
// ==========================================
let gold = 0;
let balls = [];
let ballValue = 1.0;
let spawnIntervalTime = 10000;
let correctAnswersCount = 0;
let unlockedLevels = 1; // 初始僅解鎖第 1 關

// 永久歷史紀錄（Prestige 絕對不重置）
let quizStats = {
    totalAnswered: 0,
    totalCorrect: 0,
    wrongQuestions: [] // 格式：{ question, options, correct, userChoice }
};

let prestigeData = {
    multiplier: 1.0,
    count: 0
};

// ==========================================
// 3. 雲端讀取與寫入 (Supabase)
// ==========================================
async function loadGameFromCloud() {
    try {
        const { data, error } = await supabaseClient
            .from('player_saves')
            .select('*')
            .eq('user_id', PLAYER_ID)
            .single();

        if (error) {
            console.log("尚無雲端存檔，使用初始預設進度");
            return;
        }

        if (data) {
            console.log("成功從雲端載入進度！", data);
            gold = data.gold || 0;
            unlockedLevels = data.level || 1;
            ballValue = data.ball_value || 1.0;
            spawnIntervalTime = data.spawn_interval || 10000;

            quizStats.totalAnswered = data.total_answered || 0;
            quizStats.totalCorrect = data.total_correct || 0;
            quizStats.wrongQuestions = data.wrong_questions || [];

            if (data.prestige_data) {
                prestigeData = data.prestige_data;
            }

            // 重新設定計時器與關卡邊界
            clearInterval(spawnerTimer);
            spawnerTimer = setInterval(spawnBall, spawnIntervalTime);
            updateLevelBoundaries();
            updateUI();
        }
    } catch (err) {
        console.error("載入雲端存檔發生例外錯誤：", err);
    }
}

async function saveGameToCloud() {
    try {
        const { error } = await supabaseClient
            .from('player_saves')
            .upsert({
                user_id: PLAYER_ID,
                level: unlockedLevels,
                gold: gold,
                ball_value: ballValue,
                spawn_interval: spawnIntervalTime,
                total_answered: quizStats.totalAnswered,
                total_correct: quizStats.totalCorrect,
                wrong_questions: quizStats.wrongQuestions,
                prestige_data: prestigeData,
                update_at: new Date()
            }, { onConflict: 'user_id' });

        if (error) {
            console.error("雲端存檔失敗：", error.message);
        } else {
            console.log("進度已成功同步至雲端！");
        }
    } catch (err) {
        console.error("雲端存檔發生例外錯誤：", err);
    }
}

// ==========================================
// 4. MATTER.JS 物理引擎與關卡設定
// ==========================================
const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;

const engine = Engine.create();
const world = engine.world;
engine.gravity.y = 1;

const container = document.getElementById('game-container');
const width = container.clientWidth;
const viewHeight = container.clientHeight;

// 總共有 8 個關卡樓層，每層高度 700 像素
const totalLevels = 8;
const levelHeight = 700;
const worldHeight = totalLevels * levelHeight;

const render = Render.create({
    element: container,
    engine: engine,
    options: {
        width: width,
        height: viewHeight,
        wireframes: false,
        background: '#1a1a1a'
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// 初始化相機視圖對準第一層
Render.lookAt(render, {
    min: { x: 0, y: 0 },
    max: { x: width, y: viewHeight }
});

// 1. 左右邊界
const leftWall = Bodies.rectangle(0, worldHeight / 2, 20, worldHeight, { isStatic: true, render: { fillStyle: '#333' } });
const rightWall = Bodies.rectangle(width, worldHeight / 2, 20, worldHeight, { isStatic: true, render: { fillStyle: '#333' } });
Composite.add(world, [leftWall, rightWall]);

// 2. 建立所有 8 層樓的障礙物（滿版釘子與流暢斜板交錯）
for (let level = 0; level < totalLevels; level++) {
    let startY = level * levelHeight;

    if (level % 2 === 0) {
        let cols = 9;
        let spacingX = (width - 60) / (cols - 1);
        for (let row = 0; row < 7; row++) {
            for (let col = 0; col < cols; col++) {
                let x = 30 + col * spacingX + (row % 2) * (spacingX / 2);
                if (x < width - 20) {
                    let y = startY + 80 + row * 85;
                    let peg = Bodies.circle(x, y, 11, { isStatic: true, restitution: 0.85, render: { fillStyle: '#2c2c2c' } });
                    Composite.add(world, peg);
                }
            }
        }
    } else {
        for (let row = 0; row < 4; row++) {
            let xPos = (row % 2 === 0) ? width * 0.35 : width * 0.65;
            let slope = Bodies.rectangle(xPos, startY + 120 + row * 140, width * 0.5, 15, {
                isStatic: true,
                angle: (row % 2 === 0) ? 0.28 : -0.28,
                render: { fillStyle: '#333' }
            });
            Composite.add(world, slope);
        }
    }
}

// 3. 動態關卡底部邊界系統
let checkpointSensors = [];
let bottomDestructors = [];
let levelBottomBodies = [];

function updateLevelBoundaries() {
    levelBottomBodies.forEach(body => Composite.remove(world, body));
    levelBottomBodies = [];
    checkpointSensors = [];
    bottomDestructors = [];

    for (let level = 0; level < totalLevels; level++) {
        let startY = level * levelHeight;

        if (level < unlockedLevels - 1) {
            let blueSensor = Bodies.rectangle(width / 2, startY + levelHeight - 25, width - 40, 20, {
                isStatic: true,
                isSensor: true,
                render: { fillStyle: '#3498db' }
            });
            checkpointSensors.push(blueSensor);
            levelBottomBodies.push(blueSensor);
            Composite.add(world, blueSensor);
        } else if (level === unlockedLevels - 1) {
            let redBar = Bodies.rectangle(width / 2, startY + levelHeight - 25, width - 40, 20, {
                isStatic: true,
                render: { fillStyle: '#e74c3c' }
            });
            bottomDestructors.push(redBar);
            levelBottomBodies.push(redBar);
            Composite.add(world, redBar);
            break;
        }
    }
}

updateLevelBoundaries();

// ==========================================
// 5. 畫面上下滑動與相機控制
// ==========================================
let currentCameraY = 0;
let maxScroll = worldHeight - viewHeight;

function scrollCameraTo(newY) {
    currentCameraY = newY;
    if (currentCameraY < 0) currentCameraY = 0;
    if (currentCameraY > maxScroll) currentCameraY = maxScroll;

    Render.lookAt(render, {
        min: { x: 0, y: currentCameraY },
        max: { x: width, y: currentCameraY + viewHeight }
    });
}

function scrollCamera(direction) {
    scrollCameraTo(currentCameraY + direction * viewHeight);
}

let isDragging = false;
let startTouchY = 0;
let startCameraY = 0;

container.addEventListener('touchstart', (e) => {
    isDragging = true;
    startTouchY = e.touches[0].clientY;
    startCameraY = currentCameraY;
}, { passive: true });

container.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    let currentTouchY = e.touches[0].clientY;
    let deltaY = startTouchY - currentTouchY;
    scrollCameraTo(startCameraY + deltaY);
}, { passive: true });

container.addEventListener('touchend', () => { isDragging = false; });

container.addEventListener('mousedown', (e) => {
    isDragging = true;
    startTouchY = e.clientY;
    startCameraY = currentCameraY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let deltaY = startTouchY - e.clientY;
    scrollCameraTo(startCameraY + deltaY);
});

window.addEventListener('mouseup', () => { isDragging = false; });

// ==========================================
// 6. 球體生成與碰撞偵測
// ==========================================
function spawnBall() {
    let x = width / 2 + (Math.random() * 30 - 15);
    let y = 20;
    let ball = Bodies.circle(x, y, 12, {
        restitution: 0.85,
        render: { fillStyle: '#ffffff' }
    });

    Composite.add(world, ball);
    balls.push(ball);
}

let spawnerTimer = setInterval(spawnBall, spawnIntervalTime);

Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        let bodyA = pair.bodyA;
        let bodyB = pair.bodyB;

        checkpointSensors.forEach(sensor => {
            if ((bodyA === sensor && balls.includes(bodyB)) || (bodyB === sensor && balls.includes(bodyA))) {
                let ball = balls.includes(bodyA) ? bodyA : bodyB;
                if (!ball.touchedCheckpoints) ball.touchedCheckpoints = [];
                if (!ball.touchedCheckpoints.includes(sensor)) {
                    ball.touchedCheckpoints.push(sensor);
                    gold += ballValue * prestigeData.multiplier;
                    updateUI();
                }
            }
        });

        bottomDestructors.forEach(destructor => {
            if ((bodyA === destructor && balls.includes(bodyB)) || (bodyB === destructor && balls.includes(bodyA))) {
                let ball = balls.includes(bodyA) ? bodyA : bodyB;

                gold += ballValue * prestigeData.multiplier;
                updateUI();

                Composite.remove(world, ball);
                balls = balls.filter(b => b !== ball);
            }
        });
    });
});

function formatNumber(num) {
    if (num >= 1e6) {
        return num.toExponential(2).toUpperCase();
    }
    return num.toFixed(2);
}

function updateUI() {
    const goldEl = document.getElementById('gold-display');
    if (goldEl) goldEl.innerText = formatNumber(gold);

    const statusEl = document.getElementById('status-display');
    if (statusEl) {
        statusEl.innerHTML = `已解鎖關卡: ${unlockedLevels}/${totalLevels} | 球價值: $${formatNumber(ballValue * prestigeData.multiplier)} | 速度: ${(spawnIntervalTime / 1000).toFixed(1)}s`;
    }
}

// ==========================================
// 7. 題庫與隨機洗牌出題系統（支援錯題本與雲端）
// ==========================================
let quizData = [];
let currentQuestionIndex = 0;
let shuffledIndices = [];
let shufflePointer = 0;
let roundCount = 0;

async function loadQuizData() {
    try {
        let response = await fetch('questions.json');
        quizData = await response.json();
        if (quizData.length > 0) {
            initShuffledIndices();
            loadRandomQuestion();
        }
    } catch (e) {
        document.getElementById('question-text').innerText = "請確認已建立 questions.json 題庫";
    }
}

function initShuffledIndices() {
    shuffledIndices = Array.from({ length: quizData.length }, (_, i) => i);
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }
    shufflePointer = 0;
    roundCount++;
}

function loadRandomQuestion() {
    if (quizData.length === 0) return;

    if (shufflePointer >= shuffledIndices.length) {
        initShuffledIndices();
        if (roundCount > 1) {
            gold += ballValue * 5 * prestigeData.multiplier;
            updateUI();
            let feedback = document.getElementById('feedback');
            feedback.innerText = `太神啦！你已經把所有題目完整輪完一輪！獲得獎勵金幣！🏆`;
            setTimeout(() => { feedback.innerText = ""; }, 4000);
        }
    }

    currentQuestionIndex = shuffledIndices[shufflePointer];
    shufflePointer++;

    let qObj = quizData[currentQuestionIndex];

    document.getElementById('question-text').innerHTML = qObj.q;
    let optionsArea = document.getElementById('options-area');
    optionsArea.innerHTML = '';

    qObj.options.forEach((opt, index) => {
        let btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = opt;
        btn.onclick = () => checkAnswer(index);
        optionsArea.appendChild(btn);
    });

    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.getElementById('control-panel'), {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ],
            throwOnError: false
        });
    }
}

function checkAnswer(selectedIndex) {
    if (quizData.length === 0) return;
    let qObj = quizData[currentQuestionIndex];
    let feedback = document.getElementById('feedback');

    quizStats.totalAnswered++;

    if (selectedIndex === qObj.answer) {
        quizStats.totalCorrect++;
        correctAnswersCount++;

        if (correctAnswersCount % 10 === 0 && unlockedLevels < totalLevels) {
            unlockedLevels++;
            updateLevelBoundaries();
            feedback.innerText = `太神啦！成功解鎖第 ${unlockedLevels} 層新關卡！🎉`;
        } else {
            if (spawnIntervalTime <= 200) {
                ballValue *= 1.6;
                feedback.innerText = "答對！生成已達極限，球的價值爆發提升至 x1.6！💎";
            } else {
                let upgradeType = Math.random() > 0.5 ? 'value' : 'speed';
                if (upgradeType === 'value') {
                    ballValue *= 1.4;
                    feedback.innerText = "答對！球的價值提升至 x1.4！📈";
                } else {
                    spawnIntervalTime *= 0.96;
                    if (spawnIntervalTime < 200) spawnIntervalTime = 200;
                    clearInterval(spawnerTimer);
                    spawnerTimer = setInterval(spawnBall, spawnIntervalTime);
                    feedback.innerText = "答對！球的生產速度提升 4%！⚡";
                }
            }
        }
    } else {
        // 紀錄錯題
        quizStats.wrongQuestions.push({
            question: qObj.q,
            options: qObj.options,
            correct: qObj.answer,
            userChoice: selectedIndex
        });

        ballValue *= 0.9;
        if (ballValue < 0.1) ballValue = 0.1;

        spawnIntervalTime *= 1.01;
        clearInterval(spawnerTimer);
        spawnerTimer = setInterval(spawnBall, spawnIntervalTime);

        feedback.innerText = "答錯囉！球價值下降 (x0.9)，生成變慢！❌";
    }

    updateUI();
    saveGameToCloud(); // 每次答題自動同步至雲端

    setTimeout(() => {
        feedback.innerText = "";
        loadRandomQuestion();
    }, 2000);
}

// ==========================================
// 8. Prestige 轉生系統
// ==========================================
function triggerPrestige() {
    const requiredQuestions = 50;
    if (quizStats.totalAnswered < requiredQuestions) {
        alert(`尚未達標！還需回答 ${requiredQuestions - quizStats.totalAnswered} 題才能解鎖 Prestige。`);
        return;
    }

    let x = Math.max(gold, 1);
    let currentSpeed = spawnIntervalTime / 1000;
    let bonusMultiplier = 1.0;

    // 依據球速條件套用不同公式
    if (currentSpeed < 0.2) {
        bonusMultiplier = 1.6 + Math.log10(x);
    } else {
        bonusMultiplier = 1.4 + (Math.log10(x) / 10);
    }

    prestigeData.multiplier *= bonusMultiplier;
    prestigeData.count++;

    // 重置遊戲數值（答題統計與錯題完全保留）
    gold = 0;
    unlockedLevels = 1;
    ballValue = 1.0;
    spawnIntervalTime = 10000;
    clearInterval(spawnerTimer);
    spawnerTimer = setInterval(spawnBall, spawnIntervalTime);
    updateLevelBoundaries();

    saveGameToCloud();

    alert(`👑 第 ${prestigeData.count} 次 Prestige 轉生成功！\n本次獲得加成：x${bonusMultiplier.toFixed(2)}\n目前總倍率：x${prestigeData.multiplier.toFixed(2)}`);
    updateUI();
}

// 初始化載入
loadQuizData();
loadGameFromCloud();
