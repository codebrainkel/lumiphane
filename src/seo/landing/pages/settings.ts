import type { LandingPage } from '../types';

export const settingsPage: LandingPage = {
  path: '/lithophane-settings/',
  navLabel: 'Settings',
  kicker: 'Settings guide',
  title: 'Lithophane Settings for Model and Slicer | Lumiphane',
  description:
    'Thickness, contrast, border, and size are set in Lumiphane. Layer height, infill, and speed are set in your slicer. What each one changes.',
  breadcrumb: 'Lithophane settings',
  h1: 'Lithophane settings that change the picture',
  lede:
    'Half of a lithophane is decided when the mesh is built. The other half is decided when you slice it. This page keeps those two lists apart, using the controls Lumiphane actually shows.',
  heroNote: 'Thickness follows the size of the part. There is no thickness slider to hunt for.',
  sections: [
    {
      kind: 'table',
      id: 'two-places',
      heading: 'Two different places',
      caption: 'If a control is missing in Lumiphane, it belongs in the slicer, or it is applied automatically.',
      columns: ['Question', 'In Lumiphane', 'In the slicer'],
      rows: [
        ['How thick are the bright and dark areas?', 'Chosen from the part size. Shown on the export sheet.', 'Do not scale Z alone. That stretches the tones.'],
        ['How bright is the picture?', 'Brightness, contrast, and invert.', 'Not a slicer setting.'],
        ['How smooth are the tones in plastic?', 'The mesh is sampled finely. You see the result in the preview.', 'Layer height, speed, and a solid wall.'],
        ['Will it stay on the bed?', 'Optional footing under the photo.', 'Brim, temperature, and a clean plate.'],
        ['What plastic and how hot?', 'The model assumes white PLA.', 'Filament profile, nozzle, and bed temperature.'],
      ],
    },
    {
      kind: 'figure',
      id: 'thickness',
      heading: 'How thickness is chosen',
      figure: 'transmission',
      caption:
        'At 120 mm or smaller on the long side, the brightest tone is 0.8 mm and the darkest is 3.0 mm. Larger parts get slightly thicker walls.',
    },
    {
      kind: 'prose',
      id: 'thickness-detail',
      heading: 'The thickness numbers, and when they move',
      blocks: [
        {
          paragraphs: [
            'White PLA transmits less light as the wall gets thicker, and the drop is steep rather than linear. Lumiphane uses that curve, with a transmission constant chosen for white PLA, so a dark pixel lands on the thick wall and a bright pixel lands on the thin wall. The preview uses the same mapping. Another brand of “white” can still differ. Silk, gray, PETG, and resin are outside what this curve describes.',
            'There is no min/max slider. Up to 120 mm on the longest side, the range is 0.8 mm in the highlights and 3.0 mm in the shadows. Above that, the thin wall can gain at most 0.2 mm and the thick wall at most 0.4 mm, so a big part stays a bit stronger without turning the highlights opaque. The border is modeled 0.4 mm thicker than the darkest tone so the frame stays darker than the picture.',
            'Those are the values this app uses for white PLA. They are not a universal specification. A different filament, a different LED, or a nozzle that cannot reliably extrude a 0.8 mm wall is a reason to test, not a reason to expect the same numbers from every guide on the internet. American Filament, for example, publishes ranges that shift with pigment and with the color of the backlight. Treat any single table, including this one, as a starting point for the material it names.',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'tone',
      heading: 'Tone controls you can move',
      blocks: [
        {
          paragraphs: [
            'Contrast runs from −30% to +35%. Raising it pushes bright pixels toward the thin wall and dark pixels toward the thick wall. Brightness runs from −30% to +30% and shifts the whole picture. Invert swaps the relationship, so a light subject can be made from thicker plastic if that is what you want.',
            'Before those sliders, the generator stretches the photo’s tonal range and applies a small amount of edge emphasis. You do not switch those off in the interface. There is also no gamma slider and no smoothing slider. If the lit preview is wrong, crop the photo or move contrast and brightness. Photo choices are in [photo to lithophane](/photo-to-lithophane/).',
            'The relief is sampled at about 0.10 mm, finer than the 0.12 mm layer the print guide recommends, until a very large panel has to ease that spacing to keep the mesh within a sample budget. You do not pick a quality tier in the current screen. The nozzle still decides what of that mesh you can see.',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'size-border',
      heading: 'Size, border, and the bed footing',
      blocks: [
        {
          paragraphs: [
            'A flat or curved panel’s width slider runs from 60 mm to 220 mm. Height follows the photo when a single picture fills the panel. The curve angle runs from 30° to 120° and starts at 75°. Lamp diameters and heights are listed on the [lamp page](/lithophane-lamp/).',
            'Border width starts at 1.5 mm and stops at a maximum that depends on the part. Heart, star, and bone icons need a border about 5 mm wide so the motif can be read. The frame is plastic, so it shows up as a dark rim when lit.',
            'The base stand is a footing below the picture: a standard brim-style foot, a wider or finned foot, a wide base, or none. Labels change slightly between a flat panel and a tube. It makes the printed part taller. It does not add a lamp socket.',
          ],
        },
      ],
    },
    {
      kind: 'table',
      id: 'slicer',
      heading: 'Settings that belong in the slicer',
      intro:
        'The print guide inside the generator recommends the first column for white PLA. The Bambu Studio project already stores 0.12 mm layers and 100% infill. Speed, temperature, and retraction are still your filament’s problem. The printing sequence is in [3D printed lithophane](/3d-printed-lithophane/).',
      caption: 'Change these in the slicer after you export. Lumiphane does not send them to the printer.',
      columns: ['Setting', 'App print guide', 'Depends on'],
      rows: [
        ['Layer height', '0.12 mm, or 0.08–0.12 mm for smoother tones', 'Nozzle, leadscrew, and how long you want to print. A 0.2 mm nozzle is often run nearer 0.08 mm.'],
        ['Infill in the picture', '100% solid', 'Your slicer. A high wall count can also make the picture solid. Gaps in the lit area show up as a pattern.'],
        ['Outer wall speed', 'About 30–40 mm/s', 'Printer rigidity and filament. Slow down if the face ripples. A tuned fast machine may not need to stay this slow.'],
        ['Brim', 'About 5–8 mm', 'Bed surface, height of the part, and whether the footing in the model is already wide.'],
        ['Temperature', 'Not set by Lumiphane', 'The filament maker’s range. Hotter is not a contrast control.'],
        ['Supports', 'Not required for these upright shapes', 'Only add them for a real overhang. Supports on the picture scar the surface you look through.'],
      ],
    },
    {
      kind: 'table',
      id: 'which-knob',
      heading: 'Which knob to turn',
      caption: 'Look at a lit preview or a lit print before changing anything.',
      columns: ['Symptom', 'Adjust'],
      rows: [
        ['Preview is flat gray', 'Raise contrast. If the photo has no darks and lights, pick another crop.'],
        ['Faces are empty white', 'Lower brightness, or use a photo that still has detail in the skin.'],
        ['Frame is brighter than the picture', 'It should not be. The frame is thicker than the darkest tone. If a slicer hole is punched through it, the slicer is the problem.'],
        ['Lit print shows a grid', 'Infill. Make the picture solid.'],
        ['Lit print is banded, preview was smooth', 'Layer height, speed, or a wobbling part. The mesh is not the banding.'],
        ['Only the window shows the photo', 'That is a lithophane. Keep a light behind it.'],
      ],
    },
  ],
  faqs: [
    {
      question: 'Can I type in 0.6 mm and 3.5 mm?',
      answer:
        'Not in this version. Size changes the automatic range inside the limits above. The export sheet shows the range for the model you are about to download.',
    },
    {
      question: 'Is 100% infill the only correct method?',
      answer:
        'It is the method the print guide and the Bambu project use, because a gap lights up. A wall count high enough to make the picture solid can do the same job. Sparse infill inside the picture does not.',
    },
    {
      question: 'Why is there no quality menu?',
      answer:
        'The generator samples the photo at a fine pitch and does not ask you to pick a draft mode. File size still grows with the part. If a computer struggles, make a smaller lithophane.',
    },
    {
      question: 'Do these numbers work for every printer?',
      answer:
        'No. Layer height, speed, and temperature move with the nozzle, the motion system, and the filament. Use the guide as the first profile for white PLA, then keep the change that a lit test print justifies.',
    },
    {
      question: 'Where do I see the thickness of my model?',
      answer:
        'Open Export. The details include the outer size and the min-to-max thickness for that mesh.',
    },
  ],
  closing: {
    heading: 'Apply it on a real photo',
    body: 'Create a lithophane at the default size, read the thickness in the export sheet, and print one test before you scale up.',
  },
};
