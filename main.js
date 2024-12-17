let gl1, gl2, gl3;
let program1, program2, program3;
let uni1, uni2, uni3;
let pointCount1 = 0, pointCount2 = 0, pointCount3 = 0;
let currentPositions = null;

// Camera parameters
let cameraYaw = 0;
let cameraPitch = 0;
let cameraRoll = 0;
let cameraX = 0;
let cameraY = 0;
let cameraZ = -2.0;

// Track mouse inside canvases
let mouseInCanvas1 = false;
let mouseInCanvas2 = false;
let mouseInCanvas3 = false;

// For click and drag orbit
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Global state
let pipeline = "MonoGS";       // default
let depthType = "oracle_depth"; // default
let sequence = "cecum_t1_a";     // default


// Adjust this object or logic according to your actual filenames and structure
// pipeline: MonoGS or EndoGSLAM
// depthType: no_depth -> none, oracle_depth -> oracle, ppsnet_depth -> pps
// sequence: cecum_t1_a, etc.
function getPaths(pipeline, depthType, sequence) {
    const gtPath = `point_clouds/gt/ascii-${sequence}_under_review-500.ply`;

    let baseDir = (pipeline === "MonoGS") ? "MonoGS" : "EndoGSLAM";
    let depthSuffix = (depthType === "no_depth") ? "none"
                      : (depthType === "ppsnet_depth") ? "pps"
                      : "oracle";

    const basePath = `point_clouds/pc/${baseDir}_base_${depthSuffix}_${sequence}_under_review_aligned_colored.ply`;
    const nflbaPath = `point_clouds/pc/${baseDir}_our_${depthSuffix}_${sequence}_under_review_aligned_colored.ply`;

    const videoPath = `videos/${baseDir}/${baseDir}_${depthSuffix}_${sequence}_traj_3.mp4`;

    return { gtPath, basePath, nflbaPath, videoPath };
}

document.addEventListener('DOMContentLoaded', () => {
    const pipelineBtns = document.querySelectorAll('.pipeline-btn');
    const depthBtns = document.querySelectorAll('.depth-btn');
    const sequenceBtns = document.querySelectorAll('.sequence-btn');

    function updateButtonStyles() {
        pipelineBtns.forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-pipeline') === pipeline);
        });
        depthBtns.forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-depth') === depthType);
        });
        sequenceBtns.forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-seq') === sequence);
        });
    }

    function updateDepthOptions() {
        depthBtns.forEach(btn => {
            const depthVal = btn.getAttribute('data-depth');
            if (pipeline === "MonoGS") {
                btn.style.display = 'inline-block';
            } else {
                // EndoGSLAM: no_depth hidden
                if (depthVal === "no_depth") {
                    btn.style.display = 'none';
                    if (depthType === "no_depth") {
                        depthType = "oracle_depth";
                    }
                } else {
                    btn.style.display = 'inline-block';
                }
            }
        });
    }

    pipelineBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            pipeline = btn.getAttribute('data-pipeline');
            updateDepthOptions();
            updateButtonStyles();
            loadCombination();
        });
    });

    depthBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.style.display !== 'none') {
                depthType = btn.getAttribute('data-depth');
                updateButtonStyles();
                loadCombination();
            }
        });
    });

    sequenceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sequence = btn.getAttribute('data-seq');
            updateButtonStyles();
            loadCombination();
        });
    });

    updateDepthOptions();
    updateButtonStyles();
    loadCombination();
});

function recenterCamera(positions) {
    if (positions.length === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
    }

    // Compute the center of the bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Translate the camera to center the point cloud
    cameraX = -centerX;
    cameraY = -centerY;
    cameraZ = -2.0; 

    // Compute the size of the bounding box
    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;
    const maxDim = Math.max(width, height, depth);

    // Set camera Z such that the point cloud fills ~75% of the view
    cameraZ = -(1.5 * maxDim); // Adjust scaling factor as needed
}

