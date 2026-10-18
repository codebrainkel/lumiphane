import { writeFileSync } from 'node:fs';
import { GeometryGenerator } from '../src/services/geometryGenerator';
import { DEFAULT_SETTINGS } from '../src/constants/presets';
import type { LithophaneSettings, MeshGeometryData } from '../src/types/lithophane';

function mesh(shape: LithophaneSettings['shape']): MeshGeometryData {
  const cols = 180;
  const rows = 80;
  const grid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      const v = r / (rows - 1);
      // Horizontal bars only, so a vertical lighting streak cannot be the picture.
      grid[r * cols + c] = Math.floor(v * 8) % 2 === 0 ? 0.15 : 0.85;
    }
  }
  return GeometryGenerator.generateMesh(grid, cols, rows, {
    ...DEFAULT_SETTINGS,
    shape,
    width: 120,
    height: 90,
    reliefSide: 'inside',
    hasFrame: true,
  });
}

function pack(geom: MeshGeometryData) {
  return {
    vertices: Array.from(geom.vertices),
    indices: Array.from(geom.indices),
    normals: Array.from(geom.normals),
    uvs: Array.from(geom.uvs ?? []),
    thicknesses: Array.from(geom.thicknesses ?? []),
    thicknessGrid: Array.from(geom.thicknessGrid ?? []),
    boundingBox: geom.boundingBox,
    gridResolution: geom.gridResolution,
  };
}

const payload = {
  flat: pack(mesh('flat')),
  curved: pack(mesh('curved')),
  cube: pack(mesh('cube')),
};

