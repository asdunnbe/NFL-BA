// === Global Variables for Main Section ===
let gl1, gl2, gl3;
let program1, program2, program3;
let uni1, uni2, uni3;
let pointCount1 = 0, pointCount2 = 0, pointCount3 = 0;
let currentPositions = null;

// Global camera state for the main section (shared by all three main viewers)
let cameraYaw = 0, cameraPitch = 0, cameraRoll = 0;
let cameraX = 0, cameraY = 0, cameraZ = -2.0;

// Mouse tracking for main section canvases
let mouseInCanvas1 = false, mouseInCanvas2 = false, mouseInCanvas3 = false;
let isDragging = false, lastMouseX = 0, lastMouseY = 0;

// Global state for main section controls
let pipeline = "MonoGS", depthType = "ppsnet_depth", sequence = "trans_t2_a";

// === Global Variables for Extra Sections ===
// Each extra viewer gets its own independent camera state.
let cameraExtraA1 = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: -2.0 };
let cameraExtraA2 = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: -2.0 };
let cameraExtraB1 = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: -2.0 };
let cameraExtraB2 = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: -2.0 };

// WebGL globals for Extra Section A
let glE1, glE2;
let programE1, programE2;
let uniE1, uniE2;
let pointCountE1 = 0, pointCountE2 = 0;

// WebGL globals for Extra Section B
let glF1, glF2;
let programF1, programF2;
let uniF1, uniF2;
let pointCountF1 = 0, pointCountF2 = 0;

// Store loaded point cloud positions for reset purposes
let extraA1Positions, extraA2Positions;
let extraB1Positions, extraB2Positions;

// === Helper Functions ===

// Offset point cloud positions by (dx, dy, dz)
function offsetPositions(positions, dx, dy, dz) {
  let newPositions = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    newPositions[i]   = positions[i]   + dx;
    newPositions[i+1] = positions[i+1] + dy;
    newPositions[i+2] = positions[i+2] + dz;
  }
  return newPositions;
}

function getPaths(pipeline, depthType, sequence) {
  // All scenarios still use the same GT file as before
  const gtPath = `./point_clouds/gt/ascii-${sequence}_under_review-500.ply`;

  // Determine the pipeline folder name
  let baseDir = (pipeline === "MonoGS") ? "MonoGS" : "EndoGSLAM";

  // For point clouds, replace "oracle" with "gt"
  let pcDepthSuffix =
      (depthType === "dpt_depth")    ? "da-h" :
      (depthType === "ppsnet_depth") ? "pps"  :
      /* otherwise */                  "gt";

  // For the video path, keep using "oracle" if depthType is not dpt_depth or ppsnet_depth
  let videoDepthSuffix =
      (depthType === "dpt_depth")    ? "da-h" :
      (depthType === "ppsnet_depth") ? "pps"  :
      /* otherwise */                  "oracle";

  // Build point cloud paths
  const basePath = `./point_clouds/pc/${baseDir}_base_${pcDepthSuffix}_${sequence}_under_review_colored.ply`;
  const nflbaPath = `./point_clouds/pc/${baseDir}_OUR_${pcDepthSuffix}_${sequence}_under_review_colored.ply`;

  // Build video path using the videoDepthSuffix
  const videoPath = `./videos-encoded/${baseDir}/${baseDir}_${videoDepthSuffix}_${sequence}_traj_3.mp4`;

  return { gtPath, basePath, nflbaPath, videoPath };
}

// Recenter the global main camera based on point cloud bounds
function recenterCamera(positions) {
  if (positions.length === 0) return;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i+1], z = positions[i+2];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  cameraX = -centerX;
  cameraY = -centerY;
  cameraZ = -(1.5 * Math.max(maxX - minX, maxY - minY, maxZ - minZ));
}

// Recenter an extra viewer’s camera using its point cloud bounds
function recenterCameraFor(camera, positions) {
  if (positions.length === 0) return;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i+1], z = positions[i+2];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  camera.x = -((minX + maxX) / 2);
  camera.y = -((minY + maxY) / 2);
  camera.z = -(1.5 * Math.max(maxX - minX, maxY - minY, maxZ - minZ));
}

// Reset an extra viewer’s camera (set rotations to zero and recenter)
function resetExtraCamera(camera, positions) {
  camera.yaw = 0;
  camera.pitch = 0;
  camera.roll = 0;
  recenterCameraFor(camera, positions);
}

