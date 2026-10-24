import type { LandingPage } from '../types';

export const printedPage: LandingPage = {
  path: '/3d-printed-lithophane/',
  navLabel: '3D printing',
  kicker: 'Printing guide',
  title: '3D Printed Lithophanes: Slicer Settings Guide | Lumiphane',
  description:
    'Master 3D printed lithophanes with optimal slicer settings. Learn recommended layer heights, 100% solid infill, wall speeds, and vertical print orientation.',
  breadcrumb: '3D printed lithophane',
  h1: 'How to 3D Print Lithophanes: Slicer Settings',
  lede:
    'A successful lithophane relies on precise slicer parameters. While Lumiphane calculates the microscopic thickness variations that create your image, your slicing software translates those contours into physical toolpaths. This guide explains how to configure layer height, infill density, print speed, and bed adhesion for flawless optical clarity.',
  heroNote: 'Generate your 3D model in the browser, then open the file in your preferred slicer.',
  sections: [
    {
      kind: 'prose',
      id: 'split',
      heading: 'Bridging the 3D model file to your physical printer',
      blocks: [
        {
          paragraphs: [
            'Lumiphane creates watertight 3D surface geometry optimized for physical reproduction. Slicing software (such as Bambu Studio, OrcaSlicer, PrusaSlicer, or UltiMaker Cura) translates that geometry into layer-by-layer G-code toolpaths for your machine. Once you are satisfied with the lit preview in Lumiphane, download your preferred 3D file to begin slicing.',
            'Our light transmission formula is specifically calibrated for fused deposition modeling (FDM) using standard white PLA filament. While stereolithography (SLA) resin printers can import the resulting STL mesh, photopolymer resins possess different light attenuation properties. For predictable, repeatable results that match the on-screen preview, we recommend FDM printing with standard white PLA.',
          ],
        },
      ],
    },
    {
      kind: 'table',
      id: 'formats',
      heading: 'Choosing the optimal export file format',
      caption: 'All three formats are available directly from the Lumiphane export dialog. Select the format tailored to your slicing software.',
      columns: ['Export file format', 'Compatible slicing software', 'Included data and presets'],
      rows: [
        ['Bambu Studio project (.3mf)', 'Bambu Studio and OrcaSlicer for listed Bambu Lab printers', 'Complete 3D mesh plus embedded 0.12 mm layer height, 100% solid infill, and brim settings. Walkthrough: [Bambu Studio lithophane](/bambu-studio-lithophane/).'],
        ['Standard 3MF (.3mf)', 'PrusaSlicer, Cura, OrcaSlicer, Bambu Studio, and modern 3D slicers', 'High-precision production mesh with compact file size and metric millimeter scaling. Slicer parameters are configured manually.'],
        ['Binary STL (.stl)', 'Universal support across all slicing and CAD software packages', 'Standard raw triangular mesh geometry in millimeter units. Slicer parameters are configured manually.'],
      ],
    },
    {
      kind: 'prose',
      id: 'orient',
      heading: 'Why vertical print orientation is essential',
      blocks: [
        {
          paragraphs: [
            'Always print your lithophane standing upright on the print bed. Desktop 3D printers achieve fine vertical resolution (0.08–0.12 mm layer height along the Z-axis), whereas horizontal resolution along X and Y is constrained by the wider nozzle extrusion line (typically 0.4 mm). Printing vertically aligns micro-fine layer steps with image tonal transitions, eliminating visible stair-stepping artifacts.',
            'Flat panels, curved arcs, cylinders, cubes, and lanterns are all exported in their upright printing orientation. Because tall, thin parts have a narrow contact area on the build plate, configure a 5–8 mm outer brim in your slicer to ensure dependable bed adhesion throughout the print.',
            'For shade-specific design details and lighting clearances, consult our [lithophane lamp guide](/lithophane-lamp/).',
          ],
        },
      ],
    },
    {
      kind: 'table',
      id: 'slicer-start',
      heading: 'Recommended baseline slicer settings for white PLA',
      intro:
        'These calibrated starting parameters are optimized for a standard 0.4 mm nozzle extruding white PLA filament. Specific nozzle temperatures, bed temperatures, and retraction values should follow your filament manufacturer recommendations.',
      caption: 'Apply these baseline parameters in your slicer, then fine-tune if test prints suggest adjustments.',
      columns: ['Slicer parameter', 'Recommended starting value', 'Technical rationale'],
      rows: [
        ['Layer height', '0.12 mm (or 0.08 mm for ultra-fine detail)', 'Fine layer heights create smooth grayscale transitions. Going below 0.08 mm increases print time significantly with diminishing visual returns on a 0.4 mm nozzle.'],
        ['Infill density', '100% solid infill', 'Standard sparse infill patterns (grid, gyroid, or honeycomb) cast visible internal shadows when backlit. Setting infill to 100% (or using 8+ perimeters) ensures uniform light transmission.'],
        ['Outer wall print speed', '30 – 40 mm/s', 'Lower outer wall speeds minimize mechanical vibration, belt resonance, and surface ringing, resulting in crisp photographic detail.'],
        ['Filament material', 'Standard white PLA', 'The thickness-to-luminance algorithm is calibrated for white PLA optical diffusion. Dark, gray, or silk filaments scatter light differently and result in muddy contrast.'],
        ['Support structures', 'Disabled (use brim only)', 'Lithophanes are self-supporting when printed vertically. Adding supports against the image face leaves surface scars that distort transmitted light.'],
      ],
    },
    {
      kind: 'prose',
      id: 'troubles',
      heading: 'Troubleshooting print quality and surface artifacts',
      blocks: [
        {
          heading: 'Internal patterns or grid lines visible under backlight',
          paragraphs: [
            'The interior of the wall contains air gaps from sparse infill. Increase infill density to 100%, or increase your wall perimeter count so the slicer eliminates all internal cavities.',
          ],
        },
        {
          heading: 'Horizontal layer lines or wavy surface banding',
          paragraphs: [
            'Reduce outer wall printing speed to 30 mm/s, check belt tension, clean and lubricate Z-axis leadscrews, and ensure your bed adhesion brim prevents model wobble during upper layers.',
          ],
        },
        {
          heading: 'Muddy, dark, or distorted tones with non-standard filament',
          paragraphs: [
            'Verify that your filament is standard opaque or semi-translucent white PLA. Silk, sparkle, marble, and colored plastics have unpredictable scattering that degrades image contrast.',
          ],
        },
        {
          heading: 'Model appears pale and untextured in ambient room light',
          paragraphs: [
            'Lithophanes are designed to be viewed with rear illumination. Place the print in front of an even LED panel or bright window to evaluate its photographic depth.',
          ],
        },
      ],
    },
    {
      kind: 'note',
      paragraphs: [
        'Our Bambu Studio project export automatically bundles recommended 0.12 mm layer height and 100% solid infill profiles. Always review the sliced preview in Bambu Studio before sending the print job to your printer. Read our [Bambu Studio lithophane guide](/bambu-studio-lithophane/) for details.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Does Lumiphane slice files directly in the browser?',
      answer:
        'Lumiphane creates production-ready 3D mesh files (STL and 3MF). Slicing and G-code generation are handled in your preferred slicing software, such as Bambu Studio, OrcaSlicer, PrusaSlicer, or Cura.',
    },
    {
      question: 'Can I print lithophanes using PETG or resin?',
      answer:
        'While 3D slicers can process the model for any material, Lumiphane’s optical thickness curve is specifically calibrated for white PLA. Alternative materials will require manual exposure testing to match desired contrast.',
    },
    {
      question: 'What nozzle diameter provides the best balance of speed and detail?',
      answer:
        'A standard 0.4 mm nozzle paired with a 0.12 mm layer height delivers excellent sharpness and dependable print reliability. A 0.2 mm nozzle at 0.08 mm layer height can resolve microscopic text at the cost of longer print times.',
    },
    {
      question: 'What size should I choose for my initial test print?',
      answer:
        'We recommend starting with our default 120 mm flat panel or 90 mm cylinder. This allows you to evaluate your filament’s optical translucency and slicer settings before committing to large multi-hour prints.',
    },
    {
      question: 'How do I determine the best printing temperature?',
      answer:
        'Consult your filament manufacturer’s recommended temperature range. Printing temperature does not alter lithophane contrast, but proper temperature ensures smooth layer bonding and prevents surface stringing.',
    },
  ],
  closing: {
    heading: 'Ready to slice your lithophane?',
    body: 'Export your 3D model, configure your slicer with 0.12 mm layers and 100% solid infill, and create a breathtaking backlit print.',
  },
};
