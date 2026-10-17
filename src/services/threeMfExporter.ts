import JSZip from 'jszip';
import { getBambuPrinter, retargetBambuProject } from '../constants/bambuPrinters';
import { MeshGeometryData } from '../types/lithophane';

/**
 * Print profile taken from blank-profile.3mf, a project saved by Bambu Studio.
 * Studio rejects handmade project_settings.config files ("invalid config") and
 * then imports geometry only. The saved file is copied through, with supports
 * forced off. Every other process setting, including classic walls, stays.
 */
export interface EmbeddedBambuProfile {
  printerModel: string;
  printerSettingsId: string;
  printSettingsId: string;
  filamentSettingsId: string;
  layerHeight: string;
  infillDensity: string;
  brimType: string;
  brimWidth: string;
  bedType: string;
  version: string;
  nozzleDiameter: string[];
  extruderType: string[];
}

export interface ThreeMfExportOptions {
  mode?: 'universal' | 'bambu-project';
  /** Bambu printer id from BAMBU_PRINTERS. Defaults to the saved A2L profile. */
  bambuPrinterId?: string;
  /** Aborts the export between steps. A finished download must not start after this fires. */
  signal?: AbortSignal;
}

/** Import and fetch of blank-profile.3mf fail with a clear error after this long. */
export const BAMBU_TEMPLATE_TIMEOUT_MS = 20_000;

export const BAMBU_TEMPLATE_TIMEOUT_MESSAGE = 'The Bambu Studio profile took too long to load.';

/** Quoted JSON value only, so the semicolon key list that names this setting is left alone. */
const ENABLE_SUPPORT_ON = /"enable_support"\s*:\s*"1"/g;

function withSupportsDisabled(projectSettingsText: string): string {
  return projectSettingsText.replace(ENABLE_SUPPORT_ON, '"enable_support": "0"');
}

const VOLUME_OBJECT_ID = 1;
const MODEL_OBJECT_ID = 2;
const IDENTIFY_ID = 1;
const BAMBU_IDENTITY_3MF = '1 0 0 0 1 0 0 0 1 0 0 0';
const BAMBU_IDENTITY_MATRIX = '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1';
const MODEL_UNIT = 'millimeter';
const MODEL_FILE = '3D/3dmodel.model';

let templateBytesPromise: Promise<Uint8Array> | null = null;
let embeddedProfilePromise: Promise<EmbeddedBambuProfile> | null = null;