// Reset the main section view (global camera)
function resetView(positions) {
  cameraYaw = 0;
  cameraPitch = 0;
  cameraRoll = 0;
  if (positions) {
    recenterCamera(positions);
  }
  render();
}

// Load the main section data (three viewers and the video)
async function loadCombination() {
  const { gtPath, basePath, nflbaPath, videoPath } = getPaths(pipeline, depthType, sequence);
  const videoElement = document.getElementById('sequenceVideo');
  videoElement.src = videoPath;
  videoElement.loop = true;
  videoElement.muted = true;
  videoElement.autoplay = true;
  videoElement.load();
  videoElement.play().catch(err => {
    console.warn("Autoplay prevented in loadCombination:", err);
  });

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

// Load a point cloud file and parse positions/colors
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
        headerEndIndex = i;
        break;
      }
    }
    if (vertexCount === 0 || headerEndIndex === -1) {
      console.error("No vertices specified or header parsing failed.");
      return { positions: new Float32Array([]), colors: new Float32Array([]) };
    }
    const positions = [];
    const colors = [];
    for (let i = headerEndIndex + 1; i <= headerEndIndex + vertexCount; i++) {
      const parts = lines[i].split(/\s+/).map(Number);
      if (parts.length >= 3 && !parts.slice(0, 3).some(isNaN)) {
        positions.push(parts[0], parts[1], parts[2]);
        if (parts.length >= 6 && !parts.slice(3, 6).some(isNaN)) {
          colors.push(parts[3] / 255, parts[4] / 255, parts[5] / 255);
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

// === WebGL Helper Functions ===

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
    f/aspect, 0,   0,                             0,
    0,        f,   0,                             0,
    0,        0,  (near+far)*rangeInv,           -1,
    0,        0,  (2*near*far)*rangeInv,          0
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

// Construct camera matrix for main section using global camera variables
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

// Construct camera matrix from a given camera object (for extra viewers)
function constructCameraMatrixFrom(camera) {
  const cosP = Math.cos(camera.pitch), sinP = Math.sin(camera.pitch);
  const cosY = Math.cos(camera.yaw), sinY = Math.sin(camera.yaw);
  const cosR = Math.cos(camera.roll), sinR = Math.sin(camera.roll);
  const rotMatrix = new Float32Array([
    cosY*cosR, sinP*sinY*cosR - cosP*sinR, cosP*sinY*cosR + sinP*sinR, 0,
    cosY*sinR, sinP*sinY*sinR + cosP*cosR, cosP*sinY*sinR - sinP*cosR, 0,
    -sinY,     sinP*cosY,                 cosP*cosY,                 0,
    0,0,0,1
  ]);
  const transMatrix = translate(identityMatrix(), camera.x, camera.y, camera.z);
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

// Set up a viewer (creates shaders, buffers, etc.)
function setupViewer(gl, positions, colors) {
  const vsSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform mat4 uMVMatrix;
    uniform mat4 uPMatrix;
    varying vec3 vColor;
    void main(void) {
      gl_PointSize = 4.0;
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

// === Main Section Viewer Setup ===
function updateViewer(canvasId, positions, colors) {
  const canvas = document.getElementById(canvasId);
  const gl = initGL(canvas);
  const viewer = setupViewer(gl, positions, colors);
  if (canvasId === 'canvas1') {
    gl1 = gl;
    program1 = viewer.program;
    uni1 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
    pointCount1 = positions.length / 3;
    canvas.addEventListener('pointerenter', () => { mouseInCanvas1 = true; });
    canvas.addEventListener('pointerleave', () => { mouseInCanvas1 = false; });
  } else if (canvasId === 'canvas2') {
    gl2 = gl;
    program2 = viewer.program;
    uni2 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
    pointCount2 = positions.length / 3;
    canvas.addEventListener('pointerenter', () => { mouseInCanvas2 = true; });
    canvas.addEventListener('pointerleave', () => { mouseInCanvas2 = false; });
  } else if (canvasId === 'canvas3') {
    gl3 = gl;
    program3 = viewer.program;
    uni3 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
    pointCount3 = positions.length / 3;
    canvas.addEventListener('pointerenter', () => { mouseInCanvas3 = true; });
    canvas.addEventListener('pointerleave', () => { mouseInCanvas3 = false; });
  }
  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (isDragging) {
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

// === Extra Section Viewer Setup ===
// For extra viewers, attach independent events including key events.
function addExtraViewerEvents(canvas, camera) {
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMouseX;
      const deltaY = e.clientY - lastMouseY;
      camera.yaw += deltaX * 0.01;
      camera.pitch += deltaY * 0.01;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.z += e.deltaY * 0.01;
  }, { passive: false });
  // Make canvas focusable for key events
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    switch(e.key) {
      case "ArrowLeft": camera.x -= 0.05; break;
      case "ArrowRight": camera.x += 0.05; break;
      case "ArrowUp": camera.y += 0.05; break;
      case "ArrowDown": camera.y -= 0.05; break;
      case "a": camera.yaw -= 0.01; break;
      case "d": camera.yaw += 0.01; break;
      case "w": camera.pitch -= 0.01; break;
      case "s": camera.pitch += 0.01; break;
      case "q": camera.roll -= 0.01; break;
      case "e": camera.roll += 0.01; break;
    }
  });
}

document.querySelectorAll('.pipeline-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		const selectedPipeline = btn.dataset.pipeline;

		// Hide all sequence groups
		document.querySelectorAll('.sequence-group').forEach(group => {
			group.style.display = 'none';
		});

		// Show only the group matching the selected pipeline
		const matchedGroup = document.querySelector(`.sequence-group[data-pipeline="${selectedPipeline}"]`);
		if (matchedGroup) matchedGroup.style.display = 'grid';
	});
});

let indoorSequence = 'pool'; 

function loadIndoorVideo(seq) {
  const videoEl = document.getElementById('wildVideo');
  const path   = `./videos-encoded/wild/WILD_phone_${seq}_sidebyside.mp4`;
  videoEl.pause();
  videoEl.src  = path;
  videoEl.autoplay = true;
  videoEl.load();
  videoEl.play().catch(err => {
    console.warn("Indoor video autoplay prevented:", err);
  });
}

const indoorBtns = document.querySelectorAll('.indoor-seq-btn');
indoorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    indoorBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    indoorSequence = btn.dataset.indoorSeq;
    loadIndoorVideo(indoorSequence);
  });
});

