import type { LandingPage } from '../types';

export const lampPage: LandingPage = {
  path: '/lithophane-lamp/',
  navLabel: 'Lamp',
  kicker: 'Lamp guide',
  title: 'Lithophane Lamp: 3D Print DIY Lampshades | Lumiphane',
  description:
    'Design and 3D print custom lithophane lampshades. Create round cylinders, hexagonal lanterns, and curved panels with cool LED lighting for stunning displays.',
  breadcrumb: 'Lithophane lamp',
  h1: 'How to Design and 3D Print a Lithophane Lamp',
  lede:
    'A lithophane lamp turns your cherished photos into an illuminated shade. When light radiates from inside the structure, your pictures reveal themselves across seamless geometric surfaces. Lumiphane designs open-ended lampshades and lantern geometries ready for clean 3D printing and pairing with safe, low-temperature LED lights.',
  heroNote: 'Choose Round Cylinder, Hexagon, Hollow Cube, or Curved Panel in the generator.',
  sections: [
    {
      kind: 'figure',
      id: 'shapes',
      heading: 'Four geometric designs for illuminated photo displays',
      figure: 'lamps',
      caption:
        'Round cylinders, hexagonal lanterns, and hollow cubes are open-ended shades. Curved panels form self-supporting display arcs with up to 120° of curvature.',
    },
    {
      kind: 'table',
      id: 'which-shape',
      heading: 'Selecting the optimal lamp shape for your display',
      caption: 'Dimension ranges reflect adjustable slider boundaries in Lumiphane, along with recommended starting values.',
      columns: ['Geometric shape', 'Photo capacity', 'Adjustable dimensions', 'Recommended lighting'],
      rows: [
        ['Round cylinder', '1 to 4 photos around the 360° perimeter', 'Diameter 50–300 mm, height 50–260 mm. Default size: 90 × 95 mm.', 'Central LED puck or pillar light inside an open tube'],
        ['Hexagonal lantern', '1 to 6 photos across faceted flat faces', 'Diameter 50–260 mm, height 40–220 mm. Default size: 90 × 90 mm.', 'Vertical LED strip or central LED module'],
        ['Hollow cube', '1 to 4 photos around four exterior walls', 'Width 40–220 mm, height 40–220 mm. Default size: 90 × 90 mm.', 'Low-profile LED base or compact light puck'],
        ['Curved panel', '1 to 4 photos tiled across an arc', 'Width 60–220 mm, arc angle 30–120°. Default angle: 75°.', 'Rear-facing LED light bar or tabletop lamp'],
      ],
    },
    {
      kind: 'prose',
      id: 'not-a-socket',
      heading: 'Lampshade geometry and essential thermal safety',
      blocks: [
        {
          paragraphs: [
            'Lumiphane models cylinders, hexagons, and cubes as vertical tubes with open tops and bottoms. This open-ended design allows heat to escape freely while letting you lower the shade directly over an existing LED puck, nightlight base, or small lamp fixture. The optional stabilizing base stand in the generator widens the bottom perimeter so tall prints stay securely anchored to the 3D printer build plate during printing; it is not an enclosed bulb socket.',
            'Always illuminate 3D printed PLA lampshades with cool LED light sources. Standard PLA filament softens at approximately 60°C (140°F) and will deform if placed near hot incandescent lightbulbs or halogen elements. Never place an open flame candle inside a 3D printed plastic shade. Ensure comfortable physical clearance between your LED light and the interior wall.',
            'Curved panels are engineered as freestanding decorative arcs with adjustable angles between 30° and 120°. For a complete 360-degree shade, select the round cylinder shape. When wrapping a single photo around a cylinder, Lumiphane centers the subject on the front face and places a neat seam along the back.',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'photos',
      heading: 'Arranging photos seamlessly around a lampshade',
      blocks: [
        {
          paragraphs: [
            'When arranging multiple photographs around a cylinder or lantern, Lumiphane divides the perimeter into equal segments. Four photos on a cylinder each receive a 90° arc quadrant, while six images on a hexagon map cleanly onto individual flat facets. A single photo can also wrap the entire 360° circumference, with automatic aspect ratio locking to prevent horizontal stretching.',
            'Both panoramic landscapes and individual family portraits display beautifully on lamp shades. Creating a multi-sided shade with one portrait per facet is a wonderful way to showcase family members or pet photos. For guidance on image framing and contrast, review our [photo to lithophane guide](/photo-to-lithophane/).',
            'Flat panels are intended for window hangings and flat display lightboxes. For a comprehensive walkthrough of flat panels and all available shapes, see our [how to make a lithophane guide](/how-to-make-a-lithophane/).',
          ],
        },
      ],
    },
    {
      kind: 'prose',
      id: 'print-a-shade',
      heading: 'Best practices for slicing and printing lamp shades',
      blocks: [
        {
          paragraphs: [
            'All shade models are generated standing vertically on their base. Keep this orientation in your slicing software. The curved wall of a cylinder and the upright faces of cubes and hexagons are self-supporting as layers build upward, requiring zero support material across the image area.',
            'Because tall, thin walls can experience vibrations during rapid toolhead movements, we recommend adding a 5–8 mm outer brim in your slicer to ensure strong bed adhesion. Slice the photo walls with 100% solid infill in standard white PLA. For Bambu Lab printers, our pre-configured Bambu Studio project export automatically includes 0.12 mm layers and solid infill, as explained in our [Bambu Studio lithophane guide](/bambu-studio-lithophane/). Slicer parameters are discussed further in our [3D printed lithophane guide](/3d-printed-lithophane/).',
          ],
        },
      ],
    },
    {
      kind: 'note',
      paragraphs: [
        'Our default 90 mm diameter is an ideal size for first-time makers and fits many common battery-operated LED puck lights. Measure your intended lighting hardware beforehand and ensure comfortable clearance inside the printed shade.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Does a cylindrical lithophane lamp require supports?',
      answer:
        'When printed upright, the circular walls support themselves without any support structures. We recommend adding a 5–8 mm brim in your slicer to guarantee firm bed adhesion for tall prints.',
    },
    {
      question: 'Can I close the top and integrate a lightbulb socket?',
      answer:
        'Lumiphane creates open-ended tubular shades to promote passive heat dissipation and fit versatile LED pucks. If you require a custom socket mount, you can design a complementary base in your preferred CAD tool.',
    },
    {
      question: 'Why does the curved panel not meet to form a complete tube?',
      answer:
        'The curved panel is designed as a freestanding display arc spanning up to 120°. For a complete 360° closed shade, select the Round Cylinder shape in the generator.',
    },
    {
      question: 'How many photos can I place around a single shade?',
      answer:
        'You can place up to four photos around round cylinders and hollow cubes, up to six photos on hexagonal lanterns, or wrap a single continuous panoramic image.',
    },
    {
      question: 'What filament material should I use for a lamp shade?',
      answer:
        'Standard white PLA is strongly recommended. Our optical thickness curve and preview renderer are calibrated for white PLA light transmission. Colored or dark materials will obstruct light diffusion.',
    },
  ],
  closing: {
    heading: 'Craft a custom illuminated lampshade',
    body: 'Choose a cylinder, hexagon, cube, or curved panel in the generator. Export your 3D model, slice with solid infill, and bring your memories to light.',
  },
};