function resetView(positions) {
    // Reset rotation
    cameraYaw = 0;
    cameraPitch = 0;
    cameraRoll = 0;

    // Recenter the camera using the loaded point cloud
    if (positions) {
        recenterCamera(positions);
    }

    // Optionally, re-render immediately
    render();
}

async function loadCombination() {
    const { gtPath, basePath, nflbaPath, videoPath } = getPaths(pipeline, depthType, sequence);

    const videoElement = document.getElementById('sequenceVideo');
    videoElement.src = videoPath;
    videoElement.loop = true; 
    videoElement.load();
    videoElement.play();
    
    const [gtData, baseData, nflbaData] = await Promise.all([
        loadPointCloud(gtPath),
        loadPointCloud(basePath),
        loadPointCloud(nflbaPath)
    ]);

    resetView(gtData.positions);

    updateViewer('canvas1', gtData.positions, gtData.colors);
    updateViewer('canvas2', baseData.positions, baseData.colors);
    updateViewer('canvas3', nflbaData.positions, nflbaData.colors);
}

function loadPointCloud(url) {
    return fetch(url).then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load point cloud file: ${response.statusText}`);
        }
        return response.text();
    }).then(text => {
        const lines = text.trim().split('\n');
        let vertexCount = 0;
        let headerEndIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            if (line.startsWith('element vertex')) {
                const parts = line.split(/\s+/);
                vertexCount = parseInt(parts[2], 10);
            }
            if (line === 'end_header') {
                headerEndIndex = i;
                break;
            }
        }

        if (headerEndIndex === -1 || vertexCount === 0) {
            console.error("Header parsing failed or no vertices specified.");
            return { positions: new Float32Array([]), colors: new Float32Array([]) };
        }

        const positions = [];
        const colors = [];

        for (let i = headerEndIndex + 1; i <= headerEndIndex + vertexCount; i++) {
            const parts = lines[i].split(/\s+/).map(Number);

            if (parts.length >= 3 && !parts.slice(0,3).some(isNaN)) {
                const x = parts[0], y = parts[1], z = parts[2];
                positions.push(x, y, z);

                if (parts.length >= 6 && !parts.slice(3,6).some(isNaN)) {
                    const r = parts[3], g = parts[4], b = parts[5];
                    colors.push(r / 255, g / 255, b / 255);
                } else {
                    colors.push(0, 0, 0);
                }
            }
        }

        return {
            positions: new Float32Array(positions),
            colors: new Float32Array(colors)
        };
    });
}

function initGL(canvas) {
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) {
        alert("Your browser does not support WebGL.");
        return null;
    }
    return gl;
}

function createShader(gl, sourceCode, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, sourceCode);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vsSource, fsSource) {
    const vertexShader = createShader(gl, vsSource, gl.VERTEX_SHADER);
    const fragmentShader = createShader(gl, fsSource, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Program link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

function perspectiveMatrix(fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    const rangeInv = 1.0 / (near - far);
    return new Float32Array([
        f/aspect, 0,   0,                            0,
        0,        f,   0,                            0,
        0,        0,  (near+far)*rangeInv,          -1,
        0,        0,  (2*near*far)*rangeInv,         0
    ]);
}

function identityMatrix() {
    return new Float32Array([
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        0,0,0,1
    ]);
}

function multiplyMatrices(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            out[j*4 + i] = a[i]*b[j*4] + a[i+4]*b[j*4+1] + a[i+8]*b[j*4+2] + a[i+12]*b[j*4+3];
        }
    }
    return out;
}

function translate(matrix, tx, ty, tz) {
    const t = new Float32Array([
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        tx,ty,tz,1
    ]);
    return multiplyMatrices(matrix, t);
}

function constructCameraMatrix() {
    const cosP = Math.cos(cameraPitch), sinP = Math.sin(cameraPitch);
    const cosY = Math.cos(cameraYaw), sinY = Math.sin(cameraYaw);
    const cosR = Math.cos(cameraRoll), sinR = Math.sin(cameraRoll);

    const rotMatrix = new Float32Array([
        cosY*cosR, sinP*sinY*cosR - cosP*sinR, cosP*sinY*cosR + sinP*sinR, 0,
        cosY*sinR, sinP*sinY*sinR + cosP*cosR, cosP*sinY*sinR - sinP*cosR, 0,
        -sinY,     sinP*cosY,                 cosP*cosY,                 0,
        0,0,0,1
    ]);

    const transMatrix = translate(identityMatrix(), cameraX, cameraY, cameraZ);
    return multiplyMatrices(transMatrix, rotMatrix);
}

function resizeCanvasToDisplaySize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

function render() {
    if (gl1 && gl2 && gl3) {
        const canvas1 = document.getElementById('canvas1');
        const canvas2 = document.getElementById('canvas2');
        const canvas3 = document.getElementById('canvas3');

        resizeCanvasToDisplaySize(canvas1);
        resizeCanvasToDisplaySize(canvas2);
        resizeCanvasToDisplaySize(canvas3);

        const aspect1 = canvas1.width / canvas1.height;
        const aspect2 = canvas2.width / canvas2.height;
        const aspect3 = canvas3.width / canvas3.height;

        const pMatrix1 = perspectiveMatrix(45 * Math.PI / 180, aspect1, 0.1, 100.0);
        const pMatrix2 = perspectiveMatrix(45 * Math.PI / 180, aspect2, 0.1, 100.0);
        const pMatrix3 = perspectiveMatrix(45 * Math.PI / 180, aspect3, 0.1, 100.0);
        const mvMatrix = constructCameraMatrix();

        // Viewer 1
        gl1.useProgram(program1);
        gl1.viewport(0, 0, canvas1.width, canvas1.height);
        gl1.clear(gl1.COLOR_BUFFER_BIT | gl1.DEPTH_BUFFER_BIT);
        gl1.uniformMatrix4fv(uni1.pMatrix, false, pMatrix1);
        gl1.uniformMatrix4fv(uni1.mvMatrix, false, mvMatrix);
        if (pointCount1) gl1.drawArrays(gl1.POINTS, 0, pointCount1);

        // Viewer 2
        gl2.useProgram(program2);
        gl2.viewport(0, 0, canvas2.width, canvas2.height);
        gl2.clear(gl2.COLOR_BUFFER_BIT | gl2.DEPTH_BUFFER_BIT);
        gl2.uniformMatrix4fv(uni2.pMatrix, false, pMatrix2);
        gl2.uniformMatrix4fv(uni2.mvMatrix, false, mvMatrix);
        if (pointCount2) gl2.drawArrays(gl2.POINTS, 0, pointCount2);

        // Viewer 3
        gl3.useProgram(program3);
        gl3.viewport(0, 0, canvas3.width, canvas3.height);
        gl3.clear(gl3.COLOR_BUFFER_BIT | gl3.DEPTH_BUFFER_BIT);
        gl3.uniformMatrix4fv(uni3.pMatrix, false, pMatrix3);
        gl3.uniformMatrix4fv(uni3.mvMatrix, false, mvMatrix);
        if (pointCount3) gl3.drawArrays(gl3.POINTS, 0, pointCount3);
    }

    requestAnimationFrame(render);
}

function setupViewer(gl, positions, colors) {
    const vsSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform mat4 uMVMatrix;
    uniform mat4 uPMatrix;
    varying vec3 vColor;
    void main(void) {
        gl_PointSize = 1.0;
        gl_Position = uPMatrix * uMVMatrix * vec4(aPosition, 1.0);
        vColor = aColor;
    }`;

    const fsSource = `
    precision mediump float;
    varying vec3 vColor;
    void main(void) {
        gl_FragColor = vec4(vColor, 1.0);
    }`;

    const program = createProgram(gl, vsSource, fsSource);
    gl.useProgram(program);

    const attrPosition = gl.getAttribLocation(program, 'aPosition');
    const attrColor = gl.getAttribLocation(program, 'aColor');
    const uMVMatrix = gl.getUniformLocation(program, 'uMVMatrix');
    const uPMatrix = gl.getUniformLocation(program, 'uPMatrix');

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(attrPosition);
    gl.vertexAttribPointer(attrPosition, 3, gl.FLOAT, false, 0, 0);

    const colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(attrColor);
    gl.vertexAttribPointer(attrColor, 3, gl.FLOAT, false, 0, 0);

    gl.clearColor(0.95, 0.95, 0.95, 1.0);
    gl.enable(gl.DEPTH_TEST);

    return { program, uMVMatrix, uPMatrix };
}

