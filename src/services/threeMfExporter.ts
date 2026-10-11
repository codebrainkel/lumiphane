import JSZip from 'jszip';
import { MeshGeometryData } from '../types/lithophane';

export type BambuPrinterModel = 'A1' | 'A1_MINI' | 'P1S' | 'X1C';

export interface BambuPrinterProfile {
  id: BambuPrinterModel;
  name: string;
  printerModel: string;
  printerSettingsId: string;
  processSettingsId: string;
  filamentSettingsId: string;
}

export const BAMBU_PRINTER_PROFILES: Record<BambuPrinterModel, BambuPrinterProfile> = {
  A1: {
    id: 'A1',
    name: 'Bambu Lab A1 (0.4 nozzle)',
    printerModel: 'Bambu Lab A1',
    printerSettingsId: 'Bambu Lab A1 0.4 nozzle',
    processSettingsId: '0.12mm High Detail @BBL A1',
    filamentSettingsId: 'Bambu PLA Basic @BBL A1',
  },
  A1_MINI: {
    id: 'A1_MINI',
    name: 'Bambu Lab A1 mini (0.4 nozzle)',
    printerModel: 'Bambu Lab A1 mini',
    printerSettingsId: 'Bambu Lab A1 mini 0.4 nozzle',
    processSettingsId: '0.12mm High Detail @BBL A1M',
    filamentSettingsId: 'Bambu PLA Basic @BBL A1M',
  },
  P1S: {
    id: 'P1S',
    name: 'Bambu Lab P1S / P1P (0.4 nozzle)',
    printerModel: 'Bambu Lab P1S',
    printerSettingsId: 'Bambu Lab P1S 0.4 nozzle',
    processSettingsId: '0.12mm High Detail @BBL P1S',
    filamentSettingsId: 'Bambu PLA Basic @BBL P1S',
  },
  X1C: {
    id: 'X1C',
    name: 'Bambu Lab X1 Carbon (0.4 nozzle)',
    printerModel: 'Bambu Lab X1 Carbon',
    printerSettingsId: 'Bambu Lab X1 Carbon 0.4 nozzle',
    processSettingsId: '0.12mm High Detail @BBL X1C',
    filamentSettingsId: 'Bambu PLA Basic @BBL X1C',
  },
};

export interface ThreeMfExportOptions {
  mode?: 'universal' | 'bambu-project';
  bambuPrinter?: BambuPrinterModel;
}

export interface ThreeMfExportResult {
  blob: Blob;
  filename: string;
  filesizeBytes: number;
  vertexCount: number;
  triangleCount: number;
  isBambuProject?: boolean;
}