function updateExtraViewerA(canvasId, positions, colors, camera) {
  const canvas = document.getElementById(canvasId);
  const gl = initGL(canvas);
  const viewer = setupViewer(gl, positions, colors);
  addExtraViewerEvents(canvas, camera);
  if (canvasId === 'extraCanvas1A') {
    glE1 = gl;
    programE1 = viewer.program;
    uniE1 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
    pointCountE1 = positions.length / 3;
  } else if (canvasId === 'extraCanvas2A') {
    glE2 = gl;
    programE2 = viewer.program;
    uniE2 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
    pointCountE2 = positions.length / 3;
  }
}


function updateExtraViewerB(canvasId, positions, colors, camera) {
  const canvas = document.getElementById(canvasId);
  const gl = initGL(canvas);
  const viewer = setupViewer(gl, positions, colors);
  addExtraViewerEvents(canvas, camera);
  if (canvasId === 'extraCanvas1B') {
    glF1 = gl;
    programF1 = viewer.program;
    uniF1 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
    pointCountF1 = positions.length / 3;
  } else if (canvasId === 'extraCanvas2B') {
    glF2 = gl;
    programF2 = viewer.program;
    uniF2 = { mvMatrix: viewer.uMVMatrix, pMatrix: viewer.uPMatrix };
    pointCountF2 = positions.length / 3;
  }
}

