import { Answers } from '@/lib/survey';

export type Kind = 'single' | 'multi' | 'rating' | 'text';

export type SurveyQuestion = {
  id: string;
  section: number;
  title: string;
  helper?: string;
  kind: Kind;
  options?: string[];
  required?: boolean;
  max?: number;
  placeholder?: string;
  multiline?: boolean;
  otherKey?: string;
  otherPlaceholder?: string;
  condition?: (answers: Answers) => boolean;
  validate?: (value: unknown) => string | null;
};

export const QUESTION_CONFIG_STORAGE_KEY = 'kitchen-study-question-config-v1';

const isOwner = (a: Answers) => a.airFryerOwnership === 'Yes';
const isProspect = (a: Answers) => a.airFryerOwnership === 'No';

export const baseQuestions: SurveyQuestion[] = [

  // ── SECTION 0 · About you (ICP profile, 8–10 questions) ─────────────────

  {
    id: 'name',
    section: 0,
    title: 'What is your name?',
    helper: 'Used only for research analysis. Not shared publicly.',
    kind: 'text',
    placeholder: 'Your name (optional)',
  },
  {
    id: 'age',
    section: 0,
    title: 'What is your age?',
    kind: 'text',
    required: true,
    placeholder: 'Age in years',
    validate: (value) => {
      const raw = typeof value === 'string' ? value.trim() : '';
      const parsed = Number.parseInt(raw, 10);
      if (!raw) return 'Age is required.';
      if (!Number.isFinite(parsed) || parsed < 18 || parsed > 80)
        return 'Please enter a valid age between 18 and 80.';
      return null;
    },
  },
  {
    id: 'city',
    section: 0,
    title: 'Which city do you currently live in?',
    kind: 'text',
    required: true,
    placeholder: 'Mumbai, Bengaluru, Delhi…',
  },
  {
    id: 'income',
    section: 0,
    title: 'What is your annual household income range?',
    kind: 'single',
    required: true,
    options: ['Under ₹10L', '₹10–20L', '₹20–40L', '₹40L+', 'Prefer not to say'],
  },
  {
    id: 'lifeStage',
    section: 0,
    title: 'Which best describes your current life stage?',
    kind: 'single',
    required: true,
    options: [
      'Single',
      'Married / Partnered (no children)',
      'Married / Partnered (with children)',
      'Single parent',
      'Prefer not to say',
    ],
  },
  {
    id: 'modular',
    section: 0,
    title: 'Do you currently have a modular kitchen?',
    kind: 'single',
    required: true,
    options: ['Yes', 'No', 'Planning one in the next 2 years'],
  },
  {
    id: 'aesthetics',
    section: 0,
    title: 'How important is kitchen aesthetics to you?',
    helper: '1 = not at all important · 10 = extremely important',
    kind: 'rating',
    required: true,
  },
  {
    id: 'buyStyle',
    section: 0,
    title: 'When making purchases, what do you primarily optimise for?',
    helper: 'Select up to 2.',
    kind: 'multi',
    required: true,
    max: 2,
    options: ['Design', 'Quality', 'Health', 'Convenience', 'Lowest price', 'Other'],
    otherKey: 'buyStyleOther',
    otherPlaceholder: 'What else drives your buying decision?',
  },
  {
    id: 'premiumFor',
    section: 0,
    title: 'In which categories are you comfortable paying a premium?',
    helper: 'Select all that apply.',
    kind: 'multi',
    options: ['Kitchen', 'Home', 'Fitness', 'Skincare', 'Travel', 'Electronics', 'Other'],
    otherKey: 'premiumForOther',
    otherPlaceholder: 'Any other premium categories?',
  },
  {
    id: 'admired',
    section: 0,
    title: 'Which brands do you admire for design and product quality?',
    helper: 'Select all that apply.',
    kind: 'multi',
    options: ['Apple', 'Dyson', 'Dreame', 'Laifen', 'Nuuk', 'IKEA', 'None in particular', 'Other'],
    otherKey: 'admiredOther',
    otherPlaceholder: 'Which other brands do you admire?',
  },
  {
    id: 'airFryerOwnership',
    section: 0,
    title: 'Do you currently own an air fryer?',
    kind: 'single',
    required: true,
    options: ['Yes', 'No'],
  },

  // ── SECTION 1A · Air fryer discovery — Owner flow ────────────────────────

  {
    id: 'airFryerWhyBought',
    section: 1,
    title: 'Why did you originally buy an air fryer?',
    helper: 'In your own words — what was the trigger or motivation?',
    kind: 'text',
    multiline: true,
    required: true,
    placeholder: 'Tell us what led you to buy one…',
    condition: isOwner,
  },
  {
    id: 'airFryerBrandModel',
    section: 1,
    title: 'Which brand and model did you buy?',
    kind: 'text',
    placeholder: 'e.g. Philips HD9200, Instant Vortex, Wonderchef…',
    condition: isOwner,
  },
  {
    id: 'airFryerConsidered',
    section: 1,
    title: 'What other brands or products did you consider before buying?',
    kind: 'text',
    placeholder: 'Brands, models, or even different appliance types…',
    condition: isOwner,
  },
  {
    id: 'airFryerWhyChose',
    section: 1,
    title: 'What made you choose the brand you ultimately purchased?',
    kind: 'text',
    multiline: true,
    placeholder: 'Price, reputation, features, reviews, someone recommended it…',
    condition: isOwner,
  },
  {
    id: 'airFryerFrequency',
    section: 1,
    title: 'How often do you use your air fryer?',
    kind: 'single',
    required: true,
    condition: isOwner,
    options: ['Daily', 'A few times a week', 'Once a week', 'A few times a month', 'Rarely'],
  },
  {
    id: 'airFryerFoods',
    section: 1,
    title: 'What foods do you cook most often in your air fryer?',
    kind: 'text',
    multiline: true,
    placeholder: 'Fries, chicken wings, snacks, reheating leftovers…',
    condition: isOwner,
  },
  {
    id: 'airFryerLove',
    section: 1,
    title: 'What do you love most about your air fryer?',
    kind: 'text',
    multiline: true,
    placeholder: 'Share what genuinely works well for you…',
    condition: isOwner,
  },
  {
    id: 'airFryerFrustrations',
    section: 1,
    title: 'What frustrates you most about your air fryer?',
    helper: 'Be as specific as you can — this is the most valuable part of our research.',
    kind: 'text',
    multiline: true,
    required: true,
    placeholder: 'Tell us honestly what bothers you…',
    condition: isOwner,
  },
  {
    id: 'airFryerChange',
    section: 1,
    title: 'If you could change one thing about your air fryer, what would it be?',
    kind: 'text',
    multiline: true,
    placeholder: 'The single biggest improvement you wish for…',
    condition: isOwner,
  },
  {
    id: 'airFryerPlace',
    section: 1,
    title: 'Where is your air fryer usually kept?',
    kind: 'single',
    condition: isOwner,
    options: ['On the countertop permanently', 'Stored away after each use', 'Other'],
    otherKey: 'airFryerPlaceOther',
    otherPlaceholder: 'Where do you keep it?',
  },
  {
    id: 'materialConcerns',
    section: 1,
    title: 'Have concerns around plastics, coatings, or materials ever influenced a kitchen purchase decision?',
    kind: 'single',
    condition: isOwner,
    options: [
      'Yes — it has actively influenced my choices',
      "No — I haven't thought about it much",
      "I'm not sure",
    ],
  },
  {
    id: 'ownerBudget',
    section: 1,
    title: 'What budget range would you consider reasonable for a premium air fryer?',
    kind: 'single',
    required: true,
    condition: isOwner,
    options: ['Under ₹5,000', '₹5,000–₹8,000', '₹8,000–₹10,000', '₹10,000–₹15,000', '₹15,000+'],
  },

  // ── SECTION 1B · Air fryer discovery — Non-owner flow ───────────────────

  {
    id: 'consideredBuying',
    section: 1,
    title: 'Have you seriously considered buying an air fryer?',
    kind: 'single',
    required: true,
    condition: isProspect,
    options: [
      'Yes — I have actively looked into it',
      'Casually — I have thought about it but not seriously',
      'Not really',
    ],
  },
  {
    id: 'whyNotBought',
    section: 1,
    title: 'Why have you not purchased one yet?',
    helper: 'In your own words — what has held you back?',
    kind: 'text',
    multiline: true,
    required: true,
    placeholder: 'Share your honest reason…',
    condition: isProspect,
  },
  {
    id: 'whatWouldConvince',
    section: 1,
    title: 'What would convince you to buy one?',
    kind: 'text',
    multiline: true,
    placeholder: 'A feature, price point, recommendation, proof point…',
    condition: isProspect,
  },
  {
    id: 'airFryerConcerns',
    section: 1,
    title: 'What concerns do you have about air fryers?',
    kind: 'text',
    multiline: true,
    placeholder: 'Health, counter space, cleaning, usefulness, materials…',
    condition: isProspect,
  },
  {
    id: 'prospectBudget',
    section: 1,
    title: 'What budget would feel reasonable for an air fryer?',
    kind: 'single',
    required: true,
    condition: isProspect,
    options: ['Under ₹5,000', '₹5,000–₹8,000', '₹8,000–₹10,000', '₹10,000–₹15,000', '₹15,000+'],
  },

  // ── SECTION 2 · Norro concept validation ────────────────────────────────

  {
    id: 'conceptCompelling',
    section: 2,
    title: 'On a scale of 1–10, how compelling is this concept compared to air fryers available today?',
    helper:
      'Norro is a premium air fryer with a 100% borosilicate glass cooking chamber — zero plastic contact with food — Indian cooking presets, and a design-led countertop form factor. Estimated launch price: ₹8,990.',
    kind: 'rating',
    required: true,
  },
  {
    id: 'conceptWhyScore',
    section: 2,
    title: 'Why did you give that score?',
    kind: 'text',
    multiline: true,
    required: true,
    placeholder: 'What made you rate it that way…',
  },
  {
    id: 'conceptNoBrainer',
    section: 2,
    title: 'What would make this a no-brainer purchase for you?',
    kind: 'text',
    multiline: true,
    placeholder: 'Features, certifications, guarantees, social proof, trial offer…',
  },
  {
    id: 'conceptConcerns',
    section: 2,
    title: 'What concerns or objections would you still have?',
    kind: 'text',
    multiline: true,
    placeholder: 'Be completely honest — this is how we build a better product…',
  },
  {
    id: 'purchaseIntent',
    section: 2,
    title: 'If this product launched tomorrow at ₹8,990, how likely would you be to buy it?',
    kind: 'single',
    required: true,
    options: ['Definitely buy', 'Probably buy', 'Might consider', 'Probably not', 'Definitely not'],
  },
  {
    id: 'purchaseIntentBarrier',
    section: 2,
    title: 'What would need to change for you to move one level higher in purchase intent?',
    kind: 'text',
    multiline: true,
    placeholder: 'Price, features, proof points, brand trust, try-before-you-buy…',
  },
];
