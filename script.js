import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ==========================================
// 1. MATH ENGINE & CONTEXT
// ==========================================

const Noise = {
    perm: new Uint8Array(512),
    seed: function() {
        const p = new Uint8Array(256);
        for(let i=0; i<256; i++) p[i] = i;
        for(let i=0; i<256; i++) {
            let r = Math.floor(Math.random()*256);
            let t = p[i]; p[i] = p[r]; p[r] = t;
        }
        for(let i=0; i<512; i++) this.perm[i] = p[i & 255];
    },
    grad3: [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],
    dot: (g, x, y) => g[0]*x + g[1]*y,
    simplex: function(x, y) {
        const F2 = 0.5*(Math.sqrt(3.0)-1.0);
        const G2 = (3.0-Math.sqrt(3.0))/6.0;
        let n0, n1, n2;
        let s = (x+y)*F2; 
        let i = Math.floor(x+s); let j = Math.floor(y+s);
        let t = (i+j)*G2;
        let X0 = i-t; let Y0 = j-t;
        let x0 = x-X0; let y0 = y-Y0;
        let i1, j1;
        if(x0>y0){i1=1; j1=0;}else{i1=0; j1=1;}
        let x1 = x0 - i1 + G2; let y1 = y0 - j1 + G2;
        let x2 = x0 - 1.0 + 2.0 * G2; let y2 = y0 - 1.0 + 2.0 * G2;
        let ii = i & 255; let jj = j & 255;
        let gi0 = this.perm[ii+this.perm[jj]] % 12;
        let gi1 = this.perm[ii+i1+this.perm[jj+j1]] % 12;
        let gi2 = this.perm[ii+1+this.perm[jj+1]] % 12;
        let t0 = 0.5 - x0*x0 - y0*y0;
        if(t0<0) n0 = 0.0; else {t0 *= t0; n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0);}
        let t1 = 0.5 - x1*x1 - y1*y1;
        if(t1<0) n1 = 0.0; else {t1 *= t1; n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1);}
        let t2 = 0.5 - x2*x2 - y2*y2;
        if(t2<0) n2 = 0.0; else {t2 *= t2; n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2);}
        return 70.0 * (n0 + n1 + n2);
    }
};
Noise.seed();

const Hash = {
    intHash: (x, z) => {
        let h = 0x811c9dc5;
        h ^= (x & 0xFFFFFFFF);
        h = Math.imul(h, 0x01000193);
        h ^= (z & 0xFFFFFFFF);
        h = Math.imul(h, 0x01000193);
        return (h >>> 0) / 4294967296;
    },
    val: (x, z) => {
        const xi = Math.floor(x * 100);
        const zi = Math.floor(z * 100);
        return Hash.intHash(xi, zi);
    }
}

const Ctx = {
    _x: 0, _z: 0,
    pi: Math.PI, 'π': Math.PI, e: Math.E, phi: 1.61803,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    sqrt: Math.sqrt, pow: Math.pow,
    mod: (x, y) => ((x % y) + y) % y,
    max: Math.max, min: Math.min,
    csc: x => 1/Math.sin(x), sec: x => 1/Math.cos(x),
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    ln: Math.log, lg: Math.log10, exp: Math.exp,
    rand: () => Hash.intHash(Ctx._x, Ctx._z),
    randnormal: (mean=0, stdev=1) => {
        let u = Hash.intHash(Ctx._x * 167, Ctx._z * 167);
        let v = Hash.intHash(Ctx._x * 253, Ctx._z * 253);
        if(u<=0) u=0.0001;
        return (Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)) * stdev + mean;
    },
    simplex: (x,y,z) => Noise.simplex(x,z),
    perlin: (x,y,z) => Noise.simplex(x,z),
    normal: (x,y,z) => Ctx.randnormal(0, 1),
    blended: (x,y,z) => (Noise.simplex(x,z) + Math.sin(x)*Math.cos(z)) * 0.5,
    octaved: (x, z, oct, per) => {
        let total = 0, amp = 1, freq = 1, max = 0;
        for(let i=0; i<(oct||4); i++){
            total += Noise.simplex(x*freq, z*freq)*amp;
            max += amp; amp *= (per||0.5); freq *= 2;
        }
        return total/max;
    }
};

