import type { LandingPage } from '../types';

export const bambuPage: LandingPage = {
  path: '/bambu-studio-lithophane/',
  navLabel: 'Bambu Studio',
  kicker: 'Bambu guide',
  title: 'Lithophane for Bambu Studio: Export to Print | Lumiphane',
  description:
    'Export a Bambu Studio project from Lumiphane with 0.12 mm layers and 100% infill for listed single-nozzle machines. Open it in Studio, slice, and print in white PLA.',
  breadcrumb: 'Bambu Studio lithophane',
  h1: 'Print a lithophane from a Bambu Studio project',
  lede:
    'Lumiphane can hand you a Bambu Studio project: the standing mesh plus a saved 0.12 mm, 100% infill process for the single-nozzle Bambu Lab machine you pick. You still open the file in Studio, slice it, and send the job yourself.',
  heroNote: 'Pick Bambu Studio project in the export sheet, then choose your printer from the list.',
  sections: [
    {
      kind: 'prose',
      id: 'what-you-get',
      heading: 'What the Bambu project actually contains',
      blocks: [
        {
          paragraphs: [
            'A Bambu Studio project from Lumiphane is a 3MF archive Studio recognizes as its own. Inside is the lithophane mesh, already standing on the bed, and a process profile saved for that machine: 0.12 mm layers and 100% infill through the picture, plus a brim for adhesion. Filament temperature and many speed limits still follow the filament profile Studio loads for white PLA on that printer.',
            'It is not a print queue. Lumiphane does not talk to your printer, queue a plate, or watch the job. After the download, the next screen is Bambu Studio on your computer. The general export and slicer path for any machine is in the [3D printed lithophane](/3d-printed-lithophane/) guide.',
          ],
        },
      ],
    },
    {
      kind: 'table',
      id: 'machines',
      heading: 'Machines in the export sheet',
      intro:
        'The project is built for single-nozzle, 0.4 mm profiles that ship with Bambu Studio. Pick the printer you will actually use. The mesh stays the same; Studio’s machine and process names change to match.',
      caption: 'If your machine is missing from this list, export a standard 3MF or an STL and open that in Studio instead.',
      columns: ['In the sheet', 'Studio printer model'],
      rows: [
        ['Bambu Lab A2L', 'Bambu Lab A2L'],
        ['Bambu Lab A1', 'Bambu Lab A1'],
        ['Bambu Lab A1 mini', 'Bambu Lab A1 mini'],
        ['Bambu Lab P1P', 'Bambu Lab P1P'],
        ['Bambu Lab P1S', 'Bambu Lab P1S'],
        ['Bambu Lab X1 Carbon', 'Bambu Lab X1 Carbon'],
        ['Bambu Lab X1', 'Bambu Lab X1'],
        ['Bambu Lab X1E', 'Bambu Lab X1E'],
        ['Bambu Lab P2S', 'Bambu Lab P2S'],
        ['Bambu Lab H2S', 'Bambu Lab H2S'],
      ],
    },
    {
      kind: 'steps',
      id: 'steps',
      heading: 'From photo to Bambu print',
      intro: 'Stay in this order. A bad photo still prints as a bad lithophane, even with a perfect Studio profile.',
      steps: [
        {
          title: 'Build the model in the browser',
          body: 'Choose a shape, add JPEG, PNG, or WebP photos, and read the backlit preview. Contrast, brightness, and crop matter more than anything in the slicer. The beginner path is in [how to make a lithophane](/how-to-make-a-lithophane/). Photo choices are in [photo to lithophane](/photo-to-lithophane/).',
        },
        {
          title: 'Open Export and pick Bambu Studio project',
          body: 'Wait until the preview finishes. In the export sheet, choose the Bambu Studio project option and the printer you will print on. The sheet also shows outer size, the thickness range for this part, and any warning. Read the warning before a multi-hour job.',
        },
        {
          title: 'Download the project file',
          body: 'The filename names the printer you selected. Keep the .3mf extension. Do not unzip it by hand unless you are debugging; Studio opens the archive as a project.',
        },
        {
          title: 'Open it in Bambu Studio',
          body: 'File → Open, or drop the file onto Studio. Confirm the printer matches the one you picked, that the part is still standing upright, and that the process shows 0.12 mm layers with solid infill in the picture. Change filament to a plain white PLA profile for that machine if Studio did not already load one.',
        },
        {
          title: 'Slice, then send the job',
          body: 'Slice in Studio and review the preview. You should see a solid wall through the image and a brim around the foot. Send the plate the same way you send any other Studio job. Lumiphane is out of the loop after the download.',
        },
        {
          title: 'Light the finished print from behind',
          body: 'A flat panel needs a window or an even LED behind it. A cylinder, cube, or hexagon is an open shade for a cool LED — never a hot bulb. Lamp shapes and sizing are on the [lamp page](/lithophane-lamp/).',
        },
      ],
    },
    {
      kind: 'table',
      id: 'profile',
      heading: 'What the embedded profile sets',
      caption: 'These values come with the project. Temperature and many speeds still follow your filament and machine presets in Studio.',
      columns: ['In the project', 'Value', 'Why it is there'],
      rows: [
        ['Layer height', '0.12 mm', 'Finer layers make smoother tones through white PLA. A 0.2 mm nozzle can go nearer 0.08 mm if you change it in Studio.'],
        ['Infill in the picture', '100%', 'A grid or honeycomb inside the wall shows up when you light it. The lit area has to be solid plastic.'],
        ['Orientation', 'Standing', 'Lumiphane builds the part upright. Leave it that way so layer steps draw the tones.'],
        ['Brim', 'About 5–8 mm in the print guide', 'Tall thin walls tip. The brim is bed adhesion, not support under the picture.'],
        ['Material assumption', 'White PLA', 'The thickness map and the on-screen preview are tuned for white PLA transmission.'],
      ],
    },
    {
      kind: 'prose',
      id: 'when-not',
      heading: 'When to skip the Bambu project',
      blocks: [
        {
          paragraphs: [
            'Use a standard 3MF or an STL when your printer is not in the export list, when you want OrcaSlicer or another fork, or when you already keep a lithophane process you trust and only need the mesh. Those formats carry the model only. You set layer height and infill yourself. The [settings guide](/lithophane-settings/) separates what Lumiphane controls from what belongs in the slicer.',
            'Multi-material tricks and dual-nozzle machines are outside this project. A lithophane is one material: white PLA. Color in the photo becomes thickness, not a second filament.',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'mistakes',
      heading: 'Mistakes that waste a Bambu print',
      blocks: [
        {
          heading: 'Laying the part flat on the plate',
          paragraphs: [
            'Studio will let you rotate it. Do not. Flat on the bed makes nozzle width the detail limit and paints layer lines across the face. The project is exported standing for a reason.',
          ],
        },
        {
          heading: 'Switching to sparse infill to “save plastic”',
          paragraphs: [
            'Any gap in the picture lights up as a pattern. Keep 100% through the image, or enough walls that Studio never leaves a hole there.',
          ],
        },
        {
          heading: 'Printing silk, gray, or “marble” PLA',
          paragraphs: [
            'The file will slice. The tones will not match the preview. Sparkle and dark pigment scatter light in ways this thickness curve does not describe.',
          ],
        },
        {
          heading: 'Judging the part before you light it',
          paragraphs: [
            'An unlit lithophane is a white texture. Put a cool LED or a window behind it before you decide contrast was wrong.',
          ],
        },
      ],
    },
    {
      kind: 'note',
      paragraphs: [
        'The embedded profile is a starting point saved for those machines. Read it in Studio before you print. Filament brand, nozzle wear, and a fast machine’s useful speed are still your responsibility.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Does Lumiphane send the job to my Bambu?',
      answer:
        'No. It builds a Studio project file. You open that file in Bambu Studio, slice it, and send the plate the way you always do.',
    },
    {
      question: 'My printer is not in the list. What do I export?',
      answer:
        'Export a standard 3MF or an STL, open it in Bambu Studio, and apply your own 0.12 mm, solid-infill process. The Bambu project option is only for the single-nozzle machines named in the sheet.',
    },
    {
      question: 'Can I use AMS or a second color?',
      answer:
        'A lithophane is one translucent material. Extra colors do not paint the photo; thickness does. Load plain white PLA and keep the picture solid.',
    },
    {
      question: 'Do I still need to slice in Studio?',
      answer:
        'Yes. The project includes a process profile. Studio still has to slice the toolpaths and talk to the printer.',
    },
    {
      question: 'Where should I go if the print looks wrong?',
      answer:
        'Check orientation and infill first, then filament. Photo and contrast issues belong in the photo guide. Mechanical banding and slicer numbers are covered in the printing and settings guides.',
    },
  ],
  closing: {
    heading: 'Export for your Bambu',
    body: 'Create the lithophane, download the Bambu Studio project for your machine, then finish the job in Studio.',
  },
};
