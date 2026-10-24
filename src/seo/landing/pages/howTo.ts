import type { LandingPage } from '../types';

export const howToPage: LandingPage = {
  path: '/how-to-make-a-lithophane/',
  navLabel: 'How to make',
  kicker: 'Beginner guide',
  title: 'How to Make a Lithophane from a Photo | Lumiphane',
  description:
    'Learn how to make a lithophane from a photo: build the model in your browser, export STL or 3MF, then slice and print. A clear beginner walkthrough.',
  breadcrumb: 'How to make a lithophane',
  h1: 'How to make a lithophane',
  lede:
    'A lithophane is a thin print that looks almost blank in room light, then shows a picture when light shines through it from behind. This guide covers the photo, the model Lumiphane builds, and how you print it.',
  heroNote: 'Opens the generator in your browser. No Lumiphane account needed.',
  sections: [
    {
      kind: 'prose',
      id: 'what-it-is',
      heading: 'Why thickness becomes a picture',
      blocks: [
        {
          paragraphs: [
            'Old lithophanes were porcelain plaques. Thin spots let more light through; thick spots held it back. Put a lamp behind the plaque and that relief becomes a grayscale scene. A 3D printer does the same thing with plastic: the generator reads how bright each part of a photo is and varies the wall thickness.',
            'Bright areas become thin. Dark areas become thick. Light through translucent plastic falls off quickly as the wall gets thicker, so even a modest thickness range can show a full set of tones. Lumiphane maps that curve for white PLA. The on-screen preview uses the same idea, so you can judge the picture before a long print.',
            'The preview is a simulation — close enough to trust, not a photo of your filament or LED.',
          ],
        },
      ],
    },
    {
      kind: 'figure',
      id: 'thickness',
      heading: 'Thin passes light, thick blocks it',
      figure: 'transmission',
      caption:
        'The same sheet is thin where the photo is bright and thick where it is dark. Without a light behind it, the sheet looks like a blank relief.',
    },
    {
      kind: 'prose',
      id: 'two-jobs',
      heading: 'Generating a model and printing it are different jobs',
      blocks: [
        {
          paragraphs: [
            'Lumiphane runs in the browser. You pick a shape, add JPEG, PNG, or WebP photos, crop and place them, tweak brightness and contrast, and download a model. The mesh is built on your device.',
            'That file does not start a printer. You open it in a slicer, choose plastic, layer height, and speed, then send the job to the machine. The [3D printed lithophane guide](/3d-printed-lithophane/) covers that second half. The [settings guide](/lithophane-settings/) separates the controls in Lumiphane from the ones in the slicer.',
          ],
        },
      ],
    },
    {
      kind: 'cards',
      id: 'you-need',
      heading: 'What you need',
      cards: [
        {
          title: 'A photo with a clear subject',
          body: 'One face, a pet, or a simple scene works better than a crowded group. The [photo guide](/photo-to-lithophane/) covers cropping, contrast, and the formats the uploader accepts.',
        },
        {
          title: 'A shape that matches the light',
          body: 'A flat panel sits in a window or a lightbox. A curved panel stands in front of a light. A cylinder, cube, or hexagon is an open shade. Sizes and limits are on the [lamp page](/lithophane-lamp/).',
        },
        {
          title: 'White filament and a cool light',
          body: 'The thickness curve is tuned for white PLA. Silk, gray, and dark plastics scramble the tones. Light the finished print with an LED — a hot bulb can soften PLA.',
        },
        {
          title: 'A slicer you already use',
          body: 'Export an STL or a standard 3MF for any slicer, or a Bambu Studio project for the single-nozzle Bambu Lab machines listed in the export sheet. See [Bambu Studio lithophane](/bambu-studio-lithophane/) for that path.',
        },
      ],
    },
    {
      kind: 'steps',
      id: 'steps',
      heading: 'Make one from start to finish',
      intro: 'Follow this order. A great model of a poor photo still prints as a poor lithophane.',
      steps: [
        {
          title: 'Choose the shape first',
          body: 'Flat and curved panels hold up to 4 photos. A cube or cylinder holds up to 4 around the outside. A hexagon holds up to 6. One photo on a flat or curved panel sets the height from the picture. A lamp shape, or several photos on one panel, crops each picture to its tile.',
        },
        {
          title: 'Add the photos',
          body: 'Drop JPEG, PNG, or WebP files. You can add more than one at a time, up to the limit for that shape. Crop in the tool, and slide a photo inside its frame if the subject sits too high or too low.',
        },
        {
          title: 'Read the preview, then nudge the tone',
          body: 'Contrast spreads the thin and thick regions. Brightness lifts or darkens the whole picture. Invert swaps them — useful when a light subject has disappeared into the bright end. Ranges and what they do are in [lithophane settings](/lithophane-settings/).',
        },
        {
          title: 'Export the file',
          body: 'Wait until the preview finishes. The export sheet can build a Bambu Studio project, a standard 3MF, or an STL. It also lists size, the thickness range for this part, and any warning. Read the warning before a multi-hour print. Opening the Bambu project in Studio is covered in [Bambu Studio lithophane](/bambu-studio-lithophane/).',
        },
        {
          title: 'Slice it standing up',
          body: 'Keep the model upright. Use white PLA, a solid image area, and a fine layer height. Lumiphane’s print guide starts at 0.12 mm layers, 100% infill, a slow speed, and a brim. Those are starting points for a typical 0.4 mm nozzle — not settings the app can push to your printer.',
        },
        {
          title: 'Light it from behind',
          body: 'Hold a flat panel to a window or an even LED panel. Set an open shade over a cool LED with a gap so the light does not touch the plastic. In ordinary room light the picture should look faint. That is normal.',
        },
      ],
    },
    {
      kind: 'prose',
      id: 'mistakes',
      heading: 'Mistakes that waste a print',
      blocks: [
        {
          heading: 'Printing the sheet flat on the bed',
          paragraphs: [
            'Layer lines then cut across the face, and the nozzle’s width becomes the detail limit. Standing the part up lets the finer vertical steps draw the tones. Lumiphane builds the model in that standing orientation — leave it that way in the slicer.',
          ],
        },
        {
          heading: 'Leaving holes inside the wall',
          paragraphs: [
            'A honeycomb or grid inside the picture shows up as a pattern when you turn the light on. The picture area needs to be solid plastic. The print guide uses 100% infill. Some people use enough walls that the picture is solid and keep sparse infill only in a thick frame. Either way, the lit area cannot have air gaps.',
          ],
        },
        {
          heading: 'Choosing a photo the nozzle cannot resolve',
          paragraphs: [
            'Fine text, hair against a busy background, and ten faces in one frame turn into mush at a 0.4 mm nozzle. Crop tighter. If the preview already looks muddy, the print will too.',
          ],
        },
        {
          heading: 'Judging it on the desk, unlit',
          paragraphs: [
            'An unlit lithophane is a white texture. Put the light behind it before you decide the contrast is wrong.',
          ],
        },
      ],
    },
  ],
  faqs: [
    {
      question: 'Do I need CAD software?',
      answer:
        'No. Lumiphane turns the photo into a mesh. You still need a slicer to prepare the file for your printer.',
    },
    {
      question: 'Will the picture be in color?',
      answer:
        'The print is one material. Color in the photo is converted to brightness, then to thickness. You see grayscale tones when light comes through.',
    },
    {
      question: 'Can I print it in silk or wood filament?',
      answer:
        'You can load the STL into a slicer with those materials. The thickness map and the preview assume white PLA. Sparkle, silk, and dark pigments change how light scatters, so the picture will not match the preview.',
    },
    {
      question: 'Does Lumiphane include the lamp?',
      answer:
        'It builds an open panel or an open shade, plus an optional footing so the part stays on the printer bed. You supply the LED. There is no bulb socket in the model.',
    },
    {
      question: 'Where should I go next?',
      answer:
        'Use the photo guide if the picture is the weak part, the lamp guide if you want a shade, the printing guide before you slice, and the settings guide when a test print is almost right.',
    },
  ],
  closing: {
    heading: 'Start with the photo',
    body: 'Open the generator, pick a shape, and add one strong picture. The other guides are here when you want to fine-tune.',
  },
};