// ==========================================
// 2. NAME GEN
// ==========================================

const NameGen = {
    adj: ['Cosmic','Quantum','Voxel','Hyper','Cyber','Glitch','Floating','Lost','Neon','Dark','Solar','Lunar','Infinite','Fractal','Recursive','Broken','Twisted','Hollow','Solid'],
    noun: ['Lands','Waves','Mountains','Valley','Spire','Grid','Matrix','Core','Void','Peaks','Dunes','Ocean','Maze','Labyrinth','Citadel','Expanse','Realm','Sector','Zone'],
    get: function() { return this.pick(this.adj) + ' ' + this.pick(this.noun); },
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)]
};

// ==========================================
// 3. ADVANCED GENERATOR
// ==========================================

let isRealisticOnly = false;

const Generator = {
    ops: ['+','-','*'],
    funcs: ['sin','cos','abs','floor','round','sqrt'],
    noiseTypes: ['Perlin', 'Simplex', 'Normal', 'Blended'],
    
    themes: [
        'Blocky', 'Smooth', 'Upwards', 'Downward', 'Reverse', 'Forward', 
        'FlipX', 'FlipY', 'FlipZ', 'Void', 'Tower', 'Skyscraper', 
        'Holes', 'Cavern', 'Fantasy', 'Underwater', 'Hell', 'Realistic', 
        'One Block', 'X-Ray', 'Sphere', 'Cubes', 'Pyramid', 'Torus', 
        'Star', 'Notch', 'Underworld', 'Floating', 'Floating Island', 
        'Upside Down', 'Digital', 'Modern', 'Cyberpunk2077', 
        'Maze', 'Giant Maze', 'Auto Maze'
    ],
    
    levels: ['Hardcoded', 'Expert', 'Unreal', 'Long Math', 'Intermediate'],

    pick: arr => arr[Math.floor(Math.random()*arr.length)],
    
    genExpr: function(depth, noiseKey) {
        if(depth <= 0) {
            const r = Math.random();
            if(r < 0.6) return (Math.random() < 0.5 ? 'x' : 'z') + '*' + (Math.random()*0.15 + 0.01).toFixed(3);
            return (Math.random()*15).toFixed(1);
        }
        const type = Math.random();
        if(type < 0.3) return `(${this.genExpr(depth-1, noiseKey)} ${this.pick(this.ops)} ${this.genExpr(depth-1, noiseKey)})`;
        if(type < 0.6) return `${this.pick(this.funcs)}(${this.genExpr(depth-1, noiseKey)})`;
        
        return `${noiseKey.toLowerCase()}(x*${(Math.random()*0.1).toFixed(3)}, 0, z*${(Math.random()*0.1).toFixed(3)}) * ${(Math.random()*20+5).toFixed(0)}`;
    },

    create: function() {
        let theme, level, noise;
        
        if (isRealisticOnly) {
            // Force Realistic mode logic
            theme = 'Realistic'; 
            level = 'Intermediate'; // Arbitrary level label, doesn't affect logic here
            noise = this.pick(this.noiseTypes);
        } else {
            // Normal Random Mode
            theme = this.pick(this.themes);
            level = this.pick(this.levels);
            noise = this.pick(this.noiseTypes);
        }
        
        let formula = this.getFormulaForTheme(theme, noise, level);

        return {
            formula: formula,
            noise: noise,
            type: theme,
            level: level
        };
    },

    getFormulaForTheme: function(theme, noiseKey, level) {
        // If Realistic Only is enabled, we completely ignore standard generation and return random realistic formula
        if (theme === 'Realistic' && isRealisticOnly) {
            const scale = (Math.random() * 0.02 + 0.005).toFixed(4);
            const height = (Math.random() * 30 + 15).toFixed(0);
            // Octaved noise using the selected noise type (via octaved func which uses simplex, or we can use noiseKey directly)
            // Note: Ctx.octaved uses Simplex internally. To support other noise types in realistic, we construct it:
            return `octaved(x*${scale}, z*${scale}, 4, 0.5) * ${height}`;
        }

        let depth = 3;
        if(level === 'Expert') depth = 4;
        if(level === 'Long Math') depth = 5;
        if(level === 'Hardcoded') depth = 1;

        const baseNoise = `${noiseKey.toLowerCase()}(x*0.05, 0, z*0.05)`;
        const randExpr = this.genExpr(depth, noiseKey);

        switch(theme) {
            // DIRECTIONAL / TRANSFORM
            case 'Upwards': return `abs(${randExpr}) + (x + z) * 0.1`;
            case 'Downward': return `abs(${randExpr}) - (x + z) * 0.1`;
            case 'Reverse': return `-1 * (${randExpr})`;
            case 'Forward': return `(${randExpr}) + z * 0.5`;
            case 'FlipX': return `sin(-x*0.1) * 10 + ${baseNoise}*10`;
            case 'FlipY': return `-1 * abs(${randExpr})`;
            case 'FlipZ': return `cos(-z*0.1) * 10 + ${baseNoise}*10`;
            case 'Upside Down': return `-1 * (${randExpr} + 20)`;
            
            // VOXEL / GRID
            case 'Blocky': return `floor(${baseNoise} * 15) * 2`;
            case 'Cubes': return `floor(x/4)*4 + floor(z/4)*4 + ${baseNoise}*5`;
            case 'Digital': return `round(${baseNoise} * 10) * 2 + mod(x, 2)`;
            case 'Modern': return `max(abs(x%10), abs(z%10)) + ${baseNoise}*5`;
            case 'Cyberpunk2077': return `mod(floor(x), 5) * mod(floor(z), 5) * 5 + ${baseNoise}*10`;
            case 'One Block': return `(abs(x)<1 && abs(z)<1) ? 10 : 0`;
            case 'X-Ray': return `(mod(x, 2) > 1 && mod(z, 2) > 1) ? ${baseNoise}*20 : 0`;
            
            // GEOMETRIC
            case 'Sphere': return `sqrt(max(0, 900 - x*x - z*z))`;
            case 'Torus': return `sqrt(max(0, 100 - pow(sqrt(x*x+z*z) - 30, 2)))`;
            case 'Pyramid': return `max(0, 40 - max(abs(x), abs(z)))`;
            case 'Star': return `max(0, 30 - sqrt(x*x+z*z) + sin(atan2(z,x)*5)*10)`;
            case 'Tower': return `max(0, 50 - sqrt(x*x+z*z)*2)`;
            
            // ORGANIC
            case 'Smooth': return `sin(x*0.05)*10 + cos(z*0.05)*10 + ${baseNoise}*5`;
            case 'Realistic': return `octaved(x*0.01, z*0.01, 4, 0.5) * 40`;
            case 'Fantasy': return `sin(x*0.1)*cos(z*0.1)*10 + pow(abs(${baseNoise}), 3)*15`;
            case 'Underwater': return `min(-2, ${baseNoise} * 20)`;
            case 'Cavern': return `abs(${baseNoise}*20) * -1 + 10`;
            case 'Holes': return `10 - max(0, sin(x*0.2)*sin(z*0.2)*20)`;
            case 'Notch': return `${baseNoise} * 20 + (rand() > 0.9 ? 10 : 0)`;
            
            // MAZE
            case 'Maze': return `floor(sin(x*0.2) + cos(z*0.2) + 1.5) * 10`;
            case 'Giant Maze': return `floor(sin(x*0.05) + cos(z*0.05) + 1.2) * 20`;
            case 'Auto Maze': return `(perlin(x*0.1,0,z*0.1) > 0.2) ? 10 : 0`;
            case 'Skyscraper': return `(mod(x, 10) < 3 && mod(z, 10) < 3) ? ${randExpr} + 20 : 0`;
            
            // ABSTRACT
            case 'Void': return `(sqrt(x*x+z*z) > 20) ? ${randExpr} : -50`;
            case 'Floating': return `${baseNoise}*10 + 30`;
            case 'Floating Island': return `max(0, 30 - sqrt(x*x+z*z)) + ${baseNoise}*5 + 20`;
            case 'Hell': return `abs(tan(x*0.05 + z*0.05)) * 10 + ${baseNoise}*5`;
            case 'Underworld': return `${baseNoise} * 10 - 30`;
            
            default: return randExpr;
        }
    }
};

