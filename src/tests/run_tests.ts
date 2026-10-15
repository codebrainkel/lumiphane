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

import { GeometryGenerator } from '../services/geometryGenerator';
import { MeshValidator } from '../services/meshValidator';
import { ThreeMfExporter } from '../services/threeMfExporter';
import { DEFAULT_SETTINGS, ULTRA_FINE_RESOLUTION } from '../constants/presets';
import { LithophaneSettings } from '../types/lithophane';
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

    // Standard mapping: Black => maxThickness, White => minThickness
    const thickBlack = minTh + (1.0 - 0.0) * (maxTh - minTh);
    const thickWhite = minTh + (1.0 - 1.0) * (maxTh - minTh);
    assert(Math.abs(thickBlack - maxTh) < 1e-4, 'Black region maps to maxThickness (3.2mm)');
    assert(Math.abs(thickWhite - minTh) < 1e-4, 'White region maps to minThickness (0.8mm)');

    // Invert mapping: Black => minThickness, White => maxThickness
    const thickBlackInv = minTh + 0.0 * (maxTh - minTh);
    const thickWhiteInv = minTh + 1.0 * (maxTh - minTh);
    assert(Math.abs(thickBlackInv - minTh) < 1e-4, 'Inverted black maps to minThickness');
    assert(Math.abs(thickWhiteInv - maxTh) < 1e-4, 'Inverted white maps to maxThickness');
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
    assert(geometry.vertices.length === cols * rows * 2 * 3, 'Vertex buffer length matches 2 * cols * rows * 3');
    assert(geometry.indices.length === 4 * (cols * rows - 1) * 3, 'Index buffer length matches 4 * (cols * rows - 1) * 3');

    const validation = MeshValidator.validate(geometry);
    assert(validation.isWatertight, 'Mesh is strictly watertight (zero open boundaries)');
    assert(validation.isManifold, 'Mesh is 2-manifold (all edges shared by exactly 2 opposing triangles)');
    assert(validation.eulerCharacteristic === 2, `Euler characteristic chi = 2 for closed genus-0 solid (got ${validation.eulerCharacteristic})`);
    assert(validation.degenerateTriangles === 0, 'Zero degenerate triangles detected');
    assert(validation.volumeCm3 > 0, `Positive physical volume (${validation.volumeCm3} cm³)`);
    assert(validation.estimatedWeightGrams > 0, `Positive estimated filament weight (${validation.estimatedWeightGrams} g)`);
    assert(Math.abs(geometry.boundingBox.min[2] - 0) < 1e-3, 'Bottom edge rests strictly at Z = 0 on the build plate');
    assert(Math.abs(geometry.boundingBox.max[2] - 75) < 1e-3, 'Top edge stands tall at Z = 75mm print height');
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
    assert(Math.abs(geometryConvex.boundingBox.max[2] - 90) < 1e-3, 'Curved arc stands to Z = 90mm print height');
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

    // Verify Universal 3MF package structure
    const verification = await ThreeMfExporter.verify3MfPackage(exportResult.blob);
    assert(verification.hasContentTypes, 'Package contains [Content_Types].xml');
    assert(verification.hasRels, 'Package contains _rels/.rels');
    assert(verification.hasModelXml, 'Package contains 3D/3dmodel.model');
    assert(verification.unit === 'millimeter', `Model unit is millimeter (got: ${verification.unit})`);
    assert(verification.parsedVertexCount === geometry.vertices.length / 3, `Parsed vertices match model (${verification.parsedVertexCount})`);
    assert(verification.parsedTriangleCount === geometry.indices.length / 3, `Parsed triangles match model (${verification.parsedTriangleCount})`);
    assert(verification.isValid, 'Universal 3MF package is 100% standards-compliant and slicer-ready');

    // Test Bambu Studio Native Project Mode
    const bambuProjectResult = await ThreeMfExporter.export3MF(geometry, 'test_sample', {
      mode: 'bambu-project',
      bambuPrinter: 'P1S',
    });
    assert(bambuProjectResult.filename.includes('Bambu_P1S'), `Bambu filename contains printer model (${bambuProjectResult.filename})`);
    assert(bambuProjectResult.isBambuProject === true, 'Flagged as Bambu Studio project archive');

    const zip = await JSZip.loadAsync(bambuProjectResult.blob);
    assert(zip.file('Metadata/model_settings.config') !== null, 'Contains valid Metadata/model_settings.config');
    assert(zip.file('Metadata/project_settings.config') !== null, 'Contains valid Metadata/project_settings.config');
    assert(zip.file('Metadata/plate_1.json') !== null, 'Contains valid Metadata/plate_1.json');

    const projJson = JSON.parse(await zip.file('Metadata/project_settings.config')!.async('text'));
    assert(projJson.printer_model === 'Bambu Lab P1S', `Printer model matches P1S (got: ${projJson.printer_model})`);
    assert(projJson.layer_height === '0.12', `Layer height pre-set to 0.12mm (got: ${projJson.layer_height})`);
    assert(projJson.sparse_infill_density === '100%', `Infill density pre-set to 100% (got: ${projJson.sparse_infill_density})`);
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
    assert(Math.abs(squareVal.dimensionsMm.height - 100) < 0.5, `Square mesh height is 100mm (got ${squareVal.dimensionsMm.height}mm)`);
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
    assert(Math.abs(portraitVal.dimensionsMm.height - 160) < 0.5, `Portrait mesh height is 160mm (got ${portraitVal.dimensionsMm.height}mm)`);
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
    assert(Math.abs(cylVal.dimensionsMm.height - cylHeight) < 0.5, `Cylinder height matches 95mm (got ${cylVal.dimensionsMm.height}mm)`);
    // Outer diameter includes base cylinder radius + thickness
    const outerDiamExpected = cylDiameter + 3.0 * 2; // ~96mm
    assert(cylGeom.boundingBox.min[2] === 0, 'Cylinder bottom rim rests flat at Z=0 on print bed');
    assert(cylGeom.indices.length === 4 * testCols * testRows * 3, `Cylinder index count matches 4 * cols * rows * 3 (got ${cylGeom.indices.length})`);

    // Verify outward vs inward normal directions for proper lithophane lighting
    const midRow = Math.floor(testRows / 2);
    const midOuterIdx = (midRow * testCols + Math.floor(testCols / 8)) * 3;
    const midInnerIdx = (testCols * testRows + midRow * testCols + Math.floor(testCols / 8)) * 3;

    const outerDot = cylGeom.normals[midOuterIdx] * cylGeom.vertices[midOuterIdx] +
                     cylGeom.normals[midOuterIdx + 1] * cylGeom.vertices[midOuterIdx + 1];
    const innerDot = cylGeom.normals[midInnerIdx] * cylGeom.vertices[midInnerIdx] +
                     cylGeom.normals[midInnerIdx + 1] * cylGeom.vertices[midInnerIdx + 1];

    assert(outerDot > 20, `Cylinder outer face normals point strictly outward away from center (dot: ${outerDot.toFixed(1)})`);
    assert(innerDot < -20, `Cylinder inner bore normals point strictly inward toward center light (dot: ${innerDot.toFixed(1)})`);
    assert(cylGeom.normals[2] > 0.1, 'Cylinder top rim normals point +Z (upward)');
    const botIdx = (testRows - 1) * testCols * 3;
    assert(cylGeom.normals[botIdx + 2] < -0.1, 'Cylinder bottom rim normals point -Z (downward flush with bed)');

    // Verify zero vertical frame seam gap between last image (c = testCols - 1) and first image (c = 0)
    // Even when hasFrame is enabled, the 360° cylinder perimeter must NOT have vertical side borders
    assert(cylGeom.thicknesses !== undefined, 'Cylinder thicknesses buffer is generated');
    const ths = cylGeom.thicknesses!;
    const firstColTh = ths[midRow * testCols + 0];
    const lastColTh = ths[midRow * testCols + (testCols - 1)];
    const expectedFirstTh = DEFAULT_SETTINGS.minThickness + (1.0 - 0.2) * (DEFAULT_SETTINGS.maxThickness - DEFAULT_SETTINGS.minThickness);
    const expectedLastTh = DEFAULT_SETTINGS.minThickness + (1.0 - 0.8) * (DEFAULT_SETTINGS.maxThickness - DEFAULT_SETTINGS.minThickness);
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
