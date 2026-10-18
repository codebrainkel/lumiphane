import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshGeometryData, LithophaneSettings } from '../types/lithophane';
import { WHITE_PLA_EXTINCTION_PER_MM } from '../constants/optics';
import { RotateCcw, Maximize2, Layers } from 'lucide-react';

interface Viewport3DProps {
  geometryData: MeshGeometryData | null;
  settings: LithophaneSettings;
  isGenerating: boolean;
  /** While the export sheet is open, keep the last frame and stop the animation loop. */
  renderPaused?: boolean;
}

// Fixed optical properties for calibrated translucent PLA
const WARM_LIGHT_COLOR = 0xffdfa8; // Warm 2700K backlight
const MATERIAL_BASE_COLOR = 0xf7f4ec; // Warm Ivory PLA base color
const SCATTER_STRENGTH = 0.8;
const BACKLIGHT_INTENSITY = 1.56 * 1.25;
const VIEW_EDGE_PAD = 16;
const ROOM_LIGHT_INTENSITY = 0.22;

export const Viewport3D: React.FC<Viewport3DProps> = ({
  geometryData,
  settings,
  isGenerating,
  renderPaused = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const bedPlinthRef = useRef<THREE.Group | null>(null);
  const shaderMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const pointLightRef = useRef<THREE.PointLight | null>(null);
  const geometryDataRef = useRef(geometryData);
  const activeViewRef = useRef<'front' | 'iso'>('front');
  const autoRotateRef = useRef(false);
  const placeViewRef = useRef<(geom: MeshGeometryData, view: 'front' | 'iso') => void>(() => {});
  const renderPausedRef = useRef(renderPaused);
  renderPausedRef.current = renderPaused;

  const [showBed, setShowBed] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'front' | 'iso'>('front');

  geometryDataRef.current = geometryData;
  activeViewRef.current = activeView;
  autoRotateRef.current = autoRotate;

  // 1. Initialize Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090b0f);
    sceneRef.current = scene;

    // Camera: Z is vertical print axis (camera.up = (0, 0, 1))
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.up.set(0, 0, 1);
    camera.position.set(0, 160, 80);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 600;
    controls.minDistance = 20;
    controls.target.set(0, 0, 45);
    controlsRef.current = controls;

    // Build Plate (340x340 mm at Z = 0, supports large format 3D prints up to 300mm)
    const bedGroup = new THREE.Group();
    const grid = new THREE.GridHelper(340, 68, 0x242d3d, 0x141822);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(0, 0, 0);
    bedGroup.add(grid);
    gridHelperRef.current = grid;
    scene.add(bedGroup);
    bedPlinthRef.current = bedGroup;

    // Point Light behind/inside lithophane
    const pLight = new THREE.PointLight(WARM_LIGHT_COLOR, BACKLIGHT_INTENSITY, 600, 1.1);
    pLight.position.set(0, -35, 45);
    scene.add(pLight);
    pointLightRef.current = pLight;

    // Resize Observer
    let framedW = 0;
    let framedH = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = newW / newH;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(newW, newH);
          // setSize clears the drawing buffer. One frame keeps the picture while the loop is paused.
          if (renderPausedRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
          if (Math.abs(newW - framedW) > 1 || Math.abs(newH - framedH) > 1) {
            framedW = newW;
            framedH = newH;
            const geom = geometryDataRef.current;
            if (geom) placeViewRef.current(geom, activeViewRef.current);
          }
        }
      }
    });
    resizeObserver.observe(container);

    // Context loss handlers
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost');
    };
    const handleContextRestored = () => {
      console.info('WebGL context restored');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };
    const canvasEl = renderer.domElement;
    canvasEl.addEventListener('webglcontextlost', handleContextLost, false);
    canvasEl.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      resizeObserver.disconnect();
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);
      canvasEl.removeEventListener('webglcontextrestored', handleContextRestored);
      renderer.dispose();
      if (container.contains(canvasEl)) {
        container.removeChild(canvasEl);
      }
    };
  }, []);

  // Animation loop. Pausing it drops the requestAnimationFrame callback entirely so a
  // main-thread export is not queued behind a full-mesh render. The canvas keeps the
  // last frame (nothing clears it while the loop is stopped).
  useEffect(() => {
    if (renderPaused) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (controlsRef.current) {
        if (autoRotateRef.current && meshRef.current) {
          meshRef.current.rotation.z += 0.005;
        }
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    };
    animate();
    return () => cancelAnimationFrame(animId);
  }, [renderPaused]);

  // 2. Physical Translucent Lithophane Shader
  const createLithophaneShaderMaterial = useCallback(
    (geom: MeshGeometryData): THREE.ShaderMaterial => {
      const effectiveLightColor = new THREE.Color(WARM_LIGHT_COLOR);
      const effectiveBaseColor = new THREE.Color(MATERIAL_BASE_COLOR);

      const isEnclosed =
        settings.shape === 'cylinder' || settings.shape === 'cube' || settings.shape === 'hexagon';
      const lightY = isEnclosed ? 0 : -35;

      const cols = geom.gridResolution.cols;
      const rows = geom.gridResolution.rows;
      const texMinTh = 0.2;
      const texMaxTh = Math.max(5.0, settings.maxThickness + 2.0, settings.frameThickness + 1.0);
      const hasThicknessTex = Boolean(
        geom.thicknessGrid && geom.thicknessGrid.length >= cols * rows && cols > 1 && rows > 1
      );

      let thicknessTex: THREE.DataTexture;
      if (hasThicknessTex && geom.thicknessGrid) {
        const rgba = new Uint8Array(cols * rows * 4);
        const grid = geom.thicknessGrid;
        const span = Math.max(0.1, texMaxTh - texMinTh);
        for (let i = 0; i < cols * rows; i++) {
          const norm = Math.max(0, Math.min(1, (grid[i] - texMinTh) / span));
          const val16 = Math.round(norm * 65535);
          const idx = i * 4;
          rgba[idx] = (val16 >> 8) & 0xff;
          rgba[idx + 1] = val16 & 0xff;
          rgba[idx + 2] = 0;
          rgba[idx + 3] = 255;
        }
        thicknessTex = new THREE.DataTexture(rgba, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
        thicknessTex.wrapS = isEnclosed ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        thicknessTex.wrapT = THREE.ClampToEdgeWrapping;
        thicknessTex.magFilter = THREE.LinearFilter;
        thicknessTex.minFilter = THREE.LinearFilter;
        thicknessTex.flipY = false;
        thicknessTex.needsUpdate = true;
      } else {
        thicknessTex = new THREE.DataTexture(new Uint8Array([128, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
        thicknessTex.needsUpdate = true;
      }

      const photoZMin =
        settings.orientation === 'flat' && !isEnclosed
          ? -1e5
          : geom.boundingBox.max[2] - settings.height + 0.05;

      const uniforms = {
        uBacklightIntensity: { value: BACKLIGHT_INTENSITY },
        uBacklightColor: { value: effectiveLightColor },
        uBacklightPos: { value: new THREE.Vector3(0, lightY, 45) },
        uRoomLightIntensity: { value: ROOM_LIGHT_INTENSITY },
        uRoomLightColor: { value: new THREE.Color(0xdce7f5) },
        uMaterialBaseColor: { value: effectiveBaseColor },
        uTranslucencyExtinction: { value: WHITE_PLA_EXTINCTION_PER_MM }, // shared with the mesh, per mm
        uScatteringStrength: { value: SCATTER_STRENGTH },
        uMinThickness: { value: Math.max(0.4, settings.minThickness) },
        uMaxThickness: { value: Math.max(1.0, settings.maxThickness) },
        uIsCylinder: { value: isEnclosed },
        uThicknessTex: { value: thicknessTex },
        uHasThicknessTex: { value: hasThicknessTex },
        uTexMinTh: { value: texMinTh },
        uTexMaxTh: { value: texMaxTh },
        uPhotoZMin: { value: photoZMin },
      };

      const vertexShader = `
      attribute float thickness;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying float vThickness;

      void main() {
        vThickness = thickness;
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

      const fragmentShader = `
      uniform float uBacklightIntensity;
      uniform vec3 uBacklightColor;
      uniform vec3 uBacklightPos;
      uniform float uRoomLightIntensity;
      uniform vec3 uRoomLightColor;
      uniform vec3 uMaterialBaseColor;
      uniform float uTranslucencyExtinction;
      uniform float uScatteringStrength;
      uniform float uMinThickness;
      uniform float uMaxThickness;
      uniform bool uIsCylinder;
      uniform sampler2D uThicknessTex;
      uniform bool uHasThicknessTex;
      uniform float uTexMinTh;
      uniform float uTexMaxTh;
      uniform float uPhotoZMin;

      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying float vThickness;

      // ACES Filmic Tone Mapping
      vec3 acesFilm(vec3 x) {
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPosition);

        bool isFront = uIsCylinder ? (dot(N.xy, vWorldPosition.xy) >= 0.0) : (N.y >= -0.15);
        float effectiveRoomLight = uBacklightIntensity > 0.0 ? uRoomLightIntensity : max(uRoomLightIntensity, 0.55);

        vec3 finalColor;

        if (isFront) {
          vec3 toLight = uBacklightPos - vWorldPosition;
          float distToLight = length(toLight);
          vec3 lightDir = normalize(toLight);

          float backlightReach = 1.0 / (1.0 + 0.007 * distToLight + 0.00018 * distToLight * distToLight);
          float cosInc = uIsCylinder ? clamp(dot(-lightDir, N), 0.25, 1.0) : clamp(dot(-lightDir, vec3(0.0, 1.0, 0.0)), 0.25, 1.0);
          backlightReach *= cosInc;

          // Sample the full-resolution thickness grid in the photo and border so merged
          // smooth walls still render every pixel of the backlit photograph.
          float sampledTh = vThickness;
          if (uHasThicknessTex && vWorldPosition.z >= uPhotoZMin && abs(N.z) < 0.75) {
            vec4 texel = texture2D(uThicknessTex, vec2(vUv.x, 1.0 - vUv.y));
            float norm16 = (texel.r * 255.0 * 256.0 + texel.g * 255.0) / 65535.0;
            sampledTh = uTexMinTh + norm16 * (uTexMaxTh - uTexMinTh);
          }

          // Beer-Lambert physical absorption: T = exp( - mu * thickness )
          float th = max(0.25, sampledTh);
          float transmittance = exp(-uTranslucencyExtinction * th);

          // Warm chromatic scattering in translucent PLA
          float normTh = clamp((th - uMinThickness) / max(0.1, uMaxThickness - uMinThickness), 0.0, 1.0);
          vec3 scatterShift = mix(vec3(1.0), vec3(1.0, 0.86, 0.68), normTh * uScatteringStrength);

          float forwardScatter = pow(max(0.0, dot(V, -lightDir)), 2.2) * 0.16;
          vec3 transmitted = uBacklightColor * scatterShift * (transmittance * 2.8 + forwardScatter) * backlightReach * uBacklightIntensity;

          vec3 roomKeyDir = normalize(vec3(0.35, 0.82, 0.45));
          float roomDiff = max(0.0, dot(N, roomKeyDir));
          vec3 roomHalf = normalize(roomKeyDir + V);
          float roomSpec = pow(max(0.0, dot(N, roomHalf)), 28.0) * 0.24;

          vec3 frontRoomLight = (uMaterialBaseColor * (uRoomLightColor * (0.24 + roomDiff * 0.85)) + vec3(roomSpec)) * effectiveRoomLight;
          finalColor = transmitted + frontRoomLight;
        } else {
          vec3 toLight = uBacklightPos - vWorldPosition;
          float distToLight = length(toLight);
          vec3 lightDir = normalize(toLight);

          float backDiff = max(0.0, dot(N, lightDir));
          float distFalloff = 1.0 / (1.0 + 0.008 * distToLight + 0.0002 * distToLight * distToLight);

          vec3 roomKeyDir = normalize(vec3(0.35, 0.82, 0.45));
          float innerRoomDiff = max(0.0, dot(N, roomKeyDir));
          vec3 innerHalf = normalize(lightDir + V);
          float innerSpec = pow(max(0.0, dot(N, innerHalf)), 22.0) * 0.18;

          vec3 directBackIllum = (uMaterialBaseColor * uBacklightColor * (backDiff * 1.5 + 0.15) + vec3(innerSpec) * uBacklightColor) * distFalloff * uBacklightIntensity;
          vec3 backRoomAmbient = uMaterialBaseColor * uRoomLightColor * (0.24 + innerRoomDiff * 0.55) * effectiveRoomLight;

          finalColor = directBackIllum + backRoomAmbient;
        }

        finalColor = acesFilm(finalColor);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

      return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        side: THREE.DoubleSide,
      });
    },
    [settings.frameThickness, settings.height, settings.maxThickness, settings.minThickness, settings.orientation, settings.shape]
  );

  // Update light position behind model or inside cylinder/cube
  const updateLightPosition = useCallback(
    (geom: MeshGeometryData | null) => {
      if (!geom) return;
      const isEnclosed =
        settings.shape === 'cylinder' || settings.shape === 'cube' || settings.shape === 'hexagon';
      const centerZ = (geom.boundingBox.max[2] + geom.boundingBox.min[2]) / 2;
      const lightX = 0;
      const lightY = isEnclosed ? 0 : geom.boundingBox.min[1] - 34;
      const lightZ = centerZ;

      if (pointLightRef.current) {
        pointLightRef.current.position.set(lightX, lightY, lightZ);
        pointLightRef.current.intensity = BACKLIGHT_INTENSITY;
      }

      if (shaderMaterialRef.current) {
        shaderMaterialRef.current.uniforms.uBacklightPos.value.set(lightX, lightY, lightZ);
        shaderMaterialRef.current.uniforms.uBacklightIntensity.value = BACKLIGHT_INTENSITY;
        if (shaderMaterialRef.current.uniforms.uIsCylinder) {
          shaderMaterialRef.current.uniforms.uIsCylinder.value = isEnclosed;
        }
      }
    },
    [settings.shape]
  );

  useEffect(() => {
    if (geometryData) {
      updateLightPosition(geometryData);
    }
  }, [updateLightPosition, geometryData]);

  // 3. Update Three.js Mesh when geometry changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      const disposeMat = (m: THREE.Material) => {
        if ('uniforms' in m && (m as THREE.ShaderMaterial).uniforms?.uThicknessTex?.value) {
          (m as THREE.ShaderMaterial).uniforms.uThicknessTex.value.dispose();
        }
        m.dispose();
      };
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach(disposeMat);
      } else {
        disposeMat(meshRef.current.material);
      }
      meshRef.current = null;
    }

    if (!geometryData) return;

    // 3.Update Three.js Mesh when geometry changes
    const geometry = new THREE.BufferGeometry();
    const indexArr = geometryData.indices;
    const srcV = geometryData.vertices;
    const srcTh = geometryData.thicknesses;
    const srcUv = geometryData.uvs;
    const numIndices = indexArr.length;
    const numTris = numIndices / 3;

    // Build flat/crease-aware normals for the 3D viewport:
    // Large simplified border/back rectangles (~50mm) share vertices with tiny
    // (~0.1mm) photo-relief triangles and 90° top/bottom rims. By expanding
    // triangles whose face normal diverges across sharp creases (or large-area
    // coplanar regions like flat borders and polygon corners), the border,
    // corners, and rims render crisp and completely free of diagonal fan shading.
    const posOut = new Float32Array(numIndices * 3);
    const normOut = new Float32Array(numIndices * 3);
    const thOut = new Float32Array(numIndices);
    const uvOut = srcUv ? new Float32Array(numIndices * 2) : null;

    const smoothN = geometryData.normals;
    const defaultTh = settings.maxThickness;

    for (let t = 0; t < numTris; t++) {
      const i0 = indexArr[t * 3];
      const i1 = indexArr[t * 3 + 1];
      const i2 = indexArr[t * 3 + 2];

      const ax = srcV[i0 * 3], ay = srcV[i0 * 3 + 1], az = srcV[i0 * 3 + 2];
      const bx = srcV[i1 * 3], by = srcV[i1 * 3 + 1], bz = srcV[i1 * 3 + 2];
      const cx = srcV[i2 * 3], cy = srcV[i2 * 3 + 1], cz = srcV[i2 * 3 + 2];

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      let fnx = aby * acz - abz * acy;
      let fny = abz * acx - abx * acz;
      let fnz = abx * acy - aby * acx;
      const area2 = Math.sqrt(fnx * fnx + fny * fny + fnz * fnz);
      if (area2 > 1e-8) {
        fnx /= area2;
        fny /= area2;
        fnz /= area2;
      } else {
        fny = 1;
      }

      // Large merged polygons (borders, backs, rims) or sharp creases (> ~25°)
      // use their exact face normal so diagonal fan lines never appear.
      const isLargeCoplanar = area2 > 1.0; // > 0.5 mm² triangle (pixel triangles are ~0.04 mm²)
      const base = t * 9;
      posOut[base] = ax; posOut[base + 1] = ay; posOut[base + 2] = az;
      posOut[base + 3] = bx; posOut[base + 4] = by; posOut[base + 5] = bz;
      posOut[base + 6] = cx; posOut[base + 7] = cy; posOut[base + 8] = cz;

      const verts = [i0, i1, i2];
      const u0 = srcUv ? srcUv[i0 * 2] : 0;
      const u1 = srcUv ? srcUv[i1 * 2] : 0;
      const u2 = srcUv ? srcUv[i2 * 2] : 0;
      // A cylinder, cube, or hexagon wraps the photo around the perimeter, so the
      // triangle that crosses the join has UVs at both 0 and 1. Flat and curved
      // panels really do span that range on one face. Treating them as a seam
      // pins every corner to u=1 and the backlight samples only the dark edge.
      const perimeterWraps =
        settings.shape === 'cylinder' || settings.shape === 'cube' || settings.shape === 'hexagon';
      const wrapsSeam = perimeterWraps && Math.max(u0, u1, u2) - Math.min(u0, u1, u2) > 0.5;
      for (let k = 0; k < 3; k++) {
        const vi = verts[k];
        const snx = smoothN[vi * 3];
        const sny = smoothN[vi * 3 + 1];
        const snz = smoothN[vi * 3 + 2];
        const dot = fnx * snx + fny * sny + fnz * snz;
        const useFace = isLargeCoplanar || dot < 0.88;
        normOut[base + k * 3] = useFace ? fnx : snx;
        normOut[base + k * 3 + 1] = useFace ? fny : sny;
        normOut[base + k * 3 + 2] = useFace ? fnz : snz;
        thOut[t * 3 + k] = srcTh ? srcTh[vi] : defaultTh;
        if (uvOut && srcUv) {
          let u = srcUv[vi * 2];
          if (wrapsSeam && u < 0.25) u = 1.0;
          uvOut[(t * 3 + k) * 2] = u;
          uvOut[(t * 3 + k) * 2 + 1] = srcUv[vi * 2 + 1];
        }
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normOut, 3));
    geometry.setAttribute('thickness', new THREE.BufferAttribute(thOut, 1));
    if (uvOut) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvOut, 2));
    }

    const shaderMat = createLithophaneShaderMaterial(geometryData);
    shaderMaterialRef.current = shaderMat;

    const mesh = new THREE.Mesh(geometry, shaderMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshRef.current = mesh;

    updateLightPosition(geometryData);
    fitCameraToMesh(geometryData);
  }, [geometryData]);

  // Toggle bed grid
  useEffect(() => {
    if (bedPlinthRef.current) {
      bedPlinthRef.current.visible = showBed;
    }
  }, [showBed]);

  const placeView = (geom: MeshGeometryData, view: 'front' | 'iso') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const mount = mountRef.current;
    if (!camera || !controls || !mount) return;

    const canvasW = mount.clientWidth;
    const canvasH = mount.clientHeight;
    if (canvasW < 2 || canvasH < 2) return;

    const centerX = (geom.boundingBox.max[0] + geom.boundingBox.min[0]) / 2;
    const centerY = (geom.boundingBox.max[1] + geom.boundingBox.min[1]) / 2;
    const centerZ = (geom.boundingBox.max[2] + geom.boundingBox.min[2]) / 2;
    const half = new THREE.Vector3(
      geom.boundingBox.size[0] / 2,
      geom.boundingBox.size[1] / 2,
      geom.boundingBox.size[2] / 2
    );

    const towardCamera =
      view === 'iso' ? new THREE.Vector3(0.9, 1.15, 0.7) : new THREE.Vector3(0, 1, 0);
    towardCamera.normalize();

    const worldUp = new THREE.Vector3(0, 0, 1);
    const xAxis = new THREE.Vector3().crossVectors(worldUp, towardCamera);
    if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0);
    xAxis.normalize();
    const yAxis = new THREE.Vector3().crossVectors(towardCamera, xAxis).normalize();

    const span = (axis: THREE.Vector3) =>
      2 *
      (Math.abs(half.x * axis.x) + Math.abs(half.y * axis.y) + Math.abs(half.z * axis.z));
    const objW = Math.max(span(xAxis), 1);
    const objH = Math.max(span(yAxis), 1);

    const availW = Math.max(32, canvasW - VIEW_EDGE_PAD * 2);
    const availH = Math.max(32, canvasH - VIEW_EDGE_PAD * 2 - 50);

    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const aspect = canvasW / canvasH;
    const distH = (objH * canvasH) / (2 * tan * availH);
    const distW = (objW * canvasW) / (2 * tan * aspect * availW);
    let distance = Math.max(distH, distW);

    const desiredLeft = VIEW_EDGE_PAD;
    const desiredTop = VIEW_EDGE_PAD + 40;
    const desiredCx = desiredLeft + availW / 2;
    const desiredCy = desiredTop + availH / 2;

    const { min, max } = geom.boundingBox;
    const corners = [0, 1].flatMap((ix) =>
      [0, 1].flatMap((iy) =>
        [0, 1].map(
          (iz) =>
            new THREE.Vector3(
              ix ? max[0] : min[0],
              iy ? max[1] : min[1],
              iz ? max[2] : min[2]
            )
        )
      )
    );
    const ndc = new THREE.Vector3();
    const look = new THREE.Vector3(centerX, centerY, centerZ);

    for (let i = 0; i < 6; i++) {
      camera.position.copy(look).addScaledVector(towardCamera, distance);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const corner of corners) {
        ndc.copy(corner).project(camera);
        const sx = (ndc.x * 0.5 + 0.5) * canvasW;
        const sy = (ndc.y * -0.5 + 0.5) * canvasH;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }

      const boxW = Math.max(1, maxX - minX);
      const boxH = Math.max(1, maxY - minY);
      distance *= Math.max(boxW / availW, boxH / availH);

      const worldPerPxY = (2 * distance * tan) / canvasH;
      const worldPerPxX = worldPerPxY * aspect;
      look.addScaledVector(xAxis, -(desiredCx - (minX + maxX) / 2) * worldPerPxX);
      look.addScaledVector(yAxis, (desiredCy - (minY + maxY) / 2) * worldPerPxY);
    }

    controls.maxDistance = Math.max(controls.maxDistance, distance * 2);
    controls.minDistance = Math.min(controls.minDistance, distance * 0.35);
    camera.position.copy(look).addScaledVector(towardCamera, distance);
    controls.target.copy(look);
    camera.lookAt(look);
    controls.update();

    updateLightPosition(geom);
  };
  placeViewRef.current = placeView;

  const fitCameraToMesh = (geom: MeshGeometryData) => {
    placeView(geom, 'front');
    setActiveView('front');
  };

  const resetCamera = () => {
    if (geometryData) {
      fitCameraToMesh(geometryData);
    } else if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 160, 80);
      controlsRef.current.target.set(0, 0, 45);
      controlsRef.current.update();
      setActiveView('front');
    }
  };

  const setViewAngle = (view: 'front' | 'iso') => {
    if (!geometryData) return;
    placeView(geometryData, view);
    setActiveView(view);
  };

  return (
    <div className="viewport">
      {/* Floating CAD HUD Bar */}
      <div className="viewport-tools">
        <div className="hud-bar">
          <button
            type="button"
            onClick={() => setViewAngle('front')}
            data-on={activeView === 'front'}
            className="hud-btn"
            title="Front view"
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => setViewAngle('iso')}
            data-on={activeView === 'iso'}
            className="hud-btn"
            title="3D angle view"
          >
            Angle
          </button>
          <button
            type="button"
            onClick={resetCamera}
            className="hud-icon-btn"
            title="Fit to view"
            aria-label="Fit to view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={() => setShowBed(!showBed)}
            data-on={showBed}
            className="hud-icon-btn"
            title="Toggle print bed"
            aria-pressed={showBed}
            aria-label="Toggle print bed"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            data-on={autoRotate}
            className="hud-icon-btn"
            title="Auto-rotate view"
            aria-pressed={autoRotate}
            aria-label="Auto-rotate view"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Model Dimensions Badge */}
      {geometryData && (
        <div className="hud-badge">
          {settings.shape === 'cylinder'
            ? `Ø ${Math.round(settings.cylinderDiameter || 90)} × ${Math.round(geometryData.boundingBox.size[2])} mm`
            : settings.shape === 'hexagon'
            ? `⬡ ${Math.round(settings.hexagonDiameter || 90)} × ${Math.round(geometryData.boundingBox.size[2])} mm`
            : `${Math.round(geometryData.boundingBox.size[0])} × ${Math.round(geometryData.boundingBox.size[2])} mm`}
        </div>
      )}

      {/* 3D Canvas Mount */}
      <div className="viewport-canvas">
        <div
          ref={mountRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

        {/* Loading Spinner */}
        {isGenerating && (
          <div className="absolute top-14 right-3 z-20 pointer-events-none flex items-center gap-2 rounded-md border border-white/10 bg-[#10141d]/90 px-2.5 py-1.5 text-[11px] font-mono text-slate-200 shadow-lg">
            <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="font-bold text-amber-300">Updating</span>
          </div>
        )}
      </div>
    </div>
  );
};