const html = `<!doctype html>
<html><body style="margin:0;background:#090b0f;color:#fff;font:12px sans-serif">
<div id="row" style="display:flex;gap:12px"></div>
<script type="module">
import * as THREE from 'https://unpkg.com/three@0.186.1/build/three.module.js';
const payload = ${JSON.stringify(payload)};
const WARM = new THREE.Color(0xffdfa8);
const BASE = new THREE.Color(0xf7f4ec);
const vert = \`
attribute float thickness;
varying vec3 vNormal; varying vec3 vWorldPosition; varying vec3 vViewPosition; varying vec2 vUv; varying float vThickness;
void main() {
  vThickness = thickness; vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}\`;
const frag = \`
uniform float uBacklightIntensity; uniform vec3 uBacklightColor; uniform vec3 uBacklightPos;
uniform float uRoomLightIntensity; uniform vec3 uRoomLightColor; uniform vec3 uMaterialBaseColor;
uniform float uTranslucencyExtinction; uniform float uScatteringStrength; uniform float uMinThickness; uniform float uMaxThickness;
uniform bool uIsCylinder; uniform sampler2D uThicknessTex; uniform bool uHasThicknessTex;
uniform float uTexMinTh; uniform float uTexMaxTh; uniform float uPhotoZMin;
uniform float uSpec;
varying vec3 vNormal; varying vec3 vWorldPosition; varying vec3 vViewPosition; varying vec2 vUv; varying float vThickness;
vec3 acesFilm(vec3 x){float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);}
void main(){
  vec3 N=normalize(vNormal); vec3 V=normalize(vViewPosition);
  bool isFront=uIsCylinder?(dot(N.xy,vWorldPosition.xy)>=0.0):(N.y>=-0.15);
  float effectiveRoomLight=uBacklightIntensity>0.0?uRoomLightIntensity:max(uRoomLightIntensity,0.55);
  vec3 finalColor;
  if(isFront){
    vec3 toLight=uBacklightPos-vWorldPosition; float distToLight=length(toLight); vec3 lightDir=normalize(toLight);
    float backlightReach=1.0/(1.0+0.007*distToLight+0.00018*distToLight*distToLight);
    float cosInc=uIsCylinder?clamp(dot(-lightDir,N),0.25,1.0):clamp(dot(-lightDir,vec3(0.0,1.0,0.0)),0.25,1.0);
    backlightReach*=cosInc;
    float sampledTh=vThickness;
    if(uHasThicknessTex && vWorldPosition.z>=uPhotoZMin && abs(N.z)<0.75){
      vec4 texel=texture2D(uThicknessTex, vec2(vUv.x, 1.0-vUv.y));
      float norm16=(texel.r*255.0*256.0+texel.g*255.0)/65535.0;
      sampledTh=uTexMinTh+norm16*(uTexMaxTh-uTexMinTh);
    }
    float th=max(0.25,sampledTh);
    float transmittance=exp(-uTranslucencyExtinction*th);
    float normTh=clamp((th-uMinThickness)/max(0.1,uMaxThickness-uMinThickness),0.0,1.0);
    vec3 scatterShift=mix(vec3(1.0),vec3(1.0,0.86,0.68),normTh*uScatteringStrength);
    float forwardScatter=pow(max(0.0,dot(V,-lightDir)),2.2)*0.16;
    vec3 transmitted=uBacklightColor*scatterShift*(transmittance*2.8+forwardScatter)*backlightReach*uBacklightIntensity;
    vec3 roomKeyDir=normalize(vec3(0.35,0.82,0.45));
    float roomDiff=max(0.0,dot(N,roomKeyDir));
    vec3 roomHalf=normalize(roomKeyDir+V);
    float roomSpec=pow(max(0.0,dot(N,roomHalf)),28.0)*0.24*uSpec;
    vec3 frontRoomLight=(uMaterialBaseColor*(uRoomLightColor*(0.24+roomDiff*0.85))+vec3(roomSpec))*effectiveRoomLight;
    finalColor=transmitted+frontRoomLight;
  } else {
    vec3 toLight=uBacklightPos-vWorldPosition; float distToLight=length(toLight); vec3 lightDir=normalize(toLight);
    float backDiff=max(0.0,dot(N,lightDir));
    float distFalloff=1.0/(1.0+0.008*distToLight+0.0002*distToLight*distToLight);
    vec3 roomKeyDir=normalize(vec3(0.35,0.82,0.45));
    float innerRoomDiff=max(0.0,dot(N,roomKeyDir));
    vec3 innerHalf=normalize(lightDir+V);
    float innerSpec=pow(max(0.0,dot(N,innerHalf)),22.0)*0.18;
    vec3 directBackIllum=(uMaterialBaseColor*uBacklightColor*(backDiff*1.5+0.15)+vec3(innerSpec)*uBacklightColor)*distFalloff*uBacklightIntensity;
    vec3 backRoomAmbient=uMaterialBaseColor*uRoomLightColor*(0.24+innerRoomDiff*0.55)*effectiveRoomLight;
    finalColor=directBackIllum+backRoomAmbient;
  }
  gl_FragColor=vec4(acesFilm(finalColor),1.0);
}\`;

function expand(geom, seamWraps) {
  const indexArr = geom.indices;
  const srcV = geom.vertices;
  const srcTh = geom.thicknesses;
  const srcUv = geom.uvs;
  const smoothN = geom.normals;
  const numTris = indexArr.length / 3;
  const posOut = new Float32Array(numTris * 9);
  const normOut = new Float32Array(numTris * 9);
  const thOut = new Float32Array(numTris * 3);
  const uvOut = new Float32Array(numTris * 6);
  for (let t = 0; t < numTris; t++) {
    const i0 = indexArr[t*3], i1 = indexArr[t*3+1], i2 = indexArr[t*3+2];
    const ax=srcV[i0*3], ay=srcV[i0*3+1], az=srcV[i0*3+2];
    const bx=srcV[i1*3], by=srcV[i1*3+1], bz=srcV[i1*3+2];
    const cx=srcV[i2*3], cy=srcV[i2*3+1], cz=srcV[i2*3+2];
    const abx=bx-ax, aby=by-ay, abz=bz-az, acx=cx-ax, acy=cy-ay, acz=cz-az;
    let fnx=aby*acz-abz*acy, fny=abz*acx-abx*acz, fnz=abx*acy-aby*acx;
    const area2=Math.hypot(fnx,fny,fnz);
    if (area2>1e-8){fnx/=area2;fny/=area2;fnz/=area2;} else fny=1;
    const isLarge=area2>1;
    const base=t*9;
    posOut.set([ax,ay,az,bx,by,bz,cx,cy,cz], base);
    const ids=[i0,i1,i2];
    const us=ids.map(i=>srcUv[i*2]);
    const wraps=seamWraps && Math.max(...us)-Math.min(...us)>0.5;
    for (let k=0;k<3;k++){
      const vi=ids[k];
      const snx=smoothN[vi*3], sny=smoothN[vi*3+1], snz=smoothN[vi*3+2];
      const dot=fnx*snx+fny*sny+fnz*snz;
      const useFace=isLarge || dot<0.88;
      normOut[base+k*3]=useFace?fnx:snx;
      normOut[base+k*3+1]=useFace?fny:sny;
      normOut[base+k*3+2]=useFace?fnz:snz;
      thOut[t*3+k]=srcTh[vi];
      let u=srcUv[vi*2];
      if (wraps && u<0.25) u=1;
      uvOut[(t*3+k)*2]=u;
      uvOut[(t*3+k)*2+1]=srcUv[vi*2+1];
    }
  }
  return {posOut,normOut,thOut,uvOut};
}

function material(geom, enclosed, spec) {
  const cols=geom.gridResolution.cols, rows=geom.gridResolution.rows;
  const texMin=0.2, texMax=Math.max(5, 3+2, 3.4+1);
  const rgba=new Uint8Array(cols*rows*4);
  const span=texMax-texMin;
  for (let i=0;i<cols*rows;i++){
    const norm=Math.max(0,Math.min(1,(geom.thicknessGrid[i]-texMin)/span));
    const val16=Math.round(norm*65535);
    rgba[i*4]=(val16>>8)&255; rgba[i*4+1]=val16&255; rgba[i*4+2]=0; rgba[i*4+3]=255;
  }
  const tex=new THREE.DataTexture(rgba, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS=enclosed?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;
  tex.wrapT=THREE.ClampToEdgeWrapping;
  tex.magFilter=THREE.LinearFilter; tex.minFilter=THREE.LinearFilter; tex.flipY=false; tex.needsUpdate=true;
  const bb=geom.boundingBox;
  const lightY=enclosed?0:bb.min[1]-34;
  const lightZ=(bb.max[2]+bb.min[2])/2;
  const photoZMin=bb.max[2]-90+0.05;
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide,
    uniforms: {
      uBacklightIntensity:{value:1.56*1.25}, uBacklightColor:{value:WARM},
      uBacklightPos:{value:new THREE.Vector3(0,lightY,lightZ)},
      uRoomLightIntensity:{value:0.22}, uRoomLightColor:{value:new THREE.Color(0xdce7f5)},
      uMaterialBaseColor:{value:BASE}, uTranslucencyExtinction:{value:1.75},
      uScatteringStrength:{value:0.8}, uMinThickness:{value:0.8}, uMaxThickness:{value:3},
      uIsCylinder:{value:enclosed}, uThicknessTex:{value:tex}, uHasThicknessTex:{value:true},
      uTexMinTh:{value:texMin}, uTexMaxTh:{value:texMax}, uPhotoZMin:{value:photoZMin},
      uSpec:{value:spec},
    }
  });
}

const cases=[
  ['Curved spec on', payload.curved, false, false, 1],
  ['Curved spec off', payload.curved, false, false, 0],
];
const row=document.getElementById('row');
for (const [label, geom, enclosed, seam, spec] of cases) {
  const wrap=document.createElement('div');
  const cap=document.createElement('div');
  cap.textContent=label;
  const canvas=document.createElement('canvas');
  canvas.width=520; canvas.height=640;
  wrap.append(cap, canvas);
  row.append(wrap);
  const renderer=new THREE.WebGLRenderer({canvas, antialias:true, preserveDrawingBuffer:true});
  renderer.setClearColor(0x090b0f);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  const scene=new THREE.Scene();
  const cam=new THREE.PerspectiveCamera(45, 520/640, 0.1, 2000);
  cam.up.set(0,0,1);
  const ex=expand(geom, seam);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(ex.posOut,3));
  g.setAttribute('normal', new THREE.BufferAttribute(ex.normOut,3));
  g.setAttribute('thickness', new THREE.BufferAttribute(ex.thOut,1));
  g.setAttribute('uv', new THREE.BufferAttribute(ex.uvOut,2));
  scene.add(new THREE.Mesh(g, material(geom, enclosed, spec)));
  const bb=geom.boundingBox;
  const cx=(bb.min[0]+bb.max[0])/2, cy=(bb.min[1]+bb.max[1])/2, cz=(bb.min[2]+bb.max[2])/2;
  cam.position.set(cx, cy+220, cz);
  cam.lookAt(cx, cy, cz);
  renderer.render(scene, cam);
  const gl=renderer.getContext();
  const px=new Uint8Array(4);
  gl.readPixels(260, 320, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  cap.textContent=label+' '+px[0]+','+px[1]+','+px[2];
}
</script></body></html>`;

writeFileSync('/tmp/litho-preview.html', html);
console.log('wrote', html.length);
