import { WS_PATH, PARAMS, PARAM_BY_NAME } from './remote/protocol.js';

// ============================================
// Phone Remote Control Page
// ============================================
// Touch UI that mirrors the player state and sends normalized
// parameter changes over the WebSocket relay (see protocol.js).

const SLIDER_STEPS = 1000;

let ws = null;
let connected = false;

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const currentShaderEl = document.getElementById('current-shader');
const shaderSelect = document.getElementById('shader-select');
const mirrorBtn = document.getElementById('mirror-btn');
const editBtn = document.getElementById('edit-btn');

// name -> { slider, valueEl, dragging }
const sliderRows = new Map();
let mirrorOn = false;

// ============================================
// UI construction
// ============================================
function buildSliders() {
    const containers = {
        main: document.getElementById('params-main'),
        audio: document.getElementById('params-audio'),
        mirror: document.getElementById('params-mirror'),
    };

    for (const def of PARAMS) {
        if (def.toggle) continue; // toggles have dedicated buttons

        const row = document.createElement('div');
        row.className = 'param-row';

        const label = document.createElement('div');
        label.className = 'param-label';

        const name = document.createElement('span');
        name.textContent = def.label;

        const valueEl = document.createElement('span');
        valueEl.className = 'param-value';
        valueEl.textContent = def.fmt(def.toScaled(def.defaultNorm));

        label.appendChild(name);
        label.appendChild(valueEl);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = String(SLIDER_STEPS);
        slider.step = '1';
        slider.value = String(Math.round(def.defaultNorm * SLIDER_STEPS));

        const entry = { slider, valueEl, dragging: false };
        sliderRows.set(def.name, entry);

        slider.addEventListener('pointerdown', () => { entry.dragging = true; });
        slider.addEventListener('pointerup', () => { entry.dragging = false; });
        slider.addEventListener('pointercancel', () => { entry.dragging = false; });

        slider.addEventListener('input', () => {
            const norm = Number(slider.value) / SLIDER_STEPS;
            valueEl.textContent = def.fmt(def.toScaled(norm));
            send({ type: 'param', name: def.name, value: norm });
        });

        row.appendChild(label);
        row.appendChild(slider);
        (containers[def.group] || containers.main).appendChild(row);
    }
}

function setupButtons() {
    document.getElementById('prev-btn').addEventListener('click', () => {
        send({ type: 'shader', action: 'prev' });
    });

    document.getElementById('next-btn').addEventListener('click', () => {
        send({ type: 'shader', action: 'next' });
    });

    shaderSelect.addEventListener('change', () => {
        send({ type: 'shader', action: 'setIndex', index: Number(shaderSelect.value) });
    });

    mirrorBtn.addEventListener('click', () => {
        mirrorOn = !mirrorOn;
        updateMirrorButton();
        send({ type: 'param', name: 'mirror', value: mirrorOn ? 1 : 0 });
    });

    editBtn.addEventListener('click', () => {
        send({ type: 'editMode' });
    });
}

function updateMirrorButton() {
    mirrorBtn.textContent = `Mirror: ${mirrorOn ? 'ON' : 'OFF'}`;
    mirrorBtn.classList.toggle('on', mirrorOn);
}

// ============================================
// State sync (player -> phone)
// ============================================
function applyState(state) {
    // Shader list + current shader
    if (Array.isArray(state.shaders)) {
        if (shaderSelect.options.length !== state.shaders.length) {
            shaderSelect.innerHTML = '';
            state.shaders.forEach((name, i) => {
                const option = document.createElement('option');
                option.value = String(i);
                option.textContent = name;
                shaderSelect.appendChild(option);
            });
        }
        shaderSelect.value = String(state.currentIndex);
        currentShaderEl.textContent = state.shaders[state.currentIndex] || '–';
    }

    // Parameters
    if (state.params) {
        for (const [name, norm] of Object.entries(state.params)) {
            const def = PARAM_BY_NAME.get(name);
            if (!def) continue;

            if (def.name === 'mirror') {
                mirrorOn = norm > 0.5;
                updateMirrorButton();
                continue;
            }

            const entry = sliderRows.get(name);
            if (!entry || entry.dragging) continue;
            entry.slider.value = String(Math.round(norm * SLIDER_STEPS));
            entry.valueEl.textContent = def.fmt(def.toScaled(norm));
        }
    }

    // Edit mode
    editBtn.textContent = `Edit Mode: ${state.editMode ? 'ON' : 'OFF'}`;
    editBtn.classList.toggle('on', !!state.editMode);
}

// ============================================
// WebSocket
// ============================================
function send(msg) {
    if (connected && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function setStatus(isConnected) {
    connected = isConnected;
    statusDot.classList.toggle('connected', isConnected);
    statusText.textContent = isConnected ? 'Connected' : 'Reconnecting...';
}

function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}${WS_PATH}`);

    ws.addEventListener('open', () => {
        setStatus(true);
        send({ type: 'requestState' });
    });

    ws.addEventListener('message', (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'state') {
                applyState(msg);
            }
        } catch (error) {
            console.log('Invalid message:', error);
        }
    });

    ws.addEventListener('close', () => {
        setStatus(false);
        setTimeout(connect, 2000);
    });

    ws.addEventListener('error', () => {
        ws.close();
    });
}

buildSliders();
setupButtons();
connect();
