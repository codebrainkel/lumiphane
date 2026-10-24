import type { LandingPage } from '../types';

export const photoPage: LandingPage = {
  path: '/photo-to-lithophane/',
  navLabel: 'Photo',
  kicker: 'Photo guide',
  title: 'Photo to Lithophane: Image Guide & Settings | Lumiphane',
  description:
    'Turn your photos into sharp 3D printed lithophanes. Learn cropping techniques, contrast adjustments, and multi-photo collage layouts for clear 3D prints.',
  breadcrumb: 'Photo to lithophane',
  h1: 'Turn Any Photo into a 3D Printed Lithophane',
  lede:
    'A great 3D printed lithophane begins with an optimized photograph. Because your 3D printer translates pixel luminance into physical wall thickness rather than color, lighting contrast and thoughtful framing are essential. This comprehensive guide covers image preparation, cropping, tonal balance, and multi-photo layouts in Lumiphane.',
  heroNote: 'Upload your photo after selecting a shape. No Lumiphane account needed.',
  sections: [
    {
      kind: 'prose',
      id: 'what-converts',
      heading: 'How digital photos translate into physical 3D relief',
      blocks: [
        {
          paragraphs: [
            'Lumiphane converts your photograph into a high-density grid of luminance values using standard ITU-R BT.709 colorimetric weighting. The generator expands the available dynamic range so the brightest highlights translate into thin, light-transmitting walls, while deep shadows become thicker, light-blocking sections. Subtle micro-contrast sharpening is applied to preserve delicate edges and textural contours.',
            'Because lithophanes rely on single-material translucent filament, color saturation is converted into grayscale light density. Our uploader natively accepts JPEG, PNG, and modern WebP image formats, making it easy to use pictures directly from smartphones, digital cameras, or scanned photo albums.',
            'All image processing and 3D mesh synthesis run entirely in your web browser using WebGL and Web Workers. Your personal photos stay secure on your local device and are never uploaded or stored on an external server.',
          ],
        },
      ],
    },
    {
      kind: 'cards',
      id: 'choose',
      heading: 'Choosing photos that print with exceptional clarity',
      intro:
        'A standard 0.4 mm 3D printer nozzle cannot resolve microscopic hair strands or tiny background lettering. Select photographs with clean composition, pronounced tonal separation, and clear focal subjects.',
      cards: [
        {
          title: 'Single subject with clean, even lighting',
          body: 'Portraits of people or pets with soft, directional lighting produce stunning depth. Avoid intense backlighting that leaves your main subject completely in dark silhouette.',
        },
        {
          title: 'Strong natural contrast and clear separation',
          body: 'Look for images with a healthy balance of light and dark zones. Flat, hazy, or low-contrast snapshots remain a uniform gray band even after increasing contrast sliders.',
        },
        {
          title: 'Tight cropping to highlight key details',
          body: 'A vast, empty background produces a thick, heavy plastic border around a tiny subject. Crop closely around faces or key focal points before printing.',
        },
        {
          title: 'High sharpness and low digital noise',
          body: 'Motion blur and high-ISO sensor noise translate into physical surface lumps. If facial details look soft in the preview, your 3D printer will not be able to reconstruct them.',
        },
      ],
    },
    {
      kind: 'steps',
      id: 'workflow',
      heading: 'Step-by-step image framing and tuning workflow',
      steps: [
        {
          title: 'Select your geometric form factor',
          body: 'The chosen geometry dictates the framing aspect ratio. A single photo on a flat or curved panel preserves its native proportions, adjusting panel height automatically. Cylinder, cube, and hexagonal shades lock each photo to dedicated facet dimensions.',
        },
        {
          title: 'Upload JPEG, PNG, or WebP files',
          body: 'Drag and drop your photographs directly into the upload area. Flat, curved, cube, and cylinder models support up to 4 images, while hexagonal lanterns display up to 6 distinct pictures.',
        },
        {
          title: 'Frame and position subjects with interactive crop',
          body: 'Open the cropping modal for each image to adjust the crop boundary. In the 3D preview step, you can also slide the photo horizontally and vertically within its frame to compose the shot perfectly.',
        },
        {
          title: 'Configure multi-photo collage arrangements',
          body: 'When arranging multiple images on a flat or curved panel, choose between side-by-side rows, stacked columns, or balanced grid layouts. Around cylindrical or hexagonal shades, images wrap seamlessly around the perimeter.',
        },
        {
          title: 'Fine-tune contrast and exposure in the backlit preview',
          body: 'Adjust contrast (from −30% to +35%) and brightness (from −30% to +30%) while examining the backlit 3D simulation. Toggle invert if you want light and dark values flipped for specialized artistic effects.',
        },
        {
          title: 'Export production-ready STL or 3MF files',
          body: 'Generate your 3D file once the preview looks balanced. Download a pre-configured Bambu Studio project, standard 3MF, or binary STL ready for slicing. Detailed slicer instructions are in our [3D printed lithophane guide](/3d-printed-lithophane/).',
        },
      ],
    },
    {
      kind: 'table',
      id: 'symptoms',
      heading: 'Troubleshooting common image preview issues',
      caption: 'Refine your image in Lumiphane before printing. Slicer adjustments cannot recover tonal details that are already lost in the preview.',
      columns: ['Visual symptom', 'Recommended solution'],
      rows: [
        ['Highlights or skin tones appear completely washed out', 'Reduce the brightness slider or choose a photograph with less direct highlight clipping.'],
        ['Image looks flat, hazy, or uniform gray', 'Increase the contrast slider to spread highlights and shadows across the full thickness range.'],
        ['Dark background creates an excessively thick border', 'Crop in tighter around your main subject to eliminate large empty black areas.'],
        ['Subject is cropped awkwardly by the frame', 'Open the crop modal to adjust bounds, or use the position offset sliders to center the subject.'],
        ['Fine lettering or intricate details look indistinct', 'Simplify the composition or enlarge key features; a standard 0.4 mm nozzle cannot resolve micro-text.'],
      ],
    },
    {
      kind: 'note',
      paragraphs: [
        'Higher digital megapixels do not automatically produce a sharper lithophane. Lumiphane samples your photograph at a high-resolution 0.10 mm pitch, which already exceeds the layer resolution of desktop 3D printers. The physical limit of visible fine detail is governed by your 3D printer’s nozzle diameter and vertical layer height.',
      ],
    },
  ],
  faqs: [
    {
      question: 'What image file formats does Lumiphane support?',
      answer:
        'Lumiphane supports JPEG, PNG, and WebP files. High-resolution photos from modern smartphones and digital cameras work smoothly.',
    },
    {
      question: 'Should I convert my photos to black and white before uploading?',
      answer:
        'Converting beforehand is not required. Lumiphane automatically converts color pixels into optical luminance values using standard photographic colorimetry. You can adjust exposure and contrast directly in our tool.',
    },
    {
      question: 'Do smartphone photos produce good lithophanes?',
      answer:
        'Yes. Well-lit smartphone portraits with clear subjects and good natural light make exceptional lithophanes.',
    },
    {
      question: 'Can I include multiple photos in a single print?',
      answer:
        'Yes. You can arrange up to four photos on flat, curved, cylindrical, and cube shapes, and up to six photos on hexagonal lanterns. Dedicated collage presets let you customize layouts easily.',
    },
    {
      question: 'How is thickness determined for my photo?',
      answer:
        'Lumiphane automatically assigns an optimal thickness curve based on panel dimensions: 0.8 mm for the brightest highlights and 3.0 mm for deepest shadows at standard sizes. See our [lithophane settings guide](/lithophane-settings/) for technical details.',
    },
  ],
  closing: {
    heading: 'Start with your favorite photograph',
    body: 'Select a shape, upload your picture, and preview the backlit 3D simulation instantly. Adjust framing and contrast until the preview looks balanced, then export your file.',
  },
};
