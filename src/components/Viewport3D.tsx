import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshGeometryData, LithophaneSettings } from '../types/lithophane';
import { RotateCcw, Maximize2, Layers } from 'lucide-react';

interface Viewport3DProps {
  geometryData: MeshGeometryData | null;
  settings: LithophaneSettings;
  isGenerating: boolean;
}

// Fixed optical properties for calibrated translucent PLA
const WARM_LIGHT_COLOR = 0xffdfa8; // Warm 2700K backlight
const MATERIAL_BASE_COLOR = 0xf7f4ec; // Warm Ivory PLA base color
const EXTINCTION_COEFFICIENT = 1.15; // Material light extinction mu in mm^-1
const SCATTER_STRENGTH = 0.8;
const BACKLIGHT_INTENSITY = 1.56 * 1.25;
const VIEW_EDGE_PAD = 16;
const ROOM_LIGHT_INTENSITY = 0.22;

export const Viewport3D: React.FC<Viewport3DProps> = ({
  geometryData,
  settings,
  isGenerating,
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

    // Render Loop
    let animId: number;
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
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);
      canvasEl.removeEventListener('webglcontextrestored', handleContextRestored);
      renderer.dispose();
      if (container.contains(canvasEl)) {
        container.removeChild(canvasEl);
      }
    };
  }, []);

  // 2. Physical Translucent Lithophane Shader
  const createLithophaneShaderMaterial = useCallback((): THREE.ShaderMaterial => {
    const effectiveLightColor = new THREE.Color(WARM_LIGHT_COLOR);
    const effectiveBaseColor = new THREE.Color(MATERIAL_BASE_COLOR);

    const isEnclosed = settings.shape === 'cylinder' || settings.shape === 'cube';
    const lightY = isEnclosed ? 0 : -35;

    const uniforms = {
      uBacklightIntensity: { value: BACKLIGHT_INTENSITY },
      uBacklightColor: { value: effectiveLightColor },
      uBacklightPos: { value: new THREE.Vector3(0, lightY, 45) },
      uRoomLightIntensity: { value: ROOM_LIGHT_INTENSITY },
      uRoomLightColor: { value: new THREE.Color(0xdce7f5) },
      uMaterialBaseColor: { value: effectiveBaseColor },
      uTranslucencyExtinction: { value: EXTINCTION_COEFFICIENT },
      uScatteringStrength: { value: SCATTER_STRENGTH },
      uMinThickness: { value: Math.max(0.4, settings.minThickness) },
      uMaxThickness: { value: Math.max(1.0, settings.maxThickness) },
      uIsCylinder: { value: isEnclosed },
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

          // Beer-Lambert physical absorption: T = exp( - mu * thickness )
          float th = max(0.25, vThickness);
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

          vec3 directBackIllum = uMaterialBaseColor * uBacklightColor * (backDiff * 1.5 + 0.15) * distFalloff * uBacklightIntensity;
          vec3 backRoomAmbient = uMaterialBaseColor * uRoomLightColor * 0.28 * effectiveRoomLight;

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
  }, [settings.minThickness, settings.maxThickness, settings.shape]);

  // Update light position behind model or inside cylinder/cube
  const updateLightPosition = useCallback(
    (geom: MeshGeometryData | null) => {
      if (!geom) return;
      const isEnclosed = settings.shape === 'cylinder' || settings.shape === 'cube';
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
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach((m) => m.dispose());
      } else {
        meshRef.current.material.dispose();
      }
      meshRef.current = null;
    }

    if (!geometryData) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(geometryData.vertices, 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(geometryData.normals, 3)
    );
    if (geometryData.thicknesses) {
      geometry.setAttribute(
        'thickness',
        new THREE.BufferAttribute(geometryData.thicknesses, 1)
      );
    } else {
      const count = geometryData.vertices.length / 3;
      const th = new Float32Array(count).fill(settings.maxThickness);
      geometry.setAttribute('thickness', new THREE.BufferAttribute(th, 1));
    }

    if (geometryData.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(geometryData.uvs, 2));
    }

    geometry.setIndex(new THREE.BufferAttribute(geometryData.indices, 1));

    const shaderMat = createLithophaneShaderMaterial();
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
            aria-pressed={activeView === 'front'}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => setViewAngle('iso')}
            data-on={activeView === 'iso'}
            className="hud-btn"
            title="3D angle view"
            aria-pressed={activeView === 'iso'}
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
        {isGenerating && (
          <div className="viewport-updating" role="status">
            <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="font-bold text-amber-300">Updating</span>
          </div>
        )}
      </div>

      {/* Model Dimensions Badge */}
      {geometryData && (
        <div className="hud-badge">
          {settings.shape === 'cylinder'
            ? `Ø ${Math.round(settings.cylinderDiameter || 90)} × ${Math.round(settings.height || 95)} mm`
            : `${Math.round(geometryData.boundingBox.size[0])} × ${Math.round(geometryData.boundingBox.size[2])} mm`}
        </div>
      )}

      {/* 3D Canvas Mount */}
      <div className="viewport-canvas">
        <div
          ref={mountRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

      </div>
    </div>
  );
};