// ==========================================
// 4. THREE.JS SCENE
// ==========================================

const container = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = null; 

let aspect = container.clientWidth / container.clientHeight;
let viewSize = 40;
const camera = new THREE.OrthographicCamera(
    -viewSize * aspect, viewSize * aspect,
    viewSize, -viewSize,
    1, 2000 
);

camera.position.set(500, 500, 500); 
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; 
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.zoomSpeed = 1.0;
controls.rotateSpeed = 0.5;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.5;

const ambi = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambi);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(200, 400, 200);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
const d = 300; 
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.camera.far = 1000;
scene.add(dirLight);

// ==========================================
// 5. INFINITE VOXEL SYSTEM
// ==========================================

const GRID = 200; 
const LAYERS = 4;
const TOTAL_INSTANCES = GRID * GRID * LAYERS;

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ 
    color: 0xffffff, 
    roughness: 0.8,
    metalness: 0.2
});

const instMesh = new THREE.InstancedMesh(geometry, material, TOTAL_INSTANCES);
instMesh.castShadow = true;
instMesh.receiveShadow = true;
instMesh.frustumCulled = false; 
scene.add(instMesh);

const dummy = new THREE.Object3D();
const color = new THREE.Color();
const colors = {
    water: new THREE.Color(0x3273a8),
    sand: new THREE.Color(0xdec28a),
    grass: new THREE.Color(0x56a34c),
    dirt: new THREE.Color(0x795548),
    stone: new THREE.Color(0x808080),
    snow: new THREE.Color(0xffffff),
    alien: new THREE.Color(0x9c27b0),
    lava: new THREE.Color(0xff5722),
    neon: new THREE.Color(0x00e5ff)
};

