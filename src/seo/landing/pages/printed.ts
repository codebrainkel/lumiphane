import type { LandingPage } from '../types';

export const printedPage: LandingPage = {
  path: '/3d-printed-lithophane/',
  navLabel: '3D printing',
  kicker: 'Printing guide',
  title: '3D Printed Lithophane: File to Finished Print | Lumiphane',
  description:
    'Export a standing lithophane as STL, 3MF, or a Bambu Studio project, then slice it yourself. Orientation, white PLA, and what Lumiphane does not control.',
  breadcrumb: '3D printed lithophane',
  h1: '3D print a lithophane from a photo',
  lede:
    'Lumiphane makes the model. Your slicer makes the toolpath. Your printer makes the part. This page is the path from a finished file to a print you can light from behind.',
  heroNote: 'Create the model in the browser, then open the file in your own slicer.',
  sections: [
    {
      kind: 'prose',
      id: 'split',
      heading: 'The file and the print are separate',
      blocks: [
        {
          paragraphs: [
            'Lumiphane does not talk to your printer. When the preview looks right, you download a mesh and leave the site. Choosing the photo and the shape is covered in [how to make a lithophane](/how-to-make-a-lithophane/) and [photo to lithophane](/photo-to-lithophane/).',
            'The app is built for FDM printing with white PLA. An SLA printer can open an STL — Formlabs has shown fine lithophanes in white resin — but this thickness curve will not match resin. Treat the preview as a white-PLA FDM print.',
          ],
        },
      ],
    },
    {
      kind: 'table',
      id: 'formats',
      heading: 'Which file to export',
      caption: 'All three are built in the export sheet. Pick the one your slicer actually opens.',
      columns: ['File', 'Open it in', 'What comes along'],
      rows: [
        ['Bambu Studio project', 'Bambu Studio, for a single-nozzle machine listed in the sheet', 'The mesh plus a saved Studio profile: 0.12 mm layers and 100% infill. You still slice and send the job yourself. Full walkthrough: [Bambu Studio lithophane](/bambu-studio-lithophane/).'],
        ['Standard 3MF', 'A slicer that imports 3MF meshes', 'The model. Process settings stay yours.'],
        ['STL', 'Almost any FDM slicer, including PrusaSlicer, Cura, OrcaSlicer, and Bambu Studio', 'The model only. Units are millimeters.'],
      ],
    },
    {
      kind: 'prose',
      id: 'orient',
      heading: 'Stand it up',
      blocks: [
        {
          paragraphs: [
            'Lumiphane builds the part standing, with the picture rising off the bed. Keep that orientation. Each layer becomes a thin horizontal slice through the tones. Lay the sheet flat and the nozzle width becomes your detail limit, with layer lines painted across the face.',
            'Flat sheets, curves, cylinders, cubes, and hexagons are all generated upright. Those walls usually do not need supports, but they do need help staying on the bed. The print guide in the app suggests a brim about 5–8 mm wide — for adhesion, not to hold up the picture.',
            'Shade-specific notes, including the open top and bottom, are on the [lamp page](/lithophane-lamp/).',
          ],
        },
      ],
    },
    {
      kind: 'table',
      id: 'slicer-start',
      heading: 'Starting point from the in-app print guide',
      intro:
        'These are Lumiphane’s recommendations for white PLA on a typical 0.4 mm nozzle. Temperature, retraction, and a fast machine’s useful speed still depend on your filament and printer. Change them in the slicer. A longer explanation of each number is in [lithophane settings](/lithophane-settings/).',
      caption: 'Use this as a first profile, then change whatever your filament maker or a calibration print disagrees with.',
      columns: ['In the slicer', 'Starting point', 'Why it is here'],
      rows: [
        ['Layer height', '0.12 mm, or 0.08–0.12 mm when you want smoother tones', 'Finer layers make smoother gradients. Below the reliable range of your machine, time goes up and the picture may not improve.'],
        ['Infill', '100% through the picture', 'A grid or honeycomb inside the wall shows up when you light it. Some makers use many walls instead, so the picture is solid and only a frame has sparse infill. The lit area still cannot have holes.'],
        ['Speed', 'About 30–40 mm/s in the print guide', 'Slower outer walls pick up less ripple. A well-tuned fast printer may go quicker. If the face ripples, slow the outer wall before you blame the photo.'],
        ['Material', 'White PLA', 'The thickness map and the preview assume white PLA transmission. Gray, black, silk, and translucent blends will not match.'],
        ['Supports', 'Usually none for these upright parts', 'Add a brim for adhesion. Do not add supports across the picture unless a specific feature actually overhangs.'],
      ],
    },
    {
      kind: 'prose',
      id: 'troubles',
      heading: 'When the print does not match the preview',
      blocks: [
        {
          heading: 'A pattern shows through the light',
          paragraphs: [
            'The inside of the wall is not solid. Set the picture to 100% infill, or to enough walls that the slicer never leaves a gap in the image. Sparse infill only belongs in a thick frame, if you use that approach at all.',
          ],
        },
        {
          heading: 'Horizontal bands or a wavy face',
          paragraphs: [
            'Slow the outer wall, check that the part is not wobbling, and confirm the layer height is a height your leadscrew can repeat. A lithophane shows mechanical error because you look through every layer.',
          ],
        },
        {
          heading: 'The tones are muddy in a filament that is not plain white PLA',
          paragraphs: [
            'The file is doing what it was built to do. Switch to a plain white PLA before you redraw the photo. Silk and sparkle scatter light in ways this model does not describe.',
          ],
        },
        {
          heading: 'It looks blank on the desk',
          paragraphs: [
            'Put a light behind it. An even, warm-white LED or a window is enough for a first look. The preview’s backlight is warm for the same reason: transmitted light, not light bouncing off the front.',
          ],
        },
      ],
    },
    {
      kind: 'note',
      paragraphs: [
        'The Bambu project embeds a Studio profile saved for those machines, including 0.12 mm layers and 100% infill. It does not lock every speed and temperature against your filament. Open the project and read the profile before you print. Step-by-step for Studio is in [Bambu Studio lithophane](/bambu-studio-lithophane/).',
      ],
    },
  ],
  faqs: [
    {
      question: 'Does Lumiphane slice the file?',
      answer:
        'The Bambu Studio project includes a process profile. You still open it in Bambu Studio and slice it. STL and standard 3MF have no process profile. See the Bambu Studio lithophane guide for the Studio-specific path.',
    },
    {
      question: 'Can I use PETG or resin?',
      answer:
        'The mesh will import. The bright-to-dark mapping is calculated for white PLA. Other materials need their own thickness tests if you want the preview to mean something.',
    },
    {
      question: 'What nozzle is this written for?',
      answer:
        'The print guide assumes a common 0.4 mm nozzle. A 0.2 mm nozzle can use a shorter layer, often around 0.08 mm, but that choice lives in your slicer.',
    },
    {
      question: 'Should the first print be large?',
      answer:
        'No. A panel around the default size — 120 mm wide for a flat photo, or a 90 mm lamp — is enough to learn your filament. Scale up after one lit test looks right.',
    },
    {
      question: 'Who chooses the temperature?',
      answer:
        'You do, from the filament maker’s range. Lumiphane does not set nozzle or bed temperature.',
    },
  ],
  closing: {
    heading: 'Export, then slice',
    body: 'Create the lithophane, download STL or 3MF, and finish the job in the slicer you already trust.',
  },
};
