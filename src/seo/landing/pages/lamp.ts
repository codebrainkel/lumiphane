import type { LandingPage } from '../types';

export const lampPage: LandingPage = {
  path: '/lithophane-lamp/',
  navLabel: 'Lamp',
  kicker: 'Lamp guide',
  title: 'Lithophane Lamp from Your Photos | Lumiphane',
  description:
    'Make an open cylinder, hexagon, cube, or curved lithophane shade. Export STL or 3MF and light it with a cool LED. No socket is included.',
  breadcrumb: 'Lithophane lamp',
  h1: 'Make a lithophane lamp from your photos',
  lede:
    'A lithophane lamp is a shade: the picture appears when light inside the part shines through the wall. Lumiphane builds that shade. It does not build a socket, a cord, or a closed base for a bulb.',
  heroNote: 'Choose Round Cylinder, Hexagon, Hollow Cube, or Curved Panel in the generator.',
  sections: [
    {
      kind: 'figure',
      id: 'shapes',
      heading: 'Four ways to wrap a photo around a light',
      figure: 'lamps',
      caption:
        'Cylinder, hexagon, and cube are hollow tubes with open tops and bottoms. The curved panel is an arc, and its angle stops at 120°.',
    },
    {
      kind: 'table',
      id: 'which-shape',
      heading: 'Which shape to pick',
      caption: 'Sizes are the ranges of the sliders in Lumiphane. The starting size is the value already filled in.',
      columns: ['Shape', 'Photos', 'Size you can set', 'Best light'],
      rows: [
        ['Round cylinder', '1 to 4 around the circle', 'Diameter 50–300 mm, height 50–260 mm. Starts at 90 × 95 mm.', 'A small LED inside an open tube'],
        ['Hexagon', '1 to 6, one or more per flat wall', 'Diameter 50–260 mm, height 40–220 mm. Starts at 90 × 90 mm.', 'The same, with a faceted shade'],
        ['Hollow cube', '1 to 4, around four faces', 'Side 40–220 mm, height 40–220 mm. Starts at 90 × 90 mm.', 'An LED under or inside the open cube'],
        ['Curved panel', '1 to 4, tiled on the arc', 'Width 60–220 mm. Curve angle 30–120°, starting at 75°.', 'A light behind a standing arc, not inside a closed shade'],
      ],
    },
    {
      kind: 'prose',
      id: 'not-a-socket',
      heading: 'The model is the shade, not the lamp kit',
      blocks: [
        {
          paragraphs: [
            'Cylinder, hexagon, and cube geometry is a vertical tube. The top and bottom stay open so you can lower the shade over a light you already own. The optional base in the app is a wider footing under the photo so a tall print stays stuck to the printer bed. It is not a recess for a tea light and it is not a bulb holder.',
            'Measure the light. Leave a gap so nothing warm touches the plastic. PLA softens far below the temperature of an incandescent bulb — filament makers commonly put that change around 60°C — so use a cool LED. Do not put a candle inside.',
            'A curved panel cannot become a 360° shade. The angle slider ends at 120°. For a photo that goes all the way around, use the round cylinder. One photo on a cylinder is centered on the front, with the seam at the back.',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'photos',
      heading: 'How photos sit on a shade',
      blocks: [
        {
          paragraphs: [
            'Several photos split the circumference. Four photos on a cylinder each get a quarter turn. Six on a hexagon follow the six walls. A single photo wraps the whole shape, and the crop locks to that wrap so faces are not stretched. On a single lamp photo you can match the height to the picture when you want less of it trimmed.',
            'Wide scenes and individual portraits both work. A group of ten people in one wrap gets small in a hurry. Crop each person, or follow the [photo guide](/photo-to-lithophane/) and use one strong frame.',
            'Flat panels are the wrong tool for a shade. They are pictures for a window or a lightbox. The full beginner path, including flat panels, is in [how to make a lithophane](/how-to-make-a-lithophane/).',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'print-a-shade',
      heading: 'Print the shade upright',
      blocks: [
        {
          paragraphs: [
            'These shapes are modeled standing, with the opening vertical. Leave them upright in the slicer. A brim, which the in-app print guide suggests around 5–8 mm, is there because a tall thin wall is easy to knock loose, not because the picture needs supports. The curved wall and the flat faces of a cube or hexagon support themselves as they grow.',
            'Print the picture in white PLA, solid through the image. A Bambu Studio project from the export sheet already carries 0.12 mm layers and 100% infill for the single-nozzle Bambu Lab machines in that sheet. You still slice and print it in Bambu Studio — see [Bambu Studio lithophane](/bambu-studio-lithophane/). STL and standard 3MF leave those choices to whatever slicer you open. Details are in the [printing guide](/3d-printed-lithophane/) and the [settings guide](/lithophane-settings/).',
          ],
        },
      ],
    },
    {
      kind: 'note',
      paragraphs: [
        'A 90 mm starting diameter is a comfortable first shade, not a promise that a particular puck or tea light will fit. Measure your LED, including the housing, and keep it out of contact with the plastic.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Does the cylinder need supports?',
      answer:
        'Printed upright, the wall supports itself. Use a brim if your printer struggles to hold a tall part on the bed. The picture should not need support structures.',
    },
    {
      question: 'Can I close the top and add a bulb socket?',
      answer:
        'Not in Lumiphane. The tube is open at the top and bottom. Design a separate cap in CAD if you need one, and keep any light cool.',
    },
    {
      question: 'Why does my curved panel not meet in a circle?',
      answer:
        'The curved panel is an arc from 30° to 120°. The closed shade is the round cylinder.',
    },
    {
      question: 'How many photos can go around a lamp?',
      answer:
        'Up to four on a cylinder or cube, and up to six on a hexagon. One photo can also wrap the entire shape.',
    },
    {
      question: 'What filament should the shade be?',
      answer:
        'White PLA. The preview’s transmission is modeled for that plastic. Other colors will not match the lit preview.',
    },
  ],
  closing: {
    heading: 'Build the shade',
    body: 'Open the generator and choose a cylinder, hexagon, cube, or curved panel. Export the file, then pair it with a cool LED you measured yourself.',
  },
};
