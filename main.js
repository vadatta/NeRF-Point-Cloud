import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

// ----------------------------------------------------
// Basic scene setup
// ----------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);

camera.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// ----------------------------------------------------
// Orbit controls
// ----------------------------------------------------

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.target.set(0, 0, 0);
controls.update();

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------

const gridHelper = new THREE.GridHelper(8, 16, 0x666666, 0x333333);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(2);
scene.add(axesHelper);

// Optional: lights are not needed for PointsMaterial,
// but leaving ambient light is harmless.
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

// ----------------------------------------------------
// Density threshold slider
// ----------------------------------------------------

const densityPercentileSlider = document.getElementById(
  "density-percentile-slider"
);
const densityPercentileValue = document.getElementById(
  "density-percentile-value"
);

let densityPointGeometry = null;
let totalDensityPoints = 0;

function formatPercentile(percentile) {
  const suffix =
    percentile % 10 === 1 && percentile % 100 !== 11
      ? "st"
      : percentile % 10 === 2 && percentile % 100 !== 12
        ? "nd"
        : percentile % 10 === 3 && percentile % 100 !== 13
          ? "rd"
          : "th";

  return `${percentile}${suffix} percentile`;
}

function updateDensityThreshold() {
  if (!densityPercentileSlider || !densityPercentileValue) {
    return;
  }

  const percentile = Number(densityPercentileSlider.value);
  densityPercentileValue.textContent = formatPercentile(percentile);

  if (!densityPointGeometry) {
    return;
  }

  const visiblePointCount =
    percentile === 0
      ? 0
      : Math.floor((percentile / 100) * totalDensityPoints);

  densityPointGeometry.setDrawRange(0, visiblePointCount);
}

if (densityPercentileSlider) {
  densityPercentileSlider.addEventListener("input", updateDensityThreshold);
  updateDensityThreshold();
}

function inferDensityScoreFromColor(red, green, blue) {
  // The exported PLY encodes density with the inferno colormap. The red channel
  // increases monotonically across that map, so it gives us a stable sortable
  // proxy for density without changing the notebook export.
  return red + green * 0.001 + blue * 0.000001;
}

function buildSortedDensityGeometry(geometry) {
  const positionAttribute = geometry.attributes.position;
  const colorAttribute = geometry.attributes.color;
  const pointCount = positionAttribute.count;

  if (!colorAttribute) {
    return geometry;
  }

  const sortedIndices = Array.from({ length: pointCount }, (_, index) => index);
  sortedIndices.sort((leftIndex, rightIndex) => {
    const leftColorIndex = leftIndex * colorAttribute.itemSize;
    const rightColorIndex = rightIndex * colorAttribute.itemSize;

    const leftScore = inferDensityScoreFromColor(
      colorAttribute.array[leftColorIndex],
      colorAttribute.array[leftColorIndex + 1],
      colorAttribute.array[leftColorIndex + 2]
    );
    const rightScore = inferDensityScoreFromColor(
      colorAttribute.array[rightColorIndex],
      colorAttribute.array[rightColorIndex + 1],
      colorAttribute.array[rightColorIndex + 2]
    );

    return leftScore - rightScore;
  });

  const sortedGeometry = new THREE.BufferGeometry();
  const sortedPositions = new Float32Array(positionAttribute.array.length);
  const sortedColors = new Float32Array(colorAttribute.array.length);

  sortedIndices.forEach((sourceIndex, targetIndex) => {
    const sourcePositionIndex = sourceIndex * positionAttribute.itemSize;
    const targetPositionIndex = targetIndex * positionAttribute.itemSize;

    for (let offset = 0; offset < positionAttribute.itemSize; offset += 1) {
      sortedPositions[targetPositionIndex + offset] =
        positionAttribute.array[sourcePositionIndex + offset];
    }

    const sourceColorIndex = sourceIndex * colorAttribute.itemSize;
    const targetColorIndex = targetIndex * colorAttribute.itemSize;

    for (let offset = 0; offset < colorAttribute.itemSize; offset += 1) {
      sortedColors[targetColorIndex + offset] =
        colorAttribute.array[sourceColorIndex + offset];
    }
  });

  sortedGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(sortedPositions, positionAttribute.itemSize)
  );
  sortedGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(sortedColors, colorAttribute.itemSize)
  );
  sortedGeometry.boundingBox = geometry.boundingBox.clone();
  sortedGeometry.boundingSphere = geometry.boundingSphere?.clone() ?? null;

  return sortedGeometry;
}

// ----------------------------------------------------
// Load point cloud
// ----------------------------------------------------

const loader = new PLYLoader();

loader.load(
  "./models/nerf_density_points.ply",

  function (geometry) {
    console.log("Loaded PLY geometry:", geometry);
    console.log("Position attribute:", geometry.attributes.position);
    console.log("Color attribute:", geometry.attributes.color);

    if (!geometry.attributes.position) {
      console.error("No position attribute found. The PLY may be invalid.");
      return;
    }

    if (!geometry.attributes.color) {
      console.warn(
        "No color attribute found. The point cloud will render white unless you assign colors."
      );
    }

    // Compute bounds before centering
    geometry.computeBoundingBox();

    const box = geometry.boundingBox;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();

    box.getCenter(center);
    box.getSize(size);

    console.log("Original bounding box:", box);
    console.log("Original center:", center);
    console.log("Original size:", size);

    // Center geometry around origin so OrbitControls works naturally.
    geometry.center();

    // Recompute bounds after centering.
    geometry.computeBoundingBox();
    const centeredBox = geometry.boundingBox;
    const centeredSize = new THREE.Vector3();
    centeredBox.getSize(centeredSize);

    const maxDim = Math.max(centeredSize.x, centeredSize.y, centeredSize.z);

    // If maxDim is weirdly small/large, this helps normalize view scale.
    const scale = maxDim > 0 ? 4.0 / maxDim : 1.0;

    const material = new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });

    // If your PLY has no colors, uncomment this to test visibility:
    // material.vertexColors = false;
    // material.color = new THREE.Color(0xff0000);

    const renderGeometry = buildSortedDensityGeometry(geometry);
    densityPointGeometry = renderGeometry;
    totalDensityPoints = renderGeometry.attributes.position.count;
    updateDensityThreshold();

    const points = new THREE.Points(renderGeometry, material);
    points.scale.setScalar(scale);

    scene.add(points);

    // Put camera at a good distance.
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    controls.target.set(0, 0, 0);
    controls.update();

    console.log("Point cloud added.");
    console.log("Point count:", geometry.attributes.position.count);
  },

  function (xhr) {
    if (xhr.total > 0) {
      const percent = (xhr.loaded / xhr.total) * 100;
      console.log(`${percent.toFixed(1)}% loaded`);
    } else {
      console.log(`${xhr.loaded} bytes loaded`);
    }
  },

  function (error) {
    console.error("Error loading PLY:", error);
  }
);

// ----------------------------------------------------
// Animation loop
// ----------------------------------------------------

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  renderer.render(scene, camera);
}

animate();

// ----------------------------------------------------
// Resize handling
// ----------------------------------------------------

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});