let compiledFunc = null;
let lastUpdateX = -999999;
let lastUpdateZ = -999999;

function compileFormula(str) {
    try {
        let safeStr = str.replace(/\^/g, '**');
        const f = new Function('C', 'x', 'z', `with(C){return ${safeStr};}`);
        f(Ctx, 0, 0); 
        document.getElementById('error-msg').classList.add('error-hidden');
        return f;
    } catch(e) {
        document.getElementById('error-msg').textContent = "⚠ " + e.message;
        document.getElementById('error-msg').classList.remove('error-hidden');
        return null;
    }
}

function updateTerrain(force = false) {
    if(!compiledFunc) return;

    const cx = Math.floor(controls.target.x);
    const cz = Math.floor(controls.target.z);

    if (!force && Math.abs(cx - lastUpdateX) < 2 && Math.abs(cz - lastUpdateZ) < 2) return;
    lastUpdateX = cx;
    lastUpdateZ = cz;
    
    dirLight.position.set(cx + 200, 400, cz + 200);
    dirLight.target.position.set(cx, 0, cz);
    dirLight.target.updateMatrixWorld();

    let idx = 0;
    const offset = Math.floor(GRID / 2);
    
    for(let i = 0; i < GRID; i++) {
        for(let j = 0; j < GRID; j++) {
            const wx = cx - offset + i;
            const wz = cz - offset + j;
            
            Ctx._x = wx; Ctx._z = wz;

            let y = 0;
            try { y = compiledFunc(Ctx, wx, wz); } catch(e) { y = 0; }
            if(!Number.isFinite(y)) y = 0;
            const surfaceY = Math.floor(y);
            
            let biome = 'GRASS';
            if (surfaceY < -2) biome = 'WATER';
            else if (surfaceY < 2) biome = 'SAND';
            else if (surfaceY < 15) biome = 'GRASS';
            else if (surfaceY < 40) biome = 'STONE';
            else biome = 'SNOW';
            
            if(y > 60) biome = 'ALIEN';
            if(y < -30) biome = 'LAVA';

            for (let d = 0; d < LAYERS; d++) {
                dummy.position.set(wx, surfaceY - d, wz);
                dummy.updateMatrix();
                instMesh.setMatrixAt(idx, dummy.matrix);

                let c = color;
                if(d === 0) {
                    if(biome==='WATER') c.copy(colors.water);
                    else if(biome==='SAND') c.copy(colors.sand);
                    else if(biome==='GRASS') c.copy(colors.grass);
                    else if(biome==='STONE') c.copy(colors.stone);
                    else if(biome==='SNOW') c.copy(colors.snow);
                    else if(biome==='ALIEN') c.copy(colors.alien);
                    else if(biome==='LAVA') c.copy(colors.lava);
                } else {
                    c.copy(biome==='GRASS'?colors.dirt:colors.stone);
                }
                if(d>0) c.multiplyScalar(0.85);
                instMesh.setColorAt(idx, c);
                idx++;
            }
        }
    }
    instMesh.instanceMatrix.needsUpdate = true;
    instMesh.instanceColor.needsUpdate = true;
}

