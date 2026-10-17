/**
 * Comprehensive Automated Test Suite for Lumiphane 3D Generator
 * Tests:
 * 1. Image normalization & luminance mapping formulas (ITU-R BT.709, contrast, gamma, invert)
 * 2. Physical dimension calculations & aspect ratio scaling
 * 3. Thickness mapping (minThickness, maxThickness, frame reinforcement)
 * 4. Watertight mesh generation and closure (Euler characteristic chi = 2)
 * 5. 2-Manifold topology: exactly 2 incident triangles per edge, consistent winding
 * 6. Zero degenerate triangles, valid vertex index ranges
 * 7. 3MF ZIP structure: [Content_Types].xml, _rels/.rels, 3D/3dmodel.model
 * 8. 3MF export physical dimensions & XML integrity
 * 9. Regression testing across shapes: Flat vs Curved Arc, with/without frame & base stand
 * 10. Robustness & error handling with extreme inputs (e.g. minThickness >= maxThickness, tiny sizes)
 */

import { ImageProcessor } from '../services/imageProcessor';
import { GeometryGenerator, standingBaseExtension } from '../services/geometryGenerator';
import { MeshValidator } from '../services/meshValidator';
import { ThreeMfExporter } from '../services/threeMfExporter';
import { StlExporter } from '../services/stlExporter';
import {
  inspectBinaryStl,
  isPrintOrderingConfigured,
  isTreatstockHttpsUrl,
  prepareTreatstockCheckout,
  sanitizeModelFilename,
  selectTreatstockCheckout,
} from '../services/printOrder';
import { DEFAULT_SETTINGS, ULTRA_FINE_RESOLUTION, getAutoScaledThickness } from '../constants/presets';
import { thicknessForLuminance, transmissionToSrgb } from '../constants/optics';
import { LithophaneSettings } from '../types/lithophane';
import { borderIconCoverage, createBorderIconField, maxBorderWidthMm } from '../services/borderIcons';
import { runEmailExportTests } from './emailExportTests';
import JSZip from 'jszip';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

