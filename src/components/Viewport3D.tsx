import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshGeometryData, LithophaneSettings } from '../types/lithophane';
import { RotateCcw, Maximize2, Layers, Lightbulb } from 'lucide-react';

interface Viewport3DProps {
  geometryData: MeshGeometryData | null;
  settings: LithophaneSettings;
  isGenerating: boolean;
}

// Fixed warm optical properties
const WARM_LIGHT_COLOR = 0xffdfa8; // Warm 2700K incandescent glow
const MATERIAL_BASE_COLOR = 0xf7f4ec; // Warm Ivory PLA base color
const EXTINCTION_COEFFICIENT = 1.15; // Material light extinction mu in mm^-1
const SCATTER_STRENGTH = 0.8;
const BACKLIGHT_INTENSITY = 1.56;
const ROOM_LIGHT_INTENSITY = 0.18;

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

  // Lamp state: Lamp On (illuminated) vs Lamp Off (unlit)
  const [isLampOn, setIsLampOn] = useState<boolean>(true);
  const [showBed, setShowBed] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const autoRotateRef = useRef(false);

  // 1. Initialize Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080a10);
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

    // Build Plate (220x220 mm at Z = 0)
    const bedGroup = new THREE.Group();
    const grid = new THREE.GridHelper(220, 44, 0x343d52, 0x161a25);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(0, 0, 0);
    bedGroup.add(grid);
    gridHelperRef.current = grid;
    scene.add(bedGroup);
    bedPlinthRef.current = bedGroup;

    // Invisible Point Light behind model (provides scene lighting without any visible mesh)
    const pLight = new THREE.PointLight(WARM_LIGHT_COLOR, BACKLIGHT_INTENSITY, 350, 1.1);
    pLight.position.set(0, -35, 45);
    scene.add(pLight);
    pointLightRef.current = pLight;

    // Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (controlsRef.current) {
        if (autoRotateRef.current && meshRef.current) {
          meshRef.current.rotation.y += 0.005;
        }
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = newW / newH;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(newW, newH);
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

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  // 2. Custom Physical Lithophane Shader
  const createLithophaneShaderMaterial = useCallback((): THREE.ShaderMaterial => {
    const effectiveLightColor = new THREE.Color(WARM_LIGHT_COLOR);
    const effectiveBaseColor = new THREE.Color(MATERIAL_BASE_COLOR);

    const uniforms = {
      uBacklightIntensity: { value: isLampOn ? BACKLIGHT_INTENSITY : 0.0 },
      uBacklightColor: { value: effectiveLightColor },
      uBacklightPos: { value: new THREE.Vector3(0, -35, 45) },
      uRoomLightIntensity: { value: ROOM_LIGHT_INTENSITY },
      uRoomLightColor: { value: new THREE.Color(0xdce7f5) },
      uMaterialBaseColor: { value: effectiveBaseColor },
      uTranslucencyExtinction: { value: EXTINCTION_COEFFICIENT },
      uScatteringStrength: { value: SCATTER_STRENGTH },
      uMinThickness: { value: Math.max(0.4, settings.minThickness) },
      uMaxThickness: { value: Math.max(1.0, settings.maxThickness) },
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

      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying float vThickness;

      // ACES Filmic Tone Mapping for natural photographic highlights
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

        // Lithophane stands upright facing +Y direction
        bool isFront = N.y >= -0.15;

        // When lamp is off, ensure realistic room light visibility on unlit plastic
        float effectiveRoomLight = uBacklightIntensity > 0.0 ? uRoomLightIntensity : max(uRoomLightIntensity, 0.55);

        vec3 finalColor;

        if (isFront) {
          // Front surface: light transmitted through solid thickness
          vec3 toLight = uBacklightPos - vWorldPosition;
          float distToLight = length(toLight);
          vec3 lightDir = normalize(toLight);

          // Radial falloff and incident cosine from point light behind model
          float backlightReach = 1.0 / (1.0 + 0.007 * distToLight + 0.00018 * distToLight * distToLight);
          float cosInc = clamp(dot(-lightDir, vec3(0.0, 1.0, 0.0)), 0.25, 1.0);
          backlightReach *= cosInc;

          // Beer-Lambert physical absorption: T = exp( - mu * thickness )
          float th = max(0.25, vThickness);
          float transmittance = exp(-uTranslucencyExtinction * th);

          // Warm chromatic scattering characteristic of PLA
          float normTh = clamp((th - uMinThickness) / max(0.1, uMaxThickness - uMinThickness), 0.0, 1.0);
          vec3 scatterShift = mix(vec3(1.0), vec3(1.0, 0.86, 0.68), normTh * uScatteringStrength);

          // Forward scatter micro-glow toward viewer
          float forwardScatter = pow(max(0.0, dot(V, -lightDir)), 2.2) * 0.16;

          vec3 transmitted = uBacklightColor * scatterShift * (transmittance * 2.8 + forwardScatter) * backlightReach * uBacklightIntensity;

          // Room ambient and directional lighting on front plastic ridges
          vec3 roomKeyDir = normalize(vec3(0.35, 0.82, 0.45));
          float roomDiff = max(0.0, dot(N, roomKeyDir));
          vec3 roomHalf = normalize(roomKeyDir + V);
          float roomSpec = pow(max(0.0, dot(N, roomHalf)), 28.0) * 0.24;

          vec3 frontRoomLight = (uMaterialBaseColor * (uRoomLightColor * (0.24 + roomDiff * 0.85)) + vec3(roomSpec)) * effectiveRoomLight;

          finalColor = transmitted + frontRoomLight;
        } else {
          // Back surface: light illuminates the rear face directly
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
  }, [isLampOn, settings.minThickness, settings.maxThickness]);

  // Update light position behind model
  const updateLightPosition = useCallback(
    (geom: MeshGeometryData | null) => {
      if (!geom) return;
      const centerZ = (geom.boundingBox.max[2] + geom.boundingBox.min[2]) / 2;
      const lightY = geom.boundingBox.min[1] - 34;

      if (pointLightRef.current) {
        pointLightRef.current.position.set(0, lightY, centerZ);
        pointLightRef.current.intensity = isLampOn ? BACKLIGHT_INTENSITY : 0.0;
      }

      if (shaderMaterialRef.current) {
        shaderMaterialRef.current.uniforms.uBacklightPos.value.set(0, lightY, centerZ);
        shaderMaterialRef.current.uniforms.uBacklightIntensity.value = isLampOn ? BACKLIGHT_INTENSITY : 0.0;
      }
    },
    [isLampOn]
  );

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

  // 4. Update material uniforms & point light when Lamp toggles
  useEffect(() => {
    if (shaderMaterialRef.current) {
      shaderMaterialRef.current.uniforms.uBacklightIntensity.value = isLampOn ? BACKLIGHT_INTENSITY : 0.0;
    }
    if (pointLightRef.current) {
      pointLightRef.current.intensity = isLampOn ? BACKLIGHT_INTENSITY : 0.0;
    }
  }, [isLampOn]);

  // Toggle bed grid
  useEffect(() => {
    if (bedPlinthRef.current) {
      bedPlinthRef.current.visible = showBed;
    }
  }, [showBed]);

  const fitCameraToMesh = (geom: MeshGeometryData) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const maxDim = Math.max(geom.boundingBox.size[0], geom.boundingBox.size[2], 80);
    const dist = maxDim * 1.75;
    const centerY = (geom.boundingBox.max[1] + geom.boundingBox.min[1]) / 2;
    const centerZ = (geom.boundingBox.max[2] + geom.boundingBox.min[2]) / 2;

    controlsRef.current.target.set(0, centerY, centerZ);
    cameraRef.current.position.set(0, centerY + dist * 1.45, centerZ + dist * 0.2);
    cameraRef.current.lookAt(controlsRef.current.target);
    controlsRef.current.update();

    if (shaderMaterialRef.current) {
      const lightY = geom.boundingBox.min[1] - 34;
      shaderMaterialRef.current.uniforms.uBacklightPos.value.set(0, lightY, centerZ);
    }
  };

  const resetCamera = () => {
    if (geometryData) {
      fitCameraToMesh(geometryData);
    } else if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 160, 80);
      controlsRef.current.target.set(0, 0, 45);
      controlsRef.current.update();
    }
  };

  const setViewAngle = (view: 'front' | 'back' | 'iso') => {
    if (!cameraRef.current || !controlsRef.current || !geometryData) return;
    const maxDim = Math.max(geometryData.boundingBox.size[0], geometryData.boundingBox.size[2], 80);
    const dist = maxDim * 1.75;
    const centerY = (geometryData.boundingBox.max[1] + geometryData.boundingBox.min[1]) / 2;
    const centerZ = (geometryData.boundingBox.max[2] + geometryData.boundingBox.min[2]) / 2;
    controlsRef.current.target.set(0, centerY, centerZ);

    if (view === 'front') {
      cameraRef.current.position.set(0, centerY + dist * 1.5, centerZ);
    } else if (view === 'back') {
      cameraRef.current.position.set(0, centerY - dist * 1.5, centerZ);
    } else if (view === 'iso') {
      cameraRef.current.position.set(dist * 0.9, centerY + dist * 1.15, centerZ + dist * 0.7);
    }
    cameraRef.current.lookAt(0, centerY, centerZ);
    controlsRef.current.update();
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#080a10]">
      <div
        ref={mountRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.45)_100%)]" />

      {isGenerating && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
          <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-[#12141c]/90 px-4 py-2 shadow-2xl">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#f0c36a] border-t-transparent" />
            <span className="text-sm font-medium text-zinc-100">Building mesh</span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsLampOn(!isLampOn)}
          className={`pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold shadow-xl transition ${
            isLampOn
              ? 'border-[#f0c36a] bg-[#f0c36a] text-zinc-950'
              : 'border-white/10 bg-[#11141c]/85 text-zinc-200 backdrop-blur-xl'
          }`}
          aria-pressed={isLampOn}
          title="Turn the backlight on or off"
        >
          <Lightbulb className={`h-4 w-4 ${isLampOn ? 'fill-current' : ''}`} />
          <span>{isLampOn ? 'Lamp on' : 'Lamp off'}</span>
        </button>

        {geometryData && (
          <div className="rounded-full border border-white/10 bg-[#11141c]/75 px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-zinc-300 backdrop-blur-xl">
            {Math.round(geometryData.boundingBox.size[0])} × {Math.round(geometryData.boundingBox.size[2])} mm
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center">
        <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-[#0c0e14]/80 p-1 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setViewAngle('front')}
            className="h-9 shrink-0 rounded-full px-3 text-xs font-medium text-zinc-200 hover:bg-white/10"
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => setViewAngle('iso')}
            className="h-9 shrink-0 rounded-full px-3 text-xs font-medium text-zinc-200 hover:bg-white/10"
          >
            Angle
          </button>
          <button
            type="button"
            onClick={() => setViewAngle('back')}
            className="h-9 shrink-0 rounded-full px-3 text-xs font-medium text-zinc-200 hover:bg-white/10"
          >
            Back
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" />
          <button
            type="button"
            onClick={resetCamera}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-zinc-300 hover:bg-white/10"
            aria-label="Fit model"
            title="Fit model"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowBed(!showBed)}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              showBed ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/10'
            }`}
            aria-label="Toggle print bed"
            aria-pressed={showBed}
            title="Toggle print bed"
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              autoRotate ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/10'
            }`}
            aria-label="Spin model"
            aria-pressed={autoRotate}
            title="Spin model"
          >
            <RotateCcw className={`h-4 w-4 ${autoRotate ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
