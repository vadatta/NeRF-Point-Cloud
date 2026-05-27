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

    const points = new THREE.Points(geometry, material);
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