// ==========================================
// 6. UI, HISTORY & TABS
// ==========================================

const ui = {
    input: document.getElementById('formula-input'),
    btnGen: document.getElementById('gen-btn'),
    btnCopy: document.getElementById('copy-btn'),
    btnSave: document.getElementById('save-btn'),
    btnHist: document.getElementById('history-btn'),
    btnCloseHist: document.getElementById('close-history'),
    btnToggleRealistic: document.getElementById('toggle-realistic'),
    zoomSlider: document.getElementById('zoom-slider'),
    sidebar: document.getElementById('sidebar'),
    sidebarContent: document.getElementById('sidebar-content'),
    tabHistory: document.getElementById('tab-history'),
    tabSaved: document.getElementById('tab-saved'),
    tagNoise: document.getElementById('tag-noise'),
    tagGen: document.getElementById('tag-gen'),
    genName: document.getElementById('gen-name')
};

// DATA STORES
let historyList = [];
let savedList = [];
let currentTab = 'history';

// 1. GENERATION LOGIC
function initGen() {
    Noise.seed(); // New Seed
    
    // Create new data
    const data = Generator.create();
    const name = NameGen.get();

    // Update UI
    ui.input.value = data.formula;
    ui.tagNoise.textContent = data.noise.toUpperCase();
    ui.tagGen.textContent = data.type.toUpperCase();
    ui.genName.textContent = name;

    // Render
    compiledFunc = compileFormula(data.formula);
    updateTerrain(true);

    // LOG TO HISTORY
    addToHistory({
        formula: data.formula,
        noise: data.noise,
        type: data.type,
        name: name
    });
}

// 2. HISTORY & SAVED LOGIC
function addToHistory(item) {
    historyList.unshift(item);
    if(historyList.length > 50) historyList.pop();
    if(currentTab === 'history') renderSidebar();
}

function saveCurrent() {
    const item = {
        formula: ui.input.value,
        noise: ui.tagNoise.textContent,
        type: ui.tagGen.textContent,
        name: ui.genName.textContent
    };
    
    // Avoid duplicates
    if(!savedList.some(s => s.formula === item.formula)) {
        savedList.unshift(item);
        showToast("SAVED!");
        if(currentTab === 'saved') renderSidebar();
    } else {
        showToast("ALREADY SAVED");
    }
}

