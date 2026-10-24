import type { LandingPage } from '../types';

export const settingsPage: LandingPage = {
  path: '/lithophane-settings/',
  navLabel: 'Settings',
  kicker: 'Settings guide',
  title: 'Lithophane Settings: Slicer & Thickness Guide | Lumiphane',
  description:
    'Understand every lithophane setting from wall thickness to slicer layer height. Master contrast, brightness, border width, and 100% infill for perfect prints.',
  breadcrumb: 'Lithophane settings',
  h1: 'Lithophane Settings: Thickness, Slicer, and Image',
  lede:
    'Crafting a stunning lithophane requires understanding two distinct sets of controls: parameters embedded directly into your 3D geometry by Lumiphane, and toolpath parameters configured inside your 3D slicing software. This guide clarifies exactly what each adjustment does, how thickness is calculated, and which settings produce optimal results.',
  heroNote: 'Thickness scales automatically with model size. No manual thickness sliders needed.',
  sections: [
    {
      kind: 'table',
      id: 'two-places',
      heading: 'Separating model geometry parameters from slicer toolpath settings',
      caption: 'Controls not found in Lumiphane belong in your slicing software or are automatically managed by our geometry engine.',
      columns: ['Print characteristic', 'Handled in Lumiphane', 'Handled in your 3D slicer'],
      rows: [
        ['Wall thickness of highlights and shadows', 'Calculated automatically based on physical part dimensions. Displayed in the export sheet.', 'Never scale the Z-axis alone in the slicer; non-uniform scaling distorts optical light transmission.'],
        ['Image exposure, dynamic range, and tonal balance', 'Brightness, contrast, and inversion controls. Previewed live with simulated backlight.', 'Not a slicer setting; tonal range must be resolved before exporting the 3D model.'],
        ['Smoothness of photographic surface gradients', 'High-density mesh sampling pitch (0.10 mm) captures fine micro-detail across the surface.', 'Layer height (0.12 mm or 0.08 mm), slow outer wall speed, and 100% solid perimeters.'],
        ['Bed adhesion and print stability', 'Optional stabilizing base footing (flange, wide stand, or brim foot) integrated into the mesh.', 'Outer brim width (5–8 mm), build plate temperature, and clean bed surface.'],
        ['Filament material and extrusion temperature', 'Optical transmission curve calibrated specifically for standard white PLA filament.', 'Filament profile selection, nozzle temperature, bed temperature, and cooling fan speeds.'],
      ],
    },
    {
      kind: 'figure',
      id: 'thickness',
      heading: 'How wall thickness translates into image contrast',
      figure: 'transmission',
      caption:
        'For models up to 120 mm, highlights correspond to 0.8 mm wall thickness and deep shadows to 3.0 mm. Larger models scale thickness proportionally to ensure structural rigidity.',
    },
    {
      kind: 'prose',
      id: 'thickness-detail',
      heading: 'Dynamic thickness scaling and Beer-Lambert light transmission',
      blocks: [
        {
          paragraphs: [
            'As light travels through translucent white PLA plastic, optical transmission decreases exponentially with wall thickness according to the Beer-Lambert law. Lumiphane applies this non-linear response curve so dark photographic tones map onto thicker walls and bright highlights map onto thinner walls. The on-screen 3D viewer simulates this exact physical behavior under backlight.',
            'At our default size (longest dimension up to 120 mm), Lumiphane fixes highlight thickness at 0.8 mm (providing two sturdy extrusion perimeters on a 0.4 mm nozzle) and shadow thickness at 3.0 mm (blocking approximately 95% of transmitted light). For larger panels up to 240 mm, minimum thickness increases slightly (up to 1.0 mm) and maximum thickness scales up to 3.4 mm. This provides necessary structural stiffness against warping while preserving luminous highlights. Border frames are modeled 0.4 mm thicker than the deepest shadow, ensuring a crisp framing outline.',
            'These calibrated values represent standard white PLA. Different filament manufacturers use varying concentrations of titanium dioxide pigment, which can cause slight differences in opacity. Highly opaque filaments may appear slightly darker, while highly translucent blends transmit more light. A small test print using our default 120 mm panel allows you to verify your filament before starting large prints.',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'tone',
      heading: 'Image adjustment controls: contrast, brightness, and inversion',
      blocks: [
        {
          paragraphs: [
            'The contrast slider ranges from −30% to +35%. Raising contrast stretches midtones outward, pushing bright areas toward the thin wall and dark areas toward the thick wall. The brightness slider ranges from −30% to +30%, shifting the entire image lighter or darker. The invert toggle reverses thickness values, which is useful when creating lithophanes from dark backgrounds or specialized graphic emblems.',
            'Before sliders are applied, Lumiphane automatically expands the image dynamic range and applies micro-contrast edge sharpening. There are no confusing gamma or draft sliders to adjust; our automated pipeline guarantees maximum tonal gamut directly out of the box.',
            'Lumiphane samples image relief at a fine 0.10 mm pitch—finer than a standard 0.12 mm slicer layer height. This guarantees that your 3D printer’s mechanical accuracy and nozzle diameter, rather than mesh resolution, dictate the visual clarity of the final print. For photo preparation recommendations, visit our [photo to lithophane guide](/photo-to-lithophane/).',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'size-border',
      heading: 'Physical dimensions, border styles, and stabilizing footings',
      blocks: [
        {
          paragraphs: [
            'Width sliders for flat and curved panels range from 60 mm to 220 mm. When a single photo is used, height adjusts automatically to preserve the photo aspect ratio. Curved panel arc angles adjust from 30° to 120° with a default angle of 75°. For cylindrical and lantern lamp dimensions, refer to our [lithophane lamp guide](/lithophane-lamp/).',
            'Border width starts at 1.5 mm and can expand for decorative icon frames (such as heart, star, or bone emblems). Because the outer frame is engineered thicker than the darkest shadow, it forms an attractive dark border when illuminated.',
            'The base stand selector adds an integrated stabilizing foot beneath the picture (such as a flange, finned stand, or wide pedestal). This expands the bed contact footprint, preventing tall vertical prints from tipping over on bed-slinger 3D printers.',
          ],
        },
      ],
    },
    {
      kind: 'table',
      id: 'slicer',
      heading: 'Recommended settings for your 3D slicing software',
      intro:
        'These parameters should be configured in your slicer after exporting from Lumiphane. Bambu Lab users can export pre-configured project files, as detailed in our [Bambu Studio lithophane guide](/bambu-studio-lithophane/). For the complete beginner guide, see [how to make a lithophane](/how-to-make-a-lithophane/). General printing tips are in our [3D printed lithophane guide](/3d-printed-lithophane/).',
      caption: 'Configure these parameters in your slicer for clean, high-precision prints.',
      columns: ['Slicer parameter', 'Recommended value', 'Why it matters'],
      rows: [
        ['Layer height', '0.12 mm (or 0.08 mm for fine detail)', 'Fine layer increments create smooth grayscale transitions without visible contour banding.'],
        ['Infill density', '100% solid infill', 'Internal grid or gyroid infill patterns cast visible lattice shadows. The image area must be solid plastic.'],
        ['Outer wall speed', '30 – 40 mm/s', 'Lower speeds reduce mechanical vibration, ringing artifacts, and layer shifting on tall vertical prints.'],
        ['Bed adhesion brim', '5 – 8 mm outer brim', 'Ensures tall, thin lithophanes remain securely anchored to the build plate throughout the printing process.'],
        ['Extrusion temperature', 'Manufacturer specification for white PLA', 'Follow your filament manufacturer’s recommended temperature to ensure strong layer bonding without stringing.'],
        ['Support structures', 'Disabled', 'Vertical lithophanes are self-supporting. Supports placed against the image relief leave unsightly scars.'],
      ],
    },
    {
      kind: 'table',
      id: 'which-knob',
      heading: 'Diagnostic guide: matching visual symptoms to exact solutions',
      caption: 'Evaluate your print in front of an even light source before making adjustments.',
      columns: ['Observed symptom', 'Recommended adjustment'],
      rows: [
        ['Preview appears flat and uniform gray', 'Increase the contrast slider in Lumiphane to broaden the tonal spread between highlights and shadows.'],
        ['Facial details are washed out and pure white', 'Lower the brightness slider in Lumiphane to restore subtle midtones in skin and highlight areas.'],
        ['Frame appears lighter than the image shadows', 'Ensure the border is enabled in Lumiphane; verify in your slicer that perimeters are solid and not hollow.'],
        ['Lit print displays an internal grid pattern', 'Change your slicer infill to 100% solid, or increase wall perimeters to eliminate internal air gaps.'],
        ['Lit print exhibits horizontal banding', 'Lower outer wall speed to 30 mm/s and inspect printer belt tension and Z-axis lead screws for mechanical wobble.'],
        ['Image is only visible when held to a light source', 'This is the intended behavior of a lithophane. It requires rear illumination to reveal its full contrast.'],
      ],
    },
  ],
  faqs: [
    {
      question: 'Can I manually override min and max wall thickness?',
      answer:
        'Lumiphane automatically calculates optimal thickness based on physical dimensions to balance stiffness and translucency. Exact thickness values are displayed in the export sheet before downloading.',
    },
    {
      question: 'Is 100% infill strictly required for lithophanes?',
      answer:
        'Yes. Standard sparse infills like grid, gyroid, or honeycomb create internal air voids that cast visible lattice shadows when illuminated. You can also achieve a solid print by setting wall perimeters high enough (e.g., 8–10 walls) to eliminate all internal infill.',
    },
    {
      question: 'Why does Lumiphane not feature a draft or quality menu?',
      answer:
        'Lumiphane always generates high-precision meshes using a fine 0.10 mm pitch so your printer achieves maximum possible detail. If you need faster print times, you can increase slicer layer height or scale down the model dimensions.',
    },
    {
      question: 'Do these slicer numbers work across different 3D printer brands?',
      answer:
        'Yes. The 0.12 mm layer height and 100% solid infill baseline applies universally to Bambu Lab, Prusa, Creality, Anycubic, and Elegoo FDM 3D printers.',
    },
    {
      question: 'Where can I verify the exact thickness of my model before printing?',
      answer:
        'Click the Export button to open the export dialog, which displays outer physical dimensions, minimum highlight thickness, and maximum shadow thickness for that specific mesh.',
    },
  ],
  closing: {
    heading: 'Dial in your lithophane settings',
    body: 'Upload your image, check the backlit preview, and download your calibrated 3D file for slicing.',
  },
};