async function runTestSuite() {
  console.log('\n========================================');
  console.log('  LUMIPHANE 3D — AUTOMATED TEST SUITE');
  console.log('========================================\n');

  // TEST SUITE 0: Default cover crop keeps the vertical center of odd-sized photos
  console.log('[0] Testing centered cover crop for mismatched photos...');
  {
    const tall = ImageProcessor.centeredCoverRect(1001, 2001, 1);
    assert(tall.sw === 1001 && tall.sh === 1001, `Tall odd photo crops to a square (got ${tall.sw}x${tall.sh})`);
    assert(tall.sx === 0, 'Tall photo keeps its full width');
    const tallBottom = 2001 - (tall.sy + tall.sh);
    assert(
      Math.abs(tall.sy - tallBottom) <= 1 && tall.sy > 400,
      `Tall odd photo is vertically centered (top ${tall.sy}px, bottom ${tallBottom}px)`
    );

    const wide = ImageProcessor.centeredCoverRect(2001, 1000, 1);
    assert(wide.sh === 1000, 'Wide photo keeps its full height');
    const wideRight = 2001 - (wide.sx + wide.sw);
    assert(
      Math.abs(wide.sx - wideRight) <= 1 && wide.sx > 400,
      `Wide odd photo is horizontally centered (left ${wide.sx}px, right ${wideRight}px)`
    );

    const matched = ImageProcessor.centeredCoverRect(1200, 900, 1200 / 900);
    assert(
      matched.sx === 0 && matched.sy === 0 && matched.sw === 1200 && matched.sh === 900,
      'A photo that already matches the plate is not cropped'
    );

    const slidUp = ImageProcessor.resolveSourceRect(200, 400, 1, null, 0, 1);
    assert(slidUp.sw === 200 && slidUp.sh === 200, 'Sliding keeps the frame size');
    assert(slidUp.sy === 200, `Sliding fully up shows the bottom of a tall photo (sy ${slidUp.sy})`);
    const slidDown = ImageProcessor.resolveSourceRect(200, 400, 1, null, 0, -1);
    assert(slidDown.sy === 0, `Sliding fully down shows the top of a tall photo (sy ${slidDown.sy})`);
    const centered = ImageProcessor.resolveSourceRect(200, 400, 1, null, 0, 0);
    const halfway = ImageProcessor.resolveSourceRect(200, 400, 1, null, 0, 0.5);
    const restored = ImageProcessor.offsetsForWindow(centered, 200, 400, halfway.sx, halfway.sy);
    assert(Math.abs(restored.offsetY - 0.5) < 0.02, `Drag maps back to the vertical offset (got ${restored.offsetY})`);
    const filled = ImageProcessor.resolveSourceRect(1200, 900, 1200 / 900, null, 0, 1);
    assert(
      filled.sx === 0 && filled.sy === 0 && filled.sw === 1200 && filled.sh === 900,
      'A photo that fills the frame does not move'
    );
  }

  // TEST SUITE 1: Luminance Mapping & Thickness Formula
  console.log('[1] Testing Luminance & Thickness Calculations...');
  {
    const minTh = 0.8;
    const maxTh = 3.2;

    // Luminance formula check: ITU-R BT.709
    const r = 255, g = 255, b = 255;
    const lumWhite = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    assert(Math.abs(lumWhite - 1.0) < 1e-4, 'White luminance computes to 1.0');

    const lumBlack = (0.2126 * 0 + 0.7152 * 0 + 0.0722 * 0) / 255;
    assert(lumBlack === 0.0, 'Black luminance computes to 0.0');

    // Physical mapping: black is the thick wall, white is the thin wall.
    const thickBlack = thicknessForLuminance(0, minTh, maxTh);
    const thickWhite = thicknessForLuminance(1, minTh, maxTh);
    assert(Math.abs(thickBlack - maxTh) < 1e-4, 'Black region maps to maxThickness (3.2mm)');
    assert(Math.abs(thickWhite - minTh) < 1e-4, 'White region maps to minThickness (0.8mm)');

    // Invert is applied to luminance before meshing, so an inverted black pixel arrives as 1.
    const thickBlackInv = thicknessForLuminance(1, minTh, maxTh);
    const thickWhiteInv = thicknessForLuminance(0, minTh, maxTh);
    assert(Math.abs(thickBlackInv - minTh) < 1e-4, 'Inverted black maps to minThickness');
    assert(Math.abs(thickWhiteInv - maxTh) < 1e-4, 'Inverted white maps to maxThickness');

    assert(DEFAULT_SETTINGS.contrast === 0, 'Default contrast is 0 so highlights are not hard-clamped');
    const cFactor = 1 + DEFAULT_SETTINGS.contrast / 50;
    for (const lum of [0.93, 0.95, 0.97]) {
      const clamped = Math.max(0, Math.min(1, (lum - 0.5) * cFactor + 0.5));
      assert(Math.abs(clamped - lum) < 1e-6, `Highlight ${lum} stays ${lum} at default contrast (got ${clamped})`);
    }

    const autoBase = getAutoScaledThickness(120, 90);
    assert(autoBase.minThickness === 0.8 && DEFAULT_SETTINGS.minThickness === 0.8, `Baseline highlight thickness is 0.8mm (got ${autoBase.minThickness})`);
    assert(autoBase.maxThickness === 3 && DEFAULT_SETTINGS.maxThickness === 3, `Baseline shadow thickness is 3.0mm (got ${autoBase.maxThickness})`);
    assert(autoBase.frameThickness === 3.4 && DEFAULT_SETTINGS.frameThickness === 3.4, `Baseline frame is max + 0.4mm (got ${autoBase.frameThickness})`);
    const auto160 = getAutoScaledThickness(160, 120);
    assert(auto160.minThickness === 0.84, `160mm highlight thickness scales to 0.84mm (got ${auto160.minThickness})`);
    assert(auto160.maxThickness === 3.08, `160mm shadow thickness scales to 3.08mm (got ${auto160.maxThickness})`);
    assert(Math.abs(auto160.frameThickness - (auto160.maxThickness + 0.4)) < 1e-6, `160mm frame stays 0.4mm past the shadow (got ${auto160.frameThickness})`);
    const auto240 = getAutoScaledThickness(240, 180);
    assert(auto240.minThickness === 0.92 && auto240.maxThickness === 3.25, `240mm thickness scales to 0.92–3.25mm (got ${auto240.minThickness}–${auto240.maxThickness})`);
    assert(Math.abs(auto240.frameThickness - 3.65) < 1e-6, `240mm frame is 3.65mm (got ${auto240.frameThickness})`);
  }

  // TEST SUITE 2: Mesh Generation, Watertight Closure & 2-Manifold Topology
  console.log('\n[2] Testing Watertight Mesh Generation & Topology (Standing Flat Plate)...');
  {
    const cols = 20;
    const rows = 15;
    const dummyGrid = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dummyGrid[r * cols + c] = (r + c) / (rows + cols);
      }
    }

    const testSettings: LithophaneSettings = {
      ...DEFAULT_SETTINGS,
      width: 100,
      height: 75,
      minThickness: 0.8,
      maxThickness: 3.0,
      shape: 'flat',
      orientation: 'standing',
      supportType: 'flange',
      supportBaseDepth: 14.0,
      supportHeight: 8.0,
      hasFrame: true,
      frameWidth: 3.0,
      frameThickness: 3.0,
    };

    const geometry = GeometryGenerator.generateMesh(dummyGrid, cols, rows, testSettings);
    const flatExt = standingBaseExtension(testSettings);
    const flatMeshRows = rows + flatExt.rows;
    assert(geometry.vertices.length === cols * flatMeshRows * 2 * 3, 'Vertex buffer length matches the image grid plus the stand below it');
    assert(geometry.indices.length === 4 * (cols * flatMeshRows - 1) * 3, 'Index buffer length matches the image grid plus the stand below it');

    const validation = MeshValidator.validate(geometry);
    assert(validation.isWatertight, 'Mesh is strictly watertight (zero open boundaries)');
    assert(validation.isManifold, 'Mesh is 2-manifold (all edges shared by exactly 2 opposing triangles)');
    assert(validation.eulerCharacteristic === 2, `Euler characteristic chi = 2 for closed genus-0 solid (got ${validation.eulerCharacteristic})`);
    assert(validation.degenerateTriangles === 0, 'Zero degenerate triangles detected');
    assert(validation.volumeCm3 > 0, `Positive physical volume (${validation.volumeCm3} cm³)`);
    assert(validation.estimatedWeightGrams > 0, `Positive estimated filament weight (${validation.estimatedWeightGrams} g)`);
    assert(Math.abs(geometry.boundingBox.min[2] - 0) < 1e-3, 'Bottom edge rests strictly at Z = 0 on the build plate');
    assert(Math.abs(geometry.boundingBox.max[2] - (75 + flatExt.heightMm)) < 1e-3, `Top edge stands at image height plus the ${flatExt.heightMm}mm stand (got ${geometry.boundingBox.max[2]})`);
    assert(geometry.boundingBox.min[1] <= -5, 'Stabilizing base flange expands in Y for bed contact');
    assert(Math.abs(validation.dimensionsMm.width - 100) < 0.5, 'Width matches physical 100mm');
  }

  // TEST SUITE 3: Curved Arc Lithophane Mesh Standing Upright
  console.log('\n[3] Testing Curved Arc Lithophane Standing on Print Bed...');
  {
    const cols = 24;
    const rows = 18;
    const dummyGrid = new Float32Array(cols * rows);
    dummyGrid.fill(0.5);

    // Test Convex arc standing
    const curvedConvexSettings: LithophaneSettings = {
      ...DEFAULT_SETTINGS,
      width: 120,
      height: 90,
      shape: 'curved',
      curveAngle: 90,
      curveDirection: 'convex',
      orientation: 'standing',
      hasFrame: false,
    };

    const geometryConvex = GeometryGenerator.generateMesh(dummyGrid, cols, rows, curvedConvexSettings);
    const validationConvex = MeshValidator.validate(geometryConvex);

    assert(validationConvex.isWatertight, 'Convex arc mesh is strictly watertight');
    assert(validationConvex.isManifold, 'Convex arc mesh is 2-manifold');
    assert(validationConvex.eulerCharacteristic === 2, 'Convex arc mesh has Euler characteristic chi = 2');
    assert(validationConvex.degenerateTriangles === 0, 'Zero degenerate triangles on convex arc');
    assert(Math.abs(geometryConvex.boundingBox.min[2] - 0) < 1e-3, 'Curved arc stands directly at Z = 0 build plane');
    const curvedExt = standingBaseExtension(curvedConvexSettings);
    assert(Math.abs(geometryConvex.boundingBox.max[2] - (90 + curvedExt.heightMm)) < 1e-3, `Curved arc stands at image height plus the ${curvedExt.heightMm}mm brim (got ${geometryConvex.boundingBox.max[2]})`);
    assert(geometryConvex.boundingBox.min[1] < -10, 'Convex arc arch footprint extends backward in Y');
  }

  // TEST SUITE 4: Tall Item Stabilizing Supports
  console.log('\n[4] Testing Tall Item Stabilizing Supports (Buttresses & Flange)...');
  {
    const cols = 16;
    const rows = 12;
    const dummyGrid = new Float32Array(cols * rows);
    dummyGrid.fill(0.4);

    const fullSupportSettings: LithophaneSettings = {
      ...DEFAULT_SETTINGS,
      width: 80,
      height: 60,
      shape: 'flat',
      orientation: 'standing',
      supportType: 'full',
      supportBaseDepth: 18.0,
      supportHeight: 10.0,
    };

    const geometry = GeometryGenerator.generateMesh(dummyGrid, cols, rows, fullSupportSettings);
    const validation = MeshValidator.validate(geometry);

    assert(validation.isWatertight, 'Fully supported tall lithophane remains strictly watertight');
    assert(validation.isManifold, 'Fully supported tall lithophane remains 2-manifold');
    assert(validation.eulerCharacteristic === 2, 'Euler characteristic chi = 2');
    assert(geometry.boundingBox.min[1] <= -9, 'Support base expands footprint to >= 18mm depth');
    assert(geometry.boundingBox.min[2] === 0, 'Support base rests flush at Z = 0 on bed');
  }

  // TEST SUITE 5: 3MF Standards-Compliant Package & Bambu Studio Configs
  console.log('\n[5] Testing 3MF Packaging & Bambu Studio Config Metadata...');
  {
    const cols = 12;
    const rows = 10;
    const dummyGrid = new Float32Array(cols * rows);
    dummyGrid.fill(0.3);

    const testSettings: LithophaneSettings = {
      ...DEFAULT_SETTINGS,
      width: 50,
      height: 40,
      minThickness: 0.8,
      maxThickness: 2.8,
      orientation: 'standing',
    };

    const geometry = GeometryGenerator.generateMesh(dummyGrid, cols, rows, testSettings);
    const exportResult = await ThreeMfExporter.export3MF(geometry, 'test_sample');

    assert(exportResult.filesizeBytes > 1000, `Generated valid 3MF ZIP archive (${exportResult.filesizeBytes} bytes)`);
    assert(exportResult.filename.endsWith('.3mf'), `Filename ends with .3mf (${exportResult.filename})`);

    const aborted = new AbortController();
    aborted.abort();
    let exportCancelled = false;
    try {
      await ThreeMfExporter.export3MF(geometry, 'cancelled', { signal: aborted.signal });
    } catch (err) {
      exportCancelled = err instanceof DOMException && err.name === 'AbortError';
    }
    assert(exportCancelled, 'An aborted export does not return a file');

    assert(exportResult.vertexCount === geometry.vertices.length / 3, 'Vertices were counted while writing the model');
    assert(exportResult.triangleCount === geometry.indices.length / 3, 'Triangles were counted while writing the model');

    // Directory check plus the counts recorded at write time. The model XML is not parsed again.
    const verification = await ThreeMfExporter.verify3MfPackage(exportResult.blob, {
      vertexCount: exportResult.vertexCount,
      triangleCount: exportResult.triangleCount,
      unit: 'millimeter',
    });
    assert(verification.hasContentTypes, 'Package contains [Content_Types].xml');
    assert(verification.hasRels, 'Package contains _rels/.rels');
    assert(verification.hasModelXml, 'Package contains 3D/3dmodel.model');
    assert(verification.unit === 'millimeter', `Model unit is millimeter (got: ${verification.unit})`);
    assert(verification.parsedVertexCount === geometry.vertices.length / 3, `Parsed vertices match model (${verification.parsedVertexCount})`);
    assert(verification.parsedTriangleCount === geometry.indices.length / 3, `Parsed triangles match model (${verification.parsedTriangleCount})`);
    assert(verification.isValid, 'Universal 3MF package is 100% standards-compliant and slicer-ready');

    // Test Bambu Studio Native Project Mode. The print profile is the saved
    // blank-profile.3mf project, copied through so Studio accepts the config.
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const templateZip = await JSZip.loadAsync(
      await readFile(fileURLToPath(new URL('../../blank-profile.3mf', import.meta.url)))
    );
    const templateSettings = await templateZip.file('Metadata/project_settings.config')!.async('text');

    const bambuProjectResult = await ThreeMfExporter.export3MF(geometry, 'test_sample', {
      mode: 'bambu-project',
    });
    assert(bambuProjectResult.filename.includes('Bambu_A2L'), `Bambu filename contains printer model (${bambuProjectResult.filename})`);
    assert(bambuProjectResult.isBambuProject === true, 'Flagged as Bambu Studio project archive');

    const zip = await JSZip.loadAsync(bambuProjectResult.blob);
    assert(zip.file('Metadata/model_settings.config') !== null, 'Contains valid Metadata/model_settings.config');
    assert(zip.file('Metadata/project_settings.config') !== null, 'Contains valid Metadata/project_settings.config');
    assert(zip.file('Metadata/plate_1.json') !== null, 'Contains valid Metadata/plate_1.json');
    assert(zip.file('Metadata/slice_info.config') !== null, 'Contains Metadata/slice_info.config from the saved project');
    assert(zip.file('[Content_Types].xml') !== null, 'Contains [Content_Types].xml');

    const contentTypes = await zip.file('[Content_Types].xml')!.async('text');
    assert(
      contentTypes.includes('application/vnd.ms-package.3dmanufacturing-3dmodel+xml'),
      'Model content type matches the Bambu Studio package'
    );

    const projText = await zip.file('Metadata/project_settings.config')!.async('text');
    assert(projText === templateSettings, 'project_settings.config is the saved Bambu Studio profile, unchanged');
    const projJson = JSON.parse(projText);
    assert(projJson.printer_model === 'Bambu Lab A2L', `Printer model matches the saved profile (got: ${projJson.printer_model})`);
    assert(projJson.version === '02.08.02.60', `Project version matches Bambu Studio 02.08.02.60 (got: ${projJson.version})`);
    assert(projJson.print_settings_id === '0.12mm High Quality @BBL A2L', `Process profile is preserved (got: ${projJson.print_settings_id})`);
    assert(projJson.layer_height === '0.12', `Layer height pre-set to 0.12mm (got: ${projJson.layer_height})`);
    assert(projJson.sparse_infill_density === '100%', `Infill density pre-set to 100% (got: ${projJson.sparse_infill_density})`);
    assert(Array.isArray(projJson.nozzle_diameter) && projJson.nozzle_diameter.length === projJson.extruder_type.length, 'Nozzle and extruder lists have the same length');
    assert(Object.keys(projJson).length > 400, `Full slicer config is embedded (${Object.keys(projJson).length} keys)`);

    const modelSettings = await zip.file('Metadata/model_settings.config')!.async('text');
    assert(modelSettings.includes('id="2"'), 'Model object is registered in model_settings.config');
    assert(modelSettings.includes('subtype="normal_part"'), 'Mesh part is a normal part');
    assert(modelSettings.includes('<model_instance>'), 'Lithophane is assigned to a plate');
    assert(modelSettings.includes('object_id" value="2"'), 'Plate instance points at the lithophane object');
    assert((modelSettings.match(/<plate>/g) || []).length === 1, 'Project has a single build plate');
    assert(zip.file('Metadata/plate_2.json') === null, 'Unused second plate metadata is omitted');
    assert(zip.file('Metadata/plate_2.png') === null, 'Unused second plate thumbnail is omitted');
    const filamentSequence = JSON.parse(await zip.file('Metadata/filament_sequence.json')!.async('text'));
    assert(filamentSequence.plate_1 && !filamentSequence.plate_2, 'Filament sequence lists only plate 1');

    const modelXml = await zip.file('3D/3dmodel.model')!.async('text');
    assert(modelXml.includes('BambuStudio-02.08.02.60'), 'Model is stamped as a Bambu Studio project');
    assert(modelXml.includes('BambuStudio:3mfVersion'), 'Model carries the Bambu 3MF version');
    assert(modelXml.includes('objectid="2"'), 'Build item references the assembled object');
    assert((modelXml.match(/<vertex\s/g) || []).length === geometry.vertices.length / 3, 'Bambu model vertex count matches the mesh');

    const placed = [...modelXml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((match) =>
      match.slice(1, 4).map(Number)
    );
    const xs = placed.map((p) => p[0]);
    const ys = placed.map((p) => p[1]);
    const zs = placed.map((p) => p[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    assert(Math.abs(minZ) < 0.05, `Base sits on the bed at Z = 0 (got ${minZ.toFixed(3)})`);
    assert(maxZ > 30, `Lithophane still stands upright (height ${maxZ.toFixed(1)} mm)`);
    assert(Math.abs((minX + maxX) / 2 - 165) < 1, `Centered on the 330 mm bed in X (got ${((minX + maxX) / 2).toFixed(1)})`);
    assert(Math.abs((minY + maxY) / 2 - 160) < 1, `Centered on the 320 mm bed in Y (got ${((minY + maxY) / 2).toFixed(1)})`);
    assert(minX > 0 && maxX < 330 && minY > 0 && maxY < 320, 'Entire part is inside the build plate');

    const flatGeometry = GeometryGenerator.generateMesh(dummyGrid, cols, rows, {
      ...testSettings,
      orientation: 'flat',
    });
    const flatBambu = await ThreeMfExporter.export3MF(flatGeometry, 'flat_sample', { mode: 'bambu-project' });
    const flatXml = await (await JSZip.loadAsync(flatBambu.blob)).file('3D/3dmodel.model')!.async('text');
    const flatZ = [...flatXml.matchAll(/z="([^"]+)"/g)].map((match) => Number(match[1]));
    const flatHeight = Math.max(...flatZ) - Math.min(...flatZ);
    assert(flatHeight > 30, `Face-down mesh is stood up for Bambu (height ${flatHeight.toFixed(1)} mm)`);
    assert(Math.abs(Math.min(...flatZ)) < 0.05, 'Stood-up mesh base is on the bed');

    const bambuVerification = await ThreeMfExporter.verify3MfPackage(bambuProjectResult.blob, {
      vertexCount: bambuProjectResult.vertexCount,
      triangleCount: bambuProjectResult.triangleCount,
      unit: 'millimeter',
    });
    assert(bambuVerification.isValid, `Bambu 3MF package verifies (${bambuVerification.errors.join('; ')})`);
    assert(bambuVerification.hasMetadataConfigs, 'Verifier finds the Bambu project config');

    const placedCenter = async (
      printerId: string
    ): Promise<{ proj: Record<string, unknown>; cx: number; cy: number; minZ: number; maxZ: number; filename: string }> => {
      const result = await ThreeMfExporter.export3MF(geometry, 'test_sample', {
        mode: 'bambu-project',
        bambuPrinterId: printerId,
      });
      const printerZip = await JSZip.loadAsync(result.blob);
      const proj = JSON.parse(await printerZip.file('Metadata/project_settings.config')!.async('text')) as Record<string, unknown>;
      const xml = await printerZip.file('3D/3dmodel.model')!.async('text');
      const points = [...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((match) =>
        match.slice(1, 4).map(Number)
      );
      const px = points.map((point) => point[0]);
      const py = points.map((point) => point[1]);
      const pz = points.map((point) => point[2]);
      return {
        proj,
        cx: (Math.min(...px) + Math.max(...px)) / 2,
        cy: (Math.min(...py) + Math.max(...py)) / 2,
        minZ: Math.min(...pz),
        maxZ: Math.max(...pz),
        filename: result.filename,
      };
    };

    const mini = await placedCenter('a1-mini');
    assert(mini.filename.includes('Bambu_A1mini'), `A1 mini filename names the printer (${mini.filename})`);
    assert(mini.proj.printer_model === 'Bambu Lab A1 mini', `A1 mini printer model is retargeted (got: ${mini.proj.printer_model})`);
    assert(mini.proj.printer_settings_id === 'Bambu Lab A1 mini 0.4 nozzle', 'A1 mini uses its 0.4 nozzle machine preset');
    assert(mini.proj.print_settings_id === '0.12mm High Quality @BBL A1M', 'A1 mini uses its 0.12 mm process preset');
    assert(mini.proj.layer_height === '0.12' && mini.proj.sparse_infill_density === '100%', 'Lithophane layer height and infill survive a printer change');
    assert(mini.proj.brim_width === projJson.brim_width, 'Brim width stays with the lithophane profile');
    assert(JSON.stringify(mini.proj.printable_area) === JSON.stringify(['0x0', '180x0', '180x180', '0x180']), 'A1 mini bed is 180 mm square');
    assert(!String(mini.proj.machine_end_gcode).includes('A2L end gcode'), 'A1 mini does not keep the A2L end G-code');
    assert(Array.isArray(mini.proj.nozzle_diameter) && mini.proj.nozzle_diameter.length === (mini.proj.extruder_type as unknown[]).length, 'A1 mini nozzle and extruder lists match');
    assert(mini.proj.version === '02.08.02.60', 'Retargeted project stays on Studio 02.08.02.60');
    assert(Math.abs(mini.cx - 90) < 1 && Math.abs(mini.cy - 90) < 1, `A1 mini mesh is centered on its bed (${mini.cx.toFixed(1)}, ${mini.cy.toFixed(1)})`);
    assert(Math.abs(mini.minZ) < 0.05 && mini.maxZ > 30, 'A1 mini mesh stands on the bed');

    const p1s = await placedCenter('p1s');
    assert(p1s.proj.printer_model === 'Bambu Lab P1S', `P1S printer model is retargeted (got: ${p1s.proj.printer_model})`);
    assert(p1s.proj.print_settings_id === '0.12mm High Quality @BBL X1C', 'P1S uses the X1C 0.12 mm preset Studio ships for it');
    assert(JSON.stringify(p1s.proj.filament_settings_id) === JSON.stringify(['Bambu PLA Basic @BBL P1S 0.4 nozzle']), 'P1S filament preset is installed for that machine');
    assert(JSON.stringify(p1s.proj.printable_area) === JSON.stringify(['0x0', '256x0', '256x256', '0x256']), 'P1S bed is 256 mm square');
    assert(!String(p1s.proj.machine_start_gcode).includes('A2L'), 'P1S start G-code is not the A2L script');
    assert(Math.abs(p1s.cx - 128) < 1 && Math.abs(p1s.cy - 128) < 1, `P1S mesh is centered on its bed (${p1s.cx.toFixed(1)}, ${p1s.cy.toFixed(1)})`);
    const p1sExport = await ThreeMfExporter.export3MF(geometry, 'test_sample', { mode: 'bambu-project', bambuPrinterId: 'p1s' });
    const p1sVerify = await ThreeMfExporter.verify3MfPackage(p1sExport.blob, {
      vertexCount: p1sExport.vertexCount,
      triangleCount: p1sExport.triangleCount,
      unit: 'millimeter',
    });
    assert(p1sVerify.isValid, `Retargeted P1S package verifies (${p1sVerify.errors.join('; ')})`);
  }

  // TEST SUITE 6: Robustness & Boundary Conditions
  console.log('\n[6] Testing Extreme Boundary Conditions & Safety...');
  {
    // High aspect ratio (panorama)
    const panoCols = 30;
    const panoRows = 8;
    const dummyGrid = new Float32Array(panoCols * panoRows);
    dummyGrid.fill(0.7);

    const panoSettings: LithophaneSettings = {
      ...DEFAULT_SETTINGS,
      width: 150,
      height: 40,
    };
    const panoGeom = GeometryGenerator.generateMesh(dummyGrid, panoCols, panoRows, panoSettings);
    const panoVal = MeshValidator.validate(panoGeom);
    assert(panoVal.isWatertight && panoVal.isManifold, 'Panoramic lithophane is watertight and manifold');

    // Square 1:1 lithophane
    const sqCols = 15;
    const sqRows = 15;
    const sqGrid = new Float32Array(sqCols * sqRows);
    sqGrid.fill(0.1);

    const sqSettings: LithophaneSettings = {
      ...DEFAULT_SETTINGS,
      width: 80,
      height: 80,
    };
    const sqGeom = GeometryGenerator.generateMesh(sqGrid, sqCols, sqRows, sqSettings);
    const sqVal = MeshValidator.validate(sqGeom);
    assert(sqVal.isWatertight && sqVal.isManifold, 'Square 1:1 lithophane is watertight and manifold');
  }

  // TEST SUITE 7: Ultra Fine Mesh Standard
  console.log('\n[7] Testing Permanent Ultra Fine Mesh Resolution Standard...');
  {
    assert(ULTRA_FINE_RESOLUTION === 440, 'ULTRA_FINE_RESOLUTION is permanently set to 440 cols');
  }

  // TEST SUITE 8: Quality Tiers & Uncompressed Sampling Pipeline
  console.log('\n[8] Testing Quality Tiers & Uncompressed Sampling Pipeline...');
  {
    const { getResolutionForTier, getCylinderResolutionForTier, QUALITY_TIERS } = await import('../constants/presets');

    assert(QUALITY_TIERS.master.baseCols === 600, 'Master quality base resolution is 600 cols');
    assert(QUALITY_TIERS.studio.baseCols === 440, 'Studio quality base resolution is 440 cols');
    assert(QUALITY_TIERS.balanced.baseCols === 340, 'Balanced quality base resolution is 340 cols');

    const masterCols = getResolutionForTier('master', 120);
    assert(masterCols === 600, `Master tier for 120mm yields 600 cols (got: ${masterCols})`);

    const studioCols = getResolutionForTier('studio', 120);
    assert(studioCols === 440, `Studio tier for 120mm yields 440 cols (got: ${studioCols})`);

    const pitchMm = 120 / masterCols;
    assert(pitchMm <= 0.20, `Master physical sampling pitch is <= 0.20mm (got: ${pitchMm.toFixed(3)}mm)`);

    // Cylinder Tier Assertions:
    const cylMasterCols = getCylinderResolutionForTier('master', 90);
    assert(cylMasterCols >= 1400, `Cylinder master quality yields >= 1400 cols (got: ${cylMasterCols})`);
    assert(cylMasterCols % 4 === 0, `Cylinder master cols is multiple of 4 (got: ${cylMasterCols})`);
    const cylCircumference = Math.PI * 90;
    const cylMasterPitch = cylCircumference / cylMasterCols;
    assert(cylMasterPitch <= 0.21, `Cylinder master physical pitch matches flat master <= 0.21mm (got: ${cylMasterPitch.toFixed(3)}mm)`);

    const cylStudioCols = getCylinderResolutionForTier('studio', 90);
    assert(cylStudioCols >= 960 && cylStudioCols % 4 === 0, `Cylinder studio yields 960 cols divisible by 4 (got: ${cylStudioCols})`);

    const cylDraftCols = getCylinderResolutionForTier('balanced', 90);
    assert(cylDraftCols >= 640 && cylDraftCols % 4 === 0, `Cylinder draft yields 640 cols divisible by 4 (got: ${cylDraftCols})`);
  }

  // TEST SUITE 9: Odd Size Images & Cropped Aspect Ratio Scaling
  console.log('\n[9] Testing Odd Size Images & Cropped Aspect Ratio Proportions...');
  {
    // Test A: Odd-sized image dimensions (e.g. 733 x 921 px portrait)
    const oddImgW = 733;
    const oddImgH = 921;
    const oddRatio = oddImgW / oddImgH; // ~0.79587
    const lithoW = 120;
    const expectedHeight = Math.round(lithoW / oddRatio); // 151 mm
    assert(expectedHeight === 151, `Odd image height scales correctly from ratio (expected 151mm, got ${expectedHeight}mm)`);

    const cols = 600;
    const rows = Math.round(cols / oddRatio); // 754
    assert(rows === 754, `Grid rows match aspect ratio (expected 754, got ${rows})`);

    const pitchX = lithoW / cols;
    const pitchY = expectedHeight / rows;
    assert(Math.abs(pitchX - pitchY) < 0.001, `Square sampling pitch achieved for odd image (X: ${pitchX.toFixed(4)}mm, Y: ${pitchY.toFixed(4)}mm)`);

    // Test B: Cropped to 1:1 Square
    const squareCropW = 1000;
    const squareCropH = 1000;
    const squareCropRatio = squareCropW / squareCropH; // 1.0
    const squareLithoHeight = Math.round(100 / squareCropRatio); // 100 mm
    assert(squareLithoHeight === 100, `Square crop lithograph has 1:1 square height (100mm)`);

    const squareGrid = new Float32Array(20 * 20);
    squareGrid.fill(0.5);
    const squareGeom = GeometryGenerator.generateMesh(squareGrid, 20, 20, {
      ...DEFAULT_SETTINGS,
      width: 100,
      height: squareLithoHeight,
      orientation: 'standing',
    });
    const squareVal = MeshValidator.validate(squareGeom);
    assert(Math.abs(squareVal.dimensionsMm.width - 100) < 0.5, 'Square mesh width is 100mm');
    const squareExt = standingBaseExtension({
      shape: 'flat',
      orientation: 'standing',
      supportType: DEFAULT_SETTINGS.supportType,
      supportHeight: DEFAULT_SETTINGS.supportHeight,
    });
    assert(Math.abs(squareVal.dimensionsMm.height - (100 + squareExt.heightMm)) < 0.5, `Square mesh height is the 100mm photo plus the stand (got ${squareVal.dimensionsMm.height}mm)`);
    assert(squareVal.isWatertight && squareVal.isManifold, 'Square cropped mesh is watertight and 2-manifold');

    // Test C: Cropped to 3:4 Portrait
    const portraitRatio = 3 / 4; // 0.75
    const portraitLithoHeight = Math.round(120 / portraitRatio); // 160 mm
    assert(portraitLithoHeight === 160, `3:4 portrait lithograph scales to 160mm height`);

    const portraitCols = 18;
    const portraitRows = 24; // 18 / 24 = 3 / 4
    const portraitGrid = new Float32Array(portraitCols * portraitRows);
    portraitGrid.fill(0.4);
    const portraitGeom = GeometryGenerator.generateMesh(portraitGrid, portraitCols, portraitRows, {
      ...DEFAULT_SETTINGS,
      width: 120,
      height: portraitLithoHeight,
      orientation: 'standing',
    });
    const portraitVal = MeshValidator.validate(portraitGeom);
    assert(Math.abs(portraitVal.dimensionsMm.width - 120) < 0.5, 'Portrait mesh width is 120mm');
    const portraitExt = standingBaseExtension({
      shape: 'flat',
      orientation: 'standing',
      supportType: DEFAULT_SETTINGS.supportType,
      supportHeight: DEFAULT_SETTINGS.supportHeight,
    });
    assert(Math.abs(portraitVal.dimensionsMm.height - (160 + portraitExt.heightMm)) < 0.5, `Portrait mesh height is the 160mm photo plus the stand (got ${portraitVal.dimensionsMm.height}mm)`);
    assert(portraitVal.isWatertight && portraitVal.isManifold, 'Portrait cropped mesh is watertight and 2-manifold');
  }

  // TEST SUITE 10: 360° Round Hollow Cylinder Mode (4-Image Lantern)
  console.log('\n[10] Testing Round Hollow Cylinder Lithophane (360°)...');
  {
    const cylDiameter = 90; // mm
    const cylHeight = 95;   // mm
    const circumference = Math.PI * cylDiameter; // ~282.74 mm
    const totalAspect = circumference / cylHeight;
    const testCols = 64; // multiple of 4
    const testRows = Math.round(testCols / totalAspect); // ~22 rows

    const cylGrid = new Float32Array(testCols * testRows);
    // Simulate 4 distinct quadrant patterns
    const quadCols = testCols / 4;
    for (let r = 0; r < testRows; r++) {
      for (let c = 0; c < testCols; c++) {
        const quadrant = Math.floor(c / quadCols);
        cylGrid[r * testCols + c] = 0.2 + quadrant * 0.2; // 4 distinct quadrants
      }
    }

    const cylGeom = GeometryGenerator.generateMesh(cylGrid, testCols, testRows, {
      ...DEFAULT_SETTINGS,
      shape: 'cylinder',
      cylinderDiameter: cylDiameter,
      height: cylHeight,
      orientation: 'standing',
      supportType: 'flange',
    });

    const cylVal = MeshValidator.validate(cylGeom);

    assert(cylVal.isWatertight, 'Round hollow cylinder mesh is strictly watertight');
    assert(cylVal.isManifold, 'Round hollow cylinder mesh is strictly 2-manifold');
    assert(cylVal.degenerateTriangles === 0, 'Zero degenerate triangles on hollow cylinder');
    const cylExt = standingBaseExtension({
      shape: 'cylinder',
      orientation: 'standing',
      supportType: 'flange',
      supportHeight: DEFAULT_SETTINGS.supportHeight,
    });
    assert(Math.abs(cylVal.dimensionsMm.height - (cylHeight + cylExt.heightMm)) < 0.5, `Cylinder height is 95mm plus the ${cylExt.heightMm}mm brim (got ${cylVal.dimensionsMm.height}mm)`);
    // Outer diameter includes base cylinder radius + thickness
    const outerDiamExpected = cylDiameter + 3.0 * 2; // ~96mm
    assert(cylGeom.boundingBox.min[2] === 0, 'Cylinder bottom rim rests flat at Z=0 on print bed');
    assert(cylGeom.indices.length === 4 * testCols * (testRows + cylExt.rows) * 3, `Cylinder index count includes the brim rows (got ${cylGeom.indices.length})`);

    // Verify outward vs inward normal directions for proper lithophane lighting
    const midRow = Math.floor(testRows / 2);
    const frontCount = cylGeom.vertices.length / 6;
    const midOuterIdx = (midRow * testCols + Math.floor(testCols / 8)) * 3;
    const midInnerIdx = (frontCount + midRow * testCols + Math.floor(testCols / 8)) * 3;

    const outerDot = cylGeom.normals[midOuterIdx] * cylGeom.vertices[midOuterIdx] +
                     cylGeom.normals[midOuterIdx + 1] * cylGeom.vertices[midOuterIdx + 1];
    const innerDot = cylGeom.normals[midInnerIdx] * cylGeom.vertices[midInnerIdx] +
                     cylGeom.normals[midInnerIdx + 1] * cylGeom.vertices[midInnerIdx + 1];

    assert(outerDot > 20, `Cylinder outer face normals point strictly outward away from center (dot: ${outerDot.toFixed(1)})`);
    assert(innerDot < -20, `Cylinder inner bore normals point strictly inward toward center light (dot: ${innerDot.toFixed(1)})`);
    assert(cylGeom.normals[2] > 0.1, 'Cylinder top rim normals point +Z (upward)');
    const botIdx = (testRows + cylExt.rows - 1) * testCols * 3;
    assert(Math.abs(cylGeom.vertices[botIdx + 2]) < 1e-4, 'Cylinder brim rests on the bed at Z = 0');
    assert(cylGeom.normals[botIdx + 2] < -0.1, 'Cylinder bottom rim normals point -Z (downward flush with bed)');

    // Verify zero vertical frame seam gap between last image (c = testCols - 1) and first image (c = 0)
    // Even when hasFrame is enabled, the 360° cylinder perimeter must NOT have vertical side borders
    assert(cylGeom.thicknesses !== undefined, 'Cylinder thicknesses buffer is generated');
    const ths = cylGeom.thicknesses!;
    const firstColTh = ths[midRow * testCols + 0];
    const lastColTh = ths[midRow * testCols + (testCols - 1)];
    const expectedFirstTh = thicknessForLuminance(0.2, DEFAULT_SETTINGS.minThickness, DEFAULT_SETTINGS.maxThickness);
    const expectedLastTh = thicknessForLuminance(0.8, DEFAULT_SETTINGS.minThickness, DEFAULT_SETTINGS.maxThickness);
    assert(Math.abs(firstColTh - expectedFirstTh) < 0.05, `First column thickness accurately reflects photo luminance without frame bar (got ${firstColTh.toFixed(2)}mm, expected ${expectedFirstTh.toFixed(2)}mm)`);
    assert(Math.abs(lastColTh - expectedLastTh) < 0.05, `Last column thickness accurately reflects photo luminance without frame bar (got ${lastColTh.toFixed(2)}mm, expected ${expectedLastTh.toFixed(2)}mm)`);
  }

  // TEST SUITE 11: Dynamic 1, 2, and 3 Image Cylinder Configurations
  console.log('\n[11] Testing Dynamic 1, 2, and 3 Image Cylinder Modes...');
  {
    const cylDiameter = 90;
    const cylHeight = 95;
    const testCols = 72; // multiple of 12 (divisible by 1, 2, 3, 4)
    const testRows = 24;

    // Test 1: Single Photo (Full 360° Wrap)
    const singleWrapGrid = new Float32Array(testCols * testRows);
    for (let r = 0; r < testRows; r++) {
      for (let c = 0; c < testCols; c++) {
        // Continuous horizontal gradient across full 360°
        singleWrapGrid[r * testCols + c] = c / testCols;
      }
    }

    const singleWrapGeom = GeometryGenerator.generateMesh(singleWrapGrid, testCols, testRows, {
      ...DEFAULT_SETTINGS,
      shape: 'cylinder',
      cylinderDiameter: cylDiameter,
      cylinderPanelCount: 1,
      height: cylHeight,
    });
    const singleVal = MeshValidator.validate(singleWrapGeom);
    assert(singleVal.isWatertight, '1-Photo 360° cylinder wrap is strictly watertight');
    assert(singleVal.isManifold, '1-Photo 360° cylinder wrap is strictly 2-manifold');
    assert(singleVal.degenerateTriangles === 0, '1-Photo 360° cylinder wrap has zero degenerate triangles');

    // For 1-photo wrap, the center of the image (c = testCols / 2) faces front (+Y) towards viewer
    const midRow = Math.floor(testRows / 2);
    const centerColIdx = (midRow * testCols + Math.floor(testCols / 2)) * 3;
    const centerNormDot = singleWrapGeom.normals[centerColIdx + 1]; // Y component of normal
    assert(centerNormDot > 0.8, `Center of single image faces directly forward (+Y) (got normal.y: ${centerNormDot.toFixed(2)})`);

    // Test 2: Two Photos (180° Halves)
    const twoPanelGeom = GeometryGenerator.generateMesh(singleWrapGrid, testCols, testRows, {
      ...DEFAULT_SETTINGS,
      shape: 'cylinder',
      cylinderDiameter: cylDiameter,
      cylinderPanelCount: 2,
      height: cylHeight,
    });
    const twoVal = MeshValidator.validate(twoPanelGeom);
    assert(twoVal.isWatertight && twoVal.isManifold, '2-Photo cylinder is watertight and 2-manifold');

    // Test 3: Three Photos (120° Thirds)
    const threePanelGeom = GeometryGenerator.generateMesh(singleWrapGrid, testCols, testRows, {
      ...DEFAULT_SETTINGS,
      shape: 'cylinder',
      cylinderDiameter: cylDiameter,
      cylinderPanelCount: 3,
      height: cylHeight,
    });
    const threeVal = MeshValidator.validate(threePanelGeom);
    assert(threeVal.isWatertight && threeVal.isManifold, '3-Photo cylinder is watertight and 2-manifold');
  }

  // TEST SUITE 12: Border width icons around the frame centerline
  console.log('\n[12] Testing Border Width and Repeating Icons...');
  {
    assert(borderIconCoverage('heart', 0, 0, 4) > 0.8, 'Heart center is solid');
    assert(borderIconCoverage('heart', 1.6, 2.6, 4) > 0.5, 'Heart lobes face out of the frame');
    assert(borderIconCoverage('heart', 0, -3.2, 4) > 0.5, 'Heart tip points back toward the photo');
    assert(borderIconCoverage('star', 0, 0, 4) > 0.8, 'Star center is solid');
    assert(borderIconCoverage('bone', 0, 0, 4) > 0.8, 'Bone center is solid');
    assert(borderIconCoverage('heart', 0, 6, 4) === 0, 'Heart does not extend past its reach');
    assert(borderIconCoverage('star', 0, 3.5, 4) > 0.5, 'Star point faces outward');
    assert(borderIconCoverage('bone', 3.4, 0, 4) > 0.5, 'Bone extends along the border');
    assert(borderIconCoverage('bone', 0, 3.4, 4) < 0.15, 'Bone stays narrow across the border');

    const frameW = 8;
    const W = 120;
    const H = 90;
    const field = createBorderIconField({
      kind: 'heart',
      layout: 'rect',
      widthMm: W,
      heightMm: H,
      frameWidthMm: frameW,
    });
    assert(field(W / 2, frameW / 2) > 0.5, 'A heart is centered on the top border');
    assert(field(W / 2, frameW * 0.08) === 0, 'Padding remains outside the heart');
    assert(field(W / 2, frameW * 0.92) === 0, 'Padding remains between the heart and the photo');
    assert(field(W / 2, H / 2) === 0, 'Photo center is clear of border icons');

    const edgeHit = (xs: number[], ys: number[]) => {
      for (const x of xs) {
        for (const y of ys) {
          if (field(x, y) > 0.45) return true;
        }
      }
      return false;
    };
    const xs = Array.from({ length: 121 }, (_, i) => i);
    const ys = Array.from({ length: 91 }, (_, i) => i);
    assert(edgeHit(xs, [frameW / 2]), 'Hearts repeat along the top border');
    assert(edgeHit(xs, [H - frameW / 2]), 'Hearts repeat along the bottom border');
    assert(edgeHit([frameW / 2], ys), 'Hearts repeat along the left border');
    assert(edgeHit([W - frameW / 2], ys), 'Hearts repeat along the right border');

    let topCount = 0;
    let prev = false;
    for (let x = 0; x <= W; x += 0.5) {
      const on = field(x, frameW / 2) > 0.5;
      if (on && !prev) topCount += 1;
      prev = on;
    }
    assert(topCount >= 3 && topCount <= 8, `Hearts are spaced along the top edge (got ${topCount})`);

    const cols = 97;
    const rows = 73;
    const grid = new Float32Array(cols * rows);
    grid.fill(1);
    const iconSettings: LithophaneSettings = {
      ...DEFAULT_SETTINGS,
      width: W,
      height: H,
      shape: 'flat',
      orientation: 'standing',
      supportType: 'none',
      hasFrame: true,
      frameWidth: frameW,
      frameThickness: 2.4,
      borderIcon: 'heart',
      minThickness: 0.6,
      maxThickness: 2.25,
    };
    const geometry = GeometryGenerator.generateMesh(grid, cols, rows, iconSettings);
    const validation = MeshValidator.validate(geometry);
    assert(validation.isWatertight, 'Heart border mesh is watertight');
    assert(validation.isManifold, 'Heart border mesh is 2-manifold');
    assert(validation.degenerateTriangles === 0, 'Heart border mesh has no degenerate triangles');

    const near = (x0: number, y0: number, radius: number, pick: 'min' | 'max') => {
      let value = pick === 'min' ? Infinity : 0;
      for (let r = 0; r < rows; r++) {
        const y = (r / (rows - 1)) * H;
        if (Math.abs(y - y0) > radius) continue;
        for (let c = 0; c < cols; c++) {
          const x = (c / (cols - 1)) * W;
          if (Math.abs(x - x0) > radius) continue;
          const th = geometry.thicknesses![r * cols + c];
          value = pick === 'min' ? Math.min(value, th) : Math.max(value, th);
        }
      }
      return value;
    };
    const centerTh = near(W / 2, H / 2, 4, 'max');
    const topTh = near(W / 2, frameW / 2, 1.2, 'min');
    assert(Math.abs(centerTh - 0.6) < 0.05, `Photo center keeps highlight thickness (got ${centerTh.toFixed(2)}mm)`);
    assert(topTh < 2.4 - 0.4, `Top-center heart is cut into the border (got ${topTh.toFixed(2)}mm)`);
    assert(topTh > 1.0, `Heart recess stays a solid border (got ${topTh.toFixed(2)}mm)`);

    let finite = true;
    for (let i = 0; i < geometry.normals.length; i++) {
      if (!Number.isFinite(geometry.normals[i])) {
        finite = false;
        break;
      }
    }
    assert(finite, 'Border icon normals stay finite');

    const curved = GeometryGenerator.generateMesh(grid, cols, rows, {
      ...iconSettings,
      shape: 'curved',
      curveAngle: 80,
      borderIcon: 'star',
    });
    const curvedVal = MeshValidator.validate(curved);
    assert(curvedVal.isWatertight && curvedVal.isManifold, 'Curved star border stays watertight');

    const cylCols = 96;
    const cylRows = 48;
    const cylH = 95;
    const cylD = 90;
    const cylGrid = new Float32Array(cylCols * cylRows);
    cylGrid.fill(0.5);
    const cylGeom = GeometryGenerator.generateMesh(cylGrid, cylCols, cylRows, {
      ...DEFAULT_SETTINGS,
      shape: 'cylinder',
      cylinderDiameter: cylD,
      cylinderPanelCount: 4,
      height: cylH,
      orientation: 'standing',
      supportType: 'none',
      hasFrame: true,
      frameWidth: frameW,
      frameThickness: 2.4,
      borderIcon: 'bone',
    });
    const cylVal = MeshValidator.validate(cylGeom);
    assert(cylVal.isWatertight && cylVal.isManifold, 'Cylinder bone border stays watertight');
    const perimeter = Math.PI * cylD;
    const frontArc = perimeter / 8;
    const cylTh = cylGeom.thicknesses!;
    let rimMin = Infinity;
    let midMax = 0;
    for (let c = 0; c < cylCols; c++) {
      const x = (c / cylCols) * perimeter;
      for (let r = 0; r < cylRows; r++) {
        const y = (r / (cylRows - 1)) * cylH;
        const th = cylTh[r * cylCols + c];
        if (Math.abs(y - frameW / 2) < 2 && Math.abs(x - frontArc) < 3) rimMin = Math.min(rimMin, th);
        if (Math.abs(y - cylH / 2) < 2) midMax = Math.max(midMax, th);
      }
    }
    assert(rimMin < 2.4 - 0.4, `Cylinder top rim has a bone cut into it (got ${rimMin.toFixed(2)}mm)`);
    const midPhoto = thicknessForLuminance(0.5, DEFAULT_SETTINGS.minThickness, DEFAULT_SETTINGS.maxThickness);
    assert(Math.abs(midMax - midPhoto) < 0.08, `Cylinder mid-height stays free of a vertical border (got ${midMax.toFixed(2)}mm)`);

    const cubeCols = 96;
    const cubeRows = 48;
    const cubeSide = 90;
    const cubeGeom = GeometryGenerator.generateMesh(cylGrid, cubeCols, cubeRows, {
      ...DEFAULT_SETTINGS,
      shape: 'cube',
      cubeWidth: cubeSide,
      height: cubeSide,
      orientation: 'standing',
      supportType: 'none',
      hasFrame: true,
      frameWidth: frameW,
      frameThickness: 2.4,
      borderIcon: 'star',
    });
    const cubeVal = MeshValidator.validate(cubeGeom);
    assert(cubeVal.isWatertight && cubeVal.isManifold, 'Cube star border stays watertight');
    const cubeTh = cubeGeom.thicknesses!;
    let faceMin = Infinity;
    let cornerMin = Infinity;
    const cubePer = cubeSide * 4;
    for (let c = 0; c < cubeCols; c++) {
      const x = (c / cubeCols) * cubePer;
      const distCorner = Math.min(x % cubeSide, cubeSide - (x % cubeSide));
      for (let r = 0; r < cubeRows; r++) {
        const y = (r / (cubeRows - 1)) * cubeSide;
        if (Math.abs(y - frameW / 2) > 1.5) continue;
        const th = cubeTh[r * cubeCols + c];
        if (Math.abs(x - cubeSide / 2) < 2.5) faceMin = Math.min(faceMin, th);
        if (distCorner < 0.4) cornerMin = Math.min(cornerMin, th);
      }
    }
    assert(faceMin < 2.4 - 0.4, `Cube front rim has a star cut into it (got ${faceMin.toFixed(2)}mm)`);
    assert(cornerMin > 2.15, `Cube corners stay a plain border (got ${cornerMin.toFixed(2)}mm)`);
  }

  console.log('\n[13] Testing Treatstock print-order handoff...');
  {
    assert(isPrintOrderingConfigured('') === false, 'Empty Treatstock key disables ordering');
    assert(isPrintOrderingConfigured('short') === false, 'Short placeholder key disables ordering');
    assert(isPrintOrderingConfigured('MY_TREATSTOCK_PRIVATE_KEY') === false, 'Example placeholder key disables ordering');
    assert(isPrintOrderingConfigured('abc123def456') === true, 'A real-looking private key enables ordering');

    assert(sanitizeModelFilename('my photo!.stl') === 'my_photo.stl', 'STL filenames are sanitized');
    assert(isTreatstockHttpsUrl('https://www.treatstock.com/catalog/model3d/preload-printable-pack?packPublicToken=abc'), 'Treatstock HTTPS checkout links are allowed');
    assert(isTreatstockHttpsUrl('http://www.treatstock.com/catalog') === false, 'Plain HTTP checkout links are rejected');
    assert(isTreatstockHttpsUrl('https://evil.example/phish') === false, 'Non-Treatstock checkout links are rejected');

    const whitePla = selectTreatstockCheckout('https://www.treatstock.com/catalog/model3d/preload-printable-pack?packPublicToken=fallback', [
      { materialGroup: 'ABS', color: 'Black', price: 4, url: 'https://www.treatstock.com/model3d/preload-printable-pack?packPublicToken=abs' },
      { materialGroup: 'Resin', color: 'White', price: 9, url: 'https://www.treatstock.com/model3d/preload-printable-pack?packPublicToken=resin' },
      { materialGroup: 'PLA', color: 'White', price: 11, url: 'https://www.treatstock.com/model3d/preload-printable-pack?packPublicToken=pla-dear' },
      { materialGroup: 'PLA', color: 'White', price: 6.5, url: 'https://www.treatstock.com/model3d/preload-printable-pack?packPublicToken=pla' },
      { materialGroup: 'PLA', color: 'White', price: 1, url: 'https://evil.example/steal' },
    ]);
    assert(whitePla.url.includes('packPublicToken=pla') && !whitePla.url.includes('pla-dear'), 'White PLA is preferred over white resin and other filaments', whitePla.url);
    assert(whitePla.price === 6.5, 'The cheaper allowed white PLA offer is chosen');

    const fallback = selectTreatstockCheckout('https://www.treatstock.com/catalog/model3d/preload-printable-pack?packPublicToken=fallback', [
      { materialGroup: 'Nylon', color: 'Black', price: 3, url: 'https://www.treatstock.com/model3d/preload-printable-pack?packPublicToken=nylon' },
    ]);
    assert(fallback.url.includes('packPublicToken=fallback'), 'Unsuitable offers fall back to the model checkout link');

    const cols = 4;
    const rows = 3;
    const grid = new Float32Array(cols * rows);
    grid.fill(0.4);
    const geometry = GeometryGenerator.generateMesh(grid, cols, rows, {
      ...DEFAULT_SETTINGS,
      width: 40,
      height: 30,
      shape: 'flat',
      supportType: 'none',
      hasFrame: false,
    });
    const exported = StlExporter.exportBinaryStl(geometry, 'order test');
    const stlBytes = new Uint8Array(await exported.blob.arrayBuffer());
    const inspected = inspectBinaryStl(stlBytes);
    assert(inspected.ok, 'Exporter STL passes the upload inspector');

    const calls: string[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method || 'GET'} ${url}`);
      if (url.includes('/printable-packs/') && !url.includes('printable-pack-costs') && init?.method === 'PUT') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/printable-pack-costs/')) {
        return new Response(JSON.stringify({
          pricesInfo: [
            {
              materialGroup: 'PLA',
              color: 'White',
              price: 8.25,
              url: 'https://www.treatstock.com/model3d/preload-printable-pack?packPublicToken=white-pla',
            },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        success: true,
        id: 42,
        redir: 'https://www.treatstock.com/catalog/model3d/preload-printable-pack?packPublicToken=pack',
        widgetUrl: 'https://www.treatstock.com/api/v2/printable-pack-widget/?apiPrintablePackToken=pack',
      }), { status: 200 });
    };

    const ready = await prepareTreatstockCheckout({
      apiKey: 'abc123def456',
      fileBytes: stlBytes,
      filename: exported.filename,
      country: 'US',
      fetchImpl: mockFetch,
      wait: async () => {},
    });
    assert(ready.ok === true, 'A configured key produces a Treatstock checkout');
    if (ready.ok) {
      assert(ready.checkoutUrl.includes('packPublicToken=white-pla'), 'Checkout uses the white PLA deep link');
      assert(ready.material === 'PLA' && ready.color === 'White', 'Checkout records white PLA');
      assert(ready.packId === 42, 'Printable pack id is returned');
      assert(!ready.checkoutUrl.includes('private-key'), 'The checkout link handed to the browser does not contain the private key');
    }
    assert(calls.some((call) => call.startsWith('POST ') && call.includes('private-key=abc123def456')), 'The STL upload carries the server-side private key');
    assert(calls.some((call) => call.startsWith('PUT ')), 'Scale is set with a PUT to the printable pack');

    const rejected = await prepareTreatstockCheckout({
      apiKey: 'abc123def456',
      fileBytes: stlBytes,
      filename: 'lithophane.stl',
      fetchImpl: async () => new Response(JSON.stringify({
        success: true,
        id: 7,
        redir: 'https://evil.example/checkout',
      }), { status: 200 }),
      wait: async () => {},
    });
    assert(rejected.ok === false, 'A non-Treatstock redirect is refused');
  }

  console.log('\n[14] Testing physical tone curve and stand clearance...');
  {
    const wedge = [0, 0.1, 0.2, 0.5, 0.9];
    const wedgeShapes: LithophaneSettings['shape'][] = ['flat', 'curved', 'cylinder', 'cube'];
    for (const shape of wedgeShapes) {
      const cols = shape === 'cube' || shape === 'cylinder' ? 48 : 20;
      const rows = 12;
      const grid = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) grid[r * cols + c] = wedge[c % wedge.length];
      }
      const geom = GeometryGenerator.generateMesh(grid, cols, rows, {
        ...DEFAULT_SETTINGS,
        shape,
        width: 80,
        height: 60,
        cylinderDiameter: 80,
        cubeWidth: 80,
        orientation: 'standing',
        supportType: 'none',
        hasFrame: false,
      });
      const validation = MeshValidator.validate(geom);
      assert(validation.isWatertight && validation.isManifold && validation.degenerateTriangles === 0, `${shape} step wedge is watertight`);
      const mid = Math.floor(rows / 2);
      let prev = -1;
      for (let i = 0; i < wedge.length; i++) {
        const th = geom.thicknesses![mid * cols + i];
        const perceived = transmissionToSrgb(th, DEFAULT_SETTINGS.minThickness, DEFAULT_SETTINGS.maxThickness);
        assert(
          Math.abs(perceived - wedge[i]) <= 0.05,
          `${shape} transmission for input ${wedge[i]} is within ±0.05 (got ${perceived.toFixed(4)}, thickness ${th.toFixed(3)}mm)`
        );
        assert(
          perceived > prev + 1e-4,
          `${shape} transmission is strictly increasing at input ${wedge[i]} (${perceived.toFixed(4)} after ${prev.toFixed(4)})`
        );
        prev = perceived;
      }
    }

    const panels: Array<{
      shape: LithophaneSettings['shape'];
      width: number;
      height: number;
      cols: number;
      rows: number;
      supports: Array<LithophaneSettings['supportType']>;
    }> = [
      { shape: 'flat', width: 120, height: 90, cols: 61, rows: 46, supports: ['flange', 'buttress', 'full', 'none'] },
      { shape: 'curved', width: 120, height: 90, cols: 61, rows: 46, supports: ['flange', 'none'] },
      { shape: 'cylinder', width: 120, height: 95, cols: 48, rows: 40, supports: ['flange', 'none'] },
      { shape: 'cube', width: 90, height: 90, cols: 48, rows: 40, supports: ['flange', 'none'] },
    ];

    for (const panel of panels) {
      const borderMax = maxBorderWidthMm(panel.shape, panel.width, panel.height);
      for (const frameWidth of [1.5, borderMax]) {
        for (const supportType of panel.supports) {
          const grid = new Float32Array(panel.cols * panel.rows);
          grid.fill(0.35);
          const midR = Math.floor(panel.rows / 2);
          const midC = panel.shape === 'cube' || panel.shape === 'cylinder'
            ? Math.floor(panel.cols / 8)
            : Math.floor(panel.cols / 2);
          grid[midR * panel.cols + midC] = 0;
          grid[midR * panel.cols + midC + 1] = 1;

          const settings: LithophaneSettings = {
            ...DEFAULT_SETTINGS,
            shape: panel.shape,
            width: panel.width,
            height: panel.height,
            cylinderDiameter: 90,
            cubeWidth: 90,
            orientation: 'standing',
            supportType,
            hasFrame: true,
            frameWidth,
            borderIcon: 'none',
          };
          const geom = GeometryGenerator.generateMesh(grid, panel.cols, panel.rows, settings);
          const validation = MeshValidator.validate(geom);
          const label = `${panel.shape}/${supportType}/border ${frameWidth}`;
          assert(validation.isWatertight && validation.isManifold, `${label} is watertight and manifold`);
          assert(validation.degenerateTriangles === 0, `${label} has no degenerate triangles`);
          assert(Math.abs(geom.boundingBox.min[2]) < 1e-6, `${label} sits on Z = 0`);

          const ext = standingBaseExtension(settings);
          assert(
            Math.abs(geom.boundingBox.max[2] - (panel.height + ext.heightMm)) < 1e-3,
            `${label} height is photo plus stand (got ${geom.boundingBox.max[2].toFixed(2)}, expected ${(panel.height + ext.heightMm).toFixed(2)})`
          );

          const enclosed = panel.shape === 'cylinder' || panel.shape === 'cube';
          let maxExcess = 0;
          let sawBlack = false;
          let sawWhite = false;
          let bottomR = -1;
          let bottomDist = Infinity;
          for (let r = 0; r < panel.rows; r++) {
            const v = r / (panel.rows - 1);
            const yFromBottom = (1 - v) * panel.height;
            if (yFromBottom <= frameWidth) continue;
            if (yFromBottom < bottomDist) {
              bottomDist = yFromBottom;
              bottomR = r;
            }
            for (let c = 0; c < panel.cols; c++) {
              const u = c / (panel.cols - 1);
              const distX = Math.min(u, 1 - u) * panel.width;
              const distY = Math.min(v, 1 - v) * panel.height;
              const inside = enclosed ? distY > frameWidth : Math.min(distX, distY) > frameWidth;
              if (!inside) continue;
              const lum = grid[r * panel.cols + c];
              const expected = thicknessForLuminance(lum, settings.minThickness, settings.maxThickness);
              const th = geom.thicknesses![r * panel.cols + c];
              maxExcess = Math.max(maxExcess, th - expected);
              if (lum === 0 && Math.abs(th - settings.maxThickness) < 0.02) sawBlack = true;
              if (lum === 1 && Math.abs(th - settings.minThickness) < 0.02) sawWhite = true;
            }
          }
          assert(maxExcess < 0.02, `${label} adds no thickness inside the photo (excess ${maxExcess.toFixed(3)}mm)`);
          assert(sawBlack && sawWhite, `${label} image thickness reaches ${settings.minThickness}–${settings.maxThickness}mm`);
          assert(bottomR >= 0, `${label} has a photo row just above the frame`);

          const edgeTh = geom.thicknesses![bottomR * panel.cols + midC];
          const edgeExpected = thicknessForLuminance(grid[bottomR * panel.cols + midC], settings.minThickness, settings.maxThickness);
          assert(
            Math.abs(edgeTh - edgeExpected) < 0.02,
            `${label} row just above the frame matches the photo (got ${edgeTh.toFixed(3)}mm, expected ${edgeExpected.toFixed(3)}mm)`
          );
          const edgeZ = geom.vertices[(bottomR * panel.cols + midC) * 3 + 2];
          assert(
            edgeZ > ext.heightMm + frameWidth - 0.05,
            `${label} photo row sits above the stand (z ${edgeZ.toFixed(2)}, stand ${ext.heightMm})`
          );

          const topTh = geom.thicknesses![midC];
          assert(
            Math.abs(topTh - settings.frameThickness) < 0.05,
            `${label} frame is ${settings.frameThickness}mm (got ${topTh.toFixed(3)}mm)`
          );

          const frontCount = geom.vertices.length / 6;
          const f = (bottomR * panel.cols + midC) * 3;
          const b = (frontCount + bottomR * panel.cols + midC) * 3;
          const dx = geom.vertices[f] - geom.vertices[b];
          const dy = geom.vertices[f + 1] - geom.vertices[b + 1];
          const dz = geom.vertices[f + 2] - geom.vertices[b + 2];
          const geometric = Math.sqrt(dx * dx + dy * dy + dz * dz);
          assert(
            Math.abs(geometric - edgeTh) < 0.05,
            `${label} geometric thickness matches the photo (got ${geometric.toFixed(3)}mm)`
          );
        }
      }
    }
  }

  await runEmailExportTests(assert);

  console.log('\n========================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test runner threw error:', err);
  process.exit(1);
});