// === Render Loop ===
function render() {
  // Render Main Section Viewers
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
    gl1.useProgram(program1);
    gl1.viewport(0, 0, canvas1.width, canvas1.height);
    gl1.clear(gl1.COLOR_BUFFER_BIT | gl1.DEPTH_BUFFER_BIT);
    gl1.uniformMatrix4fv(uni1.pMatrix, false, pMatrix1);
    gl1.uniformMatrix4fv(uni1.mvMatrix, false, mvMatrix);
    if (pointCount1) gl1.drawArrays(gl1.POINTS, 0, pointCount1);
    gl2.useProgram(program2);
    gl2.viewport(0, 0, canvas2.width, canvas2.height);
    gl2.clear(gl2.COLOR_BUFFER_BIT | gl2.DEPTH_BUFFER_BIT);
    gl2.uniformMatrix4fv(uni2.pMatrix, false, pMatrix2);
    gl2.uniformMatrix4fv(uni2.mvMatrix, false, mvMatrix);
    if (pointCount2) gl2.drawArrays(gl2.POINTS, 0, pointCount2);
    gl3.useProgram(program3);
    gl3.viewport(0, 0, canvas3.width, canvas3.height);
    gl3.clear(gl3.COLOR_BUFFER_BIT | gl3.DEPTH_BUFFER_BIT);
    gl3.uniformMatrix4fv(uni3.pMatrix, false, pMatrix3);
    gl3.uniformMatrix4fv(uni3.mvMatrix, false, mvMatrix);
    if (pointCount3) gl3.drawArrays(gl3.POINTS, 0, pointCount3);
  }
  
  // Render Extra Section A Viewers
  if (glE1 && glE2) {
    const canvasE1 = document.getElementById('extraCanvas1A');
    const canvasE2 = document.getElementById('extraCanvas2A');
    resizeCanvasToDisplaySize(canvasE1);
    resizeCanvasToDisplaySize(canvasE2);
    const aspectE1 = canvasE1.width / canvasE1.height;
    const aspectE2 = canvasE2.width / canvasE2.height;
    const pMatrixE1 = perspectiveMatrix(45 * Math.PI / 180, aspectE1, 0.1, 100.0);
    const pMatrixE2 = perspectiveMatrix(45 * Math.PI / 180, aspectE2, 0.1, 100.0);
    const mvMatrixE1 = constructCameraMatrixFrom(cameraExtraA1);
    const mvMatrixE2 = constructCameraMatrixFrom(cameraExtraA2);
    glE1.useProgram(programE1);
    glE1.viewport(0, 0, canvasE1.width, canvasE1.height);
    glE1.clear(glE1.COLOR_BUFFER_BIT | glE1.DEPTH_BUFFER_BIT);
    glE1.uniformMatrix4fv(uniE1.pMatrix, false, pMatrixE1);
    glE1.uniformMatrix4fv(uniE1.mvMatrix, false, mvMatrixE1);
    if (pointCountE1) glE1.drawArrays(glE1.POINTS, 0, pointCountE1);
    glE2.useProgram(programE2);
    glE2.viewport(0, 0, canvasE2.width, canvasE2.height);
    glE2.clear(glE2.COLOR_BUFFER_BIT | glE2.DEPTH_BUFFER_BIT);
    glE2.uniformMatrix4fv(uniE2.pMatrix, false, pMatrixE2);
    glE2.uniformMatrix4fv(uniE2.mvMatrix, false, mvMatrixE2);
    if (pointCountE2) glE2.drawArrays(glE2.POINTS, 0, pointCountE2);
  }
  
  // Render Extra Section B Viewers
  if (glF1 && glF2) {
    const canvasF1 = document.getElementById('extraCanvas1B');
    const canvasF2 = document.getElementById('extraCanvas2B');
    resizeCanvasToDisplaySize(canvasF1);
    resizeCanvasToDisplaySize(canvasF2);
    const aspectF1 = canvasF1.width / canvasF1.height;
    const aspectF2 = canvasF2.width / canvasF2.height;
    const pMatrixF1 = perspectiveMatrix(45 * Math.PI / 180, aspectF1, 0.1, 100.0);
    const pMatrixF2 = perspectiveMatrix(45 * Math.PI / 180, aspectF2, 0.1, 100.0);
    const mvMatrixF1 = constructCameraMatrixFrom(cameraExtraB1);
    const mvMatrixF2 = constructCameraMatrixFrom(cameraExtraB2);
    glF1.useProgram(programF1);
    glF1.viewport(0, 0, canvasF1.width, canvasF1.height);
    glF1.clear(glF1.COLOR_BUFFER_BIT | glF1.DEPTH_BUFFER_BIT);
    glF1.uniformMatrix4fv(uniF1.pMatrix, false, pMatrixF1);
    glF1.uniformMatrix4fv(uniF1.mvMatrix, false, mvMatrixF1);
    if (pointCountF1) glF1.drawArrays(glF1.POINTS, 0, pointCountF1);
    glF2.useProgram(programF2);
    glF2.viewport(0, 0, canvasF2.width, canvasF2.height);
    glF2.clear(glF2.COLOR_BUFFER_BIT | glF2.DEPTH_BUFFER_BIT);
    glF2.uniformMatrix4fv(uniF2.pMatrix, false, pMatrixF2);
    glF2.uniformMatrix4fv(uniF2.mvMatrix, false, mvMatrixF2);
    if (pointCountF2) glF2.drawArrays(glF2.POINTS, 0, pointCountF2);
  }
  
  requestAnimationFrame(render);
}

