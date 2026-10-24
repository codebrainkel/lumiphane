import type { LandingPage } from '../types';

export const howToPage: LandingPage = {
  path: '/how-to-make-a-lithophane/',
  navLabel: 'How to make',
  kicker: 'Beginner guide',
  title: 'How to Make a Lithophane: Complete 3D Guide | Lumiphane',
  description:
    'Learn how to create a custom 3D printed lithophane from any photo. Generate clean STL or 3MF models in your browser, configure slicer settings, and print.',
  breadcrumb: 'How to make a lithophane',
  h1: 'How to Make a 3D Printed Lithophane',
  lede:
    'A lithophane is an embossed artwork that reveals a detailed photographic image when illuminated from behind. Because thinner plastic allows more light to pass through while thicker plastic casts deep shadows, varying wall thickness creates rich grayscale gradients. This complete guide walks you through selecting the right photo, generating a 3D model, and slicing your print for flawless results.',
  heroNote: 'Opens the generator in your browser. No Lumiphane account needed.',
  sections: [
    {
      kind: 'prose',
      id: 'what-it-is',
      heading: 'The science of lithophanes: light transmission and relief',
      blocks: [
        {
          paragraphs: [
            'Historically crafted from translucent porcelain plaques in 19th-century Europe, traditional lithophanes used subtle variations in wall thickness to reproduce photographic tones. When placed in front of a backlight, thin regions transmit bright illumination, whereas thicker sections hold back light to form deep shadows. Modern desktop 3D printers replicate this exact optical principle in plastic: specialized modeling software analyzes image pixel brightness and converts lighter areas into thin walls and darker areas into thick walls.',
            'Because light attenuation through semi-translucent material follows the Beer-Lambert law, transmitted brightness drops off exponentially as wall thickness increases. Lumiphane calibrates this non-linear optical response specifically for standard white PLA filament, ensuring smooth midtone gradients and realistic highlight roll-off in your physical print. Our interactive 3D viewport includes a realistic backlight simulation, so you can preview contrast and exposure before committing to a multi-hour print job.',
            'Keep in mind that the on-screen preview is an optical simulation engineered to help you balance image tones. Subtle variations in filament brand translucency and backlight color temperature may produce minor differences in your final print.',
          ],
        },
      ],
    },
    {
      kind: 'figure',
      id: 'thickness',
      heading: 'Thin sections transmit light, thick sections block it',
      figure: 'transmission',
      caption:
        'A lithophane surface varies in thickness according to photo brightness. In ordinary room light, it looks like a subtle white relief; illuminated from behind, a photographic image appears.',
    },
    {
      kind: 'prose',
      id: 'two-jobs',
      heading: 'Understanding the workflow: model generation versus slicing',
      blocks: [
        {
          paragraphs: [
            'Producing a lithophane involves two distinct steps: generating the 3D surface geometry and slicing the toolpaths for your printer. Lumiphane operates entirely client-side in your web browser. You select a physical shape, upload JPEG, PNG, or WebP photographs, crop and position the image, adjust exposure and contrast, and download a clean STL or 3MF file. All processing occurs locally on your computer, keeping your images private.',
            'The exported 3D model contains physical geometry, but your 3D printer requires machine-specific G-code instructions. You load the downloaded model into your preferred slicer (such as Bambu Studio, OrcaSlicer, PrusaSlicer, or Cura), configure parameters such as 0.12 mm layer height and 100% solid infill, and send the job to your printer. For in-depth printer calibration, consult our [3D printed lithophane guide](/3d-printed-lithophane/) and our [lithophane settings guide](/lithophane-settings/).',
          ],
        },
      ],
    },
    {
      kind: 'cards',
      id: 'you-need',
      heading: 'Essential requirements for a high-quality lithophane',
      cards: [
        {
          title: 'A high-contrast photo with a clear subject',
          body: 'Portraits of faces, pets, and subjects with distinct separation from the background produce the sharpest results. Explore our [photo to lithophane guide](/photo-to-lithophane/) for framing, resolution, and contrast recommendations.',
        },
        {
          title: 'A shape matched to your display light',
          body: 'Flat panels fit neatly into window frames or display lightboxes, while curved panels stand independently on a table. Cylinders, lanterns, and cubes create 360-degree lampshades. Dimension options are detailed in our [lithophane lamp guide](/lithophane-lamp/).',
        },
        {
          title: 'Standard white PLA and a cool LED source',
          body: 'Our light transmission model is engineered specifically for standard white PLA. Colored, silk, or dark filaments distort contrast balance. Always illuminate PLA prints with cool LED lighting, as hot incandescent bulbs can soften plastic.',
        },
        {
          title: 'Your preferred 3D slicing software',
          body: 'Export ready-to-print STL or standard 3MF files for any desktop slicer, or download native Bambu Studio project files with pre-configured settings. See our [Bambu Studio lithophane guide](/bambu-studio-lithophane/) for setup details.',
        },
      ],
    },
    {
      kind: 'steps',
      id: 'steps',
      heading: 'Step-by-step lithophane creation walkthrough',
      intro: 'Follow this proven sequence. A well-prepared photograph and proper slicer configuration ensure a clean, detailed print every time.',
      steps: [
        {
          title: 'Choose your geometric shape',
          body: 'Select between flat panels, curved arcs, round cylinders, hollow cubes, or hexagonal lanterns. Flat and curved panels support up to 4 photos in customizable collage layouts, while lanterns display individual images across each exterior face.',
        },
        {
          title: 'Upload and crop your photos',
          body: 'Import your JPEG, PNG, or WebP pictures. Use the built-in crop modal and positional offset controls to center your subject, balance negative space, and ensure essential features fit comfortably within the frame.',
        },
        {
          title: 'Fine-tune contrast and brightness in the lit preview',
          body: 'Inspect the simulated backlit preview. Increase contrast to expand the dynamic range between bright highlights and deep shadows, or adjust brightness if skin tones appear blown out. Reference our [lithophane settings guide](/lithophane-settings/) for optimal values.',
        },
        {
          title: 'Export your 3D mesh file',
          body: 'Select your preferred export format. Choose a pre-configured Bambu Studio 3MF project, standard 3MF, or binary STL. The export dialog displays exact physical dimensions, minimum and maximum wall thickness, and geometry checks before you download.',
        },
        {
          title: 'Slice the model standing upright',
          body: 'Keep the model oriented vertically on the build plate. For optimal definition on a standard 0.4 mm nozzle, slice at 0.12 mm layer height, 100% solid infill, moderate outer wall speed (30–40 mm/s), and a 5–8 mm brim for bed stability.',
        },
        {
          title: 'Illuminate with rear lighting',
          body: 'Position the finished print in front of an even light source, such as a window, LED backlight panel, or low-heat desk lamp. In ambient room lighting, the surface appears subtle and tactile; when illuminated from behind, your photograph emerges with lifelike depth.',
        },
      ],
    },
    {
      kind: 'prose',
      id: 'mistakes',
      heading: 'Common printing mistakes and how to avoid them',
      blocks: [
        {
          heading: 'Printing the model flat on the print bed',
          paragraphs: [
            'Laying the model flat forces your printer to render subtle photographic tones using coarse horizontal nozzle extrusions, creating prominent contour stepping across faces. Printing vertically allows fine micro-layer heights (0.08–0.12 mm) to reproduce smooth, gradual grayscale transitions. Lumiphane automatically models and exports files in their correct vertical orientation.',
          ],
        },
        {
          heading: 'Using hollow or sparse infill patterns',
          paragraphs: [
            'Standard decorative prints use sparse infill like grid or gyroid to save filament, but internal air cavities cast unsightly shadows when illuminated. The photo area must be sliced with 100% solid infill (or enough concentric perimeters to eliminate internal voids) so light transmits evenly through solid plastic.',
          ],
        },
        {
          heading: 'Selecting low-contrast or cluttered images',
          paragraphs: [
            'Busy backgrounds, large group photos with tiny faces, and low-contrast snapshots turn into indistinct silhouettes when translated into physical thickness. Crop closely onto prominent subjects with clear lighting and well-defined contours.',
          ],
        },
        {
          heading: 'Evaluating print quality under unlit ambient lighting',
          paragraphs: [
            'An unlit lithophane looks like a plain white textured plastic plaque. Its true image contrast and tonal fidelity only appear when light passes through the material from the rear.',
          ],
        },
      ],
    },
  ],
  faqs: [
    {
      question: 'Do I need CAD or 3D modeling software?',
      answer:
        'No prior CAD experience is needed. Lumiphane automatically converts your 2D photo into a watertight 3D mesh. You only need a slicing program like Bambu Studio, PrusaSlicer, or Cura to prepare the file for printing.',
    },
    {
      question: 'Will my 3D printed lithophane display color?',
      answer:
        'Traditional lithophanes are single-material prints. Color in your photo is converted to grayscale luminance, which translates into physical wall thickness. Rich tonal contrast is created by light passing through varied thicknesses of white filament.',
    },
    {
      question: 'Can I print lithophanes with silk, gray, or colored filament?',
      answer:
        'We strongly recommend standard white PLA. The optical transmission model and on-screen preview are calibrated for natural white PLA light scattering. Silk additives, marble flecks, or colored pigments alter light diffusion and result in muddy tones.',
    },
    {
      question: 'Does Lumiphane include physical lamp electronics?',
      answer:
        'Lumiphane generates the 3D printable shade or panel geometry with an integrated stabilizing base. You supply the illumination source, such as a cool white LED puck light or LED strip.',
    },
    {
      question: 'What guide should I explore next?',
      answer:
        'Read our [photo to lithophane guide](/photo-to-lithophane/) for image optimization tips, our [lithophane lamp guide](/lithophane-lamp/) for custom shades, or our [3D printed lithophane guide](/3d-printed-lithophane/) for comprehensive slicer recommendations.',
    },
  ],
  closing: {
    heading: 'Ready to create your first lithophane?',
    body: 'Launch the generator, select your preferred shape, and upload a favorite photo. Our interactive backlit preview lets you inspect the result instantly before printing.',
  },
};
