import profiles from './bambuMachineProfiles.json';

/**
 * Single-nozzle Bambu Lab machines whose 0.4 mm profiles ship with
 * Bambu Studio 02.08.02.60. Machine keys come from that release's system
 * profiles. The lithophane process settings stay in the saved project.
 */
export interface BambuPrinterProfile {
  id: string;
  label: string;
  printerModel: string;
  printerSettingsId: string;
  printSettingsId: string;
  filamentSettingsId: string;
  printCompatiblePrinters: string[];
  bedWidth: number;
  bedDepth: number;
  printableHeight: string;
  set: Record<string, unknown> | null;
  remove: string[];
}

export const BAMBU_PRINTERS = profiles.printers as BambuPrinterProfile[];
export const DEFAULT_BAMBU_PRINTER_ID = 'a2l';

export function getBambuPrinter(id?: string): BambuPrinterProfile {
  const printerId = id || DEFAULT_BAMBU_PRINTER_ID;
  const printer = BAMBU_PRINTERS.find((entry) => entry.id === printerId);
  if (!printer) {
    throw new Error(`Unknown Bambu printer "${printerId}"`);
  }
  return printer;
}

/**
 * Retargets a saved Studio project config onto another Bambu machine.
 * A2L is the printer the project was saved for, so that selection is left untouched.
 */
export function retargetBambuProject(
  config: Record<string, unknown>,
  printer: BambuPrinterProfile
): boolean {
  if (printer.id === DEFAULT_BAMBU_PRINTER_ID) return false;

  if (printer.set) {
    for (const [key, value] of Object.entries(printer.set)) {
      config[key] = JSON.parse(JSON.stringify(value)) as unknown;
    }
  }
  for (const key of printer.remove) {
    delete config[key];
  }

  config.printer_model = printer.printerModel;
  config.printer_settings_id = printer.printerSettingsId;
  config.print_settings_id = printer.printSettingsId;
  config.filament_settings_id = [printer.filamentSettingsId];
  config.print_compatible_printers = [...printer.printCompatiblePrinters];

  const nozzleCount = Array.isArray(config.nozzle_diameter) ? config.nozzle_diameter.length : 0;
  const extruderCount = Array.isArray(config.extruder_type) ? config.extruder_type.length : 0;
  if (nozzleCount !== 1 || extruderCount !== 1) {
    throw new Error(`${printer.label} profile does not stay a single-nozzle Bambu config`);
  }
  return true;
}
