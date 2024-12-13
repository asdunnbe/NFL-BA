const sequences = {
    "cecum_t1_a": [
        "point_clouds/gt/ascii-cecum_t1_a_under_review-500.ply",
        "point_clouds/pc/MonoGS_base_pps_cecum_t1_a_under_review_aligned.ply",
        "point_clouds/pc/MonoGS_our_pps_cecum_t1_a_under_review_aligned.ply"
    ],
    "cecum_t2_a": [
        "point_clouds/gt/ascii-cecum_t2_a_under_review-500.ply",
        "point_clouds/monoGS_base/ascii-base_rgbd_cecum_t2_a_under_review.ply",
        "point_clouds/monoGS_nflba/ascii-our_rgbd_cecum_t2_a_under_review.ply"
    ],
    "cecum_t3_a": [
        "point_clouds/gt/ascii-cecum_t3_a_under_review-500.ply",
        "point_clouds/monoGS_base/ascii-base_rgbd_cecum_t3_a_under_review.ply",
        "point_clouds/monoGS_nflba/ascii-our_rgbd_cecum_t3_a_under_review.ply"
    ]
};

const sequencesVideos = {
    "cecum_t1_a": "videos/cecum_t1_a_traj_3.mp4",
    "cecum_t2_a": "videos/cecum_t2_a_traj_3.mp4",
    "cecum_t3_a": "videos/cecum_t3_a_traj_3.mp4"
};

let gl1, gl2, gl3;
let program1, program2, program3;
let uni1, uni2, uni3;
let pointCount1 = 0, pointCount2 = 0, pointCount3 = 0;

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

// function loadPointCloud(url) {
//     return fetch(url).then(response => {
//         if (!response.ok) {
//             throw new Error(`Failed to load point cloud file: ${response.statusText}`);
//         }
//         return response.text();
//     }).then(text => {
//         const lines = text.trim().split('\n');
//         let vertexCount = 0;
//         let headerEndIndex = -1;

//         for (let i = 0; i < lines.length; i++) {
//             const line = lines[i].toLowerCase();
//             if (line.startsWith('element vertex')) {
//                 const parts = line.split(/\s+/);
//                 vertexCount = parseInt(parts[2], 10);
//             }
//             if (line === 'end_header') {
//                 headerEndIndex = i;
//                 break;
//             }
//         }

//         if (headerEndIndex === -1 || vertexCount === 0) {
//             console.error("Header parsing failed or no vertices specified.");
//             return { positions: new Float32Array([]), colors: new Float32Array([]) };
//         }

//         const positions = [];
//         const colors = [];

//         for (let i = headerEndIndex + 1; i <= headerEndIndex + vertexCount; i++) {
//             const parts = lines[i].split(/\s+/).map(Number);
//             if (parts.length >= 6 && !parts.some(isNaN)) {
//                 const [x, y, z, r, g, b] = parts;
//                 positions.push(x, y, z);
//                 colors.push(r / 255, g / 255, b / 255);
//             }
//         }

//         return {
//             positions: new Float32Array(positions),
//             colors: new Float32Array(colors)
//         };
//     });
// }
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
                // We always have x, y, z
                const x = parts[0], y = parts[1], z = parts[2];
                positions.push(x, y, z);

                if (parts.length >= 6 && !parts.slice(3,6).some(isNaN)) {
                    // If r, g, b are provided
                    const r = parts[3], g = parts[4], b = parts[5];
                    colors.push(r / 255, g / 255, b / 255);
                } else {
                    // No color provided, default to black
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
        gl_PointSize = 3.0;
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

// async function loadSequence(sequenceKey) {
//     const [gtPath, basePath, nflbaPath] = sequences[sequenceKey];
//     const [gtData, baseData, nflbaData] = await Promise.all([
//         loadPointCloud(gtPath),
//         loadPointCloud(basePath),
//         loadPointCloud(nflbaPath)
//     ]);

//     updateViewer('canvas1', gtData.positions, gtData.colors);
//     updateViewer('canvas2', baseData.positions, baseData.colors);
//     updateViewer('canvas3', nflbaData.positions, nflbaData.colors);

//     // Update the video source based on the sequence
//     const videoElement = document.getElementById('sequenceVideo');

//     videoElement.addEventListener('click', () => {
//         videoElement.loop = true;
//         videoElement.currentTime = 0;
//         videoElement.play();
//     });

//     videoElement.src = sequencesVideos[sequenceKey];
//     videoElement.load();
//     videoElement.play();
// }
async function loadSequence(sequenceKey) {
    const [gtPath, basePath, nflbaPath] = sequences[sequenceKey];
    const [gtData, baseData, nflbaData] = await Promise.all([
        loadPointCloud(gtPath),
        loadPointCloud(basePath),
        loadPointCloud(nflbaPath)
    ]);

    // Compute bounding box from gtData (or another set if preferred)
    if (gtData.positions.length > 0) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        const pos = gtData.positions;
        for (let i = 0; i < pos.length; i += 3) {
            const x = pos[i], y = pos[i+1], z = pos[i+2];
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

        // Translate the camera so that the model is centered
        cameraX = -centerX;
        cameraY = -centerY;
        cameraZ = -2.0; // This was our default

        // Compute the size of the bounding box
        const width = maxX - minX;
        const height = maxY - minY;
        const depth = maxZ - minZ;
        const maxDim = Math.max(width, height, depth);
        
        cameraZ = -(2.0 * maxDim);

    }

    updateViewer('canvas1', gtData.positions, gtData.colors);
    updateViewer('canvas2', baseData.positions, baseData.colors);
    updateViewer('canvas3', nflbaData.positions, nflbaData.colors);

    // Update the video source based on the sequence
    const videoElement = document.getElementById('sequenceVideo');

    videoElement.addEventListener('click', () => {
        videoElement.loop = true;
        videoElement.currentTime = 0;
        videoElement.play();
    });

    videoElement.src = sequencesVideos[sequenceKey];
    videoElement.load();
    videoElement.play();
}

// Global wheel event: decide if zoom affects camera or page scroll
window.addEventListener('wheel', (e) => {
    const mouseInViewer = mouseInCanvas1 || mouseInCanvas2 || mouseInCanvas3;
    if (mouseInViewer) {
        // Inside viewer: prevent page scroll and adjust zoom
        e.preventDefault();
        cameraZ += e.deltaY * 0.01;
    }
}, { passive: false });

// Global keydown event: if inside viewer, control camera; else let page handle
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

document.getElementById('sequenceSelect').addEventListener('change', async () => {
    const selectedSequence = document.getElementById('sequenceSelect').value;
    await loadSequence(selectedSequence);
});

(async function init() {
    await loadSequence('cecum_t1_a');
    render();
})();