function updateViewer(canvasId, positions, colors) {
    const canvas = document.getElementById(canvasId);
    const gl = initGL(canvas);
    const viewer = setupViewer(gl, positions, colors);

    if (canvasId === 'canvas1') {
        gl1 = gl;
        program1 = viewer.program;
        uni1 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
        pointCount1 = positions.length / 3;
        currentPositions = positions; // Save current positions globally
    } else if (canvasId === 'canvas2') {
        gl2 = gl;
        program2 = viewer.program;
        uni2 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
        pointCount2 = positions.length / 3;
    } else if (canvasId === 'canvas3') {
        gl3 = gl;
        program3 = viewer.program;
        uni3 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
        pointCount3 = positions.length / 3;
    }

    let index = (canvasId === 'canvas1') ? 1 : (canvasId === 'canvas2' ? 2 : 3);

    canvas.addEventListener('pointerenter', () => {
        if (index === 1) mouseInCanvas1 = true;
        if (index === 2) mouseInCanvas2 = true;
        if (index === 3) mouseInCanvas3 = true;
    });
    canvas.addEventListener('pointerleave', () => {
        if (index === 1) mouseInCanvas1 = false;
        if (index === 2) mouseInCanvas2 = false;
        if (index === 3) mouseInCanvas3 = false;
    });

    // Add pointer down/move/up for click+drag to orbit
    canvas.addEventListener('pointerdown', (e) => {
        const mouseInViewer = mouseInCanvas1 || mouseInCanvas2 || mouseInCanvas3;
        if (mouseInViewer) {
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        const mouseInViewer = mouseInCanvas1 || mouseInCanvas2 || mouseInCanvas3;
        if (isDragging && mouseInViewer) {
            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;
            cameraYaw += deltaX * 0.01;
            cameraPitch += deltaY * 0.01;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        isDragging = false;
        canvas.releasePointerCapture(e.pointerId);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Add event listener for the reset view link
    const resetViewLink = document.getElementById('reset-view');
    resetViewLink.addEventListener('click', () => {
        // Reset the view using the currently loaded point cloud
        resetView(currentPositions);
    });
});

// Wheel zoom 
window.addEventListener('wheel', (e) => {
    const mouseInViewer = mouseInCanvas1 || mouseInCanvas2 || mouseInCanvas3;
    if (mouseInViewer) {
        e.preventDefault();
        cameraZ += e.deltaY * 0.01;
    }
}, { passive: false });

// Keyboard controls
window.addEventListener("keydown", (e) => {
    const mouseInViewer = mouseInCanvas1 || mouseInCanvas2 || mouseInCanvas3;
    if (mouseInViewer) {
        e.preventDefault();
        if (e.key === "ArrowLeft") cameraX -= 0.05;
        if (e.key === "ArrowRight") cameraX += 0.05;
        if (e.key === "ArrowUp") cameraY += 0.05;
        if (e.key === "ArrowDown") cameraY -= 0.05;

        if (e.key === 'a') cameraYaw -= 0.01;
        if (e.key === 'd') cameraYaw += 0.01;
        if (e.key === 'w') cameraPitch -= 0.01;
        if (e.key === 's') cameraPitch += 0.01;
        if (e.key === 'q') cameraRoll -= 0.01;
        if (e.key === 'e') cameraRoll += 0.01;
    }
});

(async function init() {
    // Initial load with defaults
    await loadCombination();
    render();
})();