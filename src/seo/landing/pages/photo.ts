import type { LandingPage } from '../types';

export const photoPage: LandingPage = {
  path: '/photo-to-lithophane/',
  navLabel: 'Photo',
  kicker: 'Photo guide',
  title: 'Photo to Lithophane, Step by Step | Lumiphane',
  description:
    'Turn a JPEG, PNG, or WebP into a lithophane. How to crop, place, and set contrast before Lumiphane exports an STL or 3MF.',
  breadcrumb: 'Photo to lithophane',
  h1: 'Turn a photo into a lithophane',
  lede:
    'The converter reads brightness, not the color name of a pixel. A clear subject and an honest crop matter more than a giant camera file. This page is the photo workflow inside Lumiphane.',
  heroNote: 'Add a photo after you pick a shape. No Lumiphane account is required.',
  sections: [
    {
      kind: 'prose',
      id: 'what-converts',
      heading: 'What actually gets converted',
      blocks: [
        {
          paragraphs: [
            'Lumiphane turns the photo into a grid of brightness values, stretches that range so the lightest and darkest useful tones reach the thin and thick walls, and adds a little edge emphasis. Brightness then sets thickness. The science of that thickness is in [how to make a lithophane](/how-to-make-a-lithophane/).',
            'You do not get a color lithophane, a text tool, or a background-removal brush. JPEG, PNG, and WebP are the formats the uploader asks for. A file that is not an image is skipped.',
            'The mesh is built in the browser. Creating the model does not upload the photo to Lumiphane.',
          ],
        },
      ],
    },
    {
      kind: 'cards',
      id: 'choose',
      heading: 'Photos that survive a nozzle',
      intro:
        'A 0.4 mm nozzle cannot draw every eyelash. Pick the picture as if you were carving it, not posting it.',
      cards: [
        {
          title: 'One subject, evenly lit',
          body: 'A face in soft light, a pet against a simple background, or a building with a clear outline. Hard backlight that silhouettes the subject becomes a dark blob.',
        },
        {
          title: 'Real contrast, not a filter',
          body: 'You want separate light and dark regions. A hazy, low-contrast photo stays a narrow band of gray even after you raise the contrast slider.',
        },
        {
          title: 'A crop with less empty dark',
          body: 'A huge black background becomes a thick slab around a small subject. Crop tight before you commit to a large print.',
        },
        {
          title: 'Sharp where it matters',
          body: 'Motion blur and heavy noise become lumps. If you cannot see the eyes in a small preview, the lithophane will not invent them.',
        },
      ],
    },
    {
      kind: 'steps',
      id: 'workflow',
      heading: 'The workflow in Lumiphane',
      steps: [
        {
          title: 'Pick the shape, then the pictures',
          body: 'The shape decides how the photo is framed. One photo on a flat or curved panel keeps its proportions, and the panel height follows it. A cylinder, cube, hexagon, or a multi-photo panel locks each crop to the tile so the picture is not stretched around the part.',
        },
        {
          title: 'Upload JPEG, PNG, or WebP',
          body: 'You can drop several files. Flat, curved, cube, and cylinder shapes take up to 4. A hexagon takes up to 6. Extra files past that limit are left out.',
        },
        {
          title: 'Crop and slide the subject into place',
          body: 'Open the crop for a photo when the frame cuts off a head or leaves too much background. On the preview step you can also slide the photo inside its frame. Positive movement shifts it right or up.',
        },
        {
          title: 'Tile extra photos on a flat or curved panel',
          body: 'Two photos can sit side by side or stacked. Three and four have row, stack, and grid layouts. Around a lamp, photos split the perimeter instead of stacking on one face. Shade layouts are on the [lamp page](/lithophane-lamp/).',
        },
        {
          title: 'Set contrast and brightness while the preview is lit',
          body: 'Contrast runs from −30% to +35%. Brightness runs from −30% to +30%. Invert swaps light and dark. There is no separate gamma slider. If the lit preview looks flat or blown out, change these before you export. The full map of controls is in [lithophane settings](/lithophane-settings/).',
        },
        {
          title: 'Export STL or 3MF',
          body: 'The export sheet builds a Bambu Studio project, a standard 3MF, or an STL. What you do with that file in a slicer is covered in [3D printed lithophane](/3d-printed-lithophane/). Opening the Bambu project in Studio is in [Bambu Studio lithophane](/bambu-studio-lithophane/).',
        },
      ],
    },
    {
      kind: 'table',
      id: 'symptoms',
      heading: 'If the preview looks wrong',
      caption: 'Fix the picture here. Layer height and infill will not repair a photo that is already muddy in the preview.',
      columns: ['What you see', 'What to try'],
      rows: [
        ['The face is a white hole', 'Lower brightness. If the source photo is blown out, crop to a better frame or choose another shot.'],
        ['Everything is a similar gray', 'Raise contrast. If that clips the highlights, the photo itself has little tonal range.'],
        ['The background is a dark mass', 'Crop it away. Invert only if you want the light and dark relationship flipped on purpose.'],
        ['The subject is cut off', 'Recrop, or slide the photo inside the frame. On a single lamp photo, match the height to the photo so less of it is trimmed.'],
        ['Fine text disappeared', 'Expect that. A lithophane is a poor way to reproduce small lettering at a 0.4 mm nozzle.'],
      ],
    },
    {
      kind: 'note',
      paragraphs: [
        'A larger camera file does not automatically mean a sharper lithophane. Lumiphane samples the relief at about a tenth of a millimeter, and a very large panel eases that spacing so the mesh stays manageable. Past that, the nozzle and the layer height decide what you can see.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Can I use a screenshot or a logo?',
      answer:
        'Yes, if it is a JPEG, PNG, or WebP and the shapes are bold. Thin lines and tiny type are the first details to disappear.',
    },
    {
      question: 'Should I convert the photo to black and white first?',
      answer:
        'You can, but you do not have to. Lumiphane uses brightness. Editing the crop and contrast in the generator is usually enough.',
    },
    {
      question: 'Does a phone photo work?',
      answer:
        'Yes. A well-lit phone photo of one subject is a better source than a huge, dark, crowded file.',
    },
    {
      question: 'Can I put several people on one lithophane?',
      answer:
        'Up to four photos on most shapes, and six on a hexagon. One person per photo, each cropped tight, reads more clearly than one group shot.',
    },
    {
      question: 'Where is the thickness setting?',
      answer:
        'There is no thickness slider. Panel size chooses it. The settings guide explains the 0.8 mm to 3.0 mm baseline and when a larger part gets slightly thicker.',
    },
  ],
  closing: {
    heading: 'Use the photo you would crop tight',
    body: 'Open the generator, choose the shape, and add the picture. Check the lit preview before you spend the print.',
  },
};
