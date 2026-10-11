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
        if (autoRotate && meshRef.current) {
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
    <div className="relative w-full h-full min-h-[460px] bg-[#080a10] overflow-hidden select-none">
      {/* 3D WebGL Canvas Mount */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Loading Overlay */}
      {isGenerating && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-30 pointer-events-none transition-opacity">
          <div className="bg-[#12151e]/90 border border-white/10 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium tracking-wide text-slate-200">
              Generating watertight 3D mesh...
            </span>
          </div>
        </div>
      )}

      {/* Top Floating Viewport Control Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20 gap-3">
        {/* Left: Lamp On / Lamp Off Toggle */}
        <div className="pointer-events-auto">
          <button
            onClick={() => setIsLampOn(!isLampOn)}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs rounded-xl font-medium transition-all shadow-xl border ${
              isLampOn
                ? 'bg-amber-400 text-slate-950 border-amber-300 font-semibold shadow-amber-400/25 ring-2 ring-amber-400/20'
                : 'bg-[#11141d]/90 text-slate-300 hover:text-white hover:bg-white/[0.08] border-white/[0.08]'
            }`}
            title="Turn backlight on or off"
          >
            <Lightbulb
              className={`w-4 h-4 ${isLampOn ? 'text-slate-950 fill-current' : 'text-slate-400'}`}
            />
            <span>{isLampOn ? 'Lamp On' : 'Lamp Off'}</span>
          </button>
        </div>

        {/* Right: Camera & Orientation Tools (Front, ISO, Back) */}
        <div className="flex items-center gap-1 p-1 bg-[#11141d]/90 backdrop-blur-md border border-white/[0.08] rounded-xl pointer-events-auto shadow-2xl">
          <button
            onClick={() => setViewAngle('front')}
            className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
            title="Front Direct View"
          >
            Front
          </button>
          <button
            onClick={() => setViewAngle('iso')}
            className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
            title="Perspective ISO View"
          >
            ISO
          </button>
          <button
            onClick={() => setViewAngle('back')}
            className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
            title="Back View"
          >
            Back
          </button>
          <div className="w-px h-3.5 bg-white/10 mx-0.5" />
          <button
            onClick={resetCamera}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
            title="Reset Camera / Center Model"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowBed(!showBed)}
            className={`p-1.5 rounded-lg transition-colors ${
              showBed ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Toggle Print Bed Grid"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded-lg transition-colors ${
              autoRotate ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Auto-Rotate Showcase"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Minimal Bottom Info Badge */}
      {geometryData && (
        <div className="absolute bottom-3 right-4 pointer-events-none z-10 text-[11px] font-mono text-slate-500/80">
          {Math.round(geometryData.boundingBox.size[0])} × {Math.round(geometryData.boundingBox.size[1])} × {Math.round(geometryData.boundingBox.size[2])} mm
        </div>
      )}
    </div>
  );
};
