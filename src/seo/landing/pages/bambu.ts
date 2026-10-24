import type { LandingPage } from '../types';

export const bambuPage: LandingPage = {
  path: '/bambu-studio-lithophane/',
  navLabel: 'Bambu Studio',
  kicker: 'Bambu guide',
  title: 'Bambu Studio Lithophane: 3MF Export & Print | Lumiphane',
  description:
    'Export optimized Bambu Studio 3MF projects directly from Lumiphane. Pre-configured with 0.12 mm layer height and 100% solid infill for Bambu Lab 3D printers.',
  breadcrumb: 'Bambu Studio lithophane',
  h1: 'Print Lithophanes with Bambu Studio and Bambu Lab',
  lede:
    'Lumiphane integrates seamlessly with Bambu Lab 3D printers by exporting native Bambu Studio 3MF project files. Each project includes your upright lithophane mesh pre-configured with a tested 0.12 mm layer height, 100% solid infill, and stabilizing brim tailored to your specific Bambu printer model. Simply open the file, preview the slice, and start your print.',
  heroNote: 'Select Bambu Studio project in the export dialog, then choose your Bambu Lab model.',
  sections: [
    {
      kind: 'prose',
      id: 'what-you-get',
      heading: 'What is included in the native Bambu Studio project archive',
      blocks: [
        {
          paragraphs: [
            'When you export a Bambu Studio project from Lumiphane, you receive an authentic 3MF project package recognized immediately by Bambu Studio. The archive contains your watertight lithophane mesh already oriented standing upright on the build plate, paired with a custom process preset: 0.12 mm layer height, 100% solid infill through the image wall, and a stabilizing brim for dependable bed adhesion.',
            'Nozzle temperatures, bed heating, and cooling fan speeds automatically inherit from the white PLA filament preset you load in Bambu Studio. Lumiphane does not connect directly to your printer over local Wi-Fi or Bambu Cloud; after downloading the file, you simply open it in Bambu Studio on your computer to slice and send the plate to your printer. For general slicer guidelines, see our [3D printed lithophane guide](/3d-printed-lithophane/).',
          ],
        },
      ],
    },
    {
      kind: 'table',
      id: 'machines',
      heading: 'Supported Bambu Lab printer profiles in the export dialog',
      intro:
        'Each printer profile configures machine-specific build plate dimensions, origin offsets, and native process parameters for single-nozzle 0.4 mm setups.',
      caption: 'If your specific model is not listed, export a universal standard 3MF or STL file and apply the recommended 0.12 mm solid profile in Bambu Studio manually.',
      columns: ['Export dialog selection', 'Bambu Studio printer model preset'],
      rows: [
        ['Bambu Lab A2L', 'Bambu Lab A2L (0.4 nozzle)'],
        ['Bambu Lab A1', 'Bambu Lab A1 (0.4 nozzle)'],
        ['Bambu Lab A1 mini', 'Bambu Lab A1 mini (0.4 nozzle)'],
        ['Bambu Lab P1P', 'Bambu Lab P1P (0.4 nozzle)'],
        ['Bambu Lab P1S', 'Bambu Lab P1S (0.4 nozzle)'],
        ['Bambu Lab X1 Carbon', 'Bambu Lab X1 Carbon (0.4 nozzle)'],
        ['Bambu Lab X1', 'Bambu Lab X1 (0.4 nozzle)'],
        ['Bambu Lab X1E', 'Bambu Lab X1E (0.4 nozzle)'],
        ['Bambu Lab P2S', 'Bambu Lab P2S (0.4 nozzle)'],
        ['Bambu Lab H2S', 'Bambu Lab H2S (0.4 nozzle)'],
      ],
    },
    {
      kind: 'steps',
      id: 'steps',
      heading: 'Step-by-step workflow from digital photo to Bambu print',
      intro: 'Follow this proven sequence. A well-prepared photograph and proper slicer configuration ensure a clean, detailed print every time.',
      steps: [
        {
          title: 'Build and compose your model in Lumiphane',
          body: 'Select your desired shape, import photos, and inspect the simulated backlit 3D preview. Review image exposure and framing carefully. A beginner walkthrough is available in [how to make a lithophane](/how-to-make-a-lithophane/), and photo recommendations are in [photo to lithophane](/photo-to-lithophane/).',
        },
        {
          title: 'Select Bambu Studio Project in the export dialog',
          body: 'Click Export and choose the Bambu Studio Project format. Select your exact printer model from the dropdown list. The dialog displays physical dimensions, thickness boundaries, and geometry checks.',
        },
        {
          title: 'Download the .3mf project file',
          body: 'Save the project to your computer. The filename includes your chosen printer model. Keep the default .3mf extension without extracting the archive manually.',
        },
        {
          title: 'Open the project file in Bambu Studio',
          body: 'In Bambu Studio, select File → Open Project, or drag the file into the window. Verify that the printer profile matches your machine, the part is standing upright on the bed, and the process profile displays 0.12 mm layers with solid infill.',
        },
        {
          title: 'Slice the plate and review the toolpath preview',
          body: 'Click Slice Plate in Bambu Studio. Inspect the sliced layer preview to confirm solid continuous perimeters across the photo area and a clean brim around the base. Click Print Plate or send via Bambu Handy.',
        },
        {
          title: 'Illuminate your finished physical print',
          body: 'Place your completed print in front of an even light source. Flat panels look best against a window or LED backlight panel, while cylinders and lanterns fit over compact LED pucks. Details on shade dimensions are in our [lithophane lamp guide](/lithophane-lamp/).',
        },
      ],
    },
    {
      kind: 'table',
      id: 'profile',
      heading: 'Pre-configured print settings included in the project',
      caption: 'These parameters are embedded directly into the project file. Extrusion temperatures and fan speeds follow your chosen white PLA filament preset.',
      columns: ['Slicer parameter', 'Pre-configured value', 'Why it is included'],
      rows: [
        ['Layer height', '0.12 mm', 'Generates micro-fine vertical steps that render smooth photographic gradients through white PLA.'],
        ['Infill density', '100% solid', 'Eliminates internal air cavities that cast unwanted lattice shadows under direct backlight.'],
        ['Model orientation', 'Standing upright', 'Stands the mesh vertically on the build plate so fine Z-axis layer increments capture photo tones.'],
        ['Bed adhesion brim', '5 – 8 mm outer brim', 'Stabilizes tall, narrow prints against bed motion and high-speed toolhead acceleration.'],
        ['Filament target', 'Standard white PLA', 'The optical thickness algorithm is calibrated specifically for white PLA light transmission.'],
      ],
    },
    {
      kind: 'prose',
      id: 'when-not',
      heading: 'When to use universal standard 3MF or STL exports',
      blocks: [
        {
          paragraphs: [
            'Choose standard 3MF or binary STL if you prefer using OrcaSlicer with customized machine profiles, PrusaSlicer, or any 3D printer not listed in our dropdown. These universal formats export pristine, watertight geometry, allowing you to apply your own slicer configurations. Slicer parameters are explained in our [lithophane settings guide](/lithophane-settings/).',
            'Traditional lithophanes rely on variable thickness in a single translucent material. While you can use the Bambu Lab AMS to select a spool of white PLA, you should not assign multiple colors across the image relief, as tonal contrast in a lithophane is created exclusively through light transmission.',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'mistakes',
      heading: 'Common mistakes to avoid when printing in Bambu Studio',
      blocks: [
        {
          heading: 'Rotating or lying the part flat on the build plate',
          paragraphs: [
            'Bambu Studio permits rotating models on the build plate, but you must keep the lithophane standing upright. Laying it flat forces the printer to render subtle photographic tones using coarse horizontal nozzle lines, ruining image detail.',
          ],
        },
        {
          heading: 'Lowering infill density to save filament or print time',
          paragraphs: [
            'Any hollow pattern inside the wall—such as grid or gyroid infill—casts dark internal shadows when illuminated. The photo area must remain 100% solid plastic.',
          ],
        },
        {
          heading: 'Printing with silk, marble, or dark filaments',
          paragraphs: [
            'Silk PLA contains metallic additives that reflect light rather than transmitting it cleanly. Dark or gray filaments absorb too much light, resulting in a dim, muddy image.',
          ],
        },
        {
          heading: 'Evaluating contrast before illuminating with a backlight',
          paragraphs: [
            'In front room lighting, an unlit lithophane looks like a plain white textured plastic slab. Always hold the print up to an LED light or window before evaluating image quality.',
          ],
        },
      ],
    },
    {
      kind: 'note',
      paragraphs: [
        'The pre-configured project applies recommended 0.12 mm layer height and 100% solid infill. Because ambient room temperatures, bed adhesion surfaces, and filament brands vary, always review your slicer preview before starting a print.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Does Lumiphane send print jobs directly to Bambu Lab printers over Wi-Fi?',
      answer:
        'No. Lumiphane creates an authentic Bambu Studio project file (.3mf) that you open in Bambu Studio on your computer. From Studio, you can send the sliced plate to your printer via Wi-Fi, Bambu Cloud, or SD card.',
    },
    {
      question: 'What if my Bambu Lab printer is not listed in the export options?',
      answer:
        'Export a standard 3MF or binary STL file. Open it in Bambu Studio under your printer profile, and set layer height to 0.12 mm, infill to 100%, and add an outer brim.',
    },
    {
      question: 'Can I use the Bambu Lab AMS with a lithophane?',
      answer:
        'Yes. You can use the AMS to feed your preferred spool of white PLA filament. Avoid assigning multi-color filaments to the image surface, as lithophanes rely on single-material translucent light transmission.',
    },
    {
      question: 'Do I still need to slice the model in Bambu Studio?',
      answer:
        'Yes. The project file includes your mesh, orientation, and process settings. Bambu Studio must slice the geometry to generate the toolpaths specific to your machine.',
    },
    {
      question: 'Where can I troubleshoot print quality issues?',
      answer:
        'Consult our [3D printed lithophane guide](/3d-printed-lithophane/) for hardware vibration and slicer tips, and our [photo to lithophane guide](/photo-to-lithophane/) for image exposure recommendations.',
    },
  ],
  closing: {
    heading: 'Export a custom project for your Bambu printer',
    body: 'Upload your photo, preview the backlit model, and export a native Bambu Studio project file with pre-configured settings.',
  },
};