// === Global Event Listeners for Main Section ===
window.addEventListener('wheel', (e) => {
  if (mouseInCanvas1 || mouseInCanvas2 || mouseInCanvas3) {
    e.preventDefault();
    cameraZ += e.deltaY * 0.01;
  }
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (mouseInCanvas1 || mouseInCanvas2 || mouseInCanvas3) {
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
}, { passive: false });

// === Extra Section Loading Functions with Absolute Paths ===

// Visual A: Video and point clouds for Visual A
async function loadExtraSectionA() {
  // Absolute paths for Visual A
  const videoPath = "./videos-encoded/real/color_video_03_15_skip.mp4";
  const leftPointCloudPath = "./point_clouds/seq3_base.ply";
  const rightPointCloudPath = "./point_clouds/seq3_v3.ply";
  
  const constantVideoA = document.getElementById('constantVideoA');
  constantVideoA.src = videoPath;
  constantVideoA.loop = true;
  constantVideoA.muted = true;
  // constantVideoA.autoplay = true;
  constantVideoA.load();
  constantVideoA.play().catch(err => {
    console.warn("Autoplay prevented in loadExtraSectionA:", err);
  });
  
  const leftData = await loadPointCloud(leftPointCloudPath);
  const rightData = await loadPointCloud(rightPointCloudPath);
  
  extraA1Positions = leftData.positions;
  extraA2Positions = rightData.positions;
  
  recenterCameraFor(cameraExtraA1, leftData.positions);
  recenterCameraFor(cameraExtraA2, rightData.positions);
  
  updateExtraViewerA('extraCanvas1A', leftData.positions, leftData.colors, cameraExtraA1);
  updateExtraViewerA('extraCanvas2A', rightData.positions, rightData.colors, cameraExtraA2);
}

// Visual B: Video and point clouds for Visual B
async function loadExtraSectionB() {
  const videoPath = "./videos-encoded/real/color_video_04_15_skip.mp4";
  const leftPointCloudPath = "./point_clouds/real_base.ply";
  const rightPointCloudPath = "./point_clouds/seq4_ours_v3.ply";
  
  const constantVideoB = document.getElementById('constantVideoB');
  constantVideoB.src = videoPath;
  constantVideoB.loop = true;
  constantVideoB.muted = true;
  constantVideoB.autoplay = true;
  constantVideoB.load();
  constantVideoB.play().catch(err => {
    console.warn("Autoplay prevented in loadExtraSectionB:", err);
  });
  
  const leftData = await loadPointCloud(leftPointCloudPath);
  const rightData = await loadPointCloud(rightPointCloudPath);
  
  extraB1Positions = leftData.positions;
  extraB2Positions = rightData.positions;
  
  recenterCameraFor(cameraExtraB1, leftData.positions);
  recenterCameraFor(cameraExtraB2, rightData.positions);
  
  updateExtraViewerB('extraCanvas1B', leftData.positions, leftData.colors, cameraExtraB1);
  updateExtraViewerB('extraCanvas2B', rightData.positions, rightData.colors, cameraExtraB2);
}

// === Initialization on DOMContentLoaded ===
document.addEventListener('DOMContentLoaded', () => {
  // Main section reset view button
  const resetViewLink = document.getElementById('reset-view');
  resetViewLink.addEventListener('click', () => { resetView(currentPositions); });

  // Set up main section control buttons
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
    depthBtns.forEach(btn => { btn.style.display = 'inline-block'; });
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

  // Add reset button event listeners for extra viewers
  document.getElementById('resetExtraA1').addEventListener('click', () => {
    resetExtraCamera(cameraExtraA1, extraA1Positions);
  });
  document.getElementById('resetExtraA2').addEventListener('click', () => {
    resetExtraCamera(cameraExtraA2, extraA2Positions);
  });

  document.getElementById('resetExtraB1').addEventListener('click', () => {
    resetExtraCamera(cameraExtraB1, extraB1Positions);
  });
  document.getElementById('resetExtraB2').addEventListener('click', () => {
    resetExtraCamera(cameraExtraB2, extraB2Positions);
  });

  // Initial load of main section and extra sections
  loadCombination();
  loadExtraSectionA();
  loadExtraSectionB();
  render();
});