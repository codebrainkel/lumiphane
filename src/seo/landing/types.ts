export interface ProseBlock {
  heading?: string;
  paragraphs: string[];
}

export interface LandingPage {
  path: string;
  navLabel: string;
  kicker: string;
  title: string;
  description: string;
  breadcrumb: string;
  h1: string;
  lede: string;
  heroNote: string;
  sections: Section[];
  faqs: { question: string; answer: string }[];
  closing: { heading: string; body: string };
}

export type Section =
  | { kind: 'prose'; id: string; heading: string; blocks: ProseBlock[] }
  | { kind: 'steps'; id: string; heading: string; intro?: string; steps: { title: string; body: string }[] }
  | { kind: 'cards'; id: string; heading: string; intro?: string; cards: { title: string; body: string }[] }
  | {
      kind: 'table';
      id: string;
      heading: string;
      intro?: string;
      caption: string;
      columns: string[];
      rows: string[][];
    }
  | { kind: 'note'; paragraphs: string[] }
  | { kind: 'figure'; id: string; heading: string; figure: 'transmission' | 'lamps'; caption: string };