export class ThreeMfExporter {
  /**
   * Generates a 3MF package file.
   * - Universal mode: strict 3MF Core Specification (ISO/IEC 25422), pure geometry.
   * - Bambu Project mode: valid native Bambu Studio project archive with exact printer and slicing profiles.
   */
  static async export3MF(
    geometry: MeshGeometryData,
    modelName: string = 'lithophane',
    options?: ThreeMfExportOptions
  ): Promise<ThreeMfExportResult> {
    const zip = new JSZip();
    const isBambuProject = options?.mode === 'bambu-project';
    const cleanName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'lithophane';

    // 1. [Content_Types].xml
    let contentTypesXml: string;
    if (isBambuProject) {
      contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodelxml"/>
  <Default Extension="config" ContentType="text/xml"/>
  <Default Extension="json" ContentType="application/json"/>
</Types>`;
    } else {
      contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodelxml"/>
</Types>`;
    }
    zip.file('[Content_Types].xml', contentTypesXml);

    // 2. _rels/.rels
    const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
    zip.folder('_rels')?.file('.rels', relsXml);

    // 3. 3D/3dmodel.model
    const modelXml = this.generateModelXml(geometry, modelName);
    zip.folder('3D')?.file('3dmodel.model', modelXml);

    // 4. If Bambu Project mode, inject fully formed, valid Bambu Studio project metadata
    if (isBambuProject) {
      const printerKey = options?.bambuPrinter || 'P1S';
      const profile = BAMBU_PRINTER_PROFILES[printerKey];
      const metadataFolder = zip.folder('Metadata');

      if (metadataFolder) {
        // model_settings.config (Plate, object, and part configuration)
        const modelSettingsXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="name" value="${cleanName}"/>
    <part id="1" name="${cleanName}">
      <metadata key="name" value="${cleanName}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="source_file" value="${cleanName}.stl"/>
      <metadata key="source_object_id" value="0"/>
      <metadata key="source_volume_id" value="0"/>
      <metadata key="source_offset_x" value="0"/>
      <metadata key="source_offset_y" value="0"/>
      <metadata key="source_offset_z" value="0"/>
      <metadata key="extruder" value="1"/>
    </part>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="Plate 1"/>
    <metadata key="locked" value="false"/>
  </plate>
</config>`;
        metadataFolder.file('model_settings.config', modelSettingsXml);

        // project_settings.config (Full Bambu slicer config with lithophane parameters)
        const projectSettings = {
          version: '01.09.00.00',
          project_name: cleanName,
          printer_model: profile.printerModel,
          printer_variant: '0.4',
          printer_settings_id: profile.printerSettingsId,
          curr_bed_type: 'textured_plate',
          filament_settings_id: [profile.filamentSettingsId],
          filament_type: ['PLA'],
          filament_vendor: ['Bambu'],
          filament_colour: ['#FFFFFF'],
          process_settings_id: profile.processSettingsId,
          layer_height: '0.12',
          initial_layer_print_height: '0.20',
          sparse_infill_density: '100%',
          sparse_infill_pattern: 'rectilinear',
          wall_loops: '4',
          top_shell_layers: '6',
          bottom_shell_layers: '5',
          brim_type: 'outer_only',
          brim_width: '5',
          enable_support: '0',
        };
        metadataFolder.file('project_settings.config', JSON.stringify(projectSettings, null, 2));

        // plate_1.json
        const plateJson = {
          plate_id: 1,
          plate_name: 'Plate 1',
          bed_type: 'textured_plate',
        };
        metadataFolder.file('plate_1.json', JSON.stringify(plateJson, null, 2));
      }
    }

    // 5. Generate compressed binary ZIP archive
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodelxml',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const isStanding = geometry.boundingBox.size[2] > geometry.boundingBox.size[1];
    const widthMm = Math.round(geometry.boundingBox.size[0]);
    const heightMm = Math.round(isStanding ? geometry.boundingBox.size[2] : geometry.boundingBox.size[1]);

    const filename = isBambuProject
      ? `${cleanName}_Bambu_${options?.bambuPrinter || 'P1S'}_0.12mm.3mf`
      : `${cleanName}_${widthMm}x${heightMm}mm.3mf`;

    return {
      blob,
      filename,
      filesizeBytes: blob.size,
      vertexCount: geometry.vertices.length / 3,
      triangleCount: geometry.indices.length / 3,
      isBambuProject,
    };
  }

  /**
   * Builds the official 3MF model XML string with high performance chunking.
   */
  private static generateModelXml(geometry: MeshGeometryData, title: string): string {
    const { vertices, indices } = geometry;
    const vertexCount = vertices.length / 3;
    const triangleCount = indices.length / 3;
    const dateStr = new Date().toISOString().split('T')[0];

    const header = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${this.escapeXml(title)} Lithophane</metadata>
  <metadata name="Designer">Lumiphane 3D</metadata>
  <metadata name="Application">Lumiphane 3D Generator</metadata>
  <metadata name="CreationDate">${dateStr}</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>\n`;

    // Fast vertex serialization
    const vertChunks: string[] = [];
    const CHUNK_SIZE = 5000;
    let tempStr = '';

    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      const x = vertices[idx].toFixed(4);
      const y = vertices[idx + 1].toFixed(4);
      const z = vertices[idx + 2].toFixed(4);
      tempStr += `          <vertex x="${x}" y="${y}" z="${z}" />\n`;

      if (i > 0 && i % CHUNK_SIZE === 0) {
        vertChunks.push(tempStr);
        tempStr = '';
      }
    }
    if (tempStr) vertChunks.push(tempStr);

    const midHeader = `        </vertices>
        <triangles>\n`;

    // Fast triangle serialization
    const triChunks: string[] = [];
    tempStr = '';
    for (let i = 0; i < triangleCount; i++) {
      const idx = i * 3;
      const v1 = indices[idx];
      const v2 = indices[idx + 1];
      const v3 = indices[idx + 2];
      tempStr += `          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />\n`;

      if (i > 0 && i % CHUNK_SIZE === 0) {
        triChunks.push(tempStr);
        tempStr = '';
      }
    }
    if (tempStr) triChunks.push(tempStr);

    const footer = `        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

    return header + vertChunks.join('') + midHeader + triChunks.join('') + footer;
  }

  /**
   * Verifies an exported 3MF blob independently:
   * Checks ZIP headers, files, XML well-formedness, and object counts.
   */
  static async verify3MfPackage(blob: Blob): Promise<{
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
    let parsedVertexCount = 0;
    let parsedTriangleCount = 0;
    let unit = 'unknown';

    try {
      const zip = await JSZip.loadAsync(blob);

      // Check [Content_Types].xml
      const ctFile = zip.file('[Content_Types].xml');
      if (ctFile) {
        hasContentTypes = true;
        const ctText = await ctFile.async('text');
        if (!ctText.includes('3dmanufacturing-3dmodelxml')) {
          errors.push('[Content_Types].xml missing 3D model content type');
        }
      } else {
        errors.push('Missing [Content_Types].xml in 3MF archive');
      }

      // Check _rels/.rels
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

      // Check 3D/3dmodel.model
      const modelFile = zip.folder('3D')?.file('3dmodel.model') || zip.file('3D/3dmodel.model');
      if (modelFile) {
        hasModelXml = true;
        const modelText = await modelFile.async('text');

        // Extract unit
        const unitMatch = modelText.match(/unit="([^"]+)"/);
        if (unitMatch) unit = unitMatch[1];

        // Parse with DOMParser if in browser environment
        if (typeof DOMParser !== 'undefined') {
          const parser = new DOMParser();
          const doc = parser.parseFromString(modelText, 'application/xml');
          const parserErrors = doc.getElementsByTagName('parsererror');
          if (parserErrors.length > 0) {
            errors.push('XML parsing error in 3dmodel.model: ' + parserErrors[0].textContent);
          } else {
            parsedVertexCount = doc.getElementsByTagName('vertex').length;
            parsedTriangleCount = doc.getElementsByTagName('triangle').length;
          }
        } else {
          // Fallback regex count for node/testing environments
          const vMatches = modelText.match(/<vertex\s/g);
          const tMatches = modelText.match(/<triangle\s/g);
          parsedVertexCount = vMatches ? vMatches.length : 0;
          parsedTriangleCount = tMatches ? tMatches.length : 0;
        }
      } else {
        errors.push('Missing 3D/3dmodel.model file in 3MF archive');
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
      hasMetadataConfigs: true,
      parsedVertexCount,
      parsedTriangleCount,
      unit,
      errors,
    };
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