export function exportAbortError(): DOMException {
  return new DOMException('The export was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw exportAbortError();
}

/** Lets a click (Cancel) run, then rejects if the export was aborted. */
async function checkpoint(signal?: AbortSignal, lastYield?: { at: number }): Promise<void> {
  throwIfAborted(signal);
  const now = Date.now();
  if (lastYield && now - lastYield.at < 32) return;
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (lastYield) lastYield.at = Date.now();
  throwIfAborted(signal);
}

function raceTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function waitForExport<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(exportAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

async function readBlankProfileBytes(): Promise<Uint8Array> {
  const started = Date.now();
  const remaining = () => BAMBU_TEMPLATE_TIMEOUT_MS - (Date.now() - started);
  const timed = async <T>(work: Promise<T>): Promise<T> => {
    const left = remaining();
    if (left <= 0) throw new Error(BAMBU_TEMPLATE_TIMEOUT_MESSAGE);
    try {
      return await raceTimeout(work, left, BAMBU_TEMPLATE_TIMEOUT_MESSAGE);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(BAMBU_TEMPLATE_TIMEOUT_MESSAGE);
      }
      throw err;
    }
  };

  const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string';
  if (isNode) {
    const { readFile } = await timed(import('node:fs/promises'));
    const { fileURLToPath } = await timed(import('node:url'));
    const path = fileURLToPath(new URL('../../blank-profile.3mf', import.meta.url));
    return new Uint8Array(await timed(readFile(path)));
  }

  const mod = await timed(import('../../blank-profile.3mf?url') as Promise<{ default: string }>);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, remaining()));
  try {
    const res = await fetch(mod.default, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch the Bambu Studio profile (${res.status})`);
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(BAMBU_TEMPLATE_TIMEOUT_MESSAGE);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function loadTemplateBytes(): Promise<Uint8Array> {
  if (!templateBytesPromise) {
    templateBytesPromise = readBlankProfileBytes().catch((err) => {
      templateBytesPromise = null;
      throw err;
    });
  }
  return templateBytesPromise;
}

function parseEmbeddedProfile(configText: string): EmbeddedBambuProfile {
  const config = JSON.parse(configText) as Record<string, unknown>;
  const asString = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value : fallback;
  const asStringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((entry) => String(entry)) : [];

  const profile: EmbeddedBambuProfile = {
    printerModel: asString(config.printer_model),
    printerSettingsId: asString(config.printer_settings_id),
    printSettingsId: asString(config.print_settings_id),
    filamentSettingsId: asStringList(config.filament_settings_id)[0] ?? '',
    layerHeight: asString(config.layer_height),
    infillDensity: asString(config.sparse_infill_density),
    brimType: asString(config.brim_type),
    brimWidth: asString(config.brim_width),
    bedType: asString(config.curr_bed_type),
    version: asString(config.version),
    nozzleDiameter: asStringList(config.nozzle_diameter),
    extruderType: asStringList(config.extruder_type),
  };

  if (!profile.printerModel || !profile.version || profile.nozzleDiameter.length === 0 || profile.extruderType.length === 0) {
    throw new Error('blank-profile.3mf is missing a complete Bambu Studio project_settings.config');
  }
  if (profile.nozzleDiameter.length !== profile.extruderType.length) {
    throw new Error('blank-profile.3mf printer config has a mismatched extruder count');
  }
  return profile;
}

export function loadEmbeddedBambuProfile(): Promise<EmbeddedBambuProfile> {
  if (!embeddedProfilePromise) {
    embeddedProfilePromise = (async () => {
      const zip = await JSZip.loadAsync(await loadTemplateBytes());
      const configFile = zip.file('Metadata/project_settings.config');
      if (!configFile) {
        throw new Error('blank-profile.3mf has no Metadata/project_settings.config');
      }
      return parseEmbeddedProfile(await configFile.async('text'));
    })().catch((err) => {
      embeddedProfilePromise = null;
      throw err;
    });
  }
  return embeddedProfilePromise;
}

function printerToken(printerModel: string): string {
  const stripped = printerModel.replace(/^Bambu Lab\s+/i, '').trim();
  return stripped.replace(/[^a-zA-Z0-9]+/g, '') || 'Bambu';
}

function isUnusedPlateFile(path: string): boolean {
  return /(?:^|\/)(?:plate_(?:no_light_)?[2-9](?:_small)?|top_[2-9]|pick_[2-9])\./.test(path)
    || /plate_[2-9]\.json$/.test(path);
}

function singlePlateFilamentSequence(sequenceText: string): string {
  let plate1: unknown = { nozzle_sequence: [], optimal_assignment: [], sequence: [] };
  if (sequenceText.trim()) {
    try {
      const parsed = JSON.parse(sequenceText) as { plate_1?: unknown };
      if (parsed.plate_1) plate1 = parsed.plate_1;
    } catch {
      // Keep the empty plate-1 sequence if the template file is not JSON.
    }
  }
  return JSON.stringify({ plate_1: plate1 });
}

function bedSizeFromPrintableArea(printableArea: unknown): { width: number; depth: number } {
  let width = 0;
  let depth = 0;
  if (Array.isArray(printableArea)) {
    for (const pair of printableArea) {
      if (typeof pair !== 'string') continue;
      const [x, y] = pair.split('x').map(Number);
      if (Number.isFinite(x) && x > width) width = x;
      if (Number.isFinite(y) && y > depth) depth = y;
    }
  }
  return { width: width || 256, depth: depth || 256 };
}

/**
 * Bambu's bed origin is the front-left corner. Mesh vertices are centered on
 * zero, so an identity transform parks the lithophane on that corner, hanging
 * off the plate. This moves the part to the middle of the bed, base on Z = 0.
 * A sheet that was modeled face-down is stood up first: its photo height
 * becomes Z and its thickness stays horizontal.
 */
interface BambuBedPlacement {
  standUp: boolean;
  bedBBox: [number, number, number, number];
  map(x: number, y: number, z: number): [number, number, number];
}

function bambuBedPlacement(
  geometry: MeshGeometryData,
  bedWidth: number,
  bedDepth: number
): BambuBedPlacement {
  const [minX, minY, minZ] = geometry.boundingBox.min;
  const [maxX, maxY, maxZ] = geometry.boundingBox.max;
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const standUp = sizeZ < Math.min(sizeX, sizeY) * 0.35;

  const loX = minX;
  const hiX = maxX;
  const loY = standUp ? -maxZ : minY;
  const hiY = standUp ? -minZ : maxY;
  const loZ = standUp ? minY : minZ;
  const tx = bedWidth / 2 - (loX + hiX) / 2;
  const ty = bedDepth / 2 - (loY + hiY) / 2;
  const tz = -loZ;

  return {
    standUp,
    bedBBox: [loX + tx, loY + ty, hiX + tx, hiY + ty],
    map(x, y, z) {
      if (standUp) return [x + tx, -z + ty, y + tz];
      return [x + tx, y + ty, z + tz];
    },
  };
}

export interface ThreeMfExportResult {
  blob: Blob;
  filename: string;
  filesizeBytes: number;
  /** Vertex tags written into the model XML. */
  vertexCount: number;
  /** Triangle tags written into the model XML. */
  triangleCount: number;
  isBambuProject?: boolean;
}

/** Counts recorded while the model XML was written. Verify uses these instead of parsing the file. */
export interface ThreeMfWrittenModel {
  vertexCount: number;
  triangleCount: number;
  unit?: string;
}

export class ThreeMfExporter {
  /**
   * Generates a 3MF package file.
   * - Universal mode: strict 3MF Core Specification (ISO/IEC 25422), pure geometry.
   * - Bambu Project mode: the lithophane mesh inside the saved Bambu Studio project
   *   from blank-profile.3mf, so Studio loads the print profile with the geometry.
   */
  static async export3MF(
    geometry: MeshGeometryData,
    modelName: string = 'lithophane',
    options?: ThreeMfExportOptions
  ): Promise<ThreeMfExportResult> {
    const signal = options?.signal;
    throwIfAborted(signal);
    const isBambuProject = options?.mode === 'bambu-project';
    const cleanName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'lithophane';
    const profile = isBambuProject ? await waitForExport(loadEmbeddedBambuProfile(), signal) : null;
    throwIfAborted(signal);
    const printer = isBambuProject ? getBambuPrinter(options?.bambuPrinterId) : null;
    const built = isBambuProject
      ? await this.buildBambuProjectZip(geometry, cleanName, modelName, profile!, printer!, signal)
      : await this.buildUniversalZip(geometry, modelName, signal);
    const { zip, written } = built;

    const expectedVertices = geometry.vertices.length / 3;
    const expectedTriangles = geometry.indices.length / 3;
    if (written.vertexCount !== expectedVertices || written.triangleCount !== expectedTriangles) {
      throw new Error(
        `3MF model counts do not match the mesh (${written.vertexCount} vertices, ${written.triangleCount} triangles).`
      );
    }
    if (!zip.file(MODEL_FILE)) {
      throw new Error('3MF archive is missing 3D/3dmodel.model');
    }

    const blob = await this.zipToBlob(zip, signal);

    const isStanding = geometry.boundingBox.size[2] > geometry.boundingBox.size[1];
    const widthMm = Math.round(geometry.boundingBox.size[0]);
    const heightMm = Math.round(isStanding ? geometry.boundingBox.size[2] : geometry.boundingBox.size[1]);
    const layerTag = profile?.layerHeight || '0.12';

    const filename = isBambuProject
      ? `${cleanName}_Bambu_${printerToken(printer!.printerModel)}_${layerTag}mm.3mf`
      : `${cleanName}_${widthMm}x${heightMm}mm.3mf`;

    return {
      blob,
      filename,
      filesizeBytes: blob.size,
      vertexCount: written.vertexCount,
      triangleCount: written.triangleCount,
      isBambuProject,
    };
  }

  private static async buildUniversalZip(
    geometry: MeshGeometryData,
    modelName: string,
    signal?: AbortSignal
  ): Promise<{ zip: JSZip; written: ThreeMfWrittenModel & { xml: string } }> {
    const written = await this.generateModelXml(geometry, modelName, undefined, undefined, signal);
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`
    );
    zip.folder('_rels')?.file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`
    );
    zip.folder('3D')?.file('3dmodel.model', written.xml);
    return { zip, written };
  }

  /**
   * Copies the saved Bambu Studio project and swaps in the lithophane mesh.
   * Supports are turned off on every printer. The A2L profile is otherwise
   * byte-for-byte. Another Bambu printer keeps the lithophane process settings
   * and replaces the machine profile (bed, limits, and G-code) with that
   * model's Studio 02.08.02.60 preset.
   */
  private static async buildBambuProjectZip(
    geometry: MeshGeometryData,
    cleanName: string,
    modelName: string,
    profile: EmbeddedBambuProfile,
    printer: ReturnType<typeof getBambuPrinter>,
    signal?: AbortSignal
  ): Promise<{ zip: JSZip; written: ThreeMfWrittenModel & { xml: string } }> {
    throwIfAborted(signal);
    const template = await JSZip.loadAsync(await waitForExport(loadTemplateBytes(), signal));
    throwIfAborted(signal);
    const projectSettingsFile = template.file('Metadata/project_settings.config');
    const modelSettingsFile = template.file('Metadata/model_settings.config');
    if (!projectSettingsFile || !modelSettingsFile) {
      throw new Error('blank-profile.3mf is not a Bambu Studio project');
    }

    const projectSettingsText = await projectSettingsFile.async('text');
    const projectSettings = JSON.parse(projectSettingsText) as Record<string, unknown>;
    const retargeted = retargetBambuProject(projectSettings, printer);
    projectSettings.enable_support = '0';
    const zip = new JSZip();

    const replacements = new Set([
      '3D/3dmodel.model',
      'Metadata/model_settings.config',
      'Metadata/project_settings.config',
      'Metadata/plate_1.json',
      'Metadata/filament_sequence.json',
    ]);

    const copies: Array<Promise<void>> = [];
    template.forEach((relativePath, file) => {
      if (file.dir || replacements.has(relativePath) || isUnusedPlateFile(relativePath)) return;
      copies.push(
        file.async('uint8array').then((bytes) => {
          throwIfAborted(signal);
          zip.file(relativePath, bytes);
        })
      );
    });
    await Promise.all(copies);
    await checkpoint(signal);

    const bed = bedSizeFromPrintableArea(projectSettings.printable_area);
    const sequenceFile = template.file('Metadata/filament_sequence.json');
    const [modelSettingsText, plate1Json, sequenceText] = await Promise.all([
      modelSettingsFile.async('text'),
      this.buildPlateJson(template, geometry, cleanName, projectSettings, 1),
      sequenceFile ? sequenceFile.async('text') : Promise.resolve(''),
    ]);
    const written = await this.generateModelXml(geometry, modelName, profile, bed, signal);
    if (!written.xml.includes('BambuStudio-')) {
      throw new Error('3dmodel.model is missing the Bambu Studio application stamp');
    }
    zip.file(MODEL_FILE, written.xml);
    zip.file(
      'Metadata/project_settings.config',
      retargeted ? JSON.stringify(projectSettings) : withSupportsDisabled(projectSettingsText),
    );
    zip.file(
      'Metadata/model_settings.config',
      this.buildBambuModelSettings(modelSettingsText, cleanName, geometry.indices.length / 3)
    );
    zip.file('Metadata/plate_1.json', plate1Json);
    zip.file('Metadata/filament_sequence.json', singlePlateFilamentSequence(sequenceText));
    return { zip, written };
  }

  /**
   * Places the mesh on plate 1 using the same model_settings grammar Studio writes:
   * the mesh is a part, the parent object is what the plate instance points at.
   */
  private static buildBambuModelSettings(templateXml: string, cleanName: string, triangleCount: number): string {
    const safeName = this.escapeXml(cleanName);
    const objectXml = `  <object id="${MODEL_OBJECT_ID}">
    <metadata key="name" value="${safeName}"/>
    <metadata key="extruder" value="1"/>
    <metadata face_count="${triangleCount}"/>
    <part id="${VOLUME_OBJECT_ID}" subtype="normal_part">
      <metadata key="name" value="${safeName}"/>
      <metadata key="matrix" value="${BAMBU_IDENTITY_MATRIX}"/>
      <metadata key="source_file" value="${safeName}.stl"/>
      <metadata key="source_object_id" value="0"/>
      <metadata key="source_volume_id" value="0"/>
      <metadata key="source_offset_x" value="0"/>
      <metadata key="source_offset_y" value="0"/>
      <metadata key="source_offset_z" value="0"/>
      <mesh_stat face_count="${triangleCount}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>
`;
    const instanceXml = `    <model_instance>
      <metadata key="object_id" value="${MODEL_OBJECT_ID}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="${IDENTIFY_ID}"/>
    </model_instance>
`;
    const assembleXml = `  <assemble>
    <assemble_item object_id="${MODEL_OBJECT_ID}" instance_id="0" transform="${BAMBU_IDENTITY_3MF}" offset="0 0 0" />
  </assemble>`;

    if (!templateXml.includes('<plate>') || !templateXml.includes('</plate>')) {
      throw new Error('blank-profile.3mf model_settings.config has no plate');
    }

    let xml = templateXml.replace(/<config>\s*/, `<config>\n${objectXml}`);
    xml = xml.replace('</plate>', `${instanceXml}  </plate>`);
    if (/<assemble>[\s\S]*?<\/assemble>/.test(xml)) {
      xml = xml.replace(/<assemble>[\s\S]*?<\/assemble>/, assembleXml);
    } else {
      xml = xml.replace('</config>', `${assembleXml}\n</config>`);
    }

    // The saved profile can carry empty extra plates. Keep the plate that holds the lithophane.
    let keptPlate = false;
    xml = xml.replace(/[ \t]*<plate>[\s\S]*?<\/plate>\s*/g, (block) => {
      if (keptPlate) return '';
      keptPlate = true;
      return block;
    });
    return xml;
  }

  private static async buildPlateJson(
    template: JSZip,
    geometry: MeshGeometryData | null,
    cleanName: string,
    projectSettings: Record<string, unknown>,
    plateNumber: number
  ): Promise<string> {
    const existingFile = template.file(`Metadata/plate_${plateNumber}.json`);
    const existing = existingFile ? (JSON.parse(await existingFile.async('text')) as Record<string, unknown>) : {};
    const { width, depth } = bedSizeFromPrintableArea(projectSettings.printable_area);
    const layerHeight = Number(projectSettings.layer_height);
    const nozzle = Array.isArray(projectSettings.nozzle_diameter)
      ? Number(projectSettings.nozzle_diameter[0])
      : 0.4;
    const filamentColors = Array.isArray(projectSettings.filament_colour)
      ? projectSettings.filament_colour
      : ['#FFFFFF'];

    let bbox = [0, 0, 0, 0];
    let objects: Array<Record<string, unknown>> = [];
    if (geometry) {
      bbox = [...bambuBedPlacement(geometry, width, depth).bedBBox];
      objects = [
        {
          area: Math.abs(geometry.boundingBox.size[0] * geometry.boundingBox.size[1]),
          bbox,
          id: IDENTIFY_ID,
          layer_height: Number.isFinite(layerHeight) ? layerHeight : 0.12,
          name: cleanName,
        },
      ];
    }

    return JSON.stringify({
      ...existing,
      bbox_all: bbox,
      bbox_objects: objects,
      bed_type: existing.bed_type ?? 'textured_plate',
      filament_colors: filamentColors,
      filament_ids: existing.filament_ids ?? [0],
      first_extruder: existing.first_extruder ?? 0,
      is_seq_print: false,
      nozzle_diameter: Number.isFinite(nozzle) ? nozzle : 0.4,
      version: existing.version ?? 2,
    });
  }

  /**
   * Builds the official 3MF model XML string with high performance chunking.
   */
  private static async generateModelXml(
    geometry: MeshGeometryData,
    title: string,
    bambuProfile?: EmbeddedBambuProfile,
    bed?: { width: number; depth: number },
    signal?: AbortSignal
  ): Promise<ThreeMfWrittenModel & { xml: string }> {
    throwIfAborted(signal);
    const lastYield = { at: Date.now() };
    const { vertices, indices } = geometry;
    const vertexCount = vertices.length / 3;
    const triangleCount = indices.length / 3;
    const dateStr = new Date().toISOString().split('T')[0];
    const safeTitle = this.escapeXml(title);
    const meshUuid = this.createUuid();
    const objectUuid = this.createUuid();
    const componentUuid = this.createUuid();
    const buildUuid = this.createUuid();
    const itemUuid = this.createUuid();

    const header = bambuProfile
      ? `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${MODEL_UNIT}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="Application">BambuStudio-${this.escapeXml(bambuProfile.version)}</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="CreationDate">${dateStr}</metadata>
 <metadata name="ModificationDate">${dateStr}</metadata>
 <metadata name="Title">${safeTitle}</metadata>
 <metadata name="Thumbnail_Middle">/Metadata/plate_1.png</metadata>
 <metadata name="Thumbnail_Small">/Metadata/plate_1_small.png</metadata>
 <resources>
  <object id="${VOLUME_OBJECT_ID}" type="model" p:UUID="${meshUuid}">
   <mesh>
    <vertices>\n`
      : `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${MODEL_UNIT}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${safeTitle} Lithophane</metadata>
  <metadata name="Designer">Lumiphane 3D</metadata>
  <metadata name="Application">Lumiphane 3D Generator</metadata>
  <metadata name="CreationDate">${dateStr}</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>\n`;

    // Fast vertex serialization. The counter is the number of <vertex> tags actually written.
    const vertChunks: string[] = [];
    const CHUNK_SIZE = 5000;
    let tempStr = '';
    let writtenVertices = 0;
    const placement = bambuProfile
      ? bambuBedPlacement(geometry, bed?.width ?? 256, bed?.depth ?? 256)
      : null;

    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      let x = vertices[idx];
      let y = vertices[idx + 1];
      let z = vertices[idx + 2];
      if (placement) {
        [x, y, z] = placement.map(x, y, z);
      }
      tempStr += `          <vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}" />\n`;
      writtenVertices++;

      if (i > 0 && i % CHUNK_SIZE === 0) {
        vertChunks.push(tempStr);
        tempStr = '';
        await checkpoint(signal, lastYield);
      }
    }
    if (tempStr) vertChunks.push(tempStr);

    const midHeader = `        </vertices>
        <triangles>\n`;

    // Fast triangle serialization. The counter is the number of <triangle> tags actually written.
    const triChunks: string[] = [];
    let writtenTriangles = 0;
    tempStr = '';
    for (let i = 0; i < triangleCount; i++) {
      const idx = i * 3;
      const v1 = indices[idx];
      const v2 = indices[idx + 1];
      const v3 = indices[idx + 2];
      tempStr += `          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />\n`;
      writtenTriangles++;

      if (i > 0 && i % CHUNK_SIZE === 0) {
        triChunks.push(tempStr);
        tempStr = '';
        await checkpoint(signal, lastYield);
      }
    }
    if (tempStr) triChunks.push(tempStr);

    const footer = bambuProfile
      ? `    </triangles>
   </mesh>
  </object>
  <object id="${MODEL_OBJECT_ID}" type="model" p:UUID="${objectUuid}">
   <components>
    <component objectid="${VOLUME_OBJECT_ID}" p:UUID="${componentUuid}" transform="${BAMBU_IDENTITY_3MF}"/>
   </components>
  </object>
 </resources>
 <build p:UUID="${buildUuid}">
  <item objectid="${MODEL_OBJECT_ID}" p:UUID="${itemUuid}" transform="${BAMBU_IDENTITY_3MF}" printable="1"/>
 </build>
</model>`
      : `        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

    return {
      xml: header + vertChunks.join('') + midHeader + triChunks.join('') + footer,
      vertexCount: writtenVertices,
      triangleCount: writtenTriangles,
      unit: MODEL_UNIT,
    };
  }

  /**
   * Deflates the archive and checks the abort signal between JSZip chunks.
   * Pausing the stream stops later chunks, so a cancelled export has no blob to download.
   */
  private static async zipToBlob(zip: JSZip, signal?: AbortSignal): Promise<Blob> {
    throwIfAborted(signal);
    const stream = zip.generateInternalStream({
      type: 'uint8array',
      mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      streamFiles: true,
    });
    const parts: Uint8Array[] = [];
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: unknown) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        try {
          stream.pause();
        } catch {
          // The stream may already have ended.
        }
        if (err) reject(err);
        else resolve();
      };
      const onAbort = () => finish(exportAbortError());
      signal?.addEventListener('abort', onAbort);
      stream.on('data', (chunk: Uint8Array) => {
        if (signal?.aborted) {
          finish(exportAbortError());
          return;
        }
        parts.push(chunk);
      });
      stream.on('error', (err: Error) => finish(err));
      stream.on('end', () => finish());
      stream.resume();
    });
    throwIfAborted(signal);
    return new Blob(parts as BlobPart[], {
      type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
    });
  }

  /**
   * Checks the package directory and the counts recorded while the model was written.
   * Does not inflate or parse 3D/3dmodel.model.
   */
  static async verify3MfPackage(blob: Blob, written?: ThreeMfWrittenModel): Promise<{
    isValid: boolean;
    hasContentTypes: boolean;
    hasRels: boolean;
    hasModelXml: boolean;
    hasMetadataConfigs: boolean;
    parsedVertexCount: number;
    parsedTriangleCount: number;
    unit: string;
    errors: string[];
  }> {
    const errors: string[] = [];
    let hasContentTypes = false;
    let hasRels = false;
    let hasModelXml = false;
    let hasMetadataConfigs = false;
    const parsedVertexCount = written?.vertexCount ?? 0;
    const parsedTriangleCount = written?.triangleCount ?? 0;
    let unit = 'unknown';

    try {
      const zip = await JSZip.loadAsync(blob);

      const ctFile = zip.file('[Content_Types].xml');
      if (ctFile) {
        hasContentTypes = true;
        const ctText = await ctFile.async('text');
        if (!/3dmanufacturing-3dmodel\+?xml/.test(ctText)) {
          errors.push('[Content_Types].xml missing 3D model content type');
        }
      } else {
        errors.push('Missing [Content_Types].xml in 3MF archive');
      }

      const relsFile = zip.folder('_rels')?.file('.rels') || zip.file('_rels/.rels');
      if (relsFile) {
        hasRels = true;
        const relsText = await relsFile.async('text');
        if (!relsText.includes('/3D/3dmodel.model')) {
          errors.push('_rels/.rels missing relationship to /3D/3dmodel.model');
        }
      } else {
        errors.push('Missing _rels/.rels package relationship');
      }

      // Name check only. Reading this entry inflates the model XML.
      const modelFile = zip.file(MODEL_FILE);
      if (modelFile) {
        hasModelXml = true;
        unit = written?.unit || MODEL_UNIT;
      } else {
        errors.push('Missing 3D/3dmodel.model file in 3MF archive');
      }

      if (!written || written.vertexCount <= 0 || written.triangleCount <= 0) {
        errors.push('Vertex and triangle counts were not recorded while writing the model');
      }

      const projectFile = zip.file('Metadata/project_settings.config');
      const settingsFile = zip.file('Metadata/model_settings.config');
      if (projectFile && settingsFile) {
        hasMetadataConfigs = true;
        const projectText = await projectFile.async('text');
        const settingsText = await settingsFile.async('text');
        let config: Record<string, unknown> = {};
        try {
          config = JSON.parse(projectText) as Record<string, unknown>;
        } catch {
          errors.push('Bambu project_settings.config is not valid JSON');
        }
        const nozzleCount = Array.isArray(config.nozzle_diameter) ? config.nozzle_diameter.length : 0;
        const extruderCount = Array.isArray(config.extruder_type) ? config.extruder_type.length : 0;
        if (!config.printer_model || !config.print_settings_id || nozzleCount === 0 || extruderCount === 0) {
          errors.push('Bambu project_settings.config is missing the printer profile');
        }
        if (nozzleCount !== extruderCount) {
          errors.push('Bambu project_settings.config extruder list does not match nozzle count');
        }
        if (!settingsText.includes(`id="${MODEL_OBJECT_ID}"`) || !settingsText.includes('model_instance')) {
          errors.push('Bambu model_settings.config does not place the lithophane on a plate');
        }
      }
    } catch (err: unknown) {
      errors.push('ZIP unpacking failed: ' + (err instanceof Error ? err.message : String(err)));
    }

    const isValid = errors.length === 0 && hasContentTypes && hasRels && hasModelXml && parsedVertexCount > 0 && parsedTriangleCount > 0;

    return {
      isValid,
      hasContentTypes,
      hasRels,
      hasModelXml,
      hasMetadataConfigs,
      parsedVertexCount,
      parsedTriangleCount,
      unit,
      errors,
    };
  }

  private static createUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  private static escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}