// 3. RENDER SIDEBAR
function renderSidebar() {
    ui.sidebarContent.innerHTML = '';
    const list = currentTab === 'history' ? historyList : savedList;

    if(list.length === 0) {
        ui.sidebarContent.innerHTML = `<div style="padding:20px; text-align:center; color:#666;">No ${currentTab} items.</div>`;
        return;
    }

    list.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'history-item';
        
        row.innerHTML = `
            <div class="history-content">
                <div class="h-tags">
                    <span class="h-badge n">${item.noise}</span>
                    <span class="h-badge t">${item.type}</span>
                    <span class="h-name">${item.name}</span>
                </div>
                <span class="h-code">${item.formula}</span>
            </div>
            <button class="history-delete">×</button>
        `;

        // Load Logic
        row.querySelector('.history-content').onclick = () => {
            ui.input.value = item.formula;
            ui.tagNoise.textContent = item.noise;
            ui.tagGen.textContent = item.type;
            ui.genName.textContent = item.name;
            compiledFunc = compileFormula(item.formula);
            updateTerrain(true);
        };

        // Delete Logic
        row.querySelector('.history-delete').onclick = (e) => {
            e.stopPropagation();
            list.splice(index, 1);
            renderSidebar();
        };

        ui.sidebarContent.appendChild(row);
    });
}

// 4. TAB SWITCHING
ui.tabHistory.onclick = () => {
    currentTab = 'history';
    ui.tabHistory.classList.add('active');
    ui.tabSaved.classList.remove('active');
    renderSidebar();
};

ui.tabSaved.onclick = () => {
    currentTab = 'saved';
    ui.tabSaved.classList.add('active');
    ui.tabHistory.classList.remove('active');
    renderSidebar();
};

// 5. EVENT LISTENERS
ui.btnGen.onclick = initGen;
ui.btnSave.onclick = saveCurrent;
ui.btnHist.onclick = () => {
    ui.sidebar.classList.add('open');
    renderSidebar();
};
ui.btnCloseHist.onclick = () => ui.sidebar.classList.remove('open');

ui.btnCopy.onclick = () => {
    navigator.clipboard.writeText(ui.input.value);
    showToast("COPIED");
};

ui.input.oninput = () => {
    ui.tagNoise.textContent = "USER";
    ui.tagGen.textContent = "CUSTOM";
    ui.genName.textContent = "Edited Formula";
    compiledFunc = compileFormula(ui.input.value);
    updateTerrain(true);
};

// REALISTIC TOGGLE LOGIC
ui.btnToggleRealistic.onclick = () => {
    isRealisticOnly = !isRealisticOnly;
    if(isRealisticOnly) {
        ui.btnToggleRealistic.innerHTML = "<span>🌿</span> REALISTIC: ON";
        ui.btnToggleRealistic.classList.add('realistic-on');
        showToast("REALISTIC MODE ON");
    } else {
        ui.btnToggleRealistic.innerHTML = "<span>🌿</span> REALISTIC: OFF";
        ui.btnToggleRealistic.classList.remove('realistic-on');
        showToast("REALISTIC MODE OFF");
    }
};

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = 1;
    setTimeout(() => t.style.opacity = 0, 1500);
}

// Zoom
ui.zoomSlider.oninput = () => {
    const val = parseInt(ui.zoomSlider.value);
    camera.zoom = val / 20;
    camera.updateProjectionMatrix();
};

controls.addEventListener('change', () => {
    const z = Math.min(100, Math.max(5, camera.zoom * 20));
    ui.zoomSlider.value = z;
    updateTerrain();
});

// Reset Camera
document.getElementById('reset-cam').onclick = () => {
    controls.target.set(0, 0, 0);
    camera.position.set(500, 500, 500);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
    ui.zoomSlider.value = 20;
    updateTerrain(true);
};

document.getElementById('toggle-rotate').onclick = (e) => {
    controls.autoRotate = !controls.autoRotate;
    e.currentTarget.classList.toggle('active');
};

window.onresize = () => {
    aspect = container.clientWidth / container.clientHeight;
    camera.left = -viewSize * aspect;
    camera.right = viewSize * aspect;
    camera.top = viewSize;
    camera.bottom = -viewSize;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
};

// INITIALIZE
initGen();
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